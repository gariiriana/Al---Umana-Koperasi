import { describe, expect, it } from "vitest";

import {
  canStartCourierDelivery,
  isActiveCourierAssignment,
  isAssignedToCourier,
} from "@/lib/deliveryAssignment";
import type { OrderStatus } from "@/types/order";

describe("courier delivery assignment visibility", () => {
  it("keeps every assigned operational task visible, including kitchen preparation", () => {
    const statuses: OrderStatus[] = [
      "PENDING",
      "IN_PRODUCTION",
      "QC",
      "READY_TO_DELIVER",
      "OUT_FOR_DELIVERY",
    ];

    expect(statuses.filter(isActiveCourierAssignment)).toHaveLength(5);
  });

  it("matches legacy courier names without case or whitespace sensitivity", () => {
    const order = { assignedCourierId: "  Rahmat " };

    expect(isAssignedToCourier(order, ["uid-rahmat", "RAHMAT", "rahmat@alumana.id"])).toBe(true);
  });

  it("only lets ready orders start while upcoming assignments stay read-only", () => {
    expect(canStartCourierDelivery("PENDING")).toBe(false);
    expect(canStartCourierDelivery("IN_PRODUCTION")).toBe(false);
    expect(canStartCourierDelivery("READY_TO_DELIVER")).toBe(true);
    expect(canStartCourierDelivery("READY")).toBe(true);
  });
});

