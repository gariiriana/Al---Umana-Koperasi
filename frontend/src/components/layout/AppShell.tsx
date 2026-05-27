import { Search, Settings, LogOut } from "lucide-react";
import { useState, type ChangeEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

export interface AppShellProps {
  children: ReactNode;
  /** Optional page title shown in the top header. */
  pageTitle?: string;
  /** Search box value (controlled). */
  searchValue?: string;
  /** Search box change handler. */
  onSearchChange?: (value: string) => void;
  /** Placeholder text for the search box. */
  searchPlaceholder?: string;
  /** Authenticated user's display name. */
  userName?: string;
  /** Authenticated user's email. */
  userEmail?: string;
  /** Authenticated user's role. */
  userRole?: string;
  /** Sign-out callback fired by the sidebar button. */
  onSignOut?: () => void;
  /** Optional custom slot rendered on the right side of the header. */
  headerActions?: ReactNode;
}

export function AppShell({
  children,
  pageTitle,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search orders, couriers...",
  userName,
  userEmail,
  userRole,
  onSignOut,
  headerActions,
}: AppShellProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange?.(event.target.value);
  };

  const initial = (userName ?? userEmail ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex bg-[#F3F4F6]">
      <Sidebar
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        onSignOut={onSignOut}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB]">
          <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3">
            {/* Left Column */}
            <div className="hidden md:flex items-center flex-1 min-w-0">
              {pageTitle && (
                <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-semibold text-[#111827] truncate">
                  {pageTitle}
                </h2>
              )}
            </div>

            {/* Middle Column */}
            <div className="flex-1 md:flex-none w-full max-w-xl">
              <label className="relative block">
                <span className="sr-only">Search</span>
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchValue ?? ""}
                  onChange={handleSearch}
                  placeholder={searchPlaceholder}
                  className={
                    "w-full rounded-full border border-[#D1D5DB] bg-white pl-11 pr-4 py-2 " +
                    "font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#111827] placeholder:text-[#6B7280] " +
                    "transition-shadow duration-150 " +
                    "focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent"
                  }
                />
              </label>
            </div>

            {/* Right Column */}
            <div className="flex items-center justify-end gap-4 md:flex-1 shrink-0">
              {headerActions && (
                <div className="flex items-center gap-2 shrink-0">
                  {headerActions}
                </div>
              )}

              <div className="relative">
                <button
                  type="button"
                  id="profile-menu-button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="h-9 w-9 rounded-full bg-[#FBBF24] hover:bg-[#F59E0B] flex items-center justify-center text-[#111827] font-semibold text-sm shrink-0 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:ring-offset-2"
                  aria-label={userName ? `Signed in as ${userName}` : "User avatar"}
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
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-[#E5E7EB] shadow-lg py-2 z-50 font-['Hanken_Grotesk',system-ui,sans-serif]">
                      <div className="px-4 py-2 border-b border-[#E5E7EB] mb-1">
                        <p className="text-[10px] font-semibold text-[#6B7280]">Masuk sebagai</p>
                        <p className="text-xs font-bold text-[#111827] truncate">{userName || "User"}</p>
                        <p className="text-[10px] text-[#6B7280] truncate">{userEmail}</p>
                      </div>

                      <Link
                        to="/admin/settings"
                        onClick={() => setIsDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827] transition-colors"
                      >
                        <Settings className="h-4 w-4 text-[#6B7280]" />
                        <span>Settings</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onSignOut?.();
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#DC2626] hover:bg-red-50 transition-colors text-left cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto bg-[#F3F4F6] pb-20 md:pb-0">
          <div className="px-4 md:px-6 py-6">{children}</div>
        </main>
      </div>

      <MobileNav userRole={userRole} />
    </div>
  );
}

export default AppShell;
