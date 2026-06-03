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
import { AdminAccessDenied } from "@/components/layout/AdminAccessDenied";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { LoginPage } from "@/pages/LoginPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { ProductionPage } from "@/pages/ProductionPage";
import { QCReviewPage } from "@/pages/QCReviewPage";
import { DispatchPage } from "@/pages/DispatchPage";
import { DeliveryPage } from "@/pages/DeliveryPage";
import { TrackingPage } from "@/pages/TrackingPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ProductsPage } from "@/admin/pages/ProductsPage";
import { ProductFormPage } from "@/admin/pages/ProductFormPage";
import { CategoriesPage } from "@/admin/pages/CategoriesPage";
import { OrderInputPage } from "@/admin/pages/OrderInputPage";
import { InvoicesPage } from "@/admin/pages/InvoicesPage";
import { FoodSchedulePage } from "@/admin/pages/FoodSchedulePage";
import { DeliverySchedulerPage } from "@/pages/DeliverySchedulerPage";
import { InvoicePage } from "@/pages/InvoicePage";
import {
  ADMIN_SHELL_ROLES,
  ROLE_DEFAULT_REDIRECT,
} from "@/constants/roles";
import { StorefrontLayout } from "@/storefront/layouts/StorefrontLayout";
import { HomePage } from "@/storefront/pages/HomePage";
import { ProductDetailPage } from "@/storefront/pages/ProductDetailPage";
import { HelpCenterPage } from "@/storefront/pages/HelpCenterPage";
import { CategoryPage } from "@/storefront/pages/CategoryPage";
import {
  CategoryIndexStub,
} from "@/storefront/pages/stubs";

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
  const { user, profile, loading } = useAuth();
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
    const target = profile ? ROLE_DEFAULT_REDIRECT[profile.role] ?? "/" : "/";
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}

/**
 * Renders the root route (`/`). Authenticated admin-shell roles get
 * redirected to their dashboard; everyone else (including unauthenticated
 * visitors and customers) sees the storefront homepage.
 */
function RootRoute() {
  const { profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
          Loading…
        </p>
      </div>
    );
  }
  if (
    profile &&
    (ADMIN_SHELL_ROLES as readonly string[]).includes(profile.role)
  ) {
    return (
      <Navigate
        to={ROLE_DEFAULT_REDIRECT[profile.role] ?? "/admin/dashboard"}
        replace
      />
    );
  }
  return (
    <StorefrontLayout>
      <HomePage />
    </StorefrontLayout>
  );
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
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
          Loading profile…
        </p>
      </div>
    );
  }

  // Redirect to respective default landing page if role is not allowed
  if (profile && !allowedRoles.includes(profile.role)) {
    // Admin-only routes (those that allow ONLY the admin role) show the
    // "Akses Ditolak" screen for non-admins and redirect to the storefront
    // homepage within 3 seconds (Requirements 16.3, 16.5).
    const isAdminOnlyRoute =
      allowedRoles.length === 1 && allowedRoles[0] === "admin";
    if (isAdminOnlyRoute) {
      return <AdminAccessDenied />;
    }

    const target = ROLE_DEFAULT_REDIRECT[profile.role] ?? "/admin/dashboard";
    return <Navigate to={target} replace />;
  }

  return (
    <AppShell
      pageTitle={pageTitle}
      userName={profile?.displayName ?? user?.displayName ?? undefined}
      userEmail={user?.email ?? undefined}
      userRole={profile?.role}
      userPhotoUrl={profile?.photoURL ?? user?.photoURL ?? undefined}
      onSignOut={requestSignOut}
    >
      {children}
    </AppShell>
  );
}

/**
 * Wraps a storefront page with the {@link StorefrontLayout}. The layout
 * does NOT enforce authentication so unauthenticated visitors can browse
 * the catalog. Auth-required pages will be guarded individually in task
 * 12.1 once the StorefrontProtected wrapper is introduced.
 */
function Storefront({ children }: { children: ReactNode }) {
  return <StorefrontLayout>{children}</StorefrontLayout>;
}

function RoutesTree() {
  return (
    <Routes>
      {/* Auth pages */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
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

      {/* Public Invoice Page (No authentication required) */}
      <Route path="/invoice/:token" element={<InvoicePage />} />

      {/* Storefront (public catalog browsing only) */}
      <Route path="/" element={<RootRoute />} />
      <Route
        path="/category"
        element={
          <Storefront>
            <CategoryIndexStub />
          </Storefront>
        }
      />
      <Route
        path="/category/:name"
        element={
          <Storefront>
            <CategoryPage />
          </Storefront>
        }
      />
      <Route
        path="/product/:id"
        element={
          <Storefront>
            <ProductDetailPage />
          </Storefront>
        }
      />
      <Route
        path="/help"
        element={
          <Storefront>
            <HelpCenterPage />
          </Storefront>
        }
      />

      {/* Admin shell routes */}
      <Route
        path="/admin/dashboard"
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
        path="/admin/orders"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Orders"
              allowedRoles={["admin", "monitoring"]}
            >
              <OrdersPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/orders/new"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Input Pesanan Baru"
              allowedRoles={["admin"]}
            >
              <OrderInputPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/invoices"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Daftar Invoice"
              allowedRoles={["admin"]}
            >
              <InvoicesPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/production"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Production"
              allowedRoles={["tim_produksi"]}
            >
              <ProductionPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/qc"
        element={
          <Protected>
            <ShelledRoute pageTitle="Quality Control" allowedRoles={["tim_produksi"]}>
              <QCReviewPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/food-schedule"
        element={
          <Protected>
            <ShelledRoute pageTitle="Jadwal Makanan" allowedRoles={["tim_produksi"]}>
              <FoodSchedulePage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/distribusi/dispatch"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Dispatch"
              allowedRoles={["distribusi"]}
            >
              <DispatchPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/distribusi/scheduler"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Delivery Scheduler"
              allowedRoles={["distribusi"]}
            >
              <DeliverySchedulerPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/distribusi/delivery"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Delivery"
              allowedRoles={["kurir"]}
            >
              <DeliveryPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/tracking"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Tracking"
              allowedRoles={["admin", "monitoring"]}
            >
              <TrackingPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Settings"
              allowedRoles={[
                "admin",
                "monitoring",
                "tim_produksi",
                "distribusi",
                "kurir",
              ]}
            >
              <SettingsPage />
            </ShelledRoute>
          </Protected>
        }
      />

      {/* Tim Produksi menu CRUD management */}
      <Route
        path="/admin/products"
        element={
          <Protected>
            <ShelledRoute pageTitle="Daftar Produk" allowedRoles={["tim_produksi"]}>
              <ProductsPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/products/new"
        element={
          <Protected>
            <ShelledRoute pageTitle="Tambah Produk" allowedRoles={["tim_produksi"]}>
              <ProductFormPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/products/:id/edit"
        element={
          <Protected>
            <ShelledRoute pageTitle="Ubah Produk" allowedRoles={["tim_produksi"]}>
              <ProductFormPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/categories"
        element={
          <Protected>
            <ShelledRoute pageTitle="Kategori" allowedRoles={["tim_produksi"]}>
              <CategoriesPage />
            </ShelledRoute>
          </Protected>
        }
      />

      {/* Legacy redirects */}
      <Route
        path="/dashboard"
        element={<Navigate to="/admin/dashboard" replace />}
      />
      <Route
        path="/production"
        element={<Navigate to="/admin/production" replace />}
      />
      <Route path="/qc" element={<Navigate to="/admin/qc" replace />} />
      <Route
        path="/dispatch"
        element={<Navigate to="/distribusi/dispatch" replace />}
      />
      <Route
        path="/delivery"
        element={<Navigate to="/distribusi/delivery" replace />}
      />
      <Route
        path="/tracking"
        element={<Navigate to="/admin/tracking" replace />}
      />
      <Route
        path="/settings"
        element={<Navigate to="/admin/settings" replace />}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
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
