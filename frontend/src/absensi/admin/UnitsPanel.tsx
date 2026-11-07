import { useEffect, useState } from "react";
import { Plus, UsersRound } from "lucide-react";

import { createUnit, updateUnit } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import type { EmployeeView, UnitView } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const field =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200";

export interface UnitsPanelProps {
  units: UnitView[];
  employees: EmployeeView[];
  onChanged: () => Promise<void>;
}

/** Calon kepala unit: akun karyawan aktif (admin absensi sudah bisa menyetujui semua). */
const candidates = (employees: EmployeeView[]) =>
  employees.filter((e) => e.role === "absen_karyawan" && e.status === "aktif");

function HeadSelect({ value, employees, onChange, label }: {
  value: string;
  employees: EmployeeView[];
  onChange: (uid: string) => void;
  label: string;
}) {
  return (
    <select aria-label={label} className={field} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Belum ada kepala unit —</option>
      {candidates(employees).map((e) => (
        <option key={e.uid} value={e.uid}>{e.name}</option>
      ))}
    </select>
  );
}

function UnitRow({ unit, employees, onChanged }: { unit: UnitView; employees: EmployeeView[]; onChanged: () => Promise<void> }) {
  const [headUid, setHeadUid] = useState(unit.headUid ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setHeadUid(unit.headUid ?? ""), [unit.headUid]);
  const dirty = headUid !== (unit.headUid ?? "");

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateUnit(unit.id, { name: unit.name, headUid: headUid || null });
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="space-y-2 rounded-2xl border border-neutral-200 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-neutral-900">{unit.name}</p>
        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-600">
          {unit.memberCount} anggota
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <HeadSelect label={`Kepala unit ${unit.name}`} value={headUid} employees={employees} onChange={setHeadUid} />
        <Button variant="primary" size="sm" disabled={!dirty} loading={saving} onClick={() => void save()}>
          Simpan
        </Button>
      </div>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
    </li>
  );
}

/** Admin: daftar unit + kepala unitnya (penyetuju pengajuan & absen luar zona anggota unit). */
export function UnitsPanel({ units, employees, onChanged }: UnitsPanelProps) {
  const [name, setName] = useState("");
  const [headUid, setHeadUid] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await createUnit({ name: name.trim(), headUid: headUid || null });
      setName("");
      setHeadUid("");
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
          <UsersRound className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">Unit & kepala unit</h2>
          <p className="text-xs text-neutral-500">
            Kepala unit ikut menyetujui cuti, pergantian shift, dan absen luar zona anggota unitnya. Pindahkan karyawan
            antar unit lewat pilihan Unit di daftar karyawan.
          </p>
        </div>
      </div>

      {units.length > 0 ? (
        <ul className="grid gap-2.5 md:grid-cols-2">
          {units.map((unit) => <UnitRow key={unit.id} unit={unit} employees={employees} onChanged={onChanged} />)}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">Belum ada unit.</p>
      )}

      <form onSubmit={add} className="flex flex-col gap-2 border-t border-neutral-100 pt-4 sm:flex-row">
        <input
          aria-label="Nama unit baru"
          placeholder="Nama unit baru"
          className={field}
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <HeadSelect label="Kepala unit baru" value={headUid} employees={employees} onChange={setHeadUid} />
        <Button type="submit" variant="outlined" size="sm" loading={adding} leftIcon={<Plus className="h-3.5 w-3.5" />}>
          Tambah unit
        </Button>
      </form>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
    </section>
  );
}
