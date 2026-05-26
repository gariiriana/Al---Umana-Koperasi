import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      const origin = (location.state as any)?.from?.pathname || "/";
      const preservedQty = (location.state as any)?.selectedQty;
      navigate(origin, {
        replace: true,
        state: { selectedQty: preservedQty }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
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
                Sign in
              </h2>
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280] mt-1">
                Use your koperasi account to continue.
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

            <div>
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="h-4 w-4" />}
                placeholder="••••••••"
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
              <div className="flex justify-end mt-1">
                <Link
                  to="/forgot-password"
                  className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#FBBF24] hover:underline font-medium"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

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
              Sign in
            </Button>

            <div className="text-center mt-4">
              <span className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280]">
                Don't have an account?{" "}
                <Link to="/register" className="text-[#FBBF24] hover:underline font-medium">
                  Register
                </Link>
              </span>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default LoginPage;
