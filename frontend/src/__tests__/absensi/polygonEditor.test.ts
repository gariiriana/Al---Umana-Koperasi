import { describe, expect, it } from "vitest";

import { canSave, polygonEditor, type PolygonState } from "@/absensi/admin/polygonEditor";

const p = (lat: number, lng: number) => ({ lat, lng });

describe("polygonEditor", () => {
  it("add ×3 bisa disimpan, undo jadi 2 titik, reset kosong", () => {
    let state: PolygonState = { points: [] };
    state = polygonEditor(state, { type: "add", point: p(-6.97352, 106.86515) });
    state = polygonEditor(state, { type: "add", point: p(-6.97352, 106.86525) });
    expect(canSave(state)).toBe(false);
    state = polygonEditor(state, { type: "add", point: p(-6.97362, 106.86525) });
    expect(canSave(state)).toBe(true);

    state = polygonEditor(state, { type: "undo" });
    expect(state.points).toHaveLength(2);
    expect(canSave(state)).toBe(false);

    state = polygonEditor(state, { type: "reset" });
    expect(state.points).toEqual([]);
  });

  it("undo pada daftar kosong tetap kosong", () => {
    expect(polygonEditor({ points: [] }, { type: "undo" }).points).toEqual([]);
  });

  it("load mengganti titik (saat memilih area lain)", () => {
    const points = [p(1, 1), p(1, 2), p(2, 2)];
    expect(polygonEditor({ points: [p(0, 0)] }, { type: "load", points }).points).toEqual(points);
  });
});
