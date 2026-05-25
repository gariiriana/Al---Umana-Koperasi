import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import {
  startTracker,
  type Tracker,
} from "@/services/gpsService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";

const courierIcon = new L.DivIcon({
  className: "courier-self",
  html: `<div style="width:30px;height:30px;border-radius:9999px;background:#FBBF24;border:3px solid #FFF;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:#111827;font-weight:700;">📍</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

export function TrackingPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeOrders(setOrders, console.error), []);
  useEffect(() => () => tracker?.stop(), [tracker]);

  const myDeliveries = orders.filter(
    (o) =>
      o.status === "OUT_FOR_DELIVERY" &&
      (!user || o.assignedCourierId === user.uid)
  );

  const start = (orderId: string) => {
    if (!user) return;
    setError(null);
    tracker?.stop();
    const t = startTracker({
      orderId,
      courierId: user.uid,
      onWrite: (lat, lng) => setPos([lat, lng]),
      onError: (e) => setError(e.message),
    });
    setTracker(t);
    setActiveOrderId(orderId);
  };

  const stop = () => {
    tracker?.stop();
    setTracker(null);
    setActiveOrderId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Tracking"
        subtitle="Start GPS broadcasting when you begin a delivery."
      />

      {error && (
        <div className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-4 py-3 text-sm text-[#991B1B] font-['Hanken_Grotesk',system-ui,sans-serif]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="!p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB]">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
              My active deliveries
            </h3>
          </div>
          <ul className="divide-y divide-[#E5E7EB]">
            {myDeliveries.length === 0 && (
              <li className="px-6 py-6 text-sm text-[#6B7280] text-center font-['Hanken_Grotesk',system-ui,sans-serif]">
                No active deliveries assigned to you.
              </li>
            )}
            {myDeliveries.map((o) => {
              const isActive = activeOrderId === o.id;
              return (
                <li
                  key={o.id}
                  className="px-6 py-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-semibold text-[#111827]">
                      {o.customerName}
                    </p>
                    <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280]">
                      {o.deliveryAddress}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                  {isActive ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={stop}
                      leftIcon={<Pause className="h-3 w-3" />}
                    >
                      Stop
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => start(o.id)}
                      leftIcon={<Play className="h-3 w-3" />}
                    >
                      Start
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="!p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB] flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#FBBF24]" />
            <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
              Current position
            </h3>
          </div>
          <div style={{ height: 380 }}>
            <MapContainer
              center={pos ?? [-6.2088, 106.8456]}
              zoom={pos ? 16 : 12}
              scrollWheelZoom={false}
              style={{ width: "100%", height: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {pos && (
                <Marker position={pos} icon={courierIcon}>
                  <Popup>You are here</Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
          {pos && (
            <p className="px-6 py-3 text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
              {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

export default TrackingPage;
