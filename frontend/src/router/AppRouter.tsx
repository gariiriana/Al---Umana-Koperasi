import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense, type ReactNode, useState, useEffect } from "react";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { AdminAccessDenied } from "@/components/layout/AdminAccessDenied";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { OfflineScreen } from "@/components/ui/OfflineScreen";
import {
  ROLE_DEFAULT_REDIRECT,
} from "@/constants/roles";
import { StorefrontLayout } from "@/storefront/layouts/StorefrontLayout";
import { HomePage } from "@/storefront/pages/HomePage";
import { subscribeNotifications } from "@/services/notificationService";

const LoginPage = lazy(() => import("@/pages/LoginPage").then(module => ({ default: module.LoginPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage").then(module => ({ default: module.ForgotPasswordPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then(module => ({ default: module.DashboardPage })));
const OrdersPage = lazy(() => import("@/pages/OrdersPage").then(module => ({ default: module.OrdersPage })));
const ProductionPage = lazy(() => import("@/pages/ProductionPage").then(module => ({ default: module.ProductionPage })));
const ProductionHistoryPage = lazy(() => import("@/pages/ProductionHistoryPage").then(module => ({ default: module.ProductionHistoryPage })));
const HandoverPage = lazy(() => import("@/pages/HandoverPage").then(module => ({ default: module.HandoverPage })));
const DeliveryPage = lazy(() => import("@/pages/DeliveryPage").then(module => ({ default: module.DeliveryPage })));
const TrackingPage = lazy(() => import("@/pages/TrackingPage").then(module => ({ default: module.TrackingPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then(module => ({ default: module.SettingsPage })));
const ProductsPage = lazy(() => import("@/admin/pages/ProductsPage").then(module => ({ default: module.ProductsPage })));
const ProductFormPage = lazy(() => import("@/admin/pages/ProductFormPage").then(module => ({ default: module.ProductFormPage })));
const OrderInputPage = lazy(() => import("@/admin/pages/OrderInputPage").then(module => ({ default: module.OrderInputPage })));
const CategoriesPage = lazy(() => import("@/admin/pages/CategoriesPage").then(module => ({ default: module.CategoriesPage })));
const InvoicesPage = lazy(() => import("@/admin/pages/InvoicesPage").then(module => ({ default: module.InvoicesPage })));
const FoodSchedulePage = lazy(() => import("@/admin/pages/FoodSchedulePage").then(module => ({ default: module.FoodSchedulePage })));
const DeliverySchedulerPage = lazy(() => import("@/pages/DeliverySchedulerPage").then(module => ({ default: module.DeliverySchedulerPage })));
const InvoicePage = lazy(() => import("@/pages/InvoicePage").then(module => ({ default: module.InvoicePage })));
const ProductDetailPage = lazy(() => import("@/storefront/pages/ProductDetailPage").then(module => ({ default: module.ProductDetailPage })));
const HelpCenterPage = lazy(() => import("@/storefront/pages/HelpCenterPage").then(module => ({ default: module.HelpCenterPage })));
const CategoryPage = lazy(() => import("@/storefront/pages/CategoryPage").then(module => ({ default: module.CategoryPage })));
const CartPage = lazy(() => import("@/storefront/pages/CartPage").then(module => ({ default: module.CartPage })));
const CheckoutWizard = lazy(() => import("@/storefront/pages/checkout/CheckoutWizard").then(module => ({ default: module.CheckoutWizard })));
const OrderConfirmationPage = lazy(() => import("@/storefront/pages/checkout/OrderConfirmationPage").then(module => ({ default: module.OrderConfirmationPage })));
const NotificationsPage = lazy(() => import("@/storefront/pages/NotificationsPage").then(module => ({ default: module.NotificationsPage })));
const ProfilePage = lazy(() => import("@/storefront/pages/ProfilePage").then(module => ({ default: module.ProfilePage })));
const TestimoniPage = lazy(() => import("@/storefront/pages/TestimoniPage").then(module => ({ default: module.TestimoniPage })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then(module => ({ default: module.NotFoundPage })));
const PromosPage = lazy(() => import("@/admin/pages/PromosPage").then(module => ({ default: module.PromosPage })));
const SchedulesPage = lazy(() => import("@/pages/SchedulesPage").then(module => ({ default: module.SchedulesPage })));

import {
  CategoryIndexStub,
  PaymentProofUploadPageStub,
} from "@/storefront/pages/stubs";

interface ProtectedProps {
  children: ReactNode;
}

function Protected({ children }: ProtectedProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <LoadingScreen message="Memuat data..." />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: ProtectedProps) {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return <LoadingScreen message="Memuat data..." />;
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
    return <LoadingScreen message="Memuat..." />;
  }
  if (profile && ROLE_DEFAULT_REDIRECT[profile.role] && ROLE_DEFAULT_REDIRECT[profile.role] !== "/") {
    return (
      <Navigate
        to={ROLE_DEFAULT_REDIRECT[profile.role]}
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
    return <LoadingScreen message="Memuat profil..." />;
  }

  // Redirect to respective default landing page if role is not allowed
  if (profile && profile.role !== "admin" && !allowedRoles.includes(profile.role)) {
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

  if (profile.role === "admin") {
    // If the page is originally designed to allow the admin role, render inside StorefrontLayout
    if (allowedRoles.includes("admin")) {
      return (
        <StorefrontLayout>
          {children}
        </StorefrontLayout>
      );
    }
    // Otherwise, render it inside the AppShell so the admin gets the sidebars and headers for the role
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

export function StorefrontProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: readonly string[];
  children: ReactNode;
}) {
  const { profile } = useAuth();

  if (!profile) {
    return <LoadingScreen message="Memuat profil..." />;
  }

  if (profile.role !== "admin" && !allowedRoles.includes(profile.role)) {
    const isAdminOnlyRoute =
      allowedRoles.length === 1 && allowedRoles[0] === "admin";
    if (isAdminOnlyRoute) {
      return <AdminAccessDenied />;
    }

    const target = ROLE_DEFAULT_REDIRECT[profile.role] ?? "/";
    return <Navigate to={target} replace />;
  }

  return <StorefrontLayout>{children}</StorefrontLayout>;
}

function NotificationsRouteWrapper() {
  const { user, profile, loading, requestSignOut } = useAuth();

  if (loading) {
    return <LoadingScreen message="Memuat profil..." />;
  }

  // If user is logged in and is an operational user (non-admin), wrap in AppShell.
  if (user && profile && profile.role !== "admin") {
    return (
      <AppShell
        pageTitle="Notifikasi"
        userName={profile?.displayName ?? user?.displayName ?? undefined}
        userEmail={user?.email ?? undefined}
        userRole={profile?.role}
        userPhotoUrl={profile?.photoURL ?? user?.photoURL ?? undefined}
        onSignOut={requestSignOut}
      >
        <NotificationsPage />
      </AppShell>
    );
  }

  // Otherwise (guest, admin, customer), wrap in Storefront layout.
  return (
    <StorefrontLayout>
      <NotificationsPage />
    </StorefrontLayout>
  );
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
        element={<Navigate to="/login" replace />}
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
            <PaymentProofUploadPageStub />
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
        path="/notifications"
        element={
          <NotificationsRouteWrapper />
        }
      />
      <Route
        path="/profile"
        element={
          <Storefront>
            <ProfilePage />
          </Storefront>
        }
      />
      <Route
        path="/testimoni"
        element={
          <Storefront>
            <TestimoniPage />
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
            <ShelledRoute pageTitle="Input Pesanan Baru" allowedRoles={["admin"]}>
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
        path="/admin/promos"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Promo & Diskon"
              allowedRoles={["admin"]}
            >
              <PromosPage />
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
        path="/admin/production/history"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Riwayat Produksi & QC"
              allowedRoles={["tim_produksi"]}
            >
              <ProductionHistoryPage />
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
        path="/distribusi/handover"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Handover"
              allowedRoles={["distribusi"]}
            >
              <HandoverPage />
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
        path="/distribusi/schedules"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Jadwal Distribusi"
              allowedRoles={["admin", "monitoring", "tim_produksi", "kurir"]}
            >
              <SchedulesPage />
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
              allowedRoles={[]}
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
        element={<Navigate to="/distribusi/handover" replace />}
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

      <Route path="*" element={<NotFoundPage />} />
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

function BrowserNotificationListener() {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!user) return;

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }

    const subscriptionStartTime = Date.now();

    const unsubscribe = subscribeNotifications(
      user.uid,
      profile?.role,
      (notifications) => {
        const newUnread = notifications.filter(
          (n) => !n.read && Date.parse(n.createdAt) > subscriptionStartTime
        );

        if (newUnread.length > 0 && typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "granted") {
            newUnread.forEach((n) => {
              const sessionKey = `browser-notif-shown-${n.id}`;
              if (!sessionStorage.getItem(sessionKey)) {
                sessionStorage.setItem(sessionKey, "true");
                new window.Notification(n.title, {
                  body: n.message,
                  icon: "/logo.png",
                });
              }
            });
          }
        }
      },
      (err) => console.error("Global notification listener error:", err)
    );

    return () => unsubscribe();
  }, [user, profile?.role]);

  return null;
}

export function AppRouter() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOnline) {
    return <OfflineScreen />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <BrowserNotificationListener />
        <Suspense fallback={<LoadingScreen message="Memuat halaman..." />}>
          <RoutesTree />
        </Suspense>
        <GlobalSignOutModal />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default AppRouter;
