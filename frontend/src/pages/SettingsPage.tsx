import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { LogOut } from "lucide-react";

export function SettingsPage() {
  const { user, signOut } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Account & preferences." />
      <Card>
        <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827] mb-2">
          Account
        </h3>
        {user ? (
          <div className="space-y-1 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#374151]">
            <p>
              <span className="text-[#6B7280]">UID:</span> {user.uid}
            </p>
            <p>
              <span className="text-[#6B7280]">Email:</span>{" "}
              {user.email ?? "—"}
            </p>
            <p>
              <span className="text-[#6B7280]">Name:</span>{" "}
              {user.displayName ?? "—"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#6B7280]">Not signed in.</p>
        )}
        <div className="mt-4">
          <Button
            variant="outlined"
            leftIcon={<LogOut className="h-4 w-4" />}
            onClick={() => signOut()}
          >
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default SettingsPage;
