import { useState } from "react";
import { CalendarOff } from "lucide-react";

import { MAX_SILAH_DAYS, SILAH_DAY_NAMES, SILAH_DAY_ORDER } from "../../../../workers/absensi/shared/silah.js";
import { patchEmployee } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import type { EmployeeView } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

export interface SilahPanelProps {
  employees: EmployeeView[];
  onChanged: () => Promise<void>;
}

const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((d) => b.includes(d));
const sortDays = (days: number[]) => [...days].sort((a, b) => SILAH_DAY_ORDER.indexOf(a) - SILAH_DAY_ORDER.indexOf(b));

function SilahRow({ employee, onChanged }: { employee: EmployeeView; onChanged: () => Promise<void> }) {
  const saved = employee.silahDays ?? [];
  const [days, setDays] = useState<number[]>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameDays(days, saved);

  const toggle = (day: number) => {
    setError(null);
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : sortDays([...current, day])));
  };

  const save = async () => {
    if (days.length > MAX_SILAH_DAYS) {
      setError("Minimal harus ada 1 hari kerja.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchEmployee(employee.uid, { action: "set_silah", silahDays: days });
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-extrabold text-neutral-900">{employee.name}</p>
        {dirty && (
          <div className="flex gap-1.5">
            <Button variant="outlined" size="sm" disabled={saving} onClick={() => setDays(saved)}>
              Batal
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
              Simpan
            </Button>
          </div>
        )}
      </div>
      <div role="group" aria-label={`Hari Silah ${employee.name}`} className="grid grid-cols-7 gap-1">
        {SILAH_DAY_ORDER.map((day) => {
          const on = days.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              aria-label={`${SILAH_DAY_NAMES[day]}${on ? ", Silah" : ""}`}
              disabled={saving}
              onClick={() => toggle(day)}
              className={`min-h-[40px] rounded-xl border text-xs font-bold transition active:scale-[0.97] ${
                on
                  ? "border-teal-500 bg-teal-500 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-teal-300 hover:bg-teal-50"
              }`}
            >
              {SILAH_DAY_NAMES[day].slice(0, 3)}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
    </li>
  );
}

/** Admin: jadwal Silah (libur mingguan tetap) per karyawan, ringkas per hari + bisa diubah. */
export function SilahPanel({ employees, onChanged }: SilahPanelProps) {
  const [editing, setEditing] = useState(false);
  const staff = employees.filter((e) => e.role === "absen_karyawan" && e.status === "aktif");
  const byDay = SILAH_DAY_ORDER
    .map((day) => ({ day, names: staff.filter((e) => e.silahDays?.includes(day)).map((e) => e.name) }))
    .filter((group) => group.names.length > 0);

  return (
    <section className="space-y-4 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-800">
            <CalendarOff className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">Jadwal Silah</h2>
            <p className="text-xs text-neutral-500">
              Hari libur mingguan tetap. Tercatat sebagai Silah di Hari Ini, Rekap, dan export, bukan sebagai tidak hadir.
            </p>
          </div>
        </div>
        <Button variant="outlined" size="sm" className="shrink-0" onClick={() => setEditing((v) => !v)}>
          {editing ? "Selesai" : "Ubah jadwal"}
        </Button>
      </div>

      {byDay.length > 0 ? (
        <dl className="grid gap-2.5 sm:grid-cols-2">
          {byDay.map(({ day, names }) => (
            <div key={day} className="rounded-2xl border border-teal-100 bg-teal-50/50 p-3.5">
              <dt className="flex items-center justify-between text-sm font-extrabold text-teal-900">
                <span>{SILAH_DAY_NAMES[day]}</span>
                <span className="text-[11px] font-bold text-teal-700">{names.length} orang</span>
              </dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {names.map((name) => (
                  <span key={name} className="rounded-full border border-teal-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-teal-900">
                    {name}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-neutral-500">Belum ada jadwal Silah. Ketuk "Ubah jadwal" untuk mengatur.</p>
      )}

      {editing && (
        <div className="space-y-3 border-t border-neutral-100 pt-4">
          <p className="text-xs font-semibold text-amber-800">
            Ketuk hari untuk menandai Silah, lalu Simpan. Perubahan berlaku mulai hari ini; rekap hari-hari sebelumnya
            tetap memakai jadwal lama.
          </p>
          <ul className="divide-y divide-neutral-100">
            {/* key ikut jadwal tersimpan: setelah Simpan baris dimuat ulang dari data server. */}
            {staff.map((employee) => (
              <SilahRow key={`${employee.uid}:${(employee.silahDays ?? []).join(",")}`} employee={employee} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
