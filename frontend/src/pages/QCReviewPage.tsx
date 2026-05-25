import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { ApiError } from "@/services/apiClient";
import { transitionOrder } from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";

const MAX_REASON = 500;

export function QCReviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const queue = useMemo(
    () =>
      orders
        .filter((o) => o.status === "READY")
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [orders]
  );

  const pass = async (o: Order) => {
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "qc-pass" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const fail = async (o: Order) => {
    const reason = (reasons[o.id] ?? "").trim();
    if (!reason) {
      setError("Fail reason is required.");
      return;
    }
    if (reason.length > MAX_REASON) {
      setError(`Fail reason must be at most ${MAX_REASON} characters.`);
      return;
    }
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "qc-fail", reason });
      setReasons((s) => ({ ...s, [o.id]: "" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quality Control"
        subtitle="Review production output before dispatch."
      />

      {error && (
        <div className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-4 py-3 text-sm text-[#991B1B] font-['Hanken_Grotesk',system-ui,sans-serif]">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {queue.length === 0 && (
          <Card className="text-center">
            <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
              Nothing waiting for QC review.
            </p>
          </Card>
        )}

        {queue.map((o) => {
          const reason = reasons[o.id] ?? "";
          const remaining = MAX_REASON - reason.length;
          return (
            <Card key={o.id}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
                  {o.customerName}
                </p>
                <StatusBadge status={o.status} />
              </div>
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mb-1">
                Order ID: <code>{o.id.slice(0, 10)}…</code>
              </p>
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mb-2">
                Delivery time: <span className="font-semibold text-[#111827]">{o.deliveryTime}</span>
              </p>
              <ul className="text-sm font-['Hanken_Grotesk',system-ui,sans-serif] text-[#374151] mb-4">
                {o.items.map((it) => (
                  <li key={it.itemId} className="flex justify-between py-0.5">
                    <span>{it.itemName}</span>
                    <span className="text-[#6B7280]">×{it.quantity}</span>
                  </li>
                ))}
              </ul>

              <div className="mb-3">
                <label
                  htmlFor={`reason-${o.id}`}
                  className="block mb-1.5 text-xs font-medium text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]"
                >
                  Fail reason (required to fail)
                </label>
                <textarea
                  id={`reason-${o.id}`}
                  rows={2}
                  maxLength={MAX_REASON}
                  value={reason}
                  onChange={(e) =>
                    setReasons((s) => ({ ...s, [o.id]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif] text-[#111827] focus:border-[#FBBF24] focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                  placeholder="Describe what failed (≤ 500 chars)"
                />
                <p className="mt-1 text-xs text-[#6B7280] text-right font-['Hanken_Grotesk',system-ui,sans-serif]">
                  {remaining} chars left
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="primary"
                  loading={busyId === o.id}
                  onClick={() => pass(o)}
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                >
                  Pass
                </Button>
                <Button
                  variant="danger"
                  loading={busyId === o.id}
                  onClick={() => fail(o)}
                  leftIcon={<XCircle className="h-4 w-4" />}
                >
                  Fail
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default QCReviewPage;
