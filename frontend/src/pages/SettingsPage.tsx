import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { LogOut } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const DICTIONARY = {
  id: {
    title: "Pengaturan",
    subtitle: "Akun & preferensi.",
    account: "Akun",
    notSignedIn: "Belum masuk.",
    signOut: "Keluar",
    name: "Nama",
  },
  en: {
    title: "Settings",
    subtitle: "Account & preferences.",
    account: "Account",
    notSignedIn: "Not signed in.",
    signOut: "Sign out",
    name: "Name",
  }
} as const;

export function SettingsPage() {
  const { user, requestSignOut } = useAuth();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <Card>
        <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827] mb-2">
          {t.account}
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
              <span className="text-[#6B7280]">{t.name}:</span>{" "}
              {user.displayName ?? "—"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#6B7280]">{t.notSignedIn}</p>
        )}
        <div className="mt-4">
          <Button
            variant="outlined"
            leftIcon={<LogOut className="h-4 w-4" />}
            onClick={requestSignOut}
          >
            {t.signOut}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default SettingsPage;
