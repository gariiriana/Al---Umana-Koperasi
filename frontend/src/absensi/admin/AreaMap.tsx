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

/** Peta satelit; klik menambah titik poligon. Pusatnya dihitung sekali saat peta dibuat. */
export function AreaMap({ points, onAdd }: { points: LatLng[]; onAdd: (point: LatLng) => void }) {
  const center = centroid(points);
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={19} maxZoom={21} className="h-80 w-full rounded-2xl" scrollWheelZoom>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles © Esri"
        maxNativeZoom={19}
        maxZoom={21}
      />
      <ClickToAdd onAdd={onAdd} />
      <Marker position={[SPPG_PIN.lat, SPPG_PIN.lng]} icon={pinIcon} />
      {points.length >= 2 && (
        <Polygon positions={points.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#F59E0B", weight: 2 }} />
      )}
      {points.map((p, i) => (
        <CircleMarker key={i} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: "#FFF", fillColor: "#F59E0B", fillOpacity: 1 }} />
      ))}
    </MapContainer>
  );
}
