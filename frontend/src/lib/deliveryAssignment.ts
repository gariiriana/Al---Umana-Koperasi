import type { Order, OrderStatus } from "@/types/order";

const ACTIVE_ASSIGNMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "PENDING",
  "IN_PRODUCTION",
  "QC",
  "READY",
  "READY_TO_DELIVER",
  "OUT_FOR_DELIVERY",
]);

export const normalizeCourierIdentity = (value?: string | null): string =>
  (value ?? "").trim().toLocaleLowerCase();

export function isAssignedToCourier(
  order: Pick<Order, "assignedCourierId">,
  identities: Array<string | null | undefined>,
): boolean {
  const assigned = normalizeCourierIdentity(order.assignedCourierId);
  if (!assigned) return false;
  return identities.some((identity) => normalizeCourierIdentity(identity) === assigned);
}

export function isActiveCourierAssignment(status: OrderStatus): boolean {
  return ACTIVE_ASSIGNMENT_STATUSES.has(status);
}

export function canStartCourierDelivery(status: OrderStatus): boolean {
  return status === "READY_TO_DELIVER" || status === "READY";
}

/** Waktu antar pesanan (ms): tanggal acara + jam antar, default 12:00; Infinity bila tak bertanggal. */
export function getOrderDeadline(order: Pick<Order, "eventDate" | "createdAt" | "deliveryTime">): number {
  const dateStr = order.eventDate || order.createdAt;
  if (!dateStr) return Infinity;
  const datePart = dateStr.slice(0, 10);
  let time = "12:00";
  if (order.deliveryTime) {
    const match = order.deliveryTime.match(/(\d{2})[:.](\d{2})/);
    if (match) {
      time = `${match[1]}:${match[2]}`;
    }
  }
  const ts = Date.parse(`${datePart}T${time}`);
  return isNaN(ts) ? Infinity : ts;
}

