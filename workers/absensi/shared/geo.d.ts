// Types for geo.js (shared by the absensi Worker and frontend).
export interface LatLng {
  lat: number;
  lng: number;
}

export interface AreaView {
  id: string;
  name: string;
  polygon: LatLng[];
  toleranceM: number;
  active: boolean;
}

export interface LocationInput extends LatLng {
  accuracy: number;
}

export type LocationResult =
  | { ok: true; areaId: string; distanceM: number }
  | { ok: false; code: "GPS_LEMAH" | "DI_LUAR_AREA" | "AREA_BELUM_ADA"; distanceM: number | null };

export function pointInPolygon(p: LatLng, polygon: LatLng[]): boolean;
export function distanceToPolygonM(p: LatLng, polygon: LatLng[]): number;
export function checkLocation(loc: LocationInput, areas: AreaView[]): LocationResult;
