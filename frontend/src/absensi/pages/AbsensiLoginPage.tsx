import { useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { AbsensiApiError } from "@/absensi/api";
import { messageFor } from "@/absensi/messages";

/** Login pintu Absensi; tampilannya mengikuti LoginPage KASMA JOB. */
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <video
        src="https://www.alumanaa.com/wp-content/uploads/2020/03/Hero-Video-Compressed.mp4"
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#111827]/80 via-[#1c1005]/70 to-[#78350F]/60" />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-[#111827]/40 p-4 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-8">
          <div className="mb-6 text-center">
            <img
              src="/logo.png"
              alt="Pondok Pesantren Modern Al Umanaa"
              className="mx-auto h-20 object-contain drop-shadow-md"
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border-t border-white/10 pt-4">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-white">Masuk Absensi</h2>
              <p className="mt-1 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-300">
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
              containerClassName="[&>label]:!text-neutral-200 [&>label]:!font-semibold"
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
              containerClassName="[&>label]:!text-neutral-200 [&>label]:!font-semibold"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[#6B7280] hover:text-[#374151] focus:outline-none"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            <div className="flex w-full justify-center overflow-hidden py-2">
              <div className="origin-center scale-90 transition-transform min-[370px]:scale-95 min-[400px]:scale-100">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
                  options={{ theme: "dark" }}
                />
              </div>
            </div>

            {shownError && (
              <p role="alert" className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#EF4444]">
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
                className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-bold text-amber-300 hover:text-amber-400 hover:underline"
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
