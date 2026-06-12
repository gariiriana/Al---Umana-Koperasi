import { LogOut, Settings, Bell, Globe, HelpCircle, Tag } from "lucide-react";
import { useState, useEffect, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeUnreadCount } from "@/services/notificationService";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { Footer } from "./Footer";
import { ROLE_DEFAULT_REDIRECT } from "@/constants/roles";

export interface AppShellProps {
  children: ReactNode;
  pageTitle?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  userPhotoUrl?: string;
  onSignOut?: () => void;
  headerActions?: ReactNode;
}

export function AppShell({
  children,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Cari pesanan, kurir...",
  userName,
  userEmail,
  userRole,
  userPhotoUrl,
  onSignOut,
}: AppShellProps) {
  const { lang, setLang } = useLanguage();
  const { user } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    const unsubscribe = subscribeUnreadCount(
      user.uid,
      (count) => setUnreadCount(count),
      (err) => console.error("Failed to subscribe to unread count:", err)
    );
    return () => unsubscribe();
  }, [user]);

  const handleLangChange = (newLang: "id" | "en") => {
    setLang(newLang);
    localStorage.setItem("al-umana-lang", newLang);
    setIsLangOpen(false);
  };


  const initial = (userName ?? userEmail ?? "?").charAt(0).toUpperCase();
  const roleBadge: Record<string, string> = {
    admin: "Admin",
    tim_produksi: "Produksi",
    distribusi: "Distribusi",
    monitoring: "Monitoring",
    kurir: "Kurir",
  };

  return (
    <div className="min-h-screen flex bg-[#F3F4F6]">
      <Sidebar
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        userPhotoUrl={userPhotoUrl}
        onSignOut={onSignOut}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Top header ─────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-gradient-to-b from-[#FBBF24] to-[#F59E0B] text-white shadow-md px-2.5 py-2 md:px-4 md:py-3 flex items-center justify-between gap-1.5 md:gap-4 font-['Hanken_Grotesk',system-ui,sans-serif] inset-x-0">
          {/* Left: Logo & Cooperative Name */}
          <div className="flex items-center gap-1 md:gap-2 shrink-0 min-w-0">
            <Link to={userRole ? (ROLE_DEFAULT_REDIRECT[userRole] ?? "/") : "/"} className="flex items-center gap-1 md:gap-2 min-w-0">
              <img
                src="/logo.png"
                alt="Al Umanaa"
                className="h-7 w-7 md:h-9 md:w-9 object-contain bg-white rounded-full p-0.5 border border-amber-200 shrink-0"
              />
              <span className="font-['Manrope',system-ui,sans-serif] text-xs sm:text-sm md:text-base font-extrabold text-white tracking-wide truncate max-w-[85px] min-[360px]:max-w-[110px] min-[400px]:max-w-none">
                Al-Umanaa <span className="hidden sm:inline font-light text-amber-100 text-xs">{lang === "id" ? "Koperasi" : "Cooperative"}</span>
              </span>
            </Link>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            {/* Tutorial Button */}
            <Link
              to="/help"
              className="flex items-center gap-1 md:gap-1.5 hover:bg-white/10 rounded-lg px-1.5 py-1 md:px-2.5 md:py-1.5 transition-colors text-white font-bold text-xs"
              title={lang === "id" ? "Pusat Tutorial" : "Help Center"}
            >
              <HelpCircle className="h-4.5 w-4.5" />
              <span className="hidden sm:inline">{lang === "id" ? "Tutorial" : "Tutorials"}</span>
            </Link>

            {userRole === "admin" && (
              <>
                <span className="hidden sm:inline-block h-5 w-px bg-white/20 shrink-0 self-center" />
                <Link
                  to="/admin/promos"
                  className="flex items-center gap-1 md:gap-1.5 hover:bg-white/10 rounded-lg px-1.5 py-1 md:px-2.5 md:py-1.5 transition-colors text-white font-bold text-xs"
                  title={lang === "id" ? "Promo & Diskon" : "Promos & Discounts"}
                >
                  <Tag className="h-4.5 w-4.5" />
                  <span className="hidden sm:inline">{lang === "id" ? "Promo" : "Promos"}</span>
                </Link>
              </>
            )}

            <span className="hidden sm:inline-block h-5 w-px bg-white/20 shrink-0 self-center" />

            {/* Notification Bell */}
            <Link
              to="/notifications"
              className="relative p-1 md:p-1.5 hover:bg-white/10 rounded-lg text-white transition-colors flex items-center justify-center"
              title={lang === "id" ? "Notifikasi" : "Notifications"}
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[9px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center border border-[#F59E0B] shadow-xs">
                  {unreadCount}
                </span>
              )}
            </Link>

            <span className="hidden sm:inline-block h-5 w-px bg-white/20 shrink-0 self-center" />

            {/* Language Switcher */}
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => {
                  setIsLangOpen(!isLangOpen);
                  setIsDropdownOpen(false);
                }}
                className="flex items-center gap-1 hover:bg-white/10 rounded-lg px-1.5 py-1 md:px-2.5 md:py-1.5 cursor-pointer focus:outline-none text-white text-xs font-bold"
                aria-label="Pilih Bahasa"
                title="Pilih Bahasa"
              >
                <Globe className="h-4.5 w-4.5" />
                <span className="hidden md:inline">{lang === "id" ? "ID" : "EN"}</span>
              </button>
              {isLangOpen && (
                <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsLangOpen(false)} />
                  <div className="absolute right-0 mt-2 w-36 rounded-lg bg-white border border-[#E5E7EB] shadow-md py-1 z-50 text-neutral-800 font-sans text-xs">
                    <button
                      type="button"
                      onClick={() => handleLangChange("id")}
                      className={`w-full text-left px-3 py-2 hover:bg-[#F3F4F6] font-semibold cursor-pointer ${lang === "id" ? "text-[#F59E0B]" : ""}`}
                    >
                      Bahasa Indonesia
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLangChange("en")}
                      className={`w-full text-left px-3 py-2 hover:bg-[#F3F4F6] font-semibold cursor-pointer ${lang === "en" ? "text-[#F59E0B]" : ""}`}
                    >
                      English
                    </button>
                  </div>
                </>
              )}
            </div>

            <span className="hidden sm:inline-block h-5 w-px bg-white/20 shrink-0 self-center" />

            {/* User Dropdown */}
            <div className="relative">
              <button
                type="button"
                id="profile-menu-button"
                onClick={() => {
                  setIsDropdownOpen(!isDropdownOpen);
                  setIsLangOpen(false);
                }}
                className="h-8 w-8 rounded-full bg-white hover:bg-amber-50 flex items-center justify-center text-[#B45309] font-bold text-xs shrink-0 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:ring-offset-2 overflow-hidden border border-white/25"
                aria-label={userName ? `Masuk sebagai ${userName}` : "Menu pengguna"}
                title={userName ?? userEmail}
              >
                {userPhotoUrl ? (
                  <img src={userPhotoUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </button>

              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-[#E5E7EB] shadow-xl py-2 z-50 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-800">
                    <div className="px-4 py-3 border-b border-[#F3F4F6]">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-[#FBBF24] flex items-center justify-center text-sm font-bold text-[#111827] shrink-0 overflow-hidden">
                          {userPhotoUrl ? (
                            <img src={userPhotoUrl} alt="Avatar" className="h-full w-full object-cover" />
                          ) : (
                            initial
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#111827] truncate">{userName || "Pengguna"}</p>
                          {userRole && (
                            <span className="inline-block text-[10px] font-bold bg-[#F3F4F6] text-[#6B7280] rounded-full px-2 py-0.5 mt-0.5">
                              {roleBadge[userRole] ?? userRole}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Link
                      to="/admin/settings"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827] transition-colors border-b border-[#F3F4F6]"
                    >
                      <Settings className="h-4 w-4 text-[#6B7280]" />
                      <span>{lang === "id" ? "Pengaturan" : "Settings"}</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onSignOut?.();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#DC2626] hover:bg-red-50 transition-colors text-left cursor-pointer mt-1"
                    >
                      <LogOut className="h-4 w-4" />
                      {lang === "id" ? "Keluar" : "Sign Out"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ── Main content ───────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-[#F3F4F6] pb-24 md:pb-0 flex flex-col justify-between min-w-0 w-full">
          <div className="px-4 md:px-6 py-5 w-full min-w-0">{children}</div>
          <Footer />
        </main>
      </div>

      <MobileNav userRole={userRole} />
    </div>
  );
}

export default AppShell;
