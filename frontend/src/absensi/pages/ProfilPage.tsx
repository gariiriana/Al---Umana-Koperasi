import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from "firebase/auth";
import { Check, ChevronRight, Eye, EyeOff, ShieldCheck, Smartphone, X } from "lucide-react";

import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { EmployeeBottomNav } from "@/absensi/components/EmployeeBottomNav";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { hasDeviceMarker } from "@/absensi/deviceMarker";
import { getAbsensiAuth } from "@/absensi/firebaseAbsensi";
import { Button } from "@/components/ui/Button";

interface ProfileCustomMeta {
  name: string;
  position: string;
  company: string;
  language: "Bahasa Indonesia" | "English";
}

function loadProfileMeta(uid: string, defaultName: string, defaultCompany: string): ProfileCustomMeta {
  try {
    const raw = localStorage.getItem(`absensi_profile_meta_${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProfileCustomMeta>;
      return {
        name: parsed.name?.trim() || defaultName,
        position: parsed.position?.trim() || "QC Maintenance - Managed Service",
        company: parsed.company?.trim() || defaultCompany,
        language: parsed.language === "English" ? "English" : "Bahasa Indonesia",
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    name: defaultName,
    position: "QC Maintenance - Managed Service",
    company: defaultCompany,
    language: "Bahasa Indonesia",
  };
}

function saveProfileMeta(uid: string, meta: ProfileCustomMeta) {
  try {
    localStorage.setItem(`absensi_profile_meta_${uid}`, JSON.stringify(meta));
  } catch {
    // ignore storage errors
  }
}

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200";

/**
 * Halaman Profil Karyawan (Referensi SS 4) dengan palet Putih + Kuning Khas:
 * - Kartu Identitas Karyawan (Avatar siluet kuning-emas, Nama, Jabatan, Unit/Perusahaan)
 * - Kartu Menu AKUN: Edit Profil, Registrasi Wajah, Ubah Kata Sandi, Pengaturan Bahasa, Riwayat Absensi Saya
 * - Tombol Keluar (outline merah) & Versi aplikasi Ver. 2.9.3 (94).
 */
export function ProfilPage() {
  const navigate = useNavigate();
  const { me, signOut, reloadMe } = useAbsensiSession();
  if (!me) return null;

  const defaultCompany = me.areas[0]?.name ?? "Koperasi Pondok Pesantren Al Umanaa";
  const [meta, setMeta] = useState<ProfileCustomMeta>(() =>
    loadProfileMeta(me.uid, me.name, defaultCompany),
  );

  const [activeSheet, setActiveSheet] = useState<"edit" | "face" | "password" | "language" | null>(null);

  // State Edit Profil
  const [editName, setEditName] = useState(meta.name);
  const [editPosition, setEditPosition] = useState(meta.position);
  const [editCompany, setEditCompany] = useState(meta.company);
  const [editNotice, setEditNotice] = useState<string | null>(null);

  // State Ubah Kata Sandi
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const deviceRegistered = hasDeviceMarker(me.uid);

  const openEditProfile = () => {
    setEditName(meta.name);
    setEditPosition(meta.position);
    setEditCompany(meta.company);
    setEditNotice(null);
    setActiveSheet("edit");
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: ProfileCustomMeta = {
      ...meta,
      name: editName.trim() || me.name,
      position: editPosition.trim() || "QC Maintenance - Managed Service",
      company: editCompany.trim() || defaultCompany,
    };
    setMeta(next);
    saveProfileMeta(me.uid, next);
    try {
      const currentUser = getAbsensiAuth().currentUser;
      if (currentUser && next.name !== currentUser.displayName) {
        await updateProfile(currentUser, { displayName: next.name });
      }
      await reloadMe();
    } catch {
      // Ignore Firebase profile update errors
    }
    setEditNotice("Profil berhasil diperbarui.");
    setTimeout(() => {
      setActiveSheet(null);
      setEditNotice(null);
    }, 800);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }

    setPasswordLoading(true);
    try {
      const currentUser = getAbsensiAuth().currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error("Sesi pengguna tidak ditemukan.");
      }
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setPasswordSuccess("Kata sandi berhasil diperbarui.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError("Gagal mengubah kata sandi. Pastikan kata sandi saat ini benar.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSelectLanguage = (lang: "Bahasa Indonesia" | "English") => {
    const next: ProfileCustomMeta = { ...meta, language: lang };
    setMeta(next);
    saveProfileMeta(me.uid, next);
    setActiveSheet(null);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      {/* Header Atas (Logo Kiri, Judul Profil Tengah, Lonceng Kanan — Referensi SS 4) */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-1.5">
            <img src="/logo.png" alt="Al Umanaa" className="h-8 w-8 object-contain" />
            <div className="leading-none">
              <span className="block font-['Manrope',system-ui,sans-serif] text-[11px] font-black tracking-tight text-amber-700">
                AL UMANAA
              </span>
              <span className="block text-[8px] font-bold tracking-widest text-neutral-500 uppercase">
                ABSENSI
              </span>
            </div>
          </div>

          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
            Profil
          </h1>

          <NotificationBellButton variant="plain" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-5">
        {/* Card 1: Kartu Identitas Karyawan (Referensi SS 4) */}
        <button
          type="button"
          onClick={openEditProfile}
          className="flex w-full items-center gap-4 rounded-2xl border border-neutral-200/80 bg-white p-4 text-left shadow-2xs transition hover:border-amber-300"
        >
          {/* Avatar Siluet Bulat Berbingkai Kuning-Emas */}
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-amber-500 bg-gradient-to-b from-amber-50 to-amber-100 shadow-inner">
            <svg viewBox="0 0 64 64" className="h-14 w-14 translate-y-1">
              <defs>
                <linearGradient id="avatarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="#D97706" />
                </linearGradient>
              </defs>
              <circle cx="32" cy="22" r="11" fill="url(#avatarGrad)" />
              <path
                d="M12 56c0-11 9-19 20-19s20 8 20 19"
                fill="url(#avatarGrad)"
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
              {meta.name}
            </h2>
            <p className="mt-0.5 truncate text-xs font-semibold text-amber-600">
              {meta.position}
            </p>
            <p className="mt-0.5 truncate text-xs font-extrabold text-amber-950">
              {meta.company}
            </p>
          </div>

          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
        </button>

        {/* Card 2: Seksi AKUN (Referensi SS 4) */}
        <section className="rounded-2xl border border-neutral-200/80 bg-white px-5 py-4 shadow-2xs">
          <h3 className="mb-1 text-[11px] font-extrabold tracking-wider text-amber-900 uppercase">
            AKUN
          </h3>

          <div className="divide-y divide-neutral-100">
            <button
              type="button"
              onClick={openEditProfile}
              className="flex w-full items-center justify-between py-3.5 text-left text-sm font-bold text-neutral-800 transition hover:text-amber-700"
            >
              <span>Edit Profil</span>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </button>

            <button
              type="button"
              onClick={() => setActiveSheet("face")}
              className="flex w-full items-center justify-between py-3.5 text-left text-sm font-bold text-neutral-800 transition hover:text-amber-700"
            >
              <span>Registrasi Wajah</span>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </button>

            <button
              type="button"
              onClick={() => {
                setPasswordError(null);
                setPasswordSuccess(null);
                setActiveSheet("password");
              }}
              className="flex w-full items-center justify-between py-3.5 text-left text-sm font-bold text-neutral-800 transition hover:text-amber-700"
            >
              <span>Ubah Kata Sandi</span>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </button>

            <button
              type="button"
              onClick={() => setActiveSheet("language")}
              className="flex w-full items-center justify-between py-3.5 text-left text-sm font-bold text-neutral-800 transition hover:text-amber-700"
            >
              <span>Pengaturan Bahasa</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-amber-800">{meta.language}</span>
                <ChevronRight className="h-4 w-4 text-neutral-400" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/absensi/riwayat")}
              className="flex w-full items-center justify-between py-3.5 text-left text-sm font-bold text-neutral-800 transition hover:text-amber-700"
            >
              <span>Riwayat Absensi Saya</span>
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </button>
          </div>
        </section>

        {/* Tombol Keluar (Outline Merah sesuai SS 4) */}
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full rounded-xl border border-rose-400 bg-white py-3.5 text-center text-sm font-extrabold text-rose-600 shadow-2xs transition hover:bg-rose-50"
        >
          Keluar
        </button>

        {/* Label Versi di Bawah */}
        <p className="pt-2 text-center text-xs font-medium text-neutral-400">
          Ver. 2.9.3 (94)
        </p>
      </main>

      {/* Modal 1: Edit Profil */}
      {activeSheet === "edit" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit Profil"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          onClick={() => setActiveSheet(null)}
        >
          <form
            onSubmit={handleSaveProfile}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3.5 rounded-3xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                Edit Profil
              </h2>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block space-y-1 text-xs font-bold text-neutral-700">
              <span>Nama Lengkap</span>
              <input
                type="text"
                required
                className={inputClass}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>

            <label className="block space-y-1 text-xs font-bold text-neutral-700">
              <span>Email Akun</span>
              <input
                type="email"
                disabled
                className={`${inputClass} bg-neutral-100 text-neutral-500`}
                value={me.email}
              />
            </label>

            <label className="block space-y-1 text-xs font-bold text-neutral-700">
              <span>Jabatan / Posisi</span>
              <input
                type="text"
                required
                className={inputClass}
                value={editPosition}
                onChange={(e) => setEditPosition(e.target.value)}
              />
            </label>

            <label className="block space-y-1 text-xs font-bold text-neutral-700">
              <span>Unit / Perusahaan</span>
              <input
                type="text"
                required
                className={inputClass}
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
              />
            </label>

            {editNotice && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                {editNotice}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outlined" className="flex-1" onClick={() => setActiveSheet(null)}>
                Batal
              </Button>
              <Button type="submit" variant="primary" className="flex-1">
                Simpan Profil
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 2: Registrasi Wajah & Perangkat */}
      {activeSheet === "face" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Registrasi Wajah"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-3xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                Registrasi Wajah & Perangkat
              </h2>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-neutral-950">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-500">Status Biometrik Wajah</p>
                  <p className="text-sm font-extrabold text-neutral-900">
                    {me.faceRequired
                      ? me.faceDescriptor
                        ? "Wajah Terdaftar & Aktif"
                        : "Wajib Pencocokan Wajah"
                      : "Selfie Kehadiran Aktif"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 border-t border-amber-200/60 pt-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-500">Kunci Perangkat (Passkey)</p>
                  <p className="text-sm font-extrabold text-neutral-900">
                    {deviceRegistered ? "Perangkat Ini Terhubung" : "Passkey Terdaftar di Akun"}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-neutral-500">
              Data referensi wajah dan perangkat Anda terikat demi keamanan absensi. Jika Anda berganti HP atau perlu
              mendaftarkan ulang wajah, hubungi Admin Absensi untuk melakukan reset perangkat.
            </p>

            <Button type="button" variant="primary" className="w-full" onClick={() => setActiveSheet(null)}>
              Mengerti
            </Button>
          </div>
        </div>
      )}

      {/* Modal 3: Ubah Kata Sandi */}
      {activeSheet === "password" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ubah Kata Sandi"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          onClick={() => setActiveSheet(null)}
        >
          <form
            onSubmit={handleChangePassword}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3.5 rounded-3xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                Ubah Kata Sandi
              </h2>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block space-y-1 text-xs font-bold text-neutral-700">
              <span>Kata Sandi Saat Ini</span>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  required
                  className={inputClass}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block space-y-1 text-xs font-bold text-neutral-700">
              <span>Kata Sandi Baru (Min. 8 Karakter)</span>
              <input
                type={showPass ? "text" : "password"}
                required
                minLength={8}
                className={inputClass}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>

            <label className="block space-y-1 text-xs font-bold text-neutral-700">
              <span>Konfirmasi Kata Sandi Baru</span>
              <input
                type={showPass ? "text" : "password"}
                required
                minLength={8}
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>

            {passwordError && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {passwordError}
              </p>
            )}
            {passwordSuccess && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                {passwordSuccess}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outlined" className="flex-1" onClick={() => setActiveSheet(null)}>
                Batal
              </Button>
              <Button type="submit" variant="primary" className="flex-1" loading={passwordLoading}>
                Simpan Kata Sandi
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 4: Pengaturan Bahasa */}
      {activeSheet === "language" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pengaturan Bahasa"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-3xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                Pengaturan Bahasa
              </h2>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(["Bahasa Indonesia", "English"] as const).map((lang) => {
              const selected = meta.language === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => handleSelectLanguage(lang)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-sm font-bold transition ${
                    selected
                      ? "border-amber-400 bg-amber-50 text-neutral-900"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-amber-300"
                  }`}
                >
                  <span>{lang}</span>
                  {selected && <Check className="h-4 w-4 text-amber-700" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <EmployeeBottomNav />
    </div>
  );
}
