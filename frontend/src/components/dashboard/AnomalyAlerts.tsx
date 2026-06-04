import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/Card";
import type { Order } from "@/types/order";
import type { CourierGPS } from "@/types/courier-gps";

interface Anomaly {
  id: string;
  kind: "gps_stale" | "rescheduled";
  title: string;
  detail: string;
  orderId: string;
  observedAt: number;
}

const STALE_GPS_MS = 5 * 60 * 1000;

export interface AnomalyAlertsProps {
  orders: Order[];
  locations: CourierGPS[];
  onSelectOrder?: (orderId: string) => void;
}

export function AnomalyAlerts({ orders, locations, onSelectOrder }: AnomalyAlertsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Detect anomalies on every render (cheap; small set sizes).
  const anomalies = useMemo<Anomaly[]>(() => {
    const list: Anomaly[] = [];
    const now = Date.now();
    const locByOrder = new Map<string, CourierGPS>();
    for (const loc of locations) locByOrder.set(loc.orderId, loc);

    for (const order of orders) {
      // GPS staleness (Req 5.3 / 9.4)
      if (order.status === "OUT_FOR_DELIVERY") {
        const loc = locByOrder.get(order.id);
        if (loc) {
          const ts = new Date(loc.timestamp).getTime();
          if (!Number.isNaN(ts) && now - ts > STALE_GPS_MS) {
            list.push({
              id: `gps_stale_${order.id}`,
              kind: "gps_stale",
              title: "GPS update overdue",
              detail: `Courier for order ${order.id.slice(0, 8)}… has not reported a GPS position for over 5 minutes.`,
              orderId: order.id,
              observedAt: now,
            });
          }
        } else {
          list.push({
            id: `gps_missing_${order.id}`,
            kind: "gps_stale",
            title: "No GPS data",
            detail: `Order ${order.id.slice(0, 8)}… is out for delivery but no GPS position has been recorded.`,
            orderId: order.id,
            observedAt: now,
          });
        }
      }

      // Reschedule transition (Req 9.3) — heuristic: orders that were in
      // OUT_FOR_DELIVERY recently but are now in READY_TO_DELIVER again.
      if (
        order.status === "READY_TO_DELIVER" &&
        order.assignedCourierId
      ) {
        list.push({
          id: `rescheduled_${order.id}`,
          kind: "rescheduled",
          title: "Delivery rescheduled",
          detail: `Order ${order.id.slice(0, 8)}… was returned to the dispatch queue.`,
          orderId: order.id,
          observedAt: now,
        });
      }
    }
    return list.filter((a) => !dismissed.has(a.id));
  }, [orders, locations, dismissed]);

  // Auto-clear stale anomalies if they fall off the active list.
  useEffect(() => {
    if (dismissed.size === 0) return;
    const activeIds = new Set(anomalies.map((a) => a.id));
    const stillRelevant = new Set<string>();
    for (const id of dismissed) {
      if (activeIds.has(id)) stillRelevant.add(id);
    }
    if (stillRelevant.size !== dismissed.size) {
      setDismissed(stillRelevant);
    }
  }, [anomalies, dismissed]);

  if (anomalies.length === 0) {
    return (
      <Card className="!p-4">
        <div className="flex items-center gap-2 text-[#10B981]">
          <span className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-semibold">
            All systems normal
          </span>
        </div>
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mt-1">
          No anomalies detected.
        </p>
      </Card>
    );
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB] flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-[#EF4444]" />
        <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
          Anomaly Alerts
        </h3>
        <span className="ml-auto text-xs font-semibold text-[#6B7280]">
          {anomalies.length}
        </span>
      </div>
      <div className="divide-y divide-[#E5E7EB] max-h-80 overflow-y-auto">
        <AnimatePresence>
          {anomalies.map((a) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              onClick={() => onSelectOrder?.(a.orderId)}
              className="px-6 py-3 flex items-start gap-3 hover:bg-[#F9FAFB] cursor-pointer transition-colors group/item"
              title="Klik untuk detail pesanan"
            >
              <div
                className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-[#FEE2E2] flex items-center justify-center group-hover/item:scale-105 transition-transform"
                aria-hidden="true"
              >
                <AlertTriangle className="h-4 w-4 text-[#991B1B]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-semibold text-[#111827] group-hover/item:text-[#D97706] transition-colors">
                    {a.title}
                  </p>
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded font-semibold opacity-0 group-hover/item:opacity-100 transition-opacity">
                    Lihat detail
                  </span>
                </div>
                <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mt-0.5">
                  {a.detail}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDismissed((s) => new Set(s).add(a.id));
                }}
                aria-label="Dismiss alert"
                className="shrink-0 h-7 w-7 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4 text-[#6B7280]" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Card>
  );
}

export default AnomalyAlerts;
