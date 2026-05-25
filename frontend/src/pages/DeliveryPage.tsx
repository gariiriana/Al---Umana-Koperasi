import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";
import { PICConfirmation } from "@/components/delivery/PICConfirmation";
import { ProofCapture } from "@/components/delivery/ProofCapture";
import { Button } from "@/components/ui/Button";

export function DeliveryPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picConfirmed, setPicConfirmed] = useState(false);

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const myDeliveries = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === "OUT_FOR_DELIVERY" &&
          (!user || o.assignedCourierId === user.uid)
      ),
    [orders, user]
  );

  const active = activeId ? orders.find((o) => o.id === activeId) ?? null : null;

  const reset = () => {
    setActiveId(null);
    setPicConfirmed(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery"
        subtitle="Confirm the handover, capture proof, and finalise the order."
      />

      {!active && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB]">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
              Select an order to deliver
            </h3>
          </div>
          <ul className="divide-y divide-[#E5E7EB]">
            {myDeliveries.length === 0 && (
              <li className="px-6 py-6 text-sm text-[#6B7280] text-center font-['Hanken_Grotesk',system-ui,sans-serif]">
                No active deliveries.
              </li>
            )}
            {myDeliveries.map((o) => (
              <li
                key={o.id}
                className="px-6 py-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-semibold text-[#111827]">
                    {o.customerName}
                  </p>
                  <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] truncate">
                    Target: {o.deliveryTime} · {o.deliveryAddress}
                  </p>
                </div>
                <StatusBadge status={o.status} />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setActiveId(o.id);
                    setPicConfirmed(false);
                  }}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {active && !picConfirmed && (
        <PICConfirmation
          customerName={active.customerName}
          onConfirm={() => setPicConfirmed(true)}
          onCancel={reset}
        />
      )}

      {active && picConfirmed && (
        <ProofCapture
          orderId={active.id}
          customerName={active.customerName}
          onComplete={reset}
        />
      )}

      {active && (
        <div>
          <Button variant="outlined" size="sm" onClick={reset}>
            ← Back to deliveries
          </Button>
        </div>
      )}
    </div>
  );
}

export default DeliveryPage;
