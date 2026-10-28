import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Crosshair, LocateFixed, RefreshCw } from "lucide-react";
import { Circle, MapContainer, Marker, Polygon, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { checkLocation } from "../../../../workers/absensi/shared/geo.js";
import { SignalStatusPill, useOnlineStatus } from "@/absensi/components/SignalStatusPill";
import { subscribeGpsPosition, type GpsFix } from "@/absensi/device/gps";
import { messageFor } from "@/absensi/messages";
import type { AbsenKind, AreaView, LocationInput } from "@/absensi/types";

const deviceDotIcon = new L.DivIcon({
  className: "absensi-device-dot",
  html: `
    <div style="position:relative;width:22px;height:22px;transform:translate(-50%,-50%)">
      <div style="position:absolute;inset:-6px;border-radius:9999px;background:rgba(37,99,235,0.22)"></div>
      <div style="width:22px;height:22px;border-radius:9999px;background:#1D4ED8;border:3px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>
    </div>
  `,
  iconSize: [0, 0],
});

function RecenterControl({ center, trigger }: { center: [number, number]; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (trigger > 0) {
      map.flyTo(center, Math.max(map.getZoom(), 17), { duration: 0.6 });
    }
  }, [map, center, trigger]);
  return null;
}

export interface LocationConfirmModalProps {
  kind: AbsenKind;
  areas: AreaView[];
  headerRight?: React.ReactNode;
  onConfirm: (fix: LocationInput) => void;
  onCancel: () => void;
}

/**
 * Layar penuh Konfirmasi Clock In / Clock Out dengan Google Maps, poligon zona kantor,
 * titik lokasi device real-time, serta indikator sinyal GPS & WiFi (sesuai referensi SS 3–5).
 */
export function LocationConfirmModal({
  kind,
  areas,
  headerRight,
  onConfirm,
  onCancel,
}: LocationConfirmModalProps) {
  const online = useOnlineStatus();
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [recenterSeq, setRecenterSeq] = useState(0);

  useEffect(() => {
    setFix(null);
    setGpsError(null);
    const stop = subscribeGpsPosition(
      (nextFix) => {
        setFix(nextFix);
        setGpsError(null);
      },
      (code) => setGpsError(code),
    );
    return stop;
  }, [retryToken]);

  const zoneCheck = useMemo(() => {
    if (!fix) return null;
    return checkLocation(fix, areas);
  }, [fix, areas]);

  const matchedAreaName = useMemo(() => {
    if (!zoneCheck || !zoneCheck.ok) return null;
    return areas.find((a) => a.id === zoneCheck.areaId)?.name ?? "Area Kantor";
  }, [zoneCheck, areas]);

  const title = kind === "pulang" ? "Konfirmasi Clock Out" : "Konfirmasi Clock In";
  const ctaLabel = kind === "pulang" ? "Lanjutkan Clock Out" : "Lanjutkan Clock In";
  const canProceed = Boolean(fix && zoneCheck?.ok && online);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-white font-['Hanken_Grotesk',system-ui,sans-serif]"
    >
      {/* Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Kembali"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-800 hover:bg-neutral-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
          {title}
        </h2>
        <div className="flex min-w-9 items-center justify-end">
          {headerRight}
        </div>
      </header>

      {/* Banner Status Zona ketika GPS sudah didapat */}
      {fix && zoneCheck && (
        <div
          className={`shrink-0 border-b px-4 py-2.5 text-center text-xs font-bold ${
            zoneCheck.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : zoneCheck.code === "GPS_LEMAH"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {zoneCheck.ok
            ? `Di Dalam Zona: ${matchedAreaName}`
            : zoneCheck.code === "DI_LUAR_AREA"
              ? `Di Luar Zona (${Math.round(zoneCheck.distanceM ?? 0)} m dari batas area terdekat)`
              : messageFor(zoneCheck.code, { distanceM: zoneCheck.distanceM })}
        </div>
      )}

      {/* Konten Utama: Mencari Sinyal atau Google Maps */}
      <div className="relative flex-1 overflow-hidden bg-neutral-50">
        {/* Floating Pill Sinyal & GPS di Kanan Atas */}
        <div className="absolute right-3 top-3 z-[1000]">
          <SignalStatusPill gpsConnected={fix !== null} online={online} floating />
        </div>

        {!fix ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-300/50" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-neutral-900 shadow-lg">
                <Crosshair className="h-8 w-8" />
              </div>
            </div>
            <p className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
              Mencari Sinyal GPS & Zona Kantor...
            </p>
            <p className="mt-1.5 max-w-xs text-xs text-neutral-500">
              {gpsError ? messageFor(gpsError) : "Pastikan GPS dan koneksi internet Anda aktif"}
            </p>
            {gpsError && (
              <button
                type="button"
                onClick={() => setRetryToken((n) => n + 1)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Coba Lagi
              </button>
            )}
          </div>
        ) : (
          <>
            <MapContainer
              center={[fix.lat, fix.lng]}
              zoom={17}
              maxZoom={21}
              zoomControl={false}
              className="h-full w-full"
            >
              <TileLayer
                url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                subdomains={["mt0", "mt1", "mt2", "mt3"]}
                attribution="Map data &copy; Google"
                maxZoom={21}
              />
              <RecenterControl center={[fix.lat, fix.lng]} trigger={recenterSeq} />

              {areas.filter((a) => a.active && a.polygon.length >= 3).map((area) => (
                <Polygon
                  key={area.id}
                  positions={area.polygon.map((p) => [p.lat, p.lng] as [number, number])}
                  pathOptions={{
                    color: "#EF4444",
                    weight: 2.5,
                    fillColor: "#FCA5A5",
                    fillOpacity: 0.42,
                  }}
                />
              ))}

              <Circle
                center={[fix.lat, fix.lng]}
                radius={Math.max(fix.accuracy, 5)}
                pathOptions={{
                  color: "#2563EB",
                  weight: 1,
                  fillColor: "#60A5FA",
                  fillOpacity: 0.15,
                }}
              />
              <Marker position={[fix.lat, fix.lng]} icon={deviceDotIcon} />
            </MapContainer>

            <button
              type="button"
              onClick={() => setRecenterSeq((n) => n + 1)}
              title="Pusatkan ke lokasi saya"
              className="absolute bottom-4 right-3 z-[1000] flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-bold text-neutral-800 shadow-md hover:bg-neutral-50"
            >
              <LocateFixed className="h-4 w-4 text-amber-600" />
              Lokasi Saya (±{Math.round(fix.accuracy)} m)
            </button>
          </>
        )}
      </div>

      {/* Footer Tombol Lanjutkan */}
      <div className="shrink-0 border-t border-neutral-200 bg-white p-4">
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => {
            if (fix) onConfirm(fix);
          }}
          className={`w-full rounded-2xl py-3.5 font-['Manrope',system-ui,sans-serif] text-sm font-extrabold transition-all ${
            canProceed
              ? "bg-gradient-to-r from-amber-400 to-yellow-400 text-neutral-900 shadow-md hover:from-amber-500 hover:to-yellow-500 active:scale-[0.99]"
              : "cursor-not-allowed bg-amber-200/70 text-neutral-500"
          }`}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

