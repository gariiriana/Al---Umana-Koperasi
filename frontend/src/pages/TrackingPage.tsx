import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Pause, Play, Navigation } from "lucide-react";

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

const renderFormattedAddress = (address: string) => {
  if (!address) return null;
  const parts = address.split(" | ");

  if (parts.length === 7) {
    const [kabupaten, kecamatan, desa, rtRw, postalCode, mapsUrl, specDetails] = parts;
    return (
      <div className="space-y-1 text-xs text-[#374151] font-['Hanken_Grotesk'] leading-relaxed">
        <p className="font-extrabold text-[#111827]">Desa/Kel. {desa}, RT/RW {rtRw}</p>
        <p className="font-semibold">Kec. {kecamatan}, {kabupaten}</p>
        <p className="text-[11px] font-medium text-neutral-500">Kode Pos: {postalCode}</p>
        <div className="text-[#6B7280] bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 mt-1 text-[11px] leading-relaxed">
          <span className="font-bold text-[#374151] block text-[9px] uppercase tracking-wide mb-0.5">Detail Patokan</span>
          {specDetails}
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
            onClick={(e) => e.stopPropagation()}>
            <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
            <span>Buka Link Peta ↗</span>
          </a>
        )}
      </div>
    );
  }

  if (parts.length === 3) {
    const [fullAddr, mapsUrl, specAddr] = parts;
    return (
      <div className="space-y-1 text-xs text-[#374151] font-['Hanken_Grotesk'] leading-relaxed">
        <p className="font-semibold text-[#111827]">{fullAddr}</p>
        <div className="text-[#6B7280] bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 mt-1 text-[11px] leading-relaxed">
          <span className="font-bold text-[#374151] block text-[9px] uppercase tracking-wide mb-0.5">Detail Patokan</span>
          {specAddr}
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
            onClick={(e) => e.stopPropagation()}>
            <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
            <span>Buka Link Peta ↗</span>
          </a>
        )}
      </div>
    );
  }

  const mapsUrlMatch = address.match(/https?:\/\/[^\s]+/);
  const mapsUrl = mapsUrlMatch ? mapsUrlMatch[0] : null;
  const cleanAddress = mapsUrl ? address.replace(mapsUrl, "").replace(/\s+/g, " ").trim() : address;

  return (
    <div className="space-y-0.5">
      {cleanAddress && <p className="text-xs text-[#374151] leading-relaxed font-medium">{cleanAddress}</p>}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer font-['Hanken_Grotesk']"
          onClick={(e) => e.stopPropagation()}>
          <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
          <span>Buka Link Peta ↗</span>
        </a>
      )}
    </div>
  );
};

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
                    {renderFormattedAddress(o.deliveryAddress)}
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
          <div className="h-[380px]">
            <MapContainer
              center={pos ?? [-6.2088, 106.8456]}
              zoom={pos ? 16 : 12}
              scrollWheelZoom={false}
              className="w-full h-full"
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
