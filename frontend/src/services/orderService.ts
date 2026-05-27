/**
 * Order client using Firestore direct access.
 *
 * Implements order management operations and lifecycle transitions directly via
 * the Firebase Client SDK, bypassing the Go order package endpoints.
 *
 * Contains two Firestore real-time subscriptions (`subscribeToOrder` and
 * `subscribeToPaymentApprovalQueue`) used by the storefront and admin
 * approval queue.
 *
 * Requirements covered: 5.2, 6.1, 7.1, 7.7, 7.9, 7.12, 8.2, 8.5, 8.8, 8.9,
 * 8.10, 9.2.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  runTransaction,
  deleteDoc,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
  type DocumentReference,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { currentUser } from "@/services/authService";
import type { Order, OrderLineItem, OrderStatus } from "@/types/order";

/** Payment method identifiers accepted by the order creation. */
export type PaymentMethod = "cod" | "bank_transfer" | "e_wallet";

export interface CreateOrderPayload {
  customerName: string;
  deliveryAddress: string;
  deliveryTime: string;
  items: OrderLineItem[];
  paymentMethod: PaymentMethod;
}

export interface ListOrdersFilter {
  status?: OrderStatus;
  courierId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface ListMyOrdersOptions {
  cursor?: string;
  limit?: number;
}

export interface ListMyOrdersResult {
  orders: Order[];
  nextCursor?: string | null;
}

const PAYMENT_APPROVAL_QUEUE_LIMIT = 50;

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function toIsoStringOrUndefined(value: unknown): string | undefined {
  if (value == null) return undefined;
  return toIsoString(value);
}

function snapshotToOrder(snap: DocumentSnapshot<DocumentData>): Order {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    customerId: (data.customerId as string) ?? "",
    customerName: (data.customerName as string) ?? "",
    items: (data.items as OrderLineItem[]) ?? [],
    deliveryAddress: (data.deliveryAddress as string) ?? "",
    deliveryTime: (data.deliveryTime as string) ?? "",
    status: ((data.status as string) ?? "PLACING") as OrderStatus,
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
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    paymentMethod: ((data.paymentMethod as string) ?? "cod") as Order["paymentMethod"],
    paymentStatus: data.paymentStatus as string | undefined,
    paymentProofFileId: data.paymentProofFileId as string | undefined,
    paymentApprovedBy: data.paymentApprovedBy as string | undefined,
    paymentApprovedAt: toIsoStringOrUndefined(data.paymentApprovedAt),
    paymentRejectedBy: data.paymentRejectedBy as string | undefined,
    paymentRejectedAt: toIsoStringOrUndefined(data.paymentRejectedAt),
    paymentRejectionReason: data.paymentRejectionReason as string | undefined,
  };
}

function snapshotToOrders(snap: QuerySnapshot<DocumentData>): Order[] {
  return snap.docs.map(snapshotToOrder);
}

/**
 * Create a new order. The customer ID is taken from the auth token.
 * Validates stock and reduces it in a transaction.
 */
export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const user = currentUser();
  if (!user) {
    throw new Error("Unauthorized to create order");
  }

  const colRef = collection(db, "orders");
  const orderDocRef = doc(colRef);

  await runTransaction(db, async (tx) => {
    const outOfStockItems: string[] = [];
    // Cache inventory details during reads phase to avoid reads-after-writes in the second phase
    const inventoryDataMap = new Map<string, { quantity: number; available?: boolean }>();

    // 1. Fetch and verify stock for all items (READS PHASE)
    for (const item of payload.items) {
      const itemRef = doc(db, "inventory", item.itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) {
        outOfStockItems.push(item.itemId);
        continue;
      }
      const data = itemSnap.data();
      const currentQty = (data.quantity as number) ?? 0;
      inventoryDataMap.set(item.itemId, {
        quantity: currentQty,
        available: data.available as boolean | undefined,
      });

      if (currentQty < item.quantity) {
        outOfStockItems.push(item.itemId);
      }
    }

    const now = new Date();
    const orderData: Record<string, unknown> = {
      customerId: user.uid,
      customerName: payload.customerName,
      items: payload.items,
      deliveryAddress: payload.deliveryAddress,
      deliveryTime: payload.deliveryTime,
      paymentMethod: payload.paymentMethod,
      createdAt: now,
      updatedAt: now,
    };

    // 2. Branch depending on stock availability (WRITES PHASE)
    if (outOfStockItems.length > 0) {
      orderData.status = "FAILED";
      orderData.outOfStockItems = outOfStockItems;
      orderData.rejectionReason = "items unavailable: " + outOfStockItems.join(", ");
    } else {
      // Deduct stock (WRITES ONLY)
      for (const item of payload.items) {
        const itemRef = doc(db, "inventory", item.itemId);
        const data = inventoryDataMap.get(item.itemId);
        const currentQty = data?.quantity ?? 0;
        const newQty = currentQty - item.quantity;
        tx.update(itemRef, {
          quantity: newQty,
          available: newQty > 0 ? (data?.available ?? true) : false,
          updatedAt: now.toISOString(),
        });
      }

      if (payload.paymentMethod === "cod") {
        orderData.status = "CONFIRMED";
      } else {
        orderData.status = "AWAITING_PAYMENT_PROOF";
        orderData.paymentStatus = "awaiting_proof";
      }
    }

    tx.set(orderDocRef, orderData);
  });

  const finalSnap = await getDoc(orderDocRef);
  return snapshotToOrder(finalSnap);
}

export async function listOrders(filter: ListOrdersFilter = {}): Promise<Order[]> {
  const colRef = collection(db, "orders");
  
  // Retrieve all orders (uses default auto-created single-field indexes)
  const snap = await getDocs(colRef);
  let orders = snapshotToOrders(snap);

  // 1. Sort by createdAt descending in-memory
  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  // 2. Filter in-memory
  if (filter.status) {
    orders = orders.filter((o) => o.status === filter.status);
  }
  if (filter.courierId) {
    orders = orders.filter((o) => o.assignedCourierId === filter.courierId);
  }
  if (filter.startDate) {
    const start = new Date(filter.startDate);
    orders = orders.filter((o) => new Date(o.createdAt) >= start);
  }
  if (filter.endDate) {
    const end = new Date(filter.endDate);
    orders = orders.filter((o) => new Date(o.createdAt) <= end);
  }
  if (filter.limit) {
    orders = orders.slice(0, filter.limit);
  }

  return orders;
}

/**
 * List the signed-in customer's own orders, paginated.
 */
export async function listMyOrders(
  opts: ListMyOrdersOptions = {}
): Promise<ListMyOrdersResult> {
  const user = currentUser();
  if (!user) {
    throw new Error("Unauthorized to list orders");
  }

  const colRef = collection(db, "orders");
  // Only query by customerId (automatic single-field index) to avoid composite index requirement
  const q = query(colRef, where("customerId", "==", user.uid));
  const snap = await getDocs(q);
  const allOrders = snapshotToOrders(snap);

  // Sort by createdAt descending in-memory
  allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Filter by cursor (pagination) in-memory
  let resultOrders = allOrders;
  if (opts.cursor) {
    const cursorTime = Date.parse(opts.cursor);
    resultOrders = allOrders.filter((o) => Date.parse(o.createdAt) < cursorTime);
  }

  // Paginate / limit in-memory
  const limitCount = Math.min(opts.limit ?? 50, 50);
  const slicedOrders = resultOrders.slice(0, limitCount);

  let nextCursor: string | null = null;
  if (resultOrders.length > limitCount) {
    nextCursor = slicedOrders[slicedOrders.length - 1].createdAt;
  }

  return {
    orders: slicedOrders,
    nextCursor,
  };
}

/** Fetch a single order by ID. */
export async function getOrder(id: string): Promise<Order> {
  const docSnap = await getDoc(doc(db, "orders", id));
  if (!docSnap.exists()) {
    throw new Error("Order not found");
  }
  return snapshotToOrder(docSnap);
}

export type TransitionAction =
  | "start-production"
  | "complete-production"
  | "qc-pass"
  | "qc-fail"
  | "reschedule";

export interface TransitionPayload {
  action: TransitionAction;
  reason?: string;
}

/** Apply a state machine transition to an order. */
export async function transitionOrder(
  id: string,
  payload: TransitionPayload
): Promise<Order> {
  const user = currentUser();
  const actorUid = user?.uid ?? "unknown";

  await runTransaction(db, async (tx) => {
    const docRef = doc(db, "orders", id);
    const snap = await tx.get(docRef);
    if (!snap.exists()) {
      throw new Error("Order not found");
    }
    const currentStatus = snap.data().status as OrderStatus;
    const now = new Date();

    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    switch (payload.action) {
      case "start-production":
        if (currentStatus !== "CONFIRMED") {
          throw new Error(`Invalid transition CONFIRMED -> IN_PRODUCTION`);
        }
        updates.status = "IN_PRODUCTION";
        updates.productionStartedBy = actorUid;
        updates.productionStartedAt = now;
        break;

      case "complete-production":
        if (currentStatus !== "IN_PRODUCTION") {
          throw new Error(`Invalid transition IN_PRODUCTION -> READY`);
        }
        updates.status = "READY";
        break;

      case "qc-pass":
        if (currentStatus !== "READY") {
          throw new Error(`Invalid transition READY -> READY_TO_DELIVER`);
        }
        updates.status = "READY_TO_DELIVER";
        updates.qcReviewedBy = actorUid;
        updates.qcReviewedAt = now;
        break;

      case "qc-fail":
        if (currentStatus !== "READY") {
          throw new Error(`Invalid transition READY -> CONFIRMED (QC_FAIL)`);
        }
        if (!payload.reason || payload.reason.trim() === "") {
          throw new Error("QC fail reason is required");
        }
        updates.status = "CONFIRMED";
        updates.qcReviewedBy = actorUid;
        updates.qcReviewedAt = now;
        updates.qcFailReason = payload.reason.trim();
        break;

      case "reschedule":
        if (currentStatus !== "OUT_FOR_DELIVERY") {
          throw new Error(`Invalid transition OUT_FOR_DELIVERY -> READY_TO_DELIVER`);
        }
        updates.status = "READY_TO_DELIVER";
        break;

      default:
        throw new Error(`Unknown action ${payload.action}`);
    }

    tx.update(docRef, updates);
  });

  return getOrder(id);
}

/** Assign a courier to a READY_TO_DELIVER order. */
export async function assignCourier(id: string, courierId: string): Promise<Order> {
  const docRef = doc(db, "orders", id);
  await updateDocAndReturn(docRef, {
    assignedCourierId: courierId,
    updatedAt: new Date(),
  });
  return getOrder(id);
}

/** Confirm dispatch for an assigned order. */
export async function dispatchOrder(id: string): Promise<Order> {
  const docRef = doc(db, "orders", id);
  await updateDocAndReturn(docRef, {
    status: "OUT_FOR_DELIVERY",
    updatedAt: new Date(),
  });
  return getOrder(id);
}

/** Mark an OUT_FOR_DELIVERY order as DELIVERED. */
export async function confirmDelivery(
  id: string,
  proofFileIds: string[]
): Promise<Order> {
  const docRef = doc(db, "orders", id);
  const updates: Record<string, unknown> = {
    status: "DELIVERED",
    deliveredAt: new Date(),
    updatedAt: new Date(),
  };
  if (proofFileIds.length > 0) {
    updates.proofFileIds = proofFileIds;
  }
  await updateDocAndReturn(docRef, updates);
  return getOrder(id);
}

/* ------------------------------------------------------------------ */
/*  Payment lifecycle                                                  */
/* ------------------------------------------------------------------ */

/**
 * Attach an already-uploaded payment proof file to an order.
 */
export async function attachPaymentProof(
  orderId: string,
  fileId: string
): Promise<Order> {
  const user = currentUser();
  if (!user) {
    throw new Error("Unauthorized to attach payment proof");
  }

  const docRef = doc(db, "orders", orderId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error("Order not found");
  }
  const currentStatus = snap.data().status;
  const currentProof = snap.data().paymentProofFileId as string | undefined;

  if (currentStatus !== "AWAITING_PAYMENT_PROOF" && currentStatus !== "PAYMENT_REJECTED") {
    throw new Error(`Invalid status for proof upload: ${currentStatus}`);
  }

  const updates: Record<string, unknown> = {
    status: "AWAITING_PAYMENT_APPROVAL",
    paymentStatus: "awaiting_approval",
    paymentProofFileId: "payment_proofs/" + fileId,
    updatedAt: new Date(),
  };

  await updateDocAndReturn(docRef, updates);

  // If there was a previous proof (re-upload), cascade delete it
  if (currentStatus === "PAYMENT_REJECTED" && currentProof) {
    const prevFileId = currentProof.replace("payment_proofs/", "");
    if (prevFileId) {
      try {
        await deleteDoc(doc(db, "payment_proofs", prevFileId));
        for (let i = 0; i < 30; i++) {
          await deleteDoc(doc(db, "payment_proofs", prevFileId, "chunks", String(i)));
        }
      } catch (err) {
        console.warn(`Failed to clean up old proof ${prevFileId}:`, err);
      }
    }
  }

  return getOrder(orderId);
}

/** Admin: approve a payment proof, transitioning to CONFIRMED. */
export async function approvePayment(orderId: string): Promise<Order> {
  const user = currentUser();
  const adminUid = user?.uid ?? "unknown";
  const docRef = doc(db, "orders", orderId);

  await updateDocAndReturn(docRef, {
    status: "CONFIRMED",
    paymentStatus: "approved",
    paymentApprovedBy: adminUid,
    paymentApprovedAt: new Date(),
    updatedAt: new Date(),
  });
  return getOrder(orderId);
}

/**
 * Admin: reject a payment proof, transitioning to PAYMENT_REJECTED.
 */
export async function rejectPayment(
  orderId: string,
  reason: string
): Promise<Order> {
  const user = currentUser();
  const adminUid = user?.uid ?? "unknown";
  const docRef = doc(db, "orders", orderId);

  await updateDocAndReturn(docRef, {
    status: "PAYMENT_REJECTED",
    paymentStatus: "rejected",
    paymentRejectionReason: reason.trim(),
    paymentRejectedBy: adminUid,
    paymentRejectedAt: new Date(),
    updatedAt: new Date(),
  });
  return getOrder(orderId);
}

/* Helper to update doc directly */
async function updateDocAndReturn(
  docRef: DocumentReference<DocumentData>,
  updates: Record<string, unknown>
): Promise<void> {
  // Use runTransaction or setDoc with merge to ensure updates are written
  await runTransaction(db, async (tx) => {
    tx.set(docRef, updates, { merge: true });
  });
}

/* ------------------------------------------------------------------ */
/*  Real-time subscriptions                                            */
/* ------------------------------------------------------------------ */

export function subscribeToOrder(
  orderId: string,
  cb: (order: Order) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "orders", orderId),
    (snap) => {
      if (!snap.exists()) return;
      cb(snapshotToOrder(snap));
    },
    onError
  );
}

export function subscribeToPaymentApprovalQueue(
  cb: (orders: Order[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "orders"),
    where("status", "==", "AWAITING_PAYMENT_APPROVAL"),
    orderBy("createdAt", "desc"),
    firestoreLimit(PAYMENT_APPROVAL_QUEUE_LIMIT)
  );
  return onSnapshot(q, (snap) => cb(snapshotToOrders(snap)), onError);
}
