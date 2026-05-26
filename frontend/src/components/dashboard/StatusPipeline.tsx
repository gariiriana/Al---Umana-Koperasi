import { motion } from "motion/react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Order, OrderStatus } from "@/types/order";

const STATUSES: OrderStatus[] = [
  "PLACING",
  "CONFIRMED",
  "IN_PRODUCTION",
  "READY",
  "READY_TO_DELIVER",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export interface StatusPipelineProps {
  orders: Order[];
}

export function StatusPipeline({ orders }: StatusPipelineProps) {
  const counts: Record<OrderStatus, number> = {
    PLACING: 0,
    AWAITING_PAYMENT_PROOF: 0,
    AWAITING_PAYMENT_APPROVAL: 0,
    PAYMENT_REJECTED: 0,
    CONFIRMED: 0,
    IN_PRODUCTION: 0,
    READY: 0,
    READY_TO_DELIVER: 0,
    OUT_FOR_DELIVERY: 0,
    DELIVERED: 0,
    FAILED: 0,
  };
  for (const o of orders) counts[o.status] += 1;

  return (
    <div className="flex overflow-x-auto gap-3 pb-2 md:grid md:grid-cols-4 lg:grid-cols-7">
      {STATUSES.map((status) => (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="min-w-[140px] md:min-w-0 flex-1 md:flex-initial shrink-0 md:shrink"
        >
          <Card className="!p-4 h-full">
            <StatusBadge status={status} />
            <p
              className="mt-3 font-['Manrope',system-ui,sans-serif] text-3xl font-bold text-[#111827]"
              data-testid={`pipeline-count-${status}`}
            >
              {counts[status]}
            </p>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

export default StatusPipeline;
