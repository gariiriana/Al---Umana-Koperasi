import { useEffect, useMemo, useState } from "react";
import { Send, Truck, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { ApiError } from "@/services/apiClient";
import {
  assignCourier,
  dispatchOrder,
  transitionOrder,
} from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";

export function DispatchPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [courierIds, setCourierIds] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const ready = useMemo(
    () => orders.filter((o) => o.status === "READY_TO_DELIVER"),
    [orders]
  );
  const enRoute = useMemo(
    () => orders.filter((o) => o.status === "OUT_FOR_DELIVERY"),
    [orders]
  );

  const onAssign = async (o: Order) => {
    const cid = (courierIds[o.id] ?? "").trim() || o.assignedCourierId || "";
    if (!cid) {
      setError("Courier ID is required.");
      return;
    }
    setBusyId(o.id);
    setError(null);
    try {
      await assignCourier(o.id, cid);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const onDispatch = async (o: Order) => {
    setBusyId(o.id);
    setError(null);
    try {
      await dispatchOrder(o.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const onReschedule = async (o: Order) => {
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "reschedule" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch"
        subtitle="Assign couriers and confirm dispatch for ready orders."
      />

      {error && (
        <div className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-4 py-3 text-sm text-[#991B1B] font-['Hanken_Grotesk',system-ui,sans-serif]">
          {error}
        </div>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB]">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
            Ready to deliver ({ready.length})
          </h3>
        </div>
        <ul className="divide-y divide-[#E5E7EB]">
          {ready.length === 0 && (
            <li className="px-6 py-6 text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] text-center">
              Nothing waiting for dispatch.
            </li>
          )}
          {ready.map((o) => (
            <li
              key={o.id}
              className="px-6 py-4 grid grid-cols-1 md:grid-cols-[1fr_240px_auto_auto] gap-3 items-end"
            >
              <div>
                <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-semibold text-[#111827]">
                  {o.customerName}
                </p>
                <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280]">
                  {o.items.length} item(s) · {o.deliveryAddress} · Target: {o.deliveryTime}
                </p>
              </div>
              <Input
                label="Courier ID"
                value={courierIds[o.id] ?? o.assignedCourierId ?? ""}
                onChange={(e) =>
                  setCourierIds((s) => ({ ...s, [o.id]: e.target.value }))
                }
                placeholder="e.g. courier-001"
              />
              <Button
                variant="outlined"
                size="md"
                loading={busyId === o.id}
                onClick={() => onAssign(o)}
              >
                Assign
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={!o.assignedCourierId}
                loading={busyId === o.id}
                onClick={() => onDispatch(o)}
                leftIcon={<Send className="h-4 w-4" />}
              >
                Dispatch
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB]">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
            En route ({enRoute.length})
          </h3>
        </div>
        <ul className="divide-y divide-[#E5E7EB]">
          {enRoute.length === 0 && (
            <li className="px-6 py-6 text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] text-center">
              No active deliveries.
            </li>
          )}
          {enRoute.map((o) => (
            <li
              key={o.id}
              className="px-6 py-4 flex items-center gap-3"
            >
              <Truck className="h-5 w-5 text-[#6B7280]" />
              <div className="min-w-0 flex-1">
                <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-semibold text-[#111827]">
                  {o.customerName}
                </p>
                <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280]">
                  Courier: {o.assignedCourierId ?? "—"} · {o.deliveryAddress} · Target: {o.deliveryTime}
                </p>
              </div>
              <StatusBadge status={o.status} />
              <Button
                variant="outlined"
                size="sm"
                onClick={() => onReschedule(o)}
                loading={busyId === o.id}
                leftIcon={<RotateCcw className="h-3 w-3" />}
              >
                Reschedule
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default DispatchPage;
