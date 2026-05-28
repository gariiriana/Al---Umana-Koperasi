import { useEffect, useMemo, useState } from "react";

import {
  subscribeCourierLocations,
  subscribeOrders,
} from "@/services/realtimeService";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusPipeline } from "@/components/dashboard/StatusPipeline";
import { CourierMap } from "@/components/dashboard/CourierMap";
import { AnomalyAlerts } from "@/components/dashboard/AnomalyAlerts";
import {
  FilterPanel,
  type FilterState,
} from "@/components/dashboard/FilterPanel";

import type { Order } from "@/types/order";
import type { CourierGPS } from "@/types/courier-gps";

const EMPTY_FILTER: FilterState = {
  status: "",
  courierId: "",
  startDate: "",
  endDate: "",
};

export function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [locations, setLocations] = useState<CourierGPS[]>([]);
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);

  useEffect(() => {
    const unsubOrders = subscribeOrders(setOrders, console.error);
    const unsubLocs = subscribeCourierLocations(setLocations, console.error);
    return () => {
      unsubOrders();
      unsubLocs();
    };
  }, []);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filter.status && o.status !== filter.status) return false;
      if (filter.courierId && o.assignedCourierId !== filter.courierId)
        return false;
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
  }, [orders, filter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Real-time view of every order in the pipeline."
      />

      <StatusPipeline orders={orders} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CourierMap locations={locations} />
        </div>
        <div>
          <AnomalyAlerts orders={orders} locations={locations} />
        </div>
      </div>

      <FilterPanel
        value={filter}
        onChange={setFilter}
        onReset={() => setFilter(EMPTY_FILTER)}
      />

      <Card className="!p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB]">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
            Orders
          </h3>
          <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mt-0.5">
            {filtered.length} of {orders.length} match the current filters.
          </p>
        </div>

        {/* Mobile Card List View */}
        <div className="divide-y divide-[#E5E7EB] md:hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-8 text-center font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
              No orders found.
            </div>
          ) : (
            filtered.slice(0, 50).map((o) => (
              <div key={o.id} className="p-4 space-y-2 font-['Hanken_Grotesk',system-ui,sans-serif]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111827]">
                    Order ID: <code className="text-xs font-mono font-normal text-[#4B5563]">{o.id.slice(0, 10)}…</code>
                  </span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="flex justify-between items-center text-xs text-[#4B5563]">
                  <div>
                    <span className="text-[#9CA3AF] mr-1">Customer:</span>
                    <span className="font-semibold text-[#111827]">{o.customerName}</span>
                  </div>
                  <div>
                    <span className="text-[#9CA3AF] mr-1">Courier:</span>
                    <span className="font-semibold text-[#111827]">
                      {o.assignedCourierId ? `${o.assignedCourierId.slice(0, 8)}…` : "—"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs text-[#4B5563]">
                  <div>
                    <span className="text-[#9CA3AF] mr-1">Delivery Time:</span>
                    <span className="font-semibold text-[#111827]">{o.deliveryTime}</span>
                  </div>
                  <div className="text-[10px] text-[#9CA3AF]">
                    {new Date(o.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F9FAFB]">
              <tr>
                {["Order ID", "Customer", "Delivery Time", "Status", "Courier", "Created"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-semibold text-[#6B7280] uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]"
                  >
                    No orders found.
                  </td>
                </tr>
              )}
              {filtered.slice(0, 50).map((o) => (
                <tr key={o.id} className="hover:bg-[#F9FAFB]">
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#111827]">
                    <code className="text-xs">{o.id.slice(0, 10)}…</code>
                  </td>
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#111827]">
                    {o.customerName}
                  </td>
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#111827]">
                    {o.deliveryTime}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
                    {o.assignedCourierId
                      ? `${o.assignedCourierId.slice(0, 8)}…`
                      : "—"}
                  </td>
                  <td className="px-6 py-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default DashboardPage;
