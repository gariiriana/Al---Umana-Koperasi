import { Search } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
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
  onSignOut,
  headerActions,
}: AppShellProps) {
  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange?.(event.target.value);
  };

  const initial = (userName ?? userEmail ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex bg-[#F3F4F6]">
      <Sidebar
        userName={userName}
        userEmail={userEmail}
        onSignOut={onSignOut}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB]">
          <div className="flex items-center gap-4 px-4 md:px-6 py-3">
            {pageTitle && (
              <h2 className="hidden md:block font-['Manrope',system-ui,sans-serif] text-lg font-semibold text-[#111827] truncate">
                {pageTitle}
              </h2>
            )}

            <div className="flex-1 max-w-xl">
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

            {headerActions && (
              <div className="flex items-center gap-2 shrink-0">
                {headerActions}
              </div>
            )}

            <div
              className="h-9 w-9 rounded-full bg-[#FBBF24] flex items-center justify-center text-[#111827] font-semibold text-sm shrink-0"
              aria-label={userName ? `Signed in as ${userName}` : "User avatar"}
              title={userName ?? userEmail}
            >
              {initial}
            </div>
          </div>
        </header>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto bg-[#F3F4F6] pb-20 md:pb-0">
          <div className="px-4 md:px-6 py-6">{children}</div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

export default AppShell;
