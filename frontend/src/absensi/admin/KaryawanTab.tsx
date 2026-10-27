import { useCallback, useEffect, useState } from "react";

import { MIN_PASSWORD_LENGTH } from "../../../../workers/absensi/shared/constants.js";
import { createEmployee, fetchPhotoUrl, listEmployees, patchEmployee, type PatchEmployeeBody } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import type { AbsensiRole, EmployeeView } from "@/absensi/types";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

const text = "font-['Hanken_Grotesk',system-ui,sans-serif]";
const field = `${text} w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500`;
const fieldLabel = `${text} block space-y-1 text-xs font-bold text-neutral-300`;

/** Foto acuan dimuat per baris; foto yang sudah lewat masa simpan tampil sebagai teks. */
function ReferencePhoto({ employee }: { employee: EmployeeView }) {
  const [state, setState] = useState<{ url: string | null; loading: boolean }>({ url: null, loading: true });
  const photoId = employee.referencePhotoId;

  useEffect(() => {
    if (!photoId) return undefined;
    let url: string | null = null;
    let cancelled = false;
    fetchPhotoUrl(photoId).then(
      (result) => {
        url = result;
        if (!cancelled) setState({ url: result, loading: false });
      },
      () => {
        if (!cancelled) setState({ url: null, loading: false });
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);

  const box = "flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 text-center text-[10px] leading-tight text-neutral-400";
  if (!photoId) return <div className={`${text} ${box}`}>{employee.activated ? "Tanpa foto" : "Belum aktivasi"}</div>;
  if (state.loading) return <div className={`${text} ${box}`}>Memuat...</div>;
  if (!state.url) return <div className={`${text} ${box}`}>Foto sudah dihapus</div>;
  return <img src={state.url} alt={`Foto acuan ${employee.name}`} className="h-16 w-16 shrink-0 rounded-xl object-cover" />;
}

/** Kelola akun absensi: tambah, nonaktifkan/aktifkan, reset HP & wajah, atur cek wajah. */
export function KaryawanTab() {
  const [employees, setEmployees] = useState<EmployeeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<EmployeeView | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AbsensiRole>("absen_karyawan");
  const [noFaceCheck, setNoFaceCheck] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listEmployees();
      setEmployees(res.employees);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await createEmployee({ name: name.trim(), email: email.trim(), password, role, faceRequired: !noFaceCheck });
      setName("");
      setEmail("");
      setPassword("");
      setRole("absen_karyawan");
      setNoFaceCheck(false);
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const patch = async (employee: EmployeeView, body: PatchEmployeeBody) => {
    setError(null);
    setBusyUid(employee.uid);
    try {
      await patchEmployee(employee.uid, body);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <section className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-white">Tambah karyawan</h2>
        <label className={fieldLabel}>
          <span>Nama</span>
          <input className={field} required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={fieldLabel}>
          <span>Email</span>
          <input className={field} type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className={fieldLabel}>
          <span>Password awal</span>
          <input
            className={field}
            type="text"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className={fieldLabel}>
          <span>Role</span>
          <select className={field} value={role} onChange={(e) => setRole(e.target.value as AbsensiRole)}>
            <option value="absen_karyawan" className="text-[#111827]">Karyawan (absen_karyawan)</option>
            <option value="admin_absensi" className="text-[#111827]">Admin absensi (admin_absensi)</option>
          </select>
        </label>
        <label className={`${text} flex items-center gap-2 text-sm text-neutral-200`}>
          <input type="checkbox" className="h-4 w-4 accent-amber-400" checked={noFaceCheck} onChange={(e) => setNoFaceCheck(e.target.checked)} />
          <span>Tanpa cek wajah</span>
        </label>
        {formError && <p role="alert" className={`${text} text-sm text-[#EF4444]`}>{formError}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={submitting}>Tambah karyawan</Button>
      </form>

      <div className="space-y-3">
        <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-white">Daftar karyawan</h2>
        {error && <p role="alert" className={`${text} text-sm text-[#EF4444]`}>{error}</p>}
        {employees === null && !error && <p className={`${text} text-sm text-neutral-400`}>Memuat...</p>}
        {employees?.length === 0 && <p className={`${text} text-sm text-neutral-400`}>Belum ada karyawan.</p>}

        <ul className="space-y-3">
          {employees?.map((employee) => {
            const busy = busyUid === employee.uid;
            return (
              <li key={employee.uid} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <ReferencePhoto employee={employee} />
                  <div className={`${text} min-w-0`}>
                    <p className="truncate text-sm font-bold text-white">{employee.name}</p>
                    <p className="truncate text-xs text-neutral-400">{employee.email}</p>
                    <p className="text-xs text-neutral-300">
                      {employee.role === "admin_absensi" ? "Admin absensi" : "Karyawan"} ·{" "}
                      {employee.status === "aktif" ? "Aktif" : "Nonaktif"} · {employee.activated ? "Sudah aktivasi" : "Belum aktivasi"} ·{" "}
                      {employee.faceRequired ? "Cek wajah" : "Tanpa cek wajah"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void patch(employee, { action: employee.status === "aktif" ? "nonaktifkan" : "aktifkan" })}
                  >
                    {employee.status === "aktif" ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => setResetTarget(employee)}>
                    Reset HP & wajah
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void patch(employee, { action: "set_face_required", faceRequired: !employee.faceRequired })}
                  >
                    {employee.faceRequired ? "Matikan cek wajah" : "Nyalakan cek wajah"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <ConfirmModal
        isOpen={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        onConfirm={() => {
          const target = resetTarget;
          setResetTarget(null);
          if (target) void patch(target, { action: "reset_perangkat" });
        }}
        title="Reset HP & wajah?"
        message={`Passkey dan foto acuan ${resetTarget?.name ?? ""} dihapus. Karyawan harus aktivasi ulang di area kerja.`}
        confirmText="Reset"
        confirmVariant="danger"
      />
    </section>
  );
}
