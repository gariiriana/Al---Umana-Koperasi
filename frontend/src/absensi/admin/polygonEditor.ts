// State editor poligon area: titik ditambah dengan klik di peta.
import type { LatLng } from "@/absensi/types";

export interface PolygonState {
  points: LatLng[];
}

export type PolygonAction =
  | { type: "add"; point: LatLng }
  | { type: "undo" }
  | { type: "reset" }
  /** Ganti seluruh titik, mis. saat memilih area lain untuk diedit. */
  | { type: "load"; points: LatLng[] };

export function polygonEditor(state: PolygonState, action: PolygonAction): PolygonState {
  switch (action.type) {
    case "add":
      return { points: [...state.points, action.point] };
    case "undo":
      return { points: state.points.slice(0, -1) };
    case "reset":
      return { points: [] };
    case "load":
      return { points: [...action.points] };
  }
}

/** Poligon butuh minimal 3 titik. */
export function canSave(state: PolygonState): boolean {
  return state.points.length >= 3;
}
