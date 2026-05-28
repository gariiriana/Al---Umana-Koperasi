import { Search, LogOut, X, Settings } from "lucide-react";
import { useState, type ChangeEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { Footer } from "./Footer";

export interface AppShellProps {
  children: ReactNode;
  pageTitle?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onSignOut?: () => void;
  headerActions?: ReactNode;
}

export function AppShell({
  children,
  pageTitle,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Cari pesanan, kurir...",
  userName,
  userEmail,
  userRole,
  onSignOut,
  headerActions,
}: AppShellProps) {
  const { lang } = useLanguage();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange?.(event.target.value);
  };

  const initial = (userName ?? userEmail ?? "?").charAt(0).toUpperCase();
  const roleBadge: Record<string, string> = {
    admin: "Admin",
    tim_produksi: "Produksi",
    distribusi: "Distribusi",
    monitoring: "Monitor",
  };

  return (
    <div className="min-h-screen flex bg-[#F3F4F6]">
      <Sidebar
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        onSignOut={onSignOut}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Top header ─────────────────────────────────────────── */}
        <header className="md:hidden sticky top-0 z-30 bg-white border-b border-[#E5E7EB]">

          {/* Mobile search bar (full-width, shown on demand) */}
          {isMobileSearchOpen && (
            <div className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b border-[#E5E7EB]">
              <Search className="h-4 w-4 text-[#9CA3AF] shrink-0" aria-hidden="true" />
              <input
                type="search"
                autoFocus
                value={searchValue ?? ""}
                onChange={handleSearch}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none font-['Hanken_Grotesk',system-ui,sans-serif]"
              />
              <button
                onClick={() => setIsMobileSearchOpen(false)}
                aria-label="Tutup pencarian"
                className="text-[#9CA3AF] hover:text-[#374151] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
            {/* Left: page title (mobile) / search (desktop) */}
            <div className="flex-1 min-w-0">
              {/* Desktop search */}
              {onSearchChange && (
                <label className="relative hidden md:block">
                  <span className="sr-only">Cari</span>
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchValue ?? ""}
                    onChange={handleSearch}
                    placeholder={searchPlaceholder}
                    className="w-full max-w-xs rounded-full border border-[#E5E7EB] bg-[#F9FAFB] pl-10 pr-4 py-2 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent font-['Hanken_Grotesk',system-ui,sans-serif] transition"
                  />
                </label>
              )}

              {/* Mobile: show page title */}
              {pageTitle && (
                <p className="md:hidden font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-[#111827] truncate">
                  {pageTitle}
                </p>
              )}
            </div>

            {/* Right: actions + search icon (mobile) + avatar */}
            <div className="flex items-center gap-2 shrink-0">
              {headerActions && (
                <div className="hidden sm:flex items-center gap-2">{headerActions}</div>
              )}

              {/* Mobile search toggle */}
              {onSearchChange && (
                <button
                  onClick={() => setIsMobileSearchOpen(true)}
                  aria-label="Buka pencarian"
                  className="md:hidden h-9 w-9 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#6B7280] cursor-pointer transition-colors"
                >
                  <Search className="h-5 w-5" />
                </button>
              )}

              {/* Avatar + dropdown */}
              <div className="relative">
                <button
                  type="button"
                  id="profile-menu-button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="h-9 w-9 rounded-full bg-[#FBBF24] hover:bg-[#F59E0B] flex items-center justify-center text-[#111827] font-bold text-sm shrink-0 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:ring-offset-2"
                  aria-label={userName ? `Masuk sebagai ${userName}` : "Menu pengguna"}
                  title={userName ?? userEmail}
                >
                  {initial}
                </button>

                {isDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-[#E5E7EB] shadow-xl py-2 z-50 font-['Hanken_Grotesk',system-ui,sans-serif]">
                      <div className="px-4 py-3 border-b border-[#F3F4F6]">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-[#FBBF24] flex items-center justify-center text-sm font-bold text-[#111827] shrink-0">
                            {initial}
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
          </div>
        </header>

        {/* ── Main content ───────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-[#F3F4F6] pb-24 md:pb-0 flex flex-col justify-between">
          <div className="px-4 md:px-6 py-5">{children}</div>
          <Footer />
        </main>
      </div>

      <MobileNav userRole={userRole} />
    </div>
  );
}

export default AppShell;
