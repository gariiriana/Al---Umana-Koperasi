import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();

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
      setSuccess("Password reset link has been sent to your email.");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
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
            Order Fulfillment & Delivery Tracking
          </p>
        </div>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-[#111827]">
                Reset Password
              </h2>
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280] mt-1">
                Enter your email address and we'll send you a link to reset your password.
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
              placeholder="you@al-umana.id"
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
              Reset Password
            </Button>

            <div className="text-center mt-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280] hover:text-[#111827]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
