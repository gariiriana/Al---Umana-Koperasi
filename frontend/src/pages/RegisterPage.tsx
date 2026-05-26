import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Lock, Mail, User, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";

export function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

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
      setError("Passwords do not match");
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
                Register
              </h2>
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280] mt-1">
                Create a new customer account.
              </p>
            </div>

            <Input
              label="Full Name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              leftIcon={<User className="h-4 w-4" />}
              placeholder="Your Full Name"
            />

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

            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              placeholder="Create password"
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
              label="Confirm Password"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              placeholder="Confirm password"
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
              Register
            </Button>

            <div className="text-center mt-4">
              <span className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280]">
                Already have an account?{" "}
                <Link to="/login" className="text-[#FBBF24] hover:underline font-medium">
                  Sign in
                </Link>
              </span>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default RegisterPage;
