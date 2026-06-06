import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import { db, auth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
// import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

const DICTIONARY = {
  id: {
    brandSubtitle: "Koperasi Al-Umanaa — Masuk untuk melanjutkan",
    title: "Masuk",
    subtitle: "Gunakan akun koperasi Anda untuk melanjutkan.",
    forgotPassword: "Lupa password?",
    signInBtn: "Masuk",
    orContinue: "Atau lanjutkan dengan",
    googleSignIn: "Masuk dengan Google",
    noAccount: "Belum punya akun?",
    register: "Daftar",
    email: "Email",
    password: "Password",
  },
  en: {
    brandSubtitle: "Al-Umanaa Cooperative — Sign in to continue",
    title: "Sign in",
    subtitle: "Use your cooperative account to continue.",
    forgotPassword: "Forgot password?",
    signInBtn: "Sign in",
    orContinue: "Or continue with",
    googleSignIn: "Sign in with Google",
    noAccount: "Don't have an account?",
    register: "Register",
    email: "Email",
    password: "Password",
  }
} as const;

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // const turnstileRef = useRef<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Bypass Turnstile check for testing
    /*
    if (!turnstileToken) {
      setError(
        lang === "id"
          ? "Silakan verifikasi bahwa Anda manusia melalui Cloudflare Turnstile."
          : "Please verify that you are human via Cloudflare Turnstile."
      );
      return;
    }
    */

    setSubmitting(true);
    try {
      await signIn(email, password);
      
      const loggedUser = auth.currentUser;
      let role = "pelanggan";
      
      if (loggedUser) {
        // Fetch user profile from Firestore to check their role before redirecting
        const userDocRef = doc(db, "users", loggedUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          role = userDocSnap.data().role || "pelanggan";
        }
      }

      const state = location.state as {
        from?: {
          pathname: string;
        };
        selectedQty?: unknown;
      } | null;
      let origin = state?.from?.pathname || "/";
      
      // If a customer (pelanggan) tries to access any admin area, redirect them to storefront homepage instead
      if (role === "pelanggan" && origin.startsWith("/admin")) {
        origin = "/";
      }

      const preservedQty = state?.selectedQty;
      navigate(origin, {
        replace: true,
        state: { selectedQty: preservedQty }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      // Reset Turnstile on authentication error
      // turnstileRef.current?.reset();
      // setTurnstileToken(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">

      {/* ── Video Background ────────────────────────────────────────────── */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src="https://www.alumanaa.com/wp-content/uploads/2020/03/Hero-Video-Compressed.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />

      {/* ── Dark amber overlay ───────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#111827]/80 via-[#1c1005]/70 to-[#78350F]/60" />

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-[#111827]/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.6)]">
          
          {/* Brand Logo & Text unified inside the card */}
          <div className="text-center mb-6">
            <img
              src="/logo.png"
              alt="Pondok Pesantren Modern Al Umanaa"
              className="h-20 mx-auto object-contain drop-shadow-md"
            />
            <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-amber-200/90 font-bold mt-2">
              {t.brandSubtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border-t border-white/10 pt-4">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-white">
                {t.title}
              </h2>
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-300 mt-1">
                {t.subtitle}
              </p>
            </div>

            <Input
              label={t.email}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail className="h-4 w-4" />}
              placeholder="you@al-umana.id"
              containerClassName="[&>label]:!text-neutral-200 [&>label]:!font-semibold"
            />

            <div>
              <Input
                label={t.password}
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
                    className="focus:outline-none text-[#6B7280] hover:text-[#374151]"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <div className="flex justify-end mt-1.5">
                <Link
                  to="/forgot-password"
                  className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-amber-300 hover:text-amber-400 font-bold hover:underline"
                >
                  {t.forgotPassword}
                </Link>
              </div>
            </div>

            {/* Turnstile Bypassed for testing
            <div className="flex justify-center py-2">
              <Turnstile
                ref={turnstileRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                options={{
                  theme: "dark",
                }}
              />
            </div>
            */}

            {error && (
              <p
                role="alert"
                className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#EF4444]"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="w-full"
            >
              {t.signInBtn}
            </Button>


          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
