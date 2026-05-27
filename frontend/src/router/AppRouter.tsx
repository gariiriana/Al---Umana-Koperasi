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
import { ProductsPage } from "@/admin/pages/ProductsPage";
import { ProductFormPage } from "@/admin/pages/ProductFormPage";
import { CategoriesPage } from "@/admin/pages/CategoriesPage";
import { PaymentApprovalPage } from "@/admin/pages/PaymentApprovalPage";
import {
  ADMIN_SHELL_ROLES,
  ROLE_DEFAULT_REDIRECT,
} from "@/constants/roles";
import { StorefrontLayout } from "@/storefront/layouts/StorefrontLayout";
import { HomePage } from "@/storefront/pages/HomePage";
import { ProductDetailPage } from "@/storefront/pages/ProductDetailPage";
import { CartPage } from "@/storefront/pages/CartPage";
import { CheckoutWizard } from "@/storefront/pages/checkout/CheckoutWizard";
import { OrderConfirmationPage } from "@/storefront/pages/checkout/OrderConfirmationPage";
import { PaymentProofUploadPage } from "@/storefront/pages/checkout/PaymentProofUploadPage";
import { OrderListPage } from "@/storefront/pages/OrderListPage";
import { OrderDetailPage } from "@/storefront/pages/OrderDetailPage";
import { HelpCenterPage } from "@/storefront/pages/HelpCenterPage";
import { NotificationsPage } from "@/storefront/pages/NotificationsPage";
import {
  CategoryIndexStub,
  CategoryPageStub,
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
      userName={user?.displayName ?? undefined}
      userEmail={user?.email ?? undefined}
      userRole={profile?.role}
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

      {/* Storefront (public + customer) */}
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
            <CategoryPageStub />
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
        path="/cart"
        element={
          <Storefront>
            <CartPage />
          </Storefront>
        }
      />
      <Route
        path="/checkout/address"
        element={
          <Storefront>
            <CheckoutWizard />
          </Storefront>
        }
      />
      <Route
        path="/checkout/payment"
        element={
          <Storefront>
            <CheckoutWizard />
          </Storefront>
        }
      />
      <Route
        path="/checkout/payment-proof/:orderId"
        element={
          <Storefront>
            <PaymentProofUploadPage />
          </Storefront>
        }
      />
      <Route
        path="/checkout/confirmation"
        element={
          <Storefront>
            <OrderConfirmationPage />
          </Storefront>
        }
      />
      <Route
        path="/orders"
        element={
          <Storefront>
            <OrderListPage />
          </Storefront>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <Storefront>
            <OrderDetailPage />
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
      <Route
        path="/notifications"
        element={
          <Protected>
            <Storefront>
              <NotificationsPage />
            </Storefront>
          </Protected>
        }
      />

      {/* Admin shell routes (existing) */}
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
        path="/admin/production"
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
        path="/admin/qc"
        element={
          <Protected>
            <ShelledRoute pageTitle="Quality Control" allowedRoles={["admin"]}>
              <QCReviewPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/dispatch"
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
        path="/admin/delivery"
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
        path="/admin/tracking"
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
                "pelanggan",
              ]}
            >
              <SettingsPage />
            </ShelledRoute>
          </Protected>
        }
      />

      {/* Admin-only stock & payment management (task 11) */}
      <Route
        path="/admin/products"
        element={
          <Protected>
            <ShelledRoute pageTitle="Daftar Produk" allowedRoles={["admin"]}>
              <ProductsPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/products/new"
        element={
          <Protected>
            <ShelledRoute pageTitle="Tambah Produk" allowedRoles={["admin"]}>
              <ProductFormPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/products/:id/edit"
        element={
          <Protected>
            <ShelledRoute pageTitle="Ubah Produk" allowedRoles={["admin"]}>
              <ProductFormPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/categories"
        element={
          <Protected>
            <ShelledRoute pageTitle="Kategori" allowedRoles={["admin"]}>
              <CategoriesPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/payment-approvals"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Persetujuan Pembayaran"
              allowedRoles={["admin"]}
            >
              <PaymentApprovalPage />
            </ShelledRoute>
          </Protected>
        }
      />

      {/* Legacy redirects: keep the previous admin URLs pointing at the
          new /admin/* prefix so any bookmarked or hard-linked locations
          keep working after the rename. */}
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
        element={<Navigate to="/admin/dispatch" replace />}
      />
      <Route
        path="/delivery"
        element={<Navigate to="/admin/delivery" replace />}
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
