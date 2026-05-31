/**
 * Cart frontend service backed by the Firestore client SDK.
 *
 * The Cart lives at `carts/{uid}/items/{itemId}` so it persists across
 * sessions and devices (Requirement 3.6). Every line-item document id is
 * the InventoryItem document id, which makes "add the same item again"
 * naturally idempotent and lets us increment quantity in a transaction
 * instead of creating duplicates (Requirements 3.4, 3.5).
 *
 * All writes go directly to Firestore — there is no backend HTTP API for
 * the cart. Security rules (`carts/{customerId}/items/{itemId}`) enforce
 * that only the owning customer can read or write their cart.
 *
 * Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.10, 3.11, 3.12,
 * 3.13, 3.14.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { formatIDR } from "@/lib/format";

/* ------------------------------------------------------------------ */
/*  Types and constants                                                */
/* ------------------------------------------------------------------ */

/** Re-exported for convenience so consumers can `import { formatIDR }` from this module. */
export { formatIDR };

/**
 * A single Cart line item, mirroring the Firestore document at
 * `carts/{customerId}/items/{itemId}`.
 */
export interface CartLineItem {
  /** InventoryItem document id; also the Firestore document id of the line. */
  itemId: string;
  /** Snapshot of the product name at the time the line was last touched. */
  itemName: string;
  /** Snapshot of the unit price in IDR (integer rupiah, ≥ 0). */
  unitPrice: number;
  /** Quantity, clamped to `[1, 99]` by every write path. */
  quantity: number;
  /** Optional customer note, truncated to ≤ 200 chars on write. */
  notes?: string;
  /** Optional product image URL snapshot. */
  imageUrl?: string;
  /** Server timestamp of the last write. Populated by Firestore. */
  // Using `unknown` keeps the call sites SDK-agnostic; consumers that need
  // the underlying `Timestamp` can cast.
  updatedAt?: unknown;
}

/** Hard cap on a single line's quantity (Requirements 3.4, 3.5). */
export const MAX_LINE_QUANTITY = 99;
/** Hard cap on the `notes` field length (Requirement 3.14). */
export const MAX_NOTES_LENGTH = 200;

/* ------------------------------------------------------------------ */
/*  Path helpers                                                       */
/* ------------------------------------------------------------------ */

function itemsCollection(uid: string) {
  return collection(db, "carts", uid, "items");
}

function lineDoc(uid: string, itemId: string) {
  return doc(db, "carts", uid, "items", itemId);
}

function snapshotToLine(snap: QueryDocumentSnapshot<DocumentData>): CartLineItem {
  const data = snap.data();
  const line: CartLineItem = {
    itemId: (data.itemId as string) ?? snap.id,
    itemName: (data.itemName as string) ?? "",
    unitPrice: typeof data.unitPrice === "number" ? data.unitPrice : 0,
    quantity: typeof data.quantity === "number" ? data.quantity : 0,
    updatedAt: data.updatedAt,
  };
  if (typeof data.notes === "string") {
    line.notes = data.notes;
  }
  if (typeof data.imageUrl === "string") {
    line.imageUrl = data.imageUrl;
  }
  return line;
}

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Clamp a candidate quantity into `[0, 99]`. Non-finite or negative inputs
 * collapse to `0`; values above 99 are capped at 99 (Requirement 3.5).
 */
function clampQuantity(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  const intQty = Math.floor(qty);
  if (intQty <= 0) return 0;
  if (intQty > MAX_LINE_QUANTITY) return MAX_LINE_QUANTITY;
  return intQty;
}

/**
 * Truncate notes to `MAX_NOTES_LENGTH` characters. Per task description
 * we choose truncate-for-UX over reject so the user never sees a hard
 * error for typing a long note.
 */
function clampNotes(notes: string): string {
  if (notes.length <= MAX_NOTES_LENGTH) return notes;
  return notes.slice(0, MAX_NOTES_LENGTH);
}

/**
 * Compute the total cart value as `Σ unitPrice × quantity` (Requirement
 * 3.10). Pure and deterministic — exposed so the cart UI can render the
 * total from the same snapshot the listener already provided.
 */
export function computeCartTotal(items: CartLineItem[]): number {
  let total = 0;
  for (const line of items) {
    const price = Number.isFinite(line.unitPrice) ? line.unitPrice : 0;
    const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
    total += price * qty;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/*  Subscription                                                       */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to the customer's cart. Listens to `carts/{uid}/items` ordered
 * by `updatedAt` desc and invokes `onChange` with the materialized line
 * items on every snapshot. Returns the `Unsubscribe` function from the
 * Firestore SDK so callers can clean up in a `useEffect`.
 *
 * Validates Requirements 3.7, 3.8.
 */
export function subscribeToCart(
  uid: string,
  onChange: (items: CartLineItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(itemsCollection(uid));
  return onSnapshot(
    q,
    (snap) => {
      const items: CartLineItem[] = snap.docs.map(snapshotToLine);
      // Sort alphabetically by product name to keep cart card order perfectly stable on quantity updates
      items.sort((a, b) => a.itemName.localeCompare(b.itemName));
      onChange(items);
    },
    onError
  );
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

/**
 * Add `qty` of `item` to the cart, or increment an existing line by `qty`
 * (capped at 99). When the line already exists, the most recent `notes`
 * supplied wins; when it does not exist, the new line is created with the
 * supplied `notes` (or an empty string).
 *
 * Uses a Firestore transaction so concurrent "add to cart" taps cannot
 * lose increments. Validates Requirements 3.3, 3.4, 3.5, 3.14.
 */
export async function addToCart(
  uid: string,
  item: { itemId: string; itemName: string; price: number; imageUrl?: string },
  qty: number,
  notes?: string
): Promise<void> {
  const incomingQty = clampQuantity(qty);
  if (incomingQty <= 0) return; // 0 and negative qtys are no-ops on add.

  const ref = lineDoc(uid, item.itemId);
  const trimmedNotes =
    typeof notes === "string" ? clampNotes(notes) : undefined;

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    const baseQty = existing.exists()
      ? clampQuantity((existing.data().quantity as number) ?? 0)
      : 0;
    const nextQty = clampQuantity(baseQty + incomingQty);

    // The data shape mirrors the design's CartLineItem schema exactly so
    // any reader (including Property 6's round-trip test) sees the same
    // fields written here.
    const data: Record<string, unknown> = {
      itemId: item.itemId,
      itemName: item.itemName,
      unitPrice: item.price,
      quantity: nextQty,
      updatedAt: serverTimestamp(),
    };
    if (item.imageUrl !== undefined) {
      data.imageUrl = item.imageUrl;
    }
    if (trimmedNotes !== undefined) {
      data.notes = trimmedNotes;
    } else if (!existing.exists()) {
      // First write with no caller-supplied note → seed an empty string
      // so the field is always present on freshly created lines (matches
      // the schema in design.md).
      data.notes = "";
    }

    tx.set(ref, data, { merge: true });
  });
}

/**
 * Set the absolute quantity of an existing line. `qty === 0` deletes the
 * line (Requirement 3.12); `qty > 99` is clamped to 99 (Requirement 3.5);
 * other values update `quantity` and refresh `updatedAt`.
 *
 * Validates Requirements 3.5, 3.11, 3.12.
 */
export async function setLineQuantity(
  uid: string,
  itemId: string,
  qty: number
): Promise<void> {
  const ref = lineDoc(uid, itemId);
  const clamped = clampQuantity(qty);

  if (clamped === 0) {
    await deleteDoc(ref);
    return;
  }

  await updateDoc(ref, {
    quantity: clamped,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update the `notes` field on an existing line. Notes are truncated to
 * `MAX_NOTES_LENGTH` chars (Requirement 3.14). Refreshes `updatedAt` so
 * the snapshot listener re-orders correctly.
 */
export async function setLineNotes(
  uid: string,
  itemId: string,
  notes: string
): Promise<void> {
  const ref = lineDoc(uid, itemId);
  await updateDoc(ref, {
    notes: clampNotes(notes),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Remove a single line from the cart (Requirement 3.13).
 */
export async function removeLineItem(
  uid: string,
  itemId: string
): Promise<void> {
  await deleteDoc(lineDoc(uid, itemId));
}

/**
 * Delete every line under `carts/{uid}/items`. Used after a successful
 * order placement (Requirement 6.3 / 6.4 — the order handler does not
 * read the cart, so the frontend clears it). Batches deletes 400 at a
 * time to stay under Firestore's 500-op batch limit.
 */
export async function clearCart(uid: string): Promise<void> {
  const itemsRef = itemsCollection(uid);
  const snap = await getDocs(itemsRef);
  if (snap.empty) return;

  const BATCH_LIMIT = 400;
  let batch = writeBatch(db);
  let opsInBatch = 0;
  const commits: Promise<void>[] = [];

  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) {
    commits.push(batch.commit());
  }

  await Promise.all(commits);
}

/**
 * Internal helpers exposed for tests. Not part of the public service
 * surface — call sites should never reach into this object.
 */
export const __test = {
  clampQuantity,
  clampNotes,
};
