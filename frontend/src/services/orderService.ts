/**
 * Order REST client. Each method maps to one endpoint on the Go backend.
 *
 * Components / hooks should call these helpers rather than crafting fetch
 * requests directly so the auth token, retries, and error envelope are
 * handled uniformly.
 */

import { api } from "@/services/apiClient";
import type { Order, OrderLineItem, OrderStatus } from "@/types/order";

export interface CreateOrderPayload {
  customerName: string;
  deliveryAddress: string;
  items: OrderLineItem[];
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

/** Create a new order. The customer ID is taken from the auth token. */
export function createOrder(payload: CreateOrderPayload): Promise<Order> {
  return api.post<Order>("/api/orders", payload);
}

/** List orders matching the supplied filter. */
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
