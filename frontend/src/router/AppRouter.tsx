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
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
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

function PublicRoute({ children }: ProtectedProps) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
          Loading…
        </p>
      </div>
    );
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function ShelledRoute({
  pageTitle,
  allowedRoles,
  children,
}: {
  pageTitle: string;
  allowedRoles: readonly string[];
  children: ReactNode;
}) {
  const { user, profile, requestSignOut } = useAuth();

  // If auth is resolved but profile is not loaded yet, wait or return loading
  if (user && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
          Loading profile…
        </p>
      </div>
    );
  }

  // Redirect to respective default dashboard/landing page if role is not allowed
  if (profile && !allowedRoles.includes(profile.role)) {
    const defaultRedirects: Record<string, string> = {
      tim_produksi: "/production",
      distribusi: "/dispatch",
      pelanggan: "/orders",
      admin: "/dashboard",
      monitoring: "/dashboard",
    };
    const target = defaultRedirects[profile.role] || "/dashboard";
    return <Navigate to={target} replace />;
  }

  return (
    <AppShell
      pageTitle={pageTitle}
      userName={user?.displayName ?? undefined}
      userEmail={user?.email ?? undefined}
      userRole={profile?.role}
      onSignOut={requestSignOut}
    >
      {children}
    </AppShell>
  );
}

function RoutesTree() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={<Navigate to="/dashboard" replace />}
      />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Dashboard"
              allowedRoles={["admin", "monitoring"]}
            >
              <DashboardPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/orders"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Orders"
              allowedRoles={["admin", "monitoring", "pelanggan"]}
            >
              <OrdersPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/production"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Production"
              allowedRoles={["admin", "tim_produksi"]}
            >
              <ProductionPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/qc"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Quality Control"
              allowedRoles={["admin"]}
            >
              <QCReviewPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/dispatch"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Dispatch"
              allowedRoles={["admin", "distribusi"]}
            >
              <DispatchPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/delivery"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Delivery"
              allowedRoles={["admin", "distribusi"]}
            >
              <DeliveryPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/tracking"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Tracking"
              allowedRoles={["admin", "monitoring", "distribusi"]}
            >
              <TrackingPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Settings"
              allowedRoles={["admin", "monitoring", "tim_produksi", "distribusi", "pelanggan"]}
            >
              <SettingsPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function GlobalSignOutModal() {
  const { isSignOutConfirmOpen, cancelSignOut, confirmSignOut } = useAuth();
  return (
    <ConfirmModal
      isOpen={isSignOutConfirmOpen}
      onClose={cancelSignOut}
      onConfirm={confirmSignOut}
      title="Konfirmasi Keluar"
      message="Apakah Anda yakin ingin keluar dari akun Anda?"
      confirmText="Keluar"
      cancelText="Batal"
    />
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoutesTree />
        <GlobalSignOutModal />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default AppRouter;
