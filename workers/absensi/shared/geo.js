// Cek "di dalam area" untuk absensi. Dipakai Worker (keputusan akhir) dan HP (pesan cepat).
import { MAX_ACCURACY_M } from "./constants.js";

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG_EQUATOR = 111320;

// Proyeksi equirectangular lokal ke meter di sekitar titik acuan. Area absen
// hanya puluhan meter, jadi galatnya jauh di bawah akurasi GPS.
function projector(origin) {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  return (p) => ({
    x: (p.lng - origin.lng) * cosLat * M_PER_DEG_LNG_EQUATOR,
    y: (p.lat - origin.lat) * M_PER_DEG_LAT,
  });
}

function insideXY(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pointInPolygon(p, polygon) {
  const project = projector(polygon[0]);
  return insideXY(project(p), polygon.map(project));
}

/** Jarak (meter) dari titik ke tepi poligon; 0 kalau di dalam. */
export function distanceToPolygonM(p, polygon) {
  const project = projector(polygon[0]);
  const pt = project(p);
  const ring = polygon.map(project);
  if (insideXY(pt, ring)) return 0;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    best = Math.min(best, segmentDistance(pt, ring[j], ring[i]));
  }
  return best;
}

/**
 * Sah kalau di dalam poligon area aktif, atau jaraknya ke tepi tidak lebih dari
 * min(akurasi GPS, toleransi area).
 */
export function checkLocation(loc, areas) {
  const { accuracy } = loc;
  if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > MAX_ACCURACY_M) {
    return { ok: false, code: "GPS_LEMAH", distanceM: null };
  }
  const active = areas.filter((a) => a.active && Array.isArray(a.polygon) && a.polygon.length >= 3);
  if (active.length === 0) return { ok: false, code: "AREA_BELUM_ADA", distanceM: null };

  let nearest = null;
  for (const area of active) {
    const distanceM = distanceToPolygonM(loc, area.polygon);
    if (!nearest || distanceM < nearest.distanceM) nearest = { area, distanceM };
  }
  if (nearest.distanceM <= Math.min(accuracy, nearest.area.toleranceM)) {
    return { ok: true, areaId: nearest.area.id, distanceM: nearest.distanceM };
  }
  return { ok: false, code: "DI_LUAR_AREA", distanceM: nearest.distanceM };
}
