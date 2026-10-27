import { useCallback, useEffect, useReducer, useState } from "react";

import { DEFAULT_TOLERANCE_M, MAX_TOLERANCE_M } from "../../../../workers/absensi/shared/constants.js";
import { AreaMap } from "@/absensi/admin/AreaMap";
import { canSave, polygonEditor } from "@/absensi/admin/polygonEditor";
import { getAreas, putAreas } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import type { AreaView } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const text = "font-['Hanken_Grotesk',system-ui,sans-serif]";
const field = `${text} w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white`;
const fieldLabel = `${text} block space-y-1 text-xs font-bold text-neutral-300`;

const NEW_AREA = -1;
const DEFAULT_AREA_NAME = "SPPG Sukabumi Gunungguruh Kebonmanggu";

/** Area absen: gambar poligon gedung di peta satelit, atur toleransi dan status aktif. */
export function AreaTab() {
  const [areas, setAreas] = useState<AreaView[] | null>(null);
  const [selected, setSelected] = useState(NEW_AREA);
  const [name, setName] = useState(DEFAULT_AREA_NAME);
  const [tolerance, setTolerance] = useState(String(DEFAULT_TOLERANCE_M));
  const [active, setActive] = useState(true);
  const [polygon, dispatch] = useReducer(polygonEditor, { points: [] });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const select = useCallback((list: AreaView[], index: number) => {
    const area = list[index];
    setSelected(area ? index : NEW_AREA);
    setName(area?.name ?? (list.length === 0 ? DEFAULT_AREA_NAME : ""));
    setTolerance(String(area?.toleranceM ?? DEFAULT_TOLERANCE_M));
    setActive(area?.active ?? true);
    dispatch({ type: "load", points: area?.polygon ?? [] });
    setNotice(null);
  }, []);

  useEffect(() => {
    getAreas().then(
      (res) => {
        setAreas(res.areas);
        select(res.areas, 0);
      },
      (err) => setError(errorMessage(err)),
    );
  }, [select]);

  const toleranceM = Number(tolerance);
  const toleranceValid = tolerance.trim() !== "" && Number.isFinite(toleranceM) && toleranceM >= 0 && toleranceM <= MAX_TOLERANCE_M;
  const ready = areas !== null && canSave(polygon) && name.trim() !== "" && toleranceValid;

  const save = async () => {
    if (!areas || !ready) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    // PUT mengganti seluruh daftar: area lain dikirim apa adanya, area yang diedit diganti.
    const entry = { name: name.trim(), polygon: polygon.points, toleranceM, active };
    const list: Array<Omit<AreaView, "id"> & { id?: string }> = areas.map((area) => ({ ...area }));
    if (selected === NEW_AREA) list.push(entry);
    else list[selected] = { ...entry, id: areas[selected].id };
    try {
      const res = await putAreas(list);
      setAreas(res.areas);
      select(res.areas, selected === NEW_AREA ? res.areas.length - 1 : selected);
      setNotice("Area tersimpan.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-white">Area absen</h2>
        {areas && (
          <select
            aria-label="Pilih area"
            className={`${field} w-auto`}
            value={selected}
            onChange={(e) => select(areas, Number(e.target.value))}
          >
            {areas.map((area, i) => (
              <option key={area.id} value={i} className="text-[#111827]">
                {area.name}{area.active ? "" : " (nonaktif)"}
              </option>
            ))}
            <option value={NEW_AREA} className="text-[#111827]">+ Area baru</option>
          </select>
        )}
      </div>

      <p className={`${text} text-sm text-neutral-300`}>
        Klik sudut-sudut gedung di peta (minimal 3 titik). Absen sah di dalam garis, ditambah toleransi.
      </p>

      {areas && (
        <AreaMap
          key={`${selected}-${areas.length}`}
          points={polygon.points}
          onAdd={(point) => dispatch({ type: "add", point })}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={polygon.points.length === 0} onClick={() => dispatch({ type: "undo" })}>
          Hapus titik terakhir
        </Button>
        <Button variant="secondary" size="sm" disabled={polygon.points.length === 0} onClick={() => dispatch({ type: "reset" })}>
          Ulang
        </Button>
        <span className={`${text} self-center text-xs text-neutral-400`}>{polygon.points.length} titik</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={fieldLabel}>
          <span>Nama area</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={fieldLabel}>
          <span>Toleransi (m, 0–{MAX_TOLERANCE_M})</span>
          <input
            className={field}
            type="number"
            min={0}
            max={MAX_TOLERANCE_M}
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
          />
        </label>
      </div>
      <label className={`${text} flex items-center gap-2 text-sm text-neutral-200`}>
        <input type="checkbox" className="h-4 w-4 accent-amber-400" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>Aktif</span>
      </label>

      {error && <p role="alert" className={`${text} text-sm text-[#EF4444]`}>{error}</p>}
      {notice && <p className={`${text} text-sm text-emerald-300`}>{notice}</p>}

      <Button variant="primary" className="w-full" loading={saving} disabled={!ready} onClick={() => void save()}>
        Simpan
      </Button>
    </section>
  );
}
