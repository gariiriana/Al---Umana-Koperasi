import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { auth } from "@/lib/firebase";
import { MIN_NEW_PASSWORD_LENGTH, changePasswordErrorMessage, validateNewPassword } from "@/components/settings/changePassword";

const fieldClass =
  "w-full rounded-lg border border-[#D1D5DB] bg-white px-4 py-3 pr-11 text-sm text-[#111827] " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] outline-none focus:border-[#FBBF24] focus:ring-2 focus:ring-[#FBBF24]";

function PasswordField({ id, label, value, onChange, autoComplete, show }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  show: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold text-[#374151]">{label}</label>
      <input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
    </div>
  );
}

/**
 * Ganti password akun sendiri: password lama diverifikasi ulang ke Firebase dulu, baru password baru disimpan.
 * Sesi di perangkat lain akan diminta login ulang oleh Firebase.
 */
export function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    const invalid = validateNewPassword(current, next, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    const user = auth.currentUser;
    if (!user?.email) {
      setError("Sesi tidak ditemukan. Keluar lalu masuk lagi.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(changePasswordErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">Ubah Password</h3>
            <p className="mt-0.5 text-xs text-[#6B7280] font-['Hanken_Grotesk']">
              Masukkan password lama, lalu buat password baru (minimal {MIN_NEW_PASSWORD_LENGTH} karakter). Perangkat lain
              yang memakai akun ini akan diminta login ulang.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <PasswordField id="pw-current" label="Password lama" value={current} onChange={setCurrent} autoComplete="current-password" show={show} />
          <PasswordField id="pw-new" label="Password baru" value={next} onChange={setNext} autoComplete="new-password" show={show} />
          <PasswordField id="pw-confirm" label="Ulangi password baru" value={confirm} onChange={setConfirm} autoComplete="new-password" show={show} />
        </div>

        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B7280] hover:text-[#111827] cursor-pointer"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
          {show ? "Sembunyikan password" : "Tampilkan password"}
        </button>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
            Password berhasil diganti. Pakai password baru saat login berikutnya.
          </p>
        )}

        <Button type="submit" variant="primary" loading={saving} className="w-full sm:w-auto">
          Simpan password baru
        </Button>
      </form>
    </Card>
  );
}
