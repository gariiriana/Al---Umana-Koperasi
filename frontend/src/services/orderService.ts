/**
 * Order REST client. Each method maps to one endpoint on the Go backend,
 * plus two Firestore real-time subscriptions (`subscribeToOrder` and
 * `subscribeToPaymentApprovalQueue`) used by the storefront and admin
 * approval queue.
 *
 * Components / hooks should call these helpers rather than crafting fetch
 * requests directly so the auth token, retries, and error envelope are
 * handled uniformly.
 *
 * Requirements covered: 6.1, 7.9, 8.2, 8.5, 8.8, 8.10, 9.2.
 */

import {
  collection,
  doc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { api } from "@/services/apiClient";
import type { Order, OrderLineItem, OrderStatus } from "@/types/order";

/** Payment method identifiers accepted by `POST /api/orders` (Requirement 5.2). */
export type PaymentMethod = "cod" | "bank_transfer" | "e_wallet";

export interface CreateOrderPayload {
  customerName: string;
  deliveryAddress: string;
  deliveryTime: string;
  items: OrderLineItem[];
  /**
   * Selected payment method. Required because the backend uses it to
   * branch the post-stock-check transition (COD → CONFIRMED, non-COD →
   * AWAITING_PAYMENT_PROOF) per Requirements 6.1 and 7.1.
   */
  paymentMethod: PaymentMethod;
}

export interface ListOrdersFilter {
  status?: OrderStatus;
  courierId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

interface ListOrdersResponse {
  orders: Order[];
}

export interface ListMyOrdersOptions {
  /** Opaque cursor returned from a previous `listMyOrders` call. */
  cursor?: string;
  /** Server-side cap is 50 (Requirement 9.2); larger values are clamped server-side. */
  limit?: number;
}

export interface ListMyOrdersResult {
  orders: Order[];
  /** Cursor for the next page; `null` or absent when there are no more pages. */
  nextCursor?: string | null;
}

interface ListMyOrdersResponse {
  orders: Order[];
  nextCursor?: string | null;
  /** Older `next` envelope is tolerated for forward compat. */
  next?: string | null;
}

/**
 * Create a new order. The customer ID is taken from the auth token.
 * `paymentMethod` is required (Requirement 5.2).
 */
export function createOrder(payload: CreateOrderPayload): Promise<Order> {
  return api.post<Order>("/api/orders", payload);
}

/** List orders matching the supplied filter (admin/staff view). */
export async function listOrders(filter: ListOrdersFilter = {}): Promise<Order[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.courierId) params.set("courierId", filter.courierId);
  if (filter.startDate) params.set("startDate", filter.startDate);
  if (filter.endDate) params.set("endDate", filter.endDate);
  if (filter.limit) params.set("limit", String(filter.limit));
  const qs = params.toString();
  const path = qs ? `/api/orders?${qs}` : "/api/orders";
  const res = await api.get<ListOrdersResponse>(path);
  return res.orders ?? [];
}

/**
 * List the signed-in customer's own orders, paginated (Requirement 9.2).
 * Returns at most `min(limit, 50)` orders, sorted by `createdAt` desc;
 * `nextCursor` is `null` when no more pages are available.
 */
export async function listMyOrders(
  opts: ListMyOrdersOptions = {}
): Promise<ListMyOrdersResult> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const path = qs ? `/api/orders/mine?${qs}` : "/api/orders/mine";
  const res = await api.get<ListMyOrdersResponse>(path);
  // Tolerate either `nextCursor` (preferred) or `next` (legacy envelope).
  const cursor =
    res.nextCursor !== undefined ? res.nextCursor : res.next ?? null;
  return {
    orders: res.orders ?? [],
    nextCursor: cursor,
  };
}

/** Fetch a single order by ID. */
export function getOrder(id: string): Promise<Order> {
  return api.get<Order>(`/api/orders/${encodeURIComponent(id)}`);
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
export function transitionOrder(
  id: string,
  payload: TransitionPayload
): Promise<Order> {
  return api.patch<Order>(`/api/orders/${encodeURIComponent(id)}/status`, payload);
}

/** Assign a courier to a READY_TO_DELIVER order. */
export function assignCourier(id: string, courierId: string): Promise<Order> {
  return api.post<Order>(`/api/orders/${encodeURIComponent(id)}/assign-courier`, {
    courierId,
  });
}

/** Confirm dispatch for an assigned order. */
export function dispatchOrder(id: string): Promise<Order> {
  return api.post<Order>(`/api/orders/${encodeURIComponent(id)}/dispatch`);
}

/** Mark an OUT_FOR_DELIVERY order as DELIVERED. */
export function confirmDelivery(
  id: string,
  proofFileIds: string[]
): Promise<Order> {
  return api.post<Order>(`/api/orders/${encodeURIComponent(id)}/deliver`, {
    proofFileIds,
  });
}

/* ------------------------------------------------------------------ */
/*  Payment lifecycle                                                  */
/* ------------------------------------------------------------------ */

/**
 * Attach an already-uploaded payment proof file to an order. Triggers the
 * `AWAITING_PAYMENT_PROOF | PAYMENT_REJECTED → AWAITING_PAYMENT_APPROVAL`
 * transition (Requirement 7.9). Used both directly (e.g. the storefront
 * payment-proof page) and indirectly via `paymentProofService`.
 */
export function attachPaymentProof(
  orderId: string,
  fileId: string
): Promise<Order> {
  return api.post<Order>(
    `/api/orders/${encodeURIComponent(orderId)}/payment-proof`,
    { fileId }
  );
}

/** Admin: approve a payment proof, transitioning to CONFIRMED (Requirement 8.5). */
export function approvePayment(orderId: string): Promise<Order> {
  return api.post<Order>(
    `/api/orders/${encodeURIComponent(orderId)}/payment/approve`
  );
}

/**
 * Admin: reject a payment proof with a Bahasa reason, transitioning to
 * `PAYMENT_REJECTED` (Requirement 8.8). Reason is sent verbatim; the
 * backend trims and validates length 1–500.
 */
export function rejectPayment(
  orderId: string,
  reason: string
): Promise<Order> {
  return api.post<Order>(
    `/api/orders/${encodeURIComponent(orderId)}/payment/reject`,
    { reason }
  );
}

/* ------------------------------------------------------------------ */
/*  Real-time subscriptions                                            */
/* ------------------------------------------------------------------ */

/**
 * Maximum number of orders surfaced by `subscribeToPaymentApprovalQueue`
 * (Requirement 8.2). Keeps the admin view bounded and predictable even
 * if the queue grows.
 */
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
  };
}

function snapshotToOrders(snap: QuerySnapshot<DocumentData>): Order[] {
  return snap.docs.map(snapshotToOrder);
}

/**
 * Subscribe to a single order document for real-time status updates
 * (Requirement 8.10 / 9.6). The callback receives every snapshot,
 * including the initial one. The returned `Unsubscribe` must be called
 * by the caller (typically a React `useEffect` cleanup).
 *
 * If the document is deleted or never existed, the callback is not
 * invoked; `onError` is used for permission / network failures.
 */
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

/**
 * Subscribe to the admin payment-approval queue: orders awaiting
 * approval, newest first, capped at 50 (Requirement 8.2). The cap is
 * enforced server-side via Firestore `limit()` so the listener payload
 * stays bounded even when the underlying collection grows large.
 */
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
