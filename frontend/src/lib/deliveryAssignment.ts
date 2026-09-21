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

