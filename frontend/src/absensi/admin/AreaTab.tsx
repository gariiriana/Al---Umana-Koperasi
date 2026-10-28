import { useCallback, useEffect, useReducer, useState } from "react";
import { Trash2 } from "lucide-react";

import { DEFAULT_TOLERANCE_M, MAX_TOLERANCE_M } from "../../../../workers/absensi/shared/constants.js";
import { AreaMap } from "@/absensi/admin/AreaMap";
import { canSave, polygonEditor } from "@/absensi/admin/polygonEditor";
import { getAreas, putAreas } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import type { AreaView } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const field =
  "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200";
const fieldLabel = "block space-y-1 text-xs font-bold text-neutral-700";

const NEW_AREA = -1;
const DEFAULT_AREA_NAME = "SPPG Sukabumi Gunungguruh Kebonmanggu";

/** Area absen: gambar poligon zona kantor di peta Google Maps/Satelit, atur toleransi dan status aktif. */
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
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    const targetId = selected === NEW_AREA ? crypto.randomUUID() : areas[selected].id;
    const entry = { id: targetId, name: name.trim(), polygon: polygon.points, toleranceM, active };
    const list: Array<Omit<AreaView, "id"> & { id?: string }> = areas.map((area) => ({ ...area }));
    if (selected === NEW_AREA) list.push(entry);
    else list[selected] = entry;
    try {
      const res = await putAreas(list);
      setAreas(res.areas);
      const savedIndex = res.areas.findIndex((area) => area.id === targetId);
      select(res.areas, savedIndex >= 0 ? savedIndex : 0);
      setNotice("Area tersimpan.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeSelected = async () => {
    if (!areas || selected === NEW_AREA || !areas[selected]) return;
    const removedName = areas[selected].name;
    setDeleting(true);
    setError(null);
    setNotice(null);
    const list = areas.filter((_, i) => i !== selected).map((area) => ({ ...area }));
    try {
      const res = await putAreas(list);
      setAreas(res.areas);
      select(res.areas, 0);
      setNotice(`Lokasi "${removedName}" berhasil dihapus.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
            Area Zona Absensi
          </h2>
          <p className="text-xs text-neutral-500">
            Klik sudut-sudut gedung di peta (minimal 3 titik). Area ini juga ditampilkan ke karyawan saat Clock In / Clock Out.
          </p>
        </div>

        {areas && (
          <select
            aria-label="Pilih area"
            className={`${field} sm:w-auto`}
            value={selected}
            onChange={(e) => select(areas, Number(e.target.value))}
          >
            {areas.map((area, i) => (
              <option key={area.id} value={i}>
                {area.name}{area.active ? "" : " (nonaktif)"}
              </option>
            ))}
            <option value={NEW_AREA}>+ Area baru</option>
          </select>
        )}
      </div>

      {areas && (
        <AreaMap
          key={`${selected}-${areas.length}`}
          points={polygon.points}
          onAdd={(point) => dispatch({ type: "add", point })}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outlined" size="sm" disabled={polygon.points.length === 0} onClick={() => dispatch({ type: "undo" })}>
          Hapus titik terakhir
        </Button>
        <Button variant="outlined" size="sm" disabled={polygon.points.length === 0} onClick={() => dispatch({ type: "reset" })}>
          Ulang
        </Button>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
          {polygon.points.length} titik poligon
        </span>
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

      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-700">
        <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>Zona Aktif</span>
      </label>

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" className="w-full" loading={saving} disabled={!ready || deleting} onClick={() => void save()}>
          Simpan Area
        </Button>
        {areas && selected !== NEW_AREA && areas[selected] && (
          <button
            type="button"
            disabled={saving || deleting}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-extrabold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:shrink-0"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Hapus Lokasi
          </button>
        )}
      </div>

      {confirmDelete && areas && selected !== NEW_AREA && areas[selected] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hapus Lokasi Area"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-3xl border border-rose-100 bg-white p-6 text-center shadow-2xl"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <Trash2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
                Hapus Lokasi Area?
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 sm:text-sm">
                Lokasi <strong className="text-neutral-900">{areas[selected].name}</strong> akan dihapus dari daftar zona
                absensi. Karyawan tidak bisa Clock In / Clock Out lagi di lokasi ini.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                className="rounded-xl border border-neutral-200 bg-neutral-100 px-4 py-3 text-xs font-extrabold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50 sm:text-sm"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void removeSelected()}
                className="rounded-xl bg-rose-600 px-4 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60 sm:text-sm"
              >
                {deleting ? "Menghapus..." : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
