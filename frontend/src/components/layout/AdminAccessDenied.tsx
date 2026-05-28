import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const DICTIONARY = {
  id: {
    title: "Akses Ditolak",
    message: "Halaman ini hanya untuk admin. Anda akan dialihkan ke beranda dalam beberapa detik."
  },
  en: {
    title: "Access Denied",
    message: "This page is only for admins. You will be redirected to the homepage in a few seconds."
  }
} as const;

/**
 * AdminAccessDenied displays the "Akses Ditolak" message when a non-admin
 * user tries to load an admin-only route, then redirects to the storefront
 * homepage (`/`) within 3 seconds.
 *
 * Used by ShelledRoute when an admin-only route is loaded by a non-admin
 * profile (Requirements 16.3, 16.5).
 */
export function AdminAccessDenied({
  redirectTo = "/",
  delayMs = 3000,
}: {
  redirectTo?: string;
  delayMs?: number;
}) {
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShouldRedirect(true);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (shouldRedirect) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="min-h-screen flex flex-col items-center justify-center bg-[#F3F4F6] px-4 text-center"
    >
      <ShieldAlert
        className="h-12 w-12 text-[#DC2626] mb-4"
        aria-hidden="true"
      />
      <h1 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-[#111827] mb-2">
        {t.title}
      </h1>
      <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280] max-w-md">
        {t.message}
      </p>
    </div>
  );
}

export default AdminAccessDenied;
