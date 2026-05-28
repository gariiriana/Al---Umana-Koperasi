import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

const DICTIONARY = {
  id: {
    brandSubtitle: "Penyelesaian Pesanan & Pelacakan Pengiriman",
    title: "Atur Ulang Kata Sandi",
    description: "Masukkan alamat email Anda dan kami akan mengirimkan tautan untuk mengatur ulang kata sandi Anda.",
    emailLabel: "Email",
    emailPlaceholder: "kamu@al-umana.id",
    resetBtn: "Atur Ulang Kata Sandi",
    backToSignIn: "Kembali ke halaman masuk",
    successMsg: "Tautan atur ulang kata sandi telah dikirim ke email Anda.",
    errorMsg: "Gagal mengirim email atur ulang kata sandi",
  },
  en: {
    brandSubtitle: "Order Fulfillment & Delivery Tracking",
    title: "Reset Password",
    description: "Enter your email address and we'll send you a link to reset your password.",
    emailLabel: "Email",
    emailPlaceholder: "you@al-umana.id",
    resetBtn: "Reset Password",
    backToSignIn: "Back to sign in",
    successMsg: "Password reset link has been sent to your email.",
    errorMsg: "Failed to send reset email",
  }
} as const;

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      await sendPasswordReset(email);
      setSuccess(t.successMsg);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="font-['Manrope',system-ui,sans-serif] text-3xl font-bold text-[#111827]">
            Al-<span className="text-[#FBBF24]">Umana</span>
          </h1>
          <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280] mt-1">
            {t.brandSubtitle}
          </p>
        </div>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-[#111827]">
                {t.title}
              </h2>
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280] mt-1">
                {t.description}
              </p>
            </div>

            <Input
              label={t.emailLabel}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail className="h-4 w-4" />}
              placeholder={t.emailPlaceholder}
            />

            {error && (
              <p
                role="alert"
                className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#EF4444]"
              >
                {error}
              </p>
            )}

            {success && (
              <p
                role="status"
                className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#10B981]"
              >
                {success}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="w-full"
            >
              {t.resetBtn}
            </Button>

            <div className="text-center mt-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] hover:text-[#111827]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t.backToSignIn}
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
