import { useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { AbsensiApiError } from "@/absensi/api";
import { messageFor } from "@/absensi/messages";

/** Login pintu Absensi dengan tema Putih + Kuning Khas selaras Beranda & Admin Absensi. */
export function AbsensiLoginPage() {
  const session = useAbsensiSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  if (session.user && session.me) {
    return <Navigate to="/absensi" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!turnstileToken) {
      setError("Silakan verifikasi bahwa Anda manusia melalui Cloudflare Turnstile.");
      return;
    }
    setSubmitting(true);
    try {
      await session.signIn(email, password);
    } catch (err) {
      setError(messageFor(err instanceof AbsensiApiError ? err.code : "LOGIN_GAGAL"));
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Error dari /me (mis. akun KASMA JOB di pintu ini) datang lewat sesi setelah login.
  const shownError = error ?? (session.error ? messageFor(session.error) : null);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8FAFC] px-4 py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 rounded-b-[3rem] bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 shadow-xs" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full bg-white/25" />
      <div className="pointer-events-none absolute left-8 top-28 h-44 w-44 rounded-full bg-amber-300/35" />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-3xl border border-amber-200/80 bg-white p-6 shadow-[0_24px_50px_-14px_rgba(17,24,39,0.16)] sm:p-8">
          <div className="mb-5 text-center">
            <img
              src="/logo.png"
              alt="Pondok Pesantren Modern Al Umanaa"
              className="mx-auto h-18 object-contain"
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border-t border-amber-100 pt-4 text-center">
              <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-[11px] font-extrabold text-amber-800">
                Portal Kehadiran
              </span>
              <h2 className="mt-1.5 font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-neutral-900">
                Masuk Absensi
              </h2>
              <p className="mt-1 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-500">
                Pakai akun absensi dari admin.
              </p>
            </div>

            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail className="h-4 w-4" />}
              placeholder="nama@absen.alumana.id"
              containerClassName="[&>label]:!text-neutral-700 [&>label]:!font-bold"
            />

            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              placeholder="••••••••"
              containerClassName="[&>label]:!text-neutral-700 [&>label]:!font-bold"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-neutral-500 hover:text-neutral-800 focus:outline-none"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            <div className="flex w-full justify-center overflow-hidden py-1">
              <div className="origin-center scale-90 transition-transform min-[370px]:scale-95 min-[400px]:scale-100">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
                  options={{ theme: "light" }}
                />
              </div>
            </div>

            {shownError && (
              <p
                role="alert"
                className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-semibold text-rose-700"
              >
                {shownError}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting || (session.user !== null && session.loading)}
              className="w-full"
            >
              Masuk
            </Button>

            <div className="text-center">
              <Link
                to="/masuk"
                className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-extrabold text-amber-700 hover:text-amber-800 hover:underline"
              >
                Pilih pintu lain
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
