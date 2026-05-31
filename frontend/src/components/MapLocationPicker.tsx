import { useState, useCallback, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Loader2, Crosshair, X } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────
export interface ReverseGeoResult {
  kabupaten: string;
  kecamatan: string;
  desa: string;
  postalCode: string;
  mapsUrl: string;
  displayAddress: string;
}

interface MapLocationPickerProps {
  lang: "id" | "en";
  onLocationSelected: (result: ReverseGeoResult) => void;
  onClose: () => void;
}

// ── Custom marker icon ────────────────────────────────────────────
const pinIcon = new L.DivIcon({
  className: "map-picker-pin",
  html: `<div style="width:36px;height:36px;border-radius:9999px;background:linear-gradient(135deg,#F59E0B,#B45309);border:3px solid #FFF;box-shadow:0 2px 12px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:16px;color:#FFF;transform:translate(-50%,-50%)">📍</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// ── Default center: Sukabumi, West Java ────────────────────────
const DEFAULT_CENTER: [number, number] = [-6.9034, 106.9696];

// ── Nominatim Reverse Geocoding ──────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeoResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=id&zoom=18&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "AlUmanaKoperasiApp/1.0" },
  });

  if (!res.ok) throw new Error("Geocoding request failed");

  const data = await res.json();
  const addr = data.address || {};

  // Indonesian mapping: county = kabupaten, city_district/suburb = kecamatan, village/suburb = desa
  const kabupaten =
    addr.county || addr.city || addr.state_district || addr.state || "";
  const kecamatan =
    addr.city_district || addr.suburb || addr.town || addr.municipality || "";
  const desa =
    addr.village || addr.hamlet || addr.neighbourhood || addr.suburb || "";
  const postalCode = addr.postcode || "";
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const displayAddress = data.display_name || "";

  return { kabupaten, kecamatan, desa, postalCode, mapsUrl, displayAddress };
}

// ── Draggable / Clickable marker handler ────────────────────────
function LocationMarker({
  position,
  onMove,
}: {
  position: [number, number] | null;
  onMove: (pos: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      onMove([e.latlng.lat, e.latlng.lng]);
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={pinIcon}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const latlng = (e.target as L.Marker).getLatLng();
          onMove([latlng.lat, latlng.lng]);
        },
      }}
    />
  );
}

// ── Main Component ────────────────────────────────────────────────
export function MapLocationPicker({ lang, onLocationSelected, onClose }: MapLocationPickerProps) {
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [result, setResult] = useState<ReverseGeoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // Auto-get user's current location on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMarkerPos(loc);
        setLocating(false);
        if (mapRef.current) {
          mapRef.current.flyTo(loc, 16, { duration: 1 });
        }
      },
      () => {
        setLocating(false);
        // Fallback to default center if geolocation denied
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Reverse geocode whenever marker position changes
  useEffect(() => {
    if (!markerPos) return;
    let cancelled = false;
    setGeocoding(true);
    setError(null);
    reverseGeocode(markerPos[0], markerPos[1])
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            lang === "id"
              ? "Gagal mengambil data alamat. Coba geser pin."
              : "Failed to fetch address. Try moving the pin."
          );
      })
      .finally(() => {
        if (!cancelled) setGeocoding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [markerPos, lang]);

  const handleMarkerMove = useCallback((pos: [number, number]) => {
    setMarkerPos(pos);
    if (mapRef.current) {
      mapRef.current.flyTo(pos, mapRef.current.getZoom(), { duration: 0.4 });
    }
  }, []);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMarkerPos(loc);
        setLocating(false);
        if (mapRef.current) {
          mapRef.current.flyTo(loc, 17, { duration: 1.2 });
        }
      },
      () => {
        setLocating(false);
        setError(
          lang === "id"
            ? "Gagal mendapatkan lokasi. Izinkan akses lokasi di browser."
            : "Failed to get location. Allow location access in your browser."
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleConfirm = () => {
    if (result) {
      onLocationSelected(result);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-[#111827]">
              {lang === "id" ? "Pilih Lokasi di Peta" : "Pick Location on Map"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={lang === "id" ? "Tutup" : "Close"}
            className="h-8 w-8 rounded-full hover:bg-neutral-100 flex items-center justify-center transition cursor-pointer"
          >
            <X className="h-4 w-4 text-neutral-500" />
          </button>
        </div>

        {/* Map */}
        <div className="relative w-full h-[280px] md:h-[340px] flex-shrink-0">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={14}
            style={{ width: "100%", height: "100%" }}
            ref={mapRef}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <LocationMarker position={markerPos} onMove={handleMarkerMove} />
          </MapContainer>

          {/* Instruction overlay */}
          {!markerPos && !locating && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-[500]">
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg text-center">
                <p className="text-xs font-bold text-[#111827]">
                  {lang === "id" ? "Ketuk peta untuk menaruh pin" : "Tap the map to drop a pin"}
                </p>
              </div>
            </div>
          )}

          {/* Use My Location button */}
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="absolute bottom-3 right-3 z-[500] bg-white hover:bg-neutral-50 rounded-xl px-3 py-2 shadow-lg border border-neutral-200 flex items-center gap-1.5 text-xs font-bold text-[#111827] transition cursor-pointer disabled:opacity-50"
          >
            {locating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
            ) : (
              <Crosshair className="h-3.5 w-3.5 text-amber-600" />
            )}
            <span>{lang === "id" ? "Lokasi Saya" : "My Location"}</span>
          </button>
        </div>

        {/* Result Preview */}
        <div className="px-4 py-3 space-y-2 overflow-y-auto flex-1">
          {geocoding && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{lang === "id" ? "Mencari alamat..." : "Finding address..."}</span>
            </div>
          )}

          {error && (
            <p className="text-xs font-semibold text-red-500">{error}</p>
          )}

          {result && !geocoding && (
            <div className="bg-[#FFFBEB] border border-amber-200 rounded-2xl p-3 space-y-1.5 text-xs font-['Hanken_Grotesk']">
              <p className="font-extrabold text-[#111827]">{result.displayAddress}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[#374151]">
                <div>
                  <span className="font-bold text-neutral-500 text-[9px] uppercase tracking-wide">
                    {lang === "id" ? "Kabupaten/Kota" : "District"}
                  </span>
                  <p className="font-semibold">{result.kabupaten || "-"}</p>
                </div>
                <div>
                  <span className="font-bold text-neutral-500 text-[9px] uppercase tracking-wide">
                    {lang === "id" ? "Kecamatan" : "Subdistrict"}
                  </span>
                  <p className="font-semibold">{result.kecamatan || "-"}</p>
                </div>
                <div>
                  <span className="font-bold text-neutral-500 text-[9px] uppercase tracking-wide">
                    {lang === "id" ? "Desa/Kel." : "Village"}
                  </span>
                  <p className="font-semibold">{result.desa || "-"}</p>
                </div>
                <div>
                  <span className="font-bold text-neutral-500 text-[9px] uppercase tracking-wide">
                    {lang === "id" ? "Kode Pos" : "Postal Code"}
                  </span>
                  <p className="font-semibold">{result.postalCode || "-"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-neutral-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-11 rounded-2xl border border-neutral-300 hover:bg-neutral-50 text-neutral-700 text-xs font-bold transition cursor-pointer"
          >
            {lang === "id" ? "Batal" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!result || geocoding}
            className="flex-[2] min-h-11 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <MapPin className="h-4 w-4" />
            {lang === "id" ? "Gunakan Lokasi Ini" : "Use This Location"}
          </button>
        </div>
      </div>
    </div>
  );
}
