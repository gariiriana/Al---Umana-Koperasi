/**
 * Centralized Firestore subscription manager with deduplication.
 *
 * Problem: When N components subscribe to the same Firestore query (e.g.
 * "all orders by status CONFIRMED"), each call to `onSnapshot` opens a
 * separate WebSocket listener to Firestore. At scale with millions of
 * users, this means millions of redundant listeners on the same query —
 * instantly exhausting Firestore quotas and causing fan-out storms.
 *
 * Solution: This module maintains a registry of active subscriptions
 * keyed by a canonical string representation of the query. When multiple
 * consumers subscribe to the same query, only ONE actual Firestore
 * `onSnapshot` listener is created. Additional consumers receive the
 * cached latest snapshot and are notified of future updates via a local
 * broadcast — zero additional Firestore listeners.
 *
 * Features:
 *  - Automatic reference counting: when the last consumer unsubscribes,
 *    the underlying Firestore listener is cleaned up.
 *  - Instant delivery of the latest snapshot to late subscribers (no
 *    waiting for the next Firestore push).
 *  - Exponential backoff reconnect on listener errors.
 *  - Type-safe generics for any document shape.
 *
 * Usage:
 *   import { subscriptionManager } from "@/services/subscriptionManager";
 *   const unsub = subscriptionManager.subscribe(
 *     query(collection(db, "orders"), where("status", "==", "CONFIRMED")),
 *     (docs) => setOrders(docs),
 *     (err) => console.error(err)
 *   );
 *   // Later:
 *   unsub();
 */

import {
  onSnapshot,
  type DocumentData,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SnapshotListener<T = DocumentData> = (snapshot: QuerySnapshot<T>) => void;
type ErrorListener = (error: Error) => void;

interface Subscriber<T = DocumentData> {
  onChange: SnapshotListener<T>;
  onError?: ErrorListener;
}

interface ManagedSubscription<T = DocumentData> {
  /** Canonical key derived from the query. */
  key: string;
  /** The Firestore query being listened to. */
  query: Query<T>;
  /** All active consumers of this query. */
  subscribers: Set<Subscriber<T>>;
  /** The underlying Firestore unsubscribe function. */
  firestoreUnsub: Unsubscribe;
  /** Last received snapshot — delivered immediately to late subscribers. */
  latestSnapshot: QuerySnapshot<T> | null;
  /** Current backoff attempt counter for error recovery. */
  backoffAttempt: number;
  /** Handle returned by setTimeout for pending reconnect. */
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

/* ------------------------------------------------------------------ */
/*  Query key generation                                               */
/* ------------------------------------------------------------------ */

/**
 * Derive a stable, canonical string key from a Firestore Query. This key
 * is used to deduplicate identical queries from different call sites.
 *
 * The Firestore JS SDK does not expose a public `.toString()` on queries,
 * but we can serialise the internal `_query` structure. For safety, we
 * fall back to JSON.stringify of the query's converter-stripped form.
 */
function queryKey<T>(q: Query<T>): string {
  // The Firestore SDK v9+ stores the serialisable query spec on the
  // `_query` property (internal, but stable across minor versions).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internal = (q as any)._query;
  if (internal) {
    try {
      return JSON.stringify(internal);
    } catch {
      // Fall through to fallback.
    }
  }

  // Fallback: use the query's own JSON representation. Less reliable
  // for dedup but still functional.
  try {
    return JSON.stringify(q);
  } catch {
    // Last resort: return a unique key so we don't accidentally merge
    // unrelated queries.
    return `__fallback_${Date.now()}_${Math.random()}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Backoff helpers                                                    */
/* ------------------------------------------------------------------ */

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

function backoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

/* ------------------------------------------------------------------ */
/*  Manager class                                                      */
/* ------------------------------------------------------------------ */

class SubscriptionManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private registry = new Map<string, ManagedSubscription<any>>();

  /**
   * Subscribe to a Firestore query with automatic deduplication.
   *
   * If another consumer is already listening to an identical query, the
   * new consumer piggybacks on the existing listener and receives the
   * cached latest snapshot immediately.
   *
   * @returns An unsubscribe function. Call it to remove this consumer;
   *          when the last consumer unsubscribes, the Firestore listener
   *          is torn down.
   */
  subscribe<T = DocumentData>(
    q: Query<T>,
    onChange: SnapshotListener<T>,
    onError?: ErrorListener
  ): Unsubscribe {
    const key = queryKey(q);
    const subscriber: Subscriber<T> = { onChange, onError };

    let managed = this.registry.get(key) as
      | ManagedSubscription<T>
      | undefined;

    if (managed) {
      // Existing listener — add consumer and deliver cached snapshot.
      managed.subscribers.add(subscriber);
      if (managed.latestSnapshot) {
        try {
          onChange(managed.latestSnapshot);
        } catch {
          // Consumer callback error — swallow to protect other subs.
        }
      }
    } else {
      // First consumer for this query — create the Firestore listener.
      managed = this.createManagedSubscription(key, q, subscriber);
      this.registry.set(key, managed);
    }

    // Return an unsubscribe function scoped to THIS consumer.
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.removeSubscriber(key, subscriber);
    };
  }

  /**
   * Number of unique Firestore listeners currently active. Useful for
   * debugging and monitoring.
   */
  get activeListenerCount(): number {
    return this.registry.size;
  }

  /**
   * Tear down ALL managed subscriptions. Used in tests and during app
   * unmount.
   */
  clear(): void {
    for (const [, managed] of this.registry) {
      managed.firestoreUnsub();
      if (managed.reconnectTimer) clearTimeout(managed.reconnectTimer);
      managed.subscribers.clear();
    }
    this.registry.clear();
  }

  /* ---------------------------------------------------------------- */
  /*  Private helpers                                                  */
  /* ---------------------------------------------------------------- */

  private createManagedSubscription<T>(
    key: string,
    q: Query<T>,
    firstSubscriber: Subscriber<T>
  ): ManagedSubscription<T> {
    const subscribers = new Set<Subscriber<T>>([firstSubscriber]);

    const managed: ManagedSubscription<T> = {
      key,
      query: q,
      subscribers,
      firestoreUnsub: () => {}, // placeholder, replaced below
      latestSnapshot: null,
      backoffAttempt: 0,
      reconnectTimer: null,
    };

    managed.firestoreUnsub = this.attachFirestoreListener(managed);
    return managed;
  }

  private attachFirestoreListener<T>(
    managed: ManagedSubscription<T>
  ): Unsubscribe {
    return onSnapshot(
      managed.query,
      (snapshot) => {
        managed.latestSnapshot = snapshot;
        managed.backoffAttempt = 0; // reset on success
        for (const sub of managed.subscribers) {
          try {
            sub.onChange(snapshot);
          } catch {
            // Swallow consumer errors to protect other subscribers.
          }
        }
      },
      (error) => {
        // Broadcast error to all consumers.
        for (const sub of managed.subscribers) {
          if (sub.onError) {
            try {
              sub.onError(error);
            } catch {
              // Swallow.
            }
          }
        }

        // Attempt reconnect with exponential backoff.
        if (managed.subscribers.size > 0) {
          const delay = backoffMs(managed.backoffAttempt);
          managed.backoffAttempt++;
          managed.reconnectTimer = setTimeout(() => {
            managed.reconnectTimer = null;
            if (managed.subscribers.size > 0) {
              managed.firestoreUnsub = this.attachFirestoreListener(managed);
            }
          }, delay);
        }
      }
    );
  }

  private removeSubscriber<T>(key: string, subscriber: Subscriber<T>): void {
    const managed = this.registry.get(key) as
      | ManagedSubscription<T>
      | undefined;
    if (!managed) return;

    managed.subscribers.delete(subscriber);

    if (managed.subscribers.size === 0) {
      // Last consumer gone — tear down the Firestore listener.
      managed.firestoreUnsub();
      if (managed.reconnectTimer) clearTimeout(managed.reconnectTimer);
      this.registry.delete(key);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Singleton export                                                   */
/* ------------------------------------------------------------------ */

/** Global subscription manager instance shared across the application. */
export const subscriptionManager = new SubscriptionManager();

/**
 * Exposed for tests. Not part of the public surface.
 * @internal
 */
export const __test = {
  SubscriptionManager,
  queryKey,
};
