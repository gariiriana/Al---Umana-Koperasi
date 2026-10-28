import { useState } from "react";
import { CircleMarker, MapContainer, Marker, Polygon, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { LatLng } from "@/absensi/types";

/** Pin SPPG Sukabumi Gunungguruh Kebonmanggu. */
const SPPG_PIN: LatLng = { lat: -6.9735229, lng: 106.8651559 };

const pinIcon = new L.DivIcon({
  className: "absensi-area-pin",
  html: `<div style="width:28px;height:28px;border-radius:9999px;background:linear-gradient(135deg,#F59E0B,#B45309);border:3px solid #FFF;box-shadow:0 2px 10px rgba(0,0,0,0.4);transform:translate(-50%,-50%)"></div>`,
  iconSize: [0, 0],
});

function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) return SPPG_PIN;
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

function ClickToAdd({ onAdd }: { onAdd: (point: LatLng) => void }) {
  useMapEvents({
    click: (event) => onAdd({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

/** Peta interaktif Google Maps (Jalan / Satelit); klik menambah titik poligon zona kantor. */
export function AreaMap({ points, onAdd }: { points: LatLng[]; onAdd: (point: LatLng) => void }) {
  const [layer, setLayer] = useState<"roadmap" | "satellite">("roadmap");
  const center = centroid(points);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 shadow-xs">
      <div className="absolute right-3 top-3 z-[1000] flex gap-1 rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-sm backdrop-blur-xs">
        <button
          type="button"
          onClick={() => setLayer("roadmap")}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            layer === "roadmap" ? "bg-amber-400 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Google Maps
        </button>
        <button
          type="button"
          onClick={() => setLayer("satellite")}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            layer === "satellite" ? "bg-amber-400 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Satelit
        </button>
      </div>

      <MapContainer center={[center.lat, center.lng]} zoom={18} maxZoom={21} className="h-80 w-full" scrollWheelZoom>
        {layer === "roadmap" ? (
          <TileLayer
            key="google-road"
            url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
            subdomains={["mt0", "mt1", "mt2", "mt3"]}
            attribution="Map data &copy; Google"
            maxZoom={21}
          />
        ) : (
          <TileLayer
            key="google-sat"
            url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
            subdomains={["mt0", "mt1", "mt2", "mt3"]}
            attribution="Map data &copy; Google"
            maxZoom={21}
          />
        )}
        <ClickToAdd onAdd={onAdd} />
        <Marker position={[SPPG_PIN.lat, SPPG_PIN.lng]} icon={pinIcon} />
        {points.length >= 2 && (
          <Polygon
            positions={points.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: "#EF4444", fillColor: "#FCA5A5", fillOpacity: 0.4, weight: 2.5 }}
          />
        )}
        {points.map((p, i) => (
          <CircleMarker key={i} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: "#FFF", fillColor: "#F59E0B", fillOpacity: 1 }} />
        ))}
      </MapContainer>
    </div>
  );
}
