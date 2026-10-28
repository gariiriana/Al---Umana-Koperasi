import { useCallback, useEffect, useState } from "react";

import { MIN_PASSWORD_LENGTH } from "../../../../workers/absensi/shared/constants.js";
import { createEmployee, fetchPhotoUrl, listEmployees, patchEmployee, type PatchEmployeeBody } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import type { AbsensiRole, EmployeeView } from "@/absensi/types";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

const field =
  "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200";
const fieldLabel = "block space-y-1 text-xs font-bold text-neutral-700";

/** Foto acuan dimuat per baris; foto yang sudah lewat masa simpan tampil sebagai teks. */
function ReferencePhoto({ employee }: { employee: EmployeeView }) {
  const [state, setState] = useState<{ url: string | null; loading: boolean }>({ url: null, loading: true });
  const photoId = employee.referencePhotoId;

  useEffect(() => {
    if (!photoId) {
      setState({ url: null, loading: false });
      return undefined;
    }
    let url: string | null = null;
    let cancelled = false;
    setState({ url: null, loading: true });
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

  const box =
    "flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-amber-200/70 bg-amber-50/60 p-1 text-center text-[10px] font-bold leading-tight text-amber-900/70";
  if (!photoId) return <div className={box}>{employee.activated ? "Tanpa foto" : "Belum aktivasi"}</div>;
  if (state.loading) return <div className={box}>Memuat...</div>;
  if (!state.url) return <div className={box}>Foto sudah dihapus</div>;
  return <img src={state.url} alt={`Foto acuan ${employee.name}`} className="h-16 w-16 shrink-0 rounded-2xl border border-neutral-200 object-cover" />;
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
      <form onSubmit={submit} className="space-y-4 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div>
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
            Tambah karyawan
          </h2>
          <p className="text-xs text-neutral-500">Buat akun baru untuk staf atau admin absensi.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
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
              <option value="absen_karyawan">Karyawan (absen_karyawan)</option>
              <option value="admin_absensi">Admin absensi (admin_absensi)</option>
            </select>
          </label>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-700">
          <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={noFaceCheck} onChange={(e) => setNoFaceCheck(e.target.checked)} />
          <span>Tanpa cek wajah</span>
        </label>

        {formError && (
          <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
            {formError}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full sm:w-auto" loading={submitting}>
          Tambah karyawan
        </Button>
      </form>

      <div className="space-y-3">
        <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
          Daftar karyawan
        </h2>
        {error && (
          <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}
        {employees === null && !error && <p className="text-sm text-neutral-500">Memuat...</p>}
        {employees?.length === 0 && <p className="text-sm text-neutral-500">Belum ada karyawan.</p>}

        <ul className="space-y-3">
          {employees?.map((employee) => {
            const busy = busyUid === employee.uid;
            return (
              <li key={employee.uid} className="space-y-3.5 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-3.5">
                  <ReferencePhoto employee={employee} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                        {employee.name}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          employee.status === "aktif"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-neutral-200 text-neutral-700"
                        }`}
                      >
                        {employee.status === "aktif" ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-neutral-500">{employee.email}</p>
                    <p className="mt-1 text-xs font-semibold text-amber-800">
                      {employee.role === "admin_absensi" ? "Admin absensi" : "Karyawan"} ·{" "}
                      {employee.activated ? "Sudah aktivasi" : "Belum aktivasi"} ·{" "}
                      {employee.faceRequired ? "Cek wajah" : "Tanpa cek wajah"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                  <Button
                    variant="outlined"
                    size="sm"
                    disabled={busy}
                    onClick={() => void patch(employee, { action: employee.status === "aktif" ? "nonaktifkan" : "aktifkan" })}
                  >
                    {employee.status === "aktif" ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  <Button variant="outlined" size="sm" disabled={busy} onClick={() => setResetTarget(employee)}>
                    Reset HP & wajah
                  </Button>
                  <Button
                    variant="outlined"
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
