import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { ProductionPage } from "@/pages/ProductionPage";
import { QCReviewPage } from "@/pages/QCReviewPage";
import { DispatchPage } from "@/pages/DispatchPage";
import { DeliveryPage } from "@/pages/DeliveryPage";
import { TrackingPage } from "@/pages/TrackingPage";
import { SettingsPage } from "@/pages/SettingsPage";

interface ProtectedProps {
  children: ReactNode;
}

function Protected({ children }: ProtectedProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
          Loading…
        </p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

function ShelledRoute({
  pageTitle,
  children,
}: {
  pageTitle: string;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  return (
    <AppShell
      pageTitle={pageTitle}
      userName={user?.displayName ?? undefined}
      userEmail={user?.email ?? undefined}
      onSignOut={() => signOut()}
    >
      {children}
    </AppShell>
  );
}

function RoutesTree() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={<Navigate to="/dashboard" replace />}
      />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <ShelledRoute pageTitle="Dashboard">
              <DashboardPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/orders"
        element={
          <Protected>
            <ShelledRoute pageTitle="Orders">
              <OrdersPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/production"
        element={
          <Protected>
            <ShelledRoute pageTitle="Production">
              <ProductionPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/qc"
        element={
          <Protected>
            <ShelledRoute pageTitle="Quality Control">
              <QCReviewPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/dispatch"
        element={
          <Protected>
            <ShelledRoute pageTitle="Dispatch">
              <DispatchPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/delivery"
        element={
          <Protected>
            <ShelledRoute pageTitle="Delivery">
              <DeliveryPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/tracking"
        element={
          <Protected>
            <ShelledRoute pageTitle="Tracking">
              <TrackingPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <ShelledRoute pageTitle="Settings">
              <SettingsPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoutesTree />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default AppRouter;
