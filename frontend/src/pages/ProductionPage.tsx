import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckCheck, Play } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { ApiError } from "@/services/apiClient";
import { transitionOrder } from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";

export function ProductionPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const queue = orders
    .filter((o) => o.status === "CONFIRMED" || o.status === "IN_PRODUCTION")
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  const start = async (o: Order) => {
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "start-production" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const complete = async (o: Order) => {
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "complete-production" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production"
        subtitle="Confirmed orders waiting to be made and items currently in production."
      />

      {error && (
        <div className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-4 py-3 text-sm text-[#991B1B] font-['Hanken_Grotesk',system-ui,sans-serif]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {queue.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3 text-center">
            <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
              No orders to produce right now.
            </p>
          </Card>
        )}
        {queue.map((o) => (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Card>
              <div className="flex items-center justify-between mb-3">
                <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827] truncate">
                  {o.customerName}
                </p>
                <StatusBadge status={o.status} />
              </div>
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mb-1">
                Order ID: <code className="font-mono">{o.id.slice(0, 10)}…</code>
              </p>
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mb-2">
                Delivery time: <span className="font-semibold text-[#111827]">{o.deliveryTime}</span>
              </p>
              <ul className="text-sm font-['Hanken_Grotesk',system-ui,sans-serif] text-[#374151] mb-4">
                {o.items.map((it) => (
                  <li key={it.itemId} className="flex justify-between py-0.5">
                    <span className="truncate">{it.itemName}</span>
                    <span className="text-[#6B7280] ml-2 shrink-0">
                      ×{it.quantity}
                    </span>
                  </li>
                ))}
              </ul>
              {o.status === "CONFIRMED" && (
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  loading={busyId === o.id}
                  onClick={() => start(o)}
                  leftIcon={<Play className="h-4 w-4" />}
                >
                  Start production
                </Button>
              )}
              {o.status === "IN_PRODUCTION" && (
                <Button
                  variant="secondary"
                  size="md"
                  className="w-full"
                  loading={busyId === o.id}
                  onClick={() => complete(o)}
                  leftIcon={<CheckCheck className="h-4 w-4" />}
                >
                  Mark complete
                </Button>
              )}
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default ProductionPage;
