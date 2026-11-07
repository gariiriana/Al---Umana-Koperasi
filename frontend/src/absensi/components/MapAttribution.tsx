import { AttributionControl } from "react-leaflet";

// Logo Firebase menggantikan "🇺🇦 Leaflet" di pojok peta. Teks "© Google" dari TileLayer tetap tampil
// karena ketentuan Google Maps mewajibkan atribusi data peta.
const FIREBASE_PREFIX =
  '<img src="/brand/firebase.png" alt="Firebase" style="display:inline-block;height:14px;width:auto;vertical-align:-3px" />';

export const GOOGLE_MAP_ATTRIBUTION = "&copy; Google";

/** Pakai bersama `<MapContainer attributionControl={false}>`. */
export function FirebaseMapAttribution() {
  return <AttributionControl position="bottomright" prefix={FIREBASE_PREFIX} />;
}
