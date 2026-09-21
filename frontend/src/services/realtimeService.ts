/**
 * Real-time Firestore subscription helpers. These wrap `onSnapshot` so
 * components can subscribe to typed streams of domain entities without
 * importing Firestore primitives directly.
 *
 * ## Scalability optimizations (v2)
 *
 * 1. **Subscription deduplication**: All collection-level subscriptions
 *    now route through the central `subscriptionManager` so that N
 *    components subscribing to the same query share ONE Firestore
 *    listener instead of opening N redundant connections.
 *
 * 2. **Pagination**: `subscribeOrders()` is limited to the most recent
 *    100 orders by default (configurable via `limit`). This prevents a
 *    full-collection listener that would fan out every write to every
 *    connected client — the #1 scalability bottleneck identified in the
 *    architecture audit.
 *
 * 3. **Backoff reconnect**: Error handling with exponential backoff is
 *    now managed by the `subscriptionManager` rather than each caller.
 *
 * Each helper returns the unsubscribe function from Firestore so callers
 * can clean up in a useEffect cleanup.
 */

import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
  Timestamp
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { Order, OrderStatus } from "@/types/order";
import type { CourierGPS } from "@/types/courier-gps";
import type { FileMetadata } from "@/types/file";
import { subscriptionManager } from "@/services/subscriptionManager";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toIsoString(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => unknown }).toDate === "function"
  ) {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
    } catch {
      // Fall through
    }
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" && !isNaN(value)) return new Date(value).toISOString();
  return new Date().toISOString();
}

function toIsoStringOrUndefined(value: unknown): string | undefined {
  if (!value) return undefined;
  return toIsoString(value);
}

function snapshotToOrder(snap: DocumentSnapshot<DocumentData>): Order {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    orderType: (data.orderType as Order["orderType"]) ?? "event",
    institutionName: (data.institutionName as string) ?? "",
    recipientName: (data.recipientName as string) ?? "",
    recipientPhone: (data.recipientPhone as string) ?? "",
    recipientNotes: data.recipientNotes as string | undefined,
    eventDate: (data.eventDate as string) ?? "",
    foodDetails: (data.foodDetails as string) ?? "",
    drinkDetails: (data.drinkDetails as string) ?? "",
    totalPrice: (data.totalPrice as number) ?? 0,
    additionalNotes: data.additionalNotes as string | undefined,
    paymentStatus: (data.paymentStatus as Order["paymentStatus"]) ?? "BELUM_DIBAYAR",
    paymentDueDate: (data.paymentDueDate as string) ?? "",
    invoiceToken: data.invoiceToken as string | undefined,
    invoiceSignedAt: toIsoStringOrUndefined(data.invoiceSignedAt),
    invoiceSignatureData: data.invoiceSignatureData as string | undefined,
    manualValidation: data.manualValidation as Order["manualValidation"],
    adminComplaintNotes: data.adminComplaintNotes as string | undefined,
    adminComplaintPhotoId: data.adminComplaintPhotoId as string | undefined,
    status: ((data.status as string) ?? "PENDING") as OrderStatus,
    customerId: (data.customerId as string) ?? "",
    customerName: (data.customerName as string) ?? "",
    items: (data.items as Order["items"]) ?? [],
    deliveryAddress: (data.deliveryAddress as string) ?? "",
    deliveryTime: (data.deliveryTime as string) ?? "",
    rejectionReason: data.rejectionReason as string | undefined,
    outOfStockItems: data.outOfStockItems as string[] | undefined,
    assignedCourierId: data.assignedCourierId as string | undefined,
    productionStartedBy: data.productionStartedBy as string | undefined,
    productionStartedAt: toIsoStringOrUndefined(data.productionStartedAt),
    qcReviewedBy: data.qcReviewedBy as string | undefined,
    qcReviewedAt: toIsoStringOrUndefined(data.qcReviewedAt),
    qcFailReason: data.qcFailReason as string | undefined,
    deliveredAt: toIsoStringOrUndefined(data.deliveredAt),
    proofFileIds: data.proofFileIds as string[] | undefined,
    deliveryProofPhotos: data.deliveryProofPhotos as Order["deliveryProofPhotos"],
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    paymentMethod: ((data.paymentMethod as string) ?? "cod") as Order["paymentMethod"],
    paymentProofFileId: data.paymentProofFileId as string | undefined,
    paymentApprovedBy: data.paymentApprovedBy as string | undefined,
    paymentApprovedAt: toIsoStringOrUndefined(data.paymentApprovedAt),
    paymentRejectedBy: data.paymentRejectedBy as string | undefined,
    paymentRejectedAt: toIsoStringOrUndefined(data.paymentRejectedAt),
    paymentRejectionReason: data.paymentRejectionReason as string | undefined,
    productionStartPhotoId: data.productionStartPhotoId as string | undefined,
    productionTimerEnd: toIsoStringOrUndefined(data.productionTimerEnd),
    productionDurationMinutes: data.productionDurationMinutes as number | undefined,
    deliveryStartPhotoId: data.deliveryStartPhotoId as string | undefined,
    deliveryTimerEnd: toIsoStringOrUndefined(data.deliveryTimerEnd),
    deliveryStartedAt: toIsoStringOrUndefined(data.deliveryStartedAt),
    deliveryDurationMinutes: data.deliveryDurationMinutes as number | undefined,
    courierLat: data.courierLat as number | undefined,
    courierLng: data.courierLng as number | undefined,
    deliveryLat: data.deliveryLat as number | undefined,
    deliveryLng: data.deliveryLng as number | undefined,
    customerConfirmedAt: data.customerConfirmedAt ? toIsoString(data.customerConfirmedAt) : undefined,
    rating: data.rating as number | undefined,
    review: data.review as string | undefined,
    reviewPhotoId: data.reviewPhotoId as string | undefined,
    reviewedAt: data.reviewedAt ? toIsoString(data.reviewedAt) : undefined,
    promoCode: data.promoCode as string | undefined,
    discountAmount: data.discountAmount as number | undefined,
    kitchen: data.kitchen as string | undefined,
    itemKitchens: data.itemKitchens as Record<string, string> | undefined,
    qaStartChecklist: data.qaStartChecklist as Order["qaStartChecklist"] | undefined,
    kitchenSignatures: data.kitchenSignatures as Order["kitchenSignatures"],
    isPreOrder: !!data.isPreOrder,
  };
}

function snapshotToOrders(snap: QuerySnapshot<DocumentData>): Order[] {
  return snap.docs.map(snapshotToOrder);
}

function snapshotToCourierGPS(
  snap: DocumentSnapshot<DocumentData>
): CourierGPS | null {
  const data = snap.data();
  if (!data) return null;
  return {
    orderId: (data.orderId as string) ?? "",
    courierId: (data.courierId as string) ?? "",
    latitude: typeof data.latitude === "number" ? data.latitude : 0,
    longitude: typeof data.longitude === "number" ? data.longitude : 0,
    timestamp: toIsoString(data.timestamp),
  };
}

/* ------------------------------------------------------------------ */
/*  Subscriptions (deduplicated via subscriptionManager)               */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to orders across the system.
 *
 * **Scalability & Reliability**: Avoids fragile Firestore orderBy on mixed-type
 * fields (Timestamp vs string) which causes documents to be dropped.
 * By default, loads all operational orders without an aggressive 100-limit cutoff
 * that conceals future or scheduled orders. Sorting is performed in JavaScript
 * based on eventDate (descending) and createdAt (descending).
 *
 * @param listener Callback receiving the decoded orders.
 * @param onError  Optional error callback.
 * @param maxOrders Optional maximum number of orders to listen to (default unbounded).
 */
export function subscribeOrders(
  listener: (orders: Order[]) => void,
  onError?: (err: Error) => void,
  maxOrders?: number
): Unsubscribe {
  const q =
    typeof maxOrders === "number" && maxOrders > 0
      ? query(collection(db, "orders"), limit(maxOrders))
      : query(collection(db, "orders"));

  return subscriptionManager.subscribe(
    q,
    (snap) => {
      const orders = snap.docs.map(snapshotToOrder);
      orders.sort((a, b) => {
        const dateA = a.eventDate || a.createdAt || "";
        const dateB = b.eventDate || b.createdAt || "";
        if (dateB !== dateA) {
          return dateB.localeCompare(dateA);
        }
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
      listener(orders);
    },
    (err) => {
      console.error("subscribeOrders error:", err);
      onError?.(err);
    }
  );
}

/**
 * Subscribe to orders filtered by a single status.
 *
 * **Scalability**: Deduplicated — if multiple components subscribe to
 * the same status, only 1 Firestore listener is created.
 */
export function subscribeOrdersByStatus(
  status: OrderStatus,
  listener: (orders: Order[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "orders"),
    where("status", "==", status)
  );
  return subscriptionManager.subscribe(
    q,
    (snap) => {
      const orders = snapshotToOrders(snap);
      orders.sort((a, b) => {
        const dateA = a.eventDate || a.createdAt || "";
        const dateB = b.eventDate || b.createdAt || "";
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
      listener(orders);
    },
    onError
  );
}

/**
 * Subscribe specifically to active kitchen production orders (PENDING and IN_PRODUCTION).
 * Deduplicated via subscriptionManager and avoids downloading thousands of past orders.
 */
export function subscribeProductionOrders(
  listener: (orders: Order[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "orders"),
    where("status", "in", ["PENDING", "IN_PRODUCTION"])
  );
  return subscriptionManager.subscribe(
    q,
    (snap) => {
      const orders = snapshotToOrders(snap);
      orders.sort((a, b) => {
        const dateA = a.eventDate || a.createdAt || "";
        const dateB = b.eventDate || b.createdAt || "";
        return dateA.localeCompare(dateB);
      });
      listener(orders);
    },
    onError
  );
}

/**
 * Subscribe to a single order document.
 *
 * Single-document listeners are lightweight so they bypass the
 * subscription manager and use `onSnapshot` directly. The fan-out
 * cost for a single-doc listener is O(1).
 */
export function subscribeOrder(
  id: string,
  listener: (order: Order | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "orders", id),
    (snap) => listener(snap.exists() ? snapshotToOrder(snap) : null),
    onError
  );
}

/**
 * Subscribe to all courier GPS locations.
 *
 * **Scalability**: Deduplicated — the admin dashboard's map view may
 * mount multiple components that all need courier locations; only one
 * Firestore listener is opened.
 */
export function subscribeCourierLocations(
  listener: (locations: CourierGPS[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, "courier_locations"), limit(50));
  return subscriptionManager.subscribe(
    q,
    (snap) => {
      const locations: CourierGPS[] = [];
      snap.forEach((d) => {
        const loc = snapshotToCourierGPS(d);
        if (loc) locations.push(loc);
      });
      listener(locations);
    },
    onError
  );
}

/** Subscribe to GPS updates for a specific order. */
export function subscribeOrderLocation(
  orderId: string,
  courierId: string,
  listener: (loc: CourierGPS | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "courier_locations", `${orderId}_${courierId}`),
    (snap) => listener(snap.exists() ? snapshotToCourierGPS(snap) : null),
    onError
  );
}

/** Subscribe to delivery files for a given order. */
export function subscribeOrderFiles(
  orderId: string,
  listener: (files: FileMetadata[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "delivery_files"),
    where("orderId", "==", orderId)
  );
  return subscriptionManager.subscribe(
    q,
    (snap) => {
      const files: FileMetadata[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          orderId: (data.orderId as string) ?? "",
          fileName: (data.fileName as string) ?? "",
          fileSize: (data.fileSize as number) ?? 0,
          fileType: (data.fileType as string) ?? "",
          totalChunks: (data.totalChunks as number) ?? 0,
          status: (data.status as FileMetadata["status"]) ?? "uploading",
          uploadedBy: (data.uploadedBy as string) ?? "",
          createdAt: toIsoString(data.createdAt),
        };
      });
      listener(files);
    },
    onError
  );
}
