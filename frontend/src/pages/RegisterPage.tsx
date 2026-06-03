import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Lock, Mail, User, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { signUp } from "@/services/authService";

const DICTIONARY = {
  id: {
    brandSubtitle: "Koperasi Al-Umanaa — Buat akun baru",
    title: "Daftar",
    subtitle: "Buat akun pelanggan baru.",
    fullName: "Nama Lengkap",
    email: "Email",
    password: "Password",
    confirmPassword: "Konfirmasi Password",
    passwordMismatch: "Password tidak cocok",
    registerBtn: "Daftar",
    orContinue: "Atau lanjutkan dengan",
    googleRegister: "Daftar dengan Google",
    hasAccount: "Sudah punya akun?",
    signIn: "Masuk",
    placeholderName: "Nama Lengkap Anda",
    placeholderPassword: "Buat password",
    placeholderConfirm: "Konfirmasi password",
  },
  en: {
    brandSubtitle: "Al-Umanaa Cooperative — Create new account",
    title: "Register",
    subtitle: "Create a new customer account.",
    fullName: "Full Name",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm Password",
    passwordMismatch: "Passwords do not match",
    registerBtn: "Register",
    orContinue: "Or continue with",
    googleRegister: "Register with Google",
    hasAccount: "Already have an account?",
    signIn: "Sign in",
    placeholderName: "Your Full Name",
    placeholderPassword: "Create password",
    placeholderConfirm: "Confirm password",
  }
} as const;

export function RegisterPage() {
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }

    setSubmitting(true);
    try {
      await signUp(email, password, displayName);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Google sign-in failed");
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
              label={t.fullName}
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              leftIcon={<User className="h-4 w-4" />}
              placeholder={t.placeholderName}
              containerClassName="[&>label]:!text-neutral-200 [&>label]:!font-semibold"
            />

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

            <Input
              label={t.password}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              placeholder={t.placeholderPassword}
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

            <Input
              label={t.confirmPassword}
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              placeholder={t.placeholderConfirm}
              containerClassName="[&>label]:!text-neutral-200 [&>label]:!font-semibold"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="focus:outline-none text-[#6B7280] hover:text-[#374151]"
                  aria-label="Toggle password visibility"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

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
              {t.registerBtn}
            </Button>

            <div className="relative flex items-center my-4">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink mx-4 text-[10px] text-neutral-300 font-['Hanken_Grotesk'] font-bold uppercase tracking-wider">{t.orContinue}</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="w-full min-h-11 flex items-center justify-center gap-3 px-4 py-2.5 border border-[#D1D5DB] rounded-2xl bg-white hover:bg-[#F9FAFB] text-sm font-bold text-[#374151] transition-all cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:ring-offset-2 disabled:opacity-50"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.47c0,-0.61 -0.06,-1.2 -0.16,-1.73Z" fill="#4285F4" />
                <path d="M12,20.6c2.32,0 4.27,-0.77 5.7,-2.1l-3.3,-2.57c-0.91,0.61 -2.08,0.98 -3.3,0.98c-2.28,0 -4.21,-1.54 -4.9,-3.61H2.78v2.66c1.44,2.86 4.38,4.64 7.62,4.64Z" fill="#34A853" />
                <path d="M7.1,13.3c-0.18,-0.54 -0.28,-1.11 -0.28,-1.7c0,-0.59 0.1,-1.16 0.28,-1.7V7.24H2.78c-0.61,1.22 -0.96,2.6 -0.96,4.06c0,1.46 0.35,2.84 0.96,4.06l4.32,-3.36Z" fill="#FBBC05" />
                <path d="M12,6.22c1.26,0 2.39,0.43 3.28,1.28l2.46,-2.46C16.26,3.64 14.31,2.9 12,2.9C8.76,2.9 5.82,4.68 4.38,7.54l4.32,3.36c0.69,-2.07 2.62,-3.61 4.9,-3.61Z" fill="#EA4335" />
              </svg>
              <span>{t.googleRegister}</span>
            </button>

            <div className="text-center mt-4">
              <span className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-neutral-300">
                {t.hasAccount}{" "}
                <Link to="/login" className="text-amber-300 hover:text-amber-400 font-bold hover:underline">
                  {t.signIn}
                </Link>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
