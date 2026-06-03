import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { Order, OrderStatus, OrderLineItem } from "@/types/order";
import type { FilterState } from "../components/dashboard/FilterPanel";

// Extracted pure filter function from DashboardPage.tsx
function filterOrders(orders: Order[], filter: FilterState): Order[] {
  return orders.filter((o) => {
    if (filter.status && o.status !== filter.status) return false;
    if (filter.courierId && o.assignedCourierId !== filter.courierId) return false;
    if (filter.startDate) {
      const t = new Date(filter.startDate).getTime();
      if (new Date(o.createdAt).getTime() < t) return false;
    }
    if (filter.endDate) {
      // Inclusive end-of-day
      const t = new Date(filter.endDate).getTime() + 24 * 3600 * 1000 - 1;
      if (new Date(o.createdAt).getTime() > t) return false;
    }
    return true;
  });
}

describe("Dashboard Filter AND Logic (Property 17)", () => {
  const statuses: OrderStatus[] = [
    "PENDING",
    "IN_PRODUCTION",
    "QC",
    "READY_TO_DELIVER",
    "OUT_FOR_DELIVERY",
    "COMPLETED",
    "DELIVERY_FAILED",
  ];

  it("should ensure filtered results satisfy ALL selected criteria simultaneously (AND logic)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            customerId: fc.string(),
            customerName: fc.string(),
            status: fc.constantFrom(...statuses),
            assignedCourierId: fc.oneof(
              fc.constant(""),
              fc.constantFrom("courier_1", "courier_2", "courier_3")
            ),
            createdAt: fc.integer({
              min: new Date("2026-01-01T00:00:00Z").getTime(),
              max: new Date("2026-12-31T23:59:59Z").getTime(),
            }).map((ts) => new Date(ts).toISOString()),
            items: fc.constant([] as OrderLineItem[]),
            deliveryAddress: fc.string(),
            deliveryTime: fc.string(),
            updatedAt: fc.string(),
          }) as fc.Arbitrary<Order>
        ),
        // Generator for filter state
        fc.record({
          status: fc.constantFrom("", ...statuses),
          courierId: fc.constantFrom("", "courier_1", "courier_2", "courier_4"),
          startDate: fc.oneof(
            fc.constant(""),
            fc.constant("2026-03-01"),
            fc.constant("2026-06-01")
          ),
          endDate: fc.oneof(
            fc.constant(""),
            fc.constant("2026-08-01"),
            fc.constant("2026-11-01")
          ),
        }),
        (orders: Order[], filter: FilterState) => {
          const results = filterOrders(orders, filter);

          // Verify AND condition for all items in the result
          for (const o of results) {
            if (filter.status) {
              expect(o.status).toBe(filter.status);
            }
            if (filter.courierId) {
              expect(o.assignedCourierId).toBe(filter.courierId);
            }
            if (filter.startDate) {
              const startT = new Date(filter.startDate).getTime();
              expect(new Date(o.createdAt).getTime()).toBeGreaterThanOrEqual(startT);
            }
            if (filter.endDate) {
              const endT = new Date(filter.endDate).getTime() + 24 * 3600 * 1000 - 1;
              expect(new Date(o.createdAt).getTime()).toBeLessThanOrEqual(endT);
            }
          }

          // Verify that any order not in the results violates at least one filter
          const resultIds = new Set(results.map((r) => r.id));
          const excluded = orders.filter((o) => !resultIds.has(o.id));

          for (const o of excluded) {
            const matchesStatus = !filter.status || o.status === filter.status;
            const matchesCourier =
              !filter.courierId || o.assignedCourierId === filter.courierId;
            const matchesStart =
              !filter.startDate ||
              new Date(o.createdAt).getTime() >= new Date(filter.startDate).getTime();
            const matchesEnd =
              !filter.endDate ||
              new Date(o.createdAt).getTime() <=
                new Date(filter.endDate).getTime() + 24 * 3600 * 1000 - 1;

            const satisfiesAll =
              matchesStatus && matchesCourier && matchesStart && matchesEnd;
            expect(satisfiesAll).toBe(false);
          }
        }
      )
    );
  });
});
