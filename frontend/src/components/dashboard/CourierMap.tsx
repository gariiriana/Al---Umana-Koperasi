import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { Card } from "@/components/ui/Card";
import type { CourierGPS } from "@/types/courier-gps";

// Default center: Indonesia (Jakarta)
const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456];
const DEFAULT_ZOOM = 12;

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

const activeIcon = new L.DivIcon({
  className: "courier-marker-active",
  html: `
    <div style="
      width:32px;height:32px;border-radius:9999px;
      background:#FBBF24;border:3px solid #FFFFFF;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
      font-family:'Hanken Grotesk',system-ui,sans-serif;
      color:#111827;font-weight:700;font-size:14px;">📍</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const staleIcon = new L.DivIcon({
  className: "courier-marker-stale",
  html: `
    <div style="
      width:32px;height:32px;border-radius:9999px;
      background:#EF4444;border:3px solid #FFFFFF;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
      color:#FFFFFF;font-size:14px;">⚠️</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export interface CourierMapProps {
  locations: CourierGPS[];
}

export function CourierMap({ locations }: CourierMapProps) {
  const now = Date.now();
  const center = useMemo<[number, number]>(() => {
    if (locations.length === 0) return DEFAULT_CENTER;
    const first = locations[0];
    return [first.latitude, first.longitude];
  }, [locations]);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB]">
        <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
          Live Courier Map
        </h3>
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] mt-0.5">
          Real-time positions of active couriers
        </p>
      </div>
      <div style={{ height: 380 }}>
        <MapContainer
          center={center}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={false}
          style={{ width: "100%", height: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {locations.map((loc) => {
            const ts = new Date(loc.timestamp).getTime();
            const stale = !Number.isNaN(ts) && now - ts > STALE_THRESHOLD_MS;
            return (
              <Marker
                key={`${loc.orderId}_${loc.courierId}`}
                position={[loc.latitude, loc.longitude]}
                icon={stale ? staleIcon : activeIcon}
              >
                <Popup>
                  <div className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm">
                    <p className="font-semibold text-[#111827]">
                      Order: {loc.orderId.slice(0, 8)}…
                    </p>
                    <p className="text-[#6B7280]">
                      Courier: {loc.courierId.slice(0, 8)}…
                    </p>
                    <p className="text-[#6B7280]">
                      {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                    </p>
                    <p className={stale ? "text-[#EF4444] font-semibold" : "text-[#10B981]"}>
                      {stale ? "⚠️ Stale (> 5 min)" : "🟢 Active"}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </Card>
  );
}

export default CourierMap;
