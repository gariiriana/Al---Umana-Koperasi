import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  MapPin,
  Lock,
  Bell,
  Camera,
  Eye,
  EyeOff,
} from "lucide-react";
import { updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";

const DICTIONARY = {
  id: {
    title: "Profil Saya",
    subtitle: "Kelola informasi profil Anda untuk mengontrol, melindungi dan mengamankan akun",
    username: "Username",
    fullName: "Nama Lengkap",
    email: "Email",
    phone: "Nomor Telepon",
    shopName: "Nama Instansi / Koperasi",
    gender: "Jenis Kelamin",
    male: "Laki-laki",
    female: "Perempuan",
    other: "Lainnya",
    birthDate: "Tanggal Lahir",
    save: "Simpan",
    saving: "Menyimpan...",
    saveSuccess: "Profil berhasil diperbarui!",
    saveError: "Gagal memperbarui profil.",
    chooseImage: "Pilih Gambar",
    imageLimit: "Ukuran gambar: maks. 1 MB. Format gambar: .JPEG, .PNG",
    change: "Ubah",
    add: "Tambah",
    editProfileText: "Ubah Profil",
    myAccount: "Akun Saya",
    myOrders: "Pesanan Saya",
    
    // Tabs
    tabProfile: "Profil",
    tabBank: "Bank & Kartu",
    tabAddress: "Alamat",
    tabPassword: "Ubah Password",
    tabNotifications: "Pengaturan Notifikasi",
    
    // Address Tab
    addressTitle: "Alamat Saya",
    addressSubtitle: "Kelola alamat pengiriman untuk mempermudah transaksi belanja Anda",
    addressLabel: "Alamat Lengkap Pengiriman",
    addressPlaceholder: "Masukkan alamat lengkap Anda (Jalan, No. Rumah, RT/RW, Kecamatan, Kota, Kode Pos)...",
    addressSuccess: "Alamat berhasil diperbarui!",
    
    // Bank Tab
    bankTitle: "Kartu & Rekening Bank Saya",
    bankSubtitle: "Simpan kartu debit/kredit atau rekening bank Anda untuk proses checkout yang lebih cepat",
    addCard: "Tambah Kartu Baru",
    noCards: "Belum ada kartu atau rekening bank yang disimpan.",
    cardAdded: "Kartu bank berhasil ditambahkan!",
    cardRemoved: "Kartu bank berhasil dihapus.",
    cardNumber: "Nomor Kartu",
    cardHolder: "Nama Pemilik",
    cardExpiry: "Masa Berlaku (MM/YY)",
    cardModalTitle: "Tambah Kartu Kredit/Debit",
    cancel: "Batal",
    
    // Password Tab
    passwordTitle: "Ubah Password",
    passwordSubtitle: "Untuk keamanan akun Anda, mohon tidak menyebarkan password Anda ke orang lain",
    currentPassword: "Password Saat Ini",
    newPassword: "Password Baru",
    confirmNewPassword: "Konfirmasi Password Baru",
    passwordSuccess: "Password berhasil diperbarui!",
    passwordMismatch: "Konfirmasi password baru tidak cocok.",
    passwordWeak: "Password minimal harus 6 karakter.",
    reauthRequired: "Silakan masukkan password saat ini untuk memverifikasi identitas Anda.",
    
    // Notification Tab
    notifTitle: "Pengaturan Notifikasi",
    notifSubtitle: "Atur jenis notifikasi yang ingin Anda terima melalui email atau nomor telepon",
    notifWhatsApp: "Notifikasi Status Pesanan (WhatsApp)",
    notifWhatsAppDesc: "Terima update real-time mengenai pembayaran dan pengiriman barang via WhatsApp",
    notifPromo: "Notifikasi Promo & Diskon",
    notifPromoDesc: "Dapatkan informasi promo menarik dari Koperasi Al-Umanaa",
    notifNewsletter: "Email Newsletter Mingguan",
    notifNewsletterDesc: "Informasi dan berita seputar kegiatan koperasi santri dan pondok pesantren",
    notifSuccess: "Pengaturan notifikasi berhasil diperbarui!",
  },
  en: {
    title: "My Profile",
    subtitle: "Manage your profile details to control, protect, and secure your account",
    username: "Username",
    fullName: "Full Name",
    email: "Email",
    phone: "Phone Number",
    shopName: "Institution / Cooperative Name",
    gender: "Gender",
    male: "Male",
    female: "Female",
    other: "Other",
    birthDate: "Date of Birth",
    save: "Save",
    saving: "Saving...",
    saveSuccess: "Profile updated successfully!",
    saveError: "Failed to update profile.",
    chooseImage: "Select Image",
    imageLimit: "Image size: max. 1 MB. Image format: .JPEG, .PNG",
    change: "Change",
    add: "Add",
    editProfileText: "Edit Profile",
    myAccount: "My Account",
    myOrders: "My Orders",
    
    // Tabs
    tabProfile: "Profile",
    tabBank: "Bank & Cards",
    tabAddress: "Addresses",
    tabPassword: "Change Password",
    tabNotifications: "Notification Settings",
    
    // Address Tab
    addressTitle: "My Addresses",
    addressSubtitle: "Manage your delivery addresses for seamless checkout experiences",
    addressLabel: "Full Shipping Address",
    addressPlaceholder: "Enter your full shipping address (Street, House No, RT/RW, Sub-district, City, Postal Code)...",
    addressSuccess: "Address updated successfully!",
    
    // Bank Tab
    bankTitle: "My Bank Cards & Accounts",
    bankSubtitle: "Save your debit/credit cards or bank accounts to speed up checkout",
    addCard: "Add New Card",
    noCards: "No saved bank cards or accounts yet.",
    cardAdded: "Bank card successfully added!",
    cardRemoved: "Bank card successfully removed.",
    cardNumber: "Card Number",
    cardHolder: "Cardholder Name",
    cardExpiry: "Expiry Date (MM/YY)",
    cardModalTitle: "Add Credit/Debit Card",
    cancel: "Cancel",
    
    // Password Tab
    passwordTitle: "Change Password",
    passwordSubtitle: "For account security, please do not share your password with others",
    currentPassword: "Current Password",
    newPassword: "New Password",
    confirmNewPassword: "Confirm New Password",
    passwordSuccess: "Password updated successfully!",
    passwordMismatch: "New passwords do not match.",
    passwordWeak: "Password must be at least 6 characters.",
    reauthRequired: "Please enter your current password to verify your identity.",
    
    // Notification Tab
    notifTitle: "Notification Settings",
    notifSubtitle: "Configure notifications you wish to receive via email or phone",
    notifWhatsApp: "Order Status Notifications (WhatsApp)",
    notifWhatsAppDesc: "Receive real-time updates regarding payments and deliveries via WhatsApp",
    notifPromo: "Promo & Discount Notifications",
    notifPromoDesc: "Get information about promotions at Al-Umanaa Cooperative",
    notifNewsletter: "Weekly Email Newsletter",
    notifNewsletterDesc: "Receive updates and news regarding cooperative events and boarding school activities",
    notifSuccess: "Notification settings updated successfully!",
  }
} as const;



interface ExtendedUserProfile {
  phoneNumber?: string;
  shopName?: string;
  gender?: string;
  birthDate?: string;
  photoURL?: string;
  notifications?: {
    whatsapp?: boolean;
    promo?: boolean;
    newsletter?: boolean;
  };
}

export function ProfilePage() {
  const { user, profile } = useAuth();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = DICTIONARY[lang];

  const mobileTabLabels = {
    id: {
      profile: "Profil",
      address: "Alamat",
      password: "Password",
      notifications: "Notifikasi"
    },
    en: {
      profile: "Profile",
      address: "Address",
      password: "Password",
      notifications: "Notifications"
    }
  }[lang];

  // Selected sub-tab under "Akun Saya"
  const [activeTab, setActiveTab] = useState<"profile" | "address" | "password" | "notifications">("profile");

  // Profile Form States
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [shopName, setShopName] = useState("");
  const [gender, setGender] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [loadingSave, setLoadingSave] = useState(false);

  // Address Form States
  const [address, setAddress] = useState("");
  const [loadingAddress, setLoadingAddress] = useState(false);



  // Password Form States
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmNewPwd, setConfirmNewPwd] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  // Notifications Form States
  const [whatsappNotif, setWhatsappNotif] = useState(true);
  const [promoNotif, setPromoNotif] = useState(true);
  const [newsletterNotif, setNewsletterNotif] = useState(false);
  const [loadingNotif, setLoadingNotif] = useState(false);

  // Sync profile states when profile finishes loading
  useEffect(() => {
    if (profile) {
      setFullName(profile.displayName || "");
      setAddress(profile.savedDeliveryAddress || "");
      
      // Fallbacks or Firestore extended attributes
      const ext = profile as unknown as ExtendedUserProfile;
      setPhoneNumber(ext.phoneNumber || "");
      setShopName(ext.shopName || "");
      setGender(ext.gender || "");
      setPhotoURL(ext.photoURL || user?.photoURL || "");

      if (ext.birthDate) {
        const parts = ext.birthDate.split("-");
        if (parts.length === 3) {
          setBirthYear(parts[0]);
          setBirthMonth(parts[1]);
          setBirthDay(parts[2]);
        }
      }
      
      if (ext.notifications) {
        setWhatsappNotif(ext.notifications.whatsapp !== false);
        setPromoNotif(ext.notifications.promo !== false);
        setNewsletterNotif(ext.notifications.newsletter === true);
      }
    }
  }, [profile, user]);

  // Handle Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoadingSave(true);

    try {
      // Update Firebase Auth user profile (displayName and photoURL)
      // Bypasses Base64 strings for photoURL to prevent "photo URL too long" Auth errors
      const isBase64 = photoURL.startsWith("data:");
      await updateProfile(user, {
        displayName: fullName,
        photoURL: isBase64 ? null : (photoURL || null)
      });

      // Update Firestore user document
      const userRef = doc(db, "users", user.uid);
      const birthDate = (birthYear && birthMonth && birthDay) 
        ? `${birthYear}-${birthMonth.padStart(2, "0")}-${birthDay.padStart(2, "0")}`
        : "";

      await updateDoc(userRef, {
        displayName: fullName,
        phoneNumber,
        shopName,
        gender,
        birthDate,
        photoURL
      });

      showToast({
        message: t.saveSuccess,
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "";
      showToast({
        message: t.saveError + " " + message,
        variant: "error",
      });
    } finally {
      setLoadingSave(false);
    }
  };

  // Handle Address Update
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoadingAddress(true);

    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        savedDeliveryAddress: address
      });

      showToast({
        message: t.addressSuccess,
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      showToast({
        message: t.saveError,
        variant: "error",
      });
    } finally {
      setLoadingAddress(false);
    }
  };

  // Handle Photo Picker
  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
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



  // Handle Password Update
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (newPwd !== confirmNewPwd) {
      showToast({
        message: t.passwordMismatch,
        variant: "error",
      });
      return;
    }

    if (newPwd.length < 6) {
      showToast({
        message: t.passwordWeak,
        variant: "error",
      });
      return;
    }

    setLoadingPassword(true);

    try {
      // Reauthenticate user first
      if (user.email) {
        const credential = EmailAuthProvider.credential(user.email, currentPwd);
        await reauthenticateWithCredential(user, credential);
      }

      // Update password
      await updatePassword(user, newPwd);

      showToast({
        message: t.passwordSuccess,
        variant: "success",
      });

      setCurrentPwd("");
      setNewPwd("");
      setConfirmNewPwd("");
    } catch (err) {
      console.error(err);
      const error = err as { code?: string; message?: string };
      const isWrongPassword = error.code === "auth/invalid-credential" || error.code === "auth/wrong-password";
      showToast({
        message: isWrongPassword ? t.reauthRequired : error.message || t.saveError,
        variant: "error",
      });
    } finally {
      setLoadingPassword(false);
    }
  };

  // Handle Notifications Save
  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoadingNotif(true);

    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        notifications: {
          whatsapp: whatsappNotif,
          promo: promoNotif,
          newsletter: newsletterNotif
        }
      });

      showToast({
        message: t.notifSuccess,
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      showToast({
        message: t.saveError,
        variant: "error",
      });
    } finally {
      setLoadingNotif(false);
    }
  };

  // Dropdowns lists helper
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const months = lang === "id" 
    ? ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
    : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => String(currentYear - i));

  const username = user?.email?.split("@")[0] || "user";

  return (
    <div className="max-w-7xl mx-auto px-4 pt-3 pb-6 lg:py-8 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <div className="grid grid-cols-1 lg:grid-cols-4 lg:gap-8">
        
        {/* ── LEFT SIDEBAR — hidden on mobile, shown on desktop ─── */}
        <aside className="lg:col-span-1 lg:space-y-6">
          {/* User Preview: visible on desktop only */}
          <div className="hidden lg:flex items-center gap-4 px-2 py-4 border-b border-neutral-200">
            <div className="relative group">
              <div className="h-12 w-12 rounded-full overflow-hidden bg-[#B45309] text-white flex items-center justify-center font-bold text-lg border-2 border-white shadow-md">
                {photoURL ? (
                  <img src={photoURL} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  (user?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase()
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                title={t.editProfileText}
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-sm text-[#111827] truncate">{username}</p>
              <button 
                onClick={() => {
                  setActiveTab("profile");
                  fileInputRef.current?.click();
                }}
                className="text-xs text-neutral-400 hover:text-neutral-500 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Camera className="h-3 w-3" />
                {t.editProfileText}
              </button>
            </div>
          </div>

          {/* file input lives in main panel area — see below */}

            {/* Menu Items (Desktop only vertical list) */}
            <nav className="hidden lg:flex lg:flex-col gap-2">
              <div className="text-xs font-bold text-[#6B7280] uppercase tracking-wider px-3 py-1.5">
                {t.myAccount}
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  activeTab === "profile" 
                    ? "bg-[#FEF3C7] text-[#B45309]" 
                    : "text-neutral-600 hover:bg-[#F3F4F6] hover:text-[#111827]"
                }`}
              >
                <User className="h-4 w-4 shrink-0" />
                <span>{t.tabProfile}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("address")}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  activeTab === "address" 
                    ? "bg-[#FEF3C7] text-[#B45309]" 
                    : "text-neutral-600 hover:bg-[#F3F4F6] hover:text-[#111827]"
                }`}
              >
                <MapPin className="h-4 w-4 shrink-0" />
                <span>{t.tabAddress}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("password")}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  activeTab === "password" 
                    ? "bg-[#FEF3C7] text-[#B45309]" 
                    : "text-neutral-600 hover:bg-[#F3F4F6] hover:text-[#111827]"
                }`}
              >
                <Lock className="h-4 w-4 shrink-0" />
                <span>{t.tabPassword}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("notifications")}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  activeTab === "notifications" 
                    ? "bg-[#FEF3C7] text-[#B45309]" 
                    : "text-neutral-600 hover:bg-[#F3F4F6] hover:text-[#111827]"
                }`}
              >
                <Bell className="h-4 w-4 shrink-0" />
                <span>{t.tabNotifications}</span>
              </button>

              <div className="h-px bg-neutral-200 my-2" />

              <button
                type="button"
                onClick={() => navigate("/orders")}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-neutral-600 hover:bg-[#F3F4F6] hover:text-[#111827] cursor-pointer whitespace-nowrap transition-colors"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <span>{t.myOrders}</span>
              </button>
            </nav>
          </aside>

        <main className="lg:col-span-3">
          {/* Hidden file input accessible by mobile avatar button too */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handlePhotoSelect}
            accept="image/png, image/jpeg"
            className="hidden"
            title="Pilih Gambar"
            aria-label="Pilih Gambar"
          />

          <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5E7EB] shadow-xs p-4 sm:p-6 md:p-8">

            {/* Mobile-only compact profile header */}
            <div className="flex lg:hidden items-center gap-3 pb-4 mb-1 border-b border-neutral-100">
              <div className="relative group shrink-0">
                <div className="h-11 w-11 rounded-full overflow-hidden bg-[#B45309] text-white flex items-center justify-center font-bold text-base border-2 border-white shadow">
                  {photoURL ? (
                    <img src={photoURL} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    (user?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase()
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity cursor-pointer text-white"
                  title={t.editProfileText}
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-sm text-[#111827] truncate">{username}</p>
                <button
                  type="button"
                  onClick={() => { setActiveTab("profile"); fileInputRef.current?.click(); }}
                  className="text-[11px] text-neutral-400 hover:text-[#B45309] font-semibold flex items-center gap-1 cursor-pointer mt-0.5 transition-colors"
                >
                  <Camera className="h-3 w-3" />
                  {t.editProfileText}
                </button>
              </div>
            </div>

            {/* Mobile Minimalist Segmented Tabs */}
            <nav className="flex lg:hidden overflow-x-auto scrollbar-none border-b border-neutral-100 gap-6 pb-px mb-5 font-['Hanken_Grotesk'] text-xs font-extrabold">
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className={`flex items-center gap-1.5 pb-3 border-b-2 cursor-pointer transition-all ${
                  activeTab === "profile" 
                    ? "border-[#B45309] text-[#B45309]" 
                    : "border-transparent text-neutral-500 hover:text-neutral-900"
                }`}
              >
                <User className="h-3.5 w-3.5" />
                <span>{mobileTabLabels.profile}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("address")}
                className={`flex items-center gap-1.5 pb-3 border-b-2 cursor-pointer transition-all ${
                  activeTab === "address" 
                    ? "border-[#B45309] text-[#B45309]" 
                    : "border-transparent text-neutral-500 hover:text-neutral-900"
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>{mobileTabLabels.address}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("password")}
                className={`flex items-center gap-1.5 pb-3 border-b-2 cursor-pointer transition-all ${
                  activeTab === "password" 
                    ? "border-[#B45309] text-[#B45309]" 
                    : "border-transparent text-neutral-500 hover:text-neutral-900"
                }`}
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{mobileTabLabels.password}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("notifications")}
                className={`flex items-center gap-1.5 pb-3 border-b-2 cursor-pointer transition-all ${
                  activeTab === "notifications" 
                    ? "border-[#B45309] text-[#B45309]" 
                    : "border-transparent text-neutral-500 hover:text-neutral-900"
                }`}
              >
                <Bell className="h-3.5 w-3.5" />
                <span>{mobileTabLabels.notifications}</span>
              </button>
            </nav>
            
            {/* ── TAB 1: PROFIL ────────────────────────────────────── */}
            {activeTab === "profile" && (
              <div>
                <div className="hidden lg:block pb-5 border-b border-neutral-100">
                  <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-[#111827]">{t.title}</h2>
                  <p className="text-sm text-[#6B7280] mt-1">{t.subtitle}</p>
                </div>

                <form onSubmit={handleSaveProfile} className="mt-4 lg:mt-8 space-y-5 max-w-2xl">
                  {/* Username */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 md:items-center">
                    <label className="text-sm font-bold text-[#4B5563]">{t.username}</label>
                    <div className="md:col-span-2 text-sm text-[#111827] font-semibold bg-neutral-50 px-4 py-2.5 rounded-xl border border-neutral-100 truncate">
                      {username}
                    </div>
                  </div>

                  {/* Nama Lengkap */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 md:items-center">
                    <label className="text-sm font-bold text-[#4B5563]" htmlFor="fullName">{t.fullName}</label>
                    <div className="md:col-span-2">
                      <input
                        id="fullName"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full text-sm font-semibold bg-white border border-[#D1D5DB] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 md:items-center">
                    <label className="text-sm font-bold text-[#4B5563]">{t.email}</label>
                    <div className="md:col-span-2 text-sm text-[#6B7280] font-semibold flex items-center justify-between bg-neutral-50 px-4 py-2.5 rounded-xl border border-neutral-100 truncate">
                      <span>{user?.email}</span>
                      <span className="text-[10px] text-[#B45309] uppercase font-bold tracking-wider shrink-0 ml-2">{lang === "id" ? "Terverifikasi" : "Verified"}</span>
                    </div>
                  </div>

                  {/* Nomor Telepon */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 md:items-center">
                    <label className="text-sm font-bold text-[#4B5563]" htmlFor="phoneNumber">{t.phone}</label>
                    <div className="md:col-span-2">
                      <input
                        id="phoneNumber"
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g. 08123456789"
                        className="w-full text-sm font-semibold bg-white border border-[#D1D5DB] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Nama Instansi / Koperasi */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 md:items-center">
                    <label className="text-sm font-bold text-[#4B5563]" htmlFor="shopName">{t.shopName}</label>
                    <div className="md:col-span-2">
                      <input
                        id="shopName"
                        type="text"
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        placeholder="e.g. Ponpes Al Umanaa"
                        className="w-full text-sm font-semibold bg-white border border-[#D1D5DB] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Jenis Kelamin */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 md:items-center">
                    <label className="text-sm font-bold text-[#4B5563]">{t.gender}</label>
                    <div className="md:col-span-2 flex flex-wrap items-center gap-4 sm:gap-6">
                      <label className="flex items-center gap-2 text-sm font-semibold text-[#111827] cursor-pointer">
                        <input
                          type="radio"
                          name="gender"
                          value="Laki-laki"
                          checked={gender === "Laki-laki"}
                          onChange={(e) => setGender(e.target.value)}
                          className="h-4 w-4 text-[#B45309] focus:ring-[#FBBF24] border-neutral-300"
                        />
                        <span>{t.male}</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold text-[#111827] cursor-pointer">
                        <input
                          type="radio"
                          name="gender"
                          value="Perempuan"
                          checked={gender === "Perempuan"}
                          onChange={(e) => setGender(e.target.value)}
                          className="h-4 w-4 text-[#B45309] focus:ring-[#FBBF24] border-neutral-300"
                        />
                        <span>{t.female}</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold text-[#111827] cursor-pointer">
                        <input
                          type="radio"
                          name="gender"
                          value="Lainnya"
                          checked={gender === "Lainnya"}
                          onChange={(e) => setGender(e.target.value)}
                          className="h-4 w-4 text-[#B45309] focus:ring-[#FBBF24] border-neutral-300"
                        />
                        <span>{t.other}</span>
                      </label>
                    </div>
                  </div>

                  {/* Tanggal Lahir */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 md:items-center">
                    <label className="text-sm font-bold text-[#4B5563]">{t.birthDate}</label>
                    <div className="md:col-span-2 grid grid-cols-3 gap-2">
                      <select
                        value={birthDay}
                        onChange={(e) => setBirthDay(e.target.value)}
                        className="text-xs md:text-sm font-semibold bg-white border border-[#D1D5DB] rounded-xl px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        aria-label="Tanggal"
                      >
                        <option value="">{lang === "id" ? "Hari" : "Day"}</option>
                        {days.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      
                      <select
                        value={birthMonth}
                        onChange={(e) => setBirthMonth(e.target.value)}
                        className="text-xs md:text-sm font-semibold bg-white border border-[#D1D5DB] rounded-xl px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        aria-label="Bulan"
                      >
                        <option value="">{lang === "id" ? "Bulan" : "Month"}</option>
                        {months.map((m, idx) => (
                          <option key={m} value={String(idx + 1)}>{m}</option>
                        ))}
                      </select>

                      <select
                        value={birthYear}
                        onChange={(e) => setBirthYear(e.target.value)}
                        className="text-xs md:text-sm font-semibold bg-white border border-[#D1D5DB] rounded-xl px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        aria-label="Tahun"
                      >
                        <option value="">{lang === "id" ? "Tahun" : "Year"}</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 pt-4">
                    <div className="hidden md:block" />
                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        disabled={loadingSave}
                        className="w-full md:w-auto min-h-11 px-8 rounded-2xl bg-[#B45309] hover:bg-[#92400E] text-white text-sm font-bold shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {loadingSave ? t.saving : t.save}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}



            {/* ── TAB 3: ALAMAT ────────────────────────────────────── */}
            {activeTab === "address" && (
              <div>
                <div className="pb-5 border-b border-neutral-100">
                  <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-[#111827]">{t.addressTitle}</h2>
                  <p className="text-sm text-[#6B7280] mt-1">{t.addressSubtitle}</p>
                </div>

                <form onSubmit={handleSaveAddress} className="mt-8 space-y-6">
                  <div>
                    <label className="text-sm font-bold text-[#4B5563] block mb-2" htmlFor="addressInput">
                      {t.addressLabel}
                    </label>
                    <textarea
                      id="addressInput"
                      rows={4}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={t.addressPlaceholder}
                      className="w-full text-sm font-semibold bg-white border border-[#D1D5DB] rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all leading-relaxed"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loadingAddress}
                    className="min-h-11 px-8 rounded-2xl bg-[#B45309] hover:bg-[#92400E] text-white text-sm font-bold shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loadingAddress ? t.saving : t.save}
                  </button>
                </form>
              </div>
            )}

            {/* ── TAB 4: PASSWORD ─────────────────────────────────── */}
            {activeTab === "password" && (
              <div>
                <div className="pb-5 border-b border-neutral-100">
                  <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-[#111827]">{t.passwordTitle}</h2>
                  <p className="text-sm text-[#6B7280] mt-1">{t.passwordSubtitle}</p>
                </div>

                <form onSubmit={handleSavePassword} className="mt-8 space-y-5 max-w-xl">
                  {/* Current Password */}
                  <div>
                    <label className="text-sm font-bold text-[#4B5563] block mb-1.5" htmlFor="currentPassword">{t.currentPassword}</label>
                    <div className="relative">
                      <input
                        id="currentPassword"
                        type={showCurrentPwd ? "text" : "password"}
                        required
                        value={currentPwd}
                        onChange={(e) => setCurrentPwd(e.target.value)}
                        className="w-full text-sm font-semibold bg-white border border-[#D1D5DB] rounded-xl pl-4 pr-11 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 focus:outline-none cursor-pointer"
                        title={showCurrentPwd ? "Hide Password" : "Show Password"}
                      >
                        {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="text-sm font-bold text-[#4B5563] block mb-1.5" htmlFor="newPassword">{t.newPassword}</label>
                    <div className="relative">
                      <input
                        id="newPassword"
                        type={showNewPwd ? "text" : "password"}
                        required
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        className="w-full text-sm font-semibold bg-white border border-[#D1D5DB] rounded-xl pl-4 pr-11 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPwd(!showNewPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 focus:outline-none cursor-pointer"
                        title={showNewPwd ? "Hide Password" : "Show Password"}
                      >
                        {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="text-sm font-bold text-[#4B5563] block mb-1.5" htmlFor="confirmNewPassword">{t.confirmNewPassword}</label>
                    <div className="relative">
                      <input
                        id="confirmNewPassword"
                        type={showConfirmPwd ? "text" : "password"}
                        required
                        value={confirmNewPwd}
                        onChange={(e) => setConfirmNewPwd(e.target.value)}
                        className="w-full text-sm font-semibold bg-white border border-[#D1D5DB] rounded-xl pl-4 pr-11 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 focus:outline-none cursor-pointer"
                        title={showConfirmPwd ? "Hide Password" : "Show Password"}
                      >
                        {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={loadingPassword}
                      className="min-h-11 px-8 rounded-2xl bg-[#B45309] hover:bg-[#92400E] text-white text-sm font-bold shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loadingPassword ? t.saving : t.save}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── TAB 5: NOTIFIKASI ───────────────────────────────── */}
            {activeTab === "notifications" && (
              <div>
                <div className="pb-5 border-b border-neutral-100">
                  <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-[#111827]">{t.notifTitle}</h2>
                  <p className="text-sm text-[#6B7280] mt-1">{t.notifSubtitle}</p>
                </div>

                <form onSubmit={handleSaveNotifications} className="mt-8 space-y-6">
                  
                  {/* WhatsApp Status Toggle */}
                  <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-[#111827] block cursor-pointer" htmlFor="whatsappNotif">
                        {t.notifWhatsApp}
                      </label>
                      <span className="text-xs text-[#6B7280] block max-w-lg">{t.notifWhatsAppDesc}</span>
                    </div>
                    <input
                      id="whatsappNotif"
                      type="checkbox"
                      checked={whatsappNotif}
                      onChange={(e) => setWhatsappNotif(e.target.checked)}
                      className="h-5 w-5 text-[#B45309] focus:ring-[#FBBF24] border-neutral-300 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Promo Toggle */}
                  <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-[#111827] block cursor-pointer" htmlFor="promoNotif">
                        {t.notifPromo}
                      </label>
                      <span className="text-xs text-[#6B7280] block max-w-lg">{t.notifPromoDesc}</span>
                    </div>
                    <input
                      id="promoNotif"
                      type="checkbox"
                      checked={promoNotif}
                      onChange={(e) => setPromoNotif(e.target.checked)}
                      className="h-5 w-5 text-[#B45309] focus:ring-[#FBBF24] border-neutral-300 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Newsletter Toggle */}
                  <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                    <div className="space-y-1">
                      <label className="text-sm font-bold text-[#111827] block cursor-pointer" htmlFor="newsletterNotif">
                        {t.notifNewsletter}
                      </label>
                      <span className="text-xs text-[#6B7280] block max-w-lg">{t.notifNewsletterDesc}</span>
                    </div>
                    <input
                      id="newsletterNotif"
                      type="checkbox"
                      checked={newsletterNotif}
                      onChange={(e) => setNewsletterNotif(e.target.checked)}
                      className="h-5 w-5 text-[#B45309] focus:ring-[#FBBF24] border-neutral-300 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loadingNotif}
                      className="min-h-11 px-8 rounded-2xl bg-[#B45309] hover:bg-[#92400E] text-white text-sm font-bold shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loadingNotif ? t.saving : t.save}
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </main>

      </div>
    </div>
  );
}

export default ProfilePage;
