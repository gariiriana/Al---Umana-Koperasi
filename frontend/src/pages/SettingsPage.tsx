import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LogOut, Camera, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const DICTIONARY = {
  id: {
    title: "Pengaturan",
    subtitle: "Akun & preferensi.",
    account: "Detail Akun",
    notSignedIn: "Belum masuk.",
    signOut: "Keluar",
    name: "Nama Pengguna",
    profileTitle: "Biodata Diri",
    profileSubtitle: "Kelola informasi profil dan biodata diri Anda",
    fullName: "Nama Lengkap",
    phone: "Nomor Telepon",
    gender: "Jenis Kelamin",
    male: "Laki-laki",
    female: "Perempuan",
    address: "Alamat Lengkap",
    save: "Simpan Perubahan",
    saving: "Menyimpan...",
    saveSuccess: "Biodata berhasil diperbarui!",
    saveError: "Gagal memperbarui biodata.",
    chooseImage: "Ubah Foto Profil",
    imageLimit: "Maks. 1 MB (JPEG, PNG)",
    role: "Peran/Jabatan",
  },
  en: {
    title: "Settings",
    subtitle: "Account & preferences.",
    account: "Account Details",
    notSignedIn: "Not signed in.",
    signOut: "Sign out",
    name: "Username",
    profileTitle: "Personal Biodata",
    profileSubtitle: "Manage your personal profile and biodata details",
    fullName: "Full Name",
    phone: "Phone Number",
    gender: "Gender",
    male: "Male",
    female: "Female",
    address: "Full Address",
    save: "Save Changes",
    saving: "Saving...",
    saveSuccess: "Biodata updated successfully!",
    saveError: "Failed to update biodata.",
    chooseImage: "Change Profile Photo",
    imageLimit: "Max. 1 MB (JPEG, PNG)",
    role: "Role/Position",
  }
} as const;

const roleLabels: Record<string, Record<string, string>> = {
  id: {
    admin: "Administrator",
    tim_produksi: "Tim Produksi",
    distribusi: "Bagian Distribusi",
    monitoring: "Monitoring & Pengawasan",
    kurir: "Kurir Pengantar",
  },
  en: {
    admin: "Administrator",
    tim_produksi: "Production Team",
    distribusi: "Distribution Dept",
    monitoring: "Monitoring & Supervisor",
    kurir: "Delivery Courier",
  }
};

interface ExtendedUserProfile {
  phoneNumber?: string;
  gender?: string;
  savedDeliveryAddress?: string;
}

export function SettingsPage() {
  const { user, profile, requestSignOut } = useAuth();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = DICTIONARY[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync profile details when loaded
  useEffect(() => {
    if (profile) {
      setFullName(profile.displayName || "");
      setPhotoURL(profile.photoURL || user?.photoURL || "");
      
      const ext = profile as unknown as ExtendedUserProfile;
      setPhoneNumber(ext.phoneNumber || "");
      setGender(ext.gender || "");
      setAddress(ext.savedDeliveryAddress || "");
    }
  }, [profile, user]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      showToast({
        message: lang === "id" ? "Ukuran file maksimal 1 MB." : "File size must not exceed 1 MB.",
        variant: "error"
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setPhotoURL(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      const isBase64 = photoURL.startsWith("data:");
      
      // Update Auth Profile
      await updateProfile(user, {
        displayName: fullName,
        photoURL: isBase64 ? null : (photoURL || null)
      });

      // Update Firestore User Doc
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        displayName: fullName,
        phoneNumber,
        gender,
        savedDeliveryAddress: address,
        photoURL
      });

      showToast({
        message: t.saveSuccess,
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      showToast({
        message: t.saveError,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      {user && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handlePhotoSelect}
            accept="image/png, image/jpeg"
            className="hidden"
            title="Upload Photo"
          />

          {/* Card 1: Biodata Diri */}
          <Card>
            <div className="space-y-6">
              <div>
                <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
                  {t.profileTitle}
                </h3>
                <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk'] mt-0.5">
                  {t.profileSubtitle}
                </p>
              </div>

              {/* Photo Upload Section */}
              <div className="flex items-center gap-4 py-2">
                <div className="relative group shrink-0">
                  <div className="h-16 w-16 rounded-full overflow-hidden bg-[#B45309] text-white flex items-center justify-center font-bold text-xl border-2 border-white shadow-md">
                    {photoURL ? (
                      <img src={photoURL} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      (fullName || user.email || "?").charAt(0).toUpperCase()
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                    title={t.chooseImage}
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-extrabold text-[#B45309] hover:text-[#92400E] cursor-pointer"
                  >
                    {t.chooseImage}
                  </button>
                  <p className="text-[10px] text-[#6B7280]">
                    {t.imageLimit}
                  </p>
                </div>
              </div>

              {/* Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={t.fullName}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
                <Input
                  label={t.phone}
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (
                      !/[0-9]/.test(e.key) &&
                      e.key !== "Backspace" &&
                      e.key !== "Delete" &&
                      e.key !== "Tab" &&
                      e.key !== "Escape" &&
                      e.key !== "Enter" &&
                      e.key !== "ArrowLeft" &&
                      e.key !== "ArrowRight" &&
                      e.key !== "ArrowUp" &&
                      e.key !== "ArrowDown" &&
                      e.key !== "Home" &&
                      e.key !== "End" &&
                      !e.metaKey &&
                      !e.ctrlKey &&
                      !e.altKey
                    ) {
                      e.preventDefault();
                    }
                  }}
                  type="tel"
                />
              </div>

              {/* Gender Radio */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#374151] font-['Hanken_Grotesk']">
                  {t.gender}
                </label>
                <div className="flex gap-6">
                  {[
                    { val: "male", label: t.male },
                    { val: "female", label: t.female }
                  ].map(({ val, label }) => (
                    <label key={val} className="flex items-center gap-2 text-sm text-[#374151] cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value={val}
                        checked={gender === val}
                        onChange={() => setGender(val)}
                        className="h-4 w-4 text-[#B45309] focus:ring-[#FBBF24] border-neutral-300"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Address textarea */}
              <div className="space-y-1.5">
                <label htmlFor="address-input" className="block text-xs font-medium text-[#374151] font-['Hanken_Grotesk']">
                  {t.address}
                </label>
                <textarea
                  id="address-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[#D1D5DB] focus:border-[#FBBF24] focus:ring-2 focus:ring-[#FBBF24] p-3 text-sm text-[#111827] placeholder:text-[#9CA3AF] bg-white outline-none transition font-['Hanken_Grotesk']"
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={saving}
                  leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                >
                  {saving ? t.saving : t.save}
                </Button>
              </div>
            </div>
          </Card>
        </form>
      )}

      {/* Card 2: Detail Akun & Keluar */}
      <Card>
        <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827] mb-2">
          {t.account}
        </h3>
        {user ? (
          <div className="space-y-1 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#374151]">
            <p>
              <span className="text-[#6B7280]">UID:</span> {user.uid}
            </p>
            <p>
              <span className="text-[#6B7280]">Email:</span>{" "}
              {user.email ?? "—"}
            </p>
            {profile?.role && (
              <p>
                <span className="text-[#6B7280]">{t.role}:</span>{" "}
                <span className="font-extrabold text-[#B45309]">
                  {roleLabels[lang]?.[profile.role] || profile.role}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-[#6B7280]">{t.notSignedIn}</p>
        )}
        <div className="mt-4">
          <Button
            variant="outlined"
            leftIcon={<LogOut className="h-4 w-4" />}
            onClick={requestSignOut}
          >
            {t.signOut}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default SettingsPage;
