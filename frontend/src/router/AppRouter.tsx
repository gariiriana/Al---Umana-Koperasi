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
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import {
  ROLE_DEFAULT_REDIRECT,
} from "@/constants/roles";
import { StorefrontLayout } from "@/storefront/layouts/StorefrontLayout";
import { HomePage } from "@/storefront/pages/HomePage";
import { subscribeNotifications } from "@/services/notificationService";
import { isPushActiveOnThisDevice, isStandalone } from "@/services/pushService";
import { useAbsensiAuthUser } from "@/absensi/authUser";
import { rootTarget } from "@/router/rootTarget";
import { PushNotificationCenter } from "@/components/notifications/PushNotificationCenter";

// Helper function to auto-retry and auto-reload on dynamic import chunk loading failures (e.g. after new deployments)
function safeLazy<T extends React.ComponentType<unknown>>(
  importFn: () => Promise<Record<string, unknown>>
) {
  return lazy(async () => {
    const pageHasBeenReloaded = sessionStorage.getItem('chunk_reload_' + window.location.pathname);
    try {
      const module = await importFn();
      sessionStorage.removeItem('chunk_reload_' + window.location.pathname);
      const component = (module.default || Object.values(module)[0]) as T;
      return { default: component };
    } catch (error) {
      if (!pageHasBeenReloaded) {
        sessionStorage.setItem('chunk_reload_' + window.location.pathname, 'true');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}

const LoginPage = safeLazy(() => import("@/pages/LoginPage").then(module => ({ default: module.LoginPage })));
const MasukPage = safeLazy(() => import("@/pages/MasukPage").then(module => ({ default: module.MasukPage })));
const AbsensiRoutes = safeLazy(() => import("@/absensi/AbsensiRoutes").then(module => ({ default: module.AbsensiRoutes })));
const ForgotPasswordPage = safeLazy(() => import("@/pages/ForgotPasswordPage").then(module => ({ default: module.ForgotPasswordPage })));
const DashboardPage = safeLazy(() => import("@/pages/DashboardPage").then(module => ({ default: module.DashboardPage })));
const OrdersPage = safeLazy(() => import("@/pages/OrdersPage").then(module => ({ default: module.OrdersPage })));
const ProductionPage = safeLazy(() => import("@/pages/ProductionPage").then(module => ({ default: module.ProductionPage })));
const ProductionHistoryPage = safeLazy(() => import("@/pages/ProductionHistoryPage").then(module => ({ default: module.ProductionHistoryPage })));
const HandoverPage = safeLazy(() => import("@/pages/HandoverPage").then(module => ({ default: module.HandoverPage })));
const DeliveryPage = safeLazy(() => import("@/pages/DeliveryPage").then(module => ({ default: module.DeliveryPage })));
const TrackingPage = safeLazy(() => import("@/pages/TrackingPage").then(module => ({ default: module.TrackingPage })));
const SettingsPage = safeLazy(() => import("@/pages/SettingsPage").then(module => ({ default: module.SettingsPage })));
const ProductsPage = safeLazy(() => import("@/admin/pages/ProductsPage").then(module => ({ default: module.ProductsPage })));
const ProductFormPage = safeLazy(() => import("@/admin/pages/ProductFormPage").then(module => ({ default: module.ProductFormPage })));
const OrderInputPage = safeLazy(() => import("@/admin/pages/OrderInputPage").then(module => ({ default: module.OrderInputPage })));
const CategoriesPage = safeLazy(() => import("@/admin/pages/CategoriesPage").then(module => ({ default: module.CategoriesPage })));
const InvoicesPage = safeLazy(() => import("@/admin/pages/InvoicesPage").then(module => ({ default: module.InvoicesPage })));
const FoodSchedulePage = safeLazy(() => import("@/admin/pages/FoodSchedulePage").then(module => ({ default: module.FoodSchedulePage })));
const DeliverySchedulerPage = safeLazy(() => import("@/pages/DeliverySchedulerPage").then(module => ({ default: module.DeliverySchedulerPage })));
const InvoicePage = safeLazy(() => import("@/pages/InvoicePage").then(module => ({ default: module.InvoicePage })));
const ProductDetailPage = safeLazy(() => import("@/storefront/pages/ProductDetailPage").then(module => ({ default: module.ProductDetailPage })));
const HelpCenterPage = safeLazy(() => import("@/storefront/pages/HelpCenterPage").then(module => ({ default: module.HelpCenterPage })));
const CategoryPage = safeLazy(() => import("@/storefront/pages/CategoryPage").then(module => ({ default: module.CategoryPage })));
const CartPage = safeLazy(() => import("@/storefront/pages/CartPage").then(module => ({ default: module.CartPage })));
const CheckoutWizard = safeLazy(() => import("@/storefront/pages/checkout/CheckoutWizard").then(module => ({ default: module.CheckoutWizard })));
const OrderConfirmationPage = safeLazy(() => import("@/storefront/pages/checkout/OrderConfirmationPage").then(module => ({ default: module.OrderConfirmationPage })));
const NotificationsPage = safeLazy(() => import("@/storefront/pages/NotificationsPage").then(module => ({ default: module.NotificationsPage })));
const ProfilePage = safeLazy(() => import("@/storefront/pages/ProfilePage").then(module => ({ default: module.ProfilePage })));
const TestimoniPage = safeLazy(() => import("@/storefront/pages/TestimoniPage").then(module => ({ default: module.TestimoniPage })));
const NotFoundPage = safeLazy(() => import("@/pages/NotFoundPage").then(module => ({ default: module.NotFoundPage })));
const PromosPage = safeLazy(() => import("@/admin/pages/PromosPage").then(module => ({ default: module.PromosPage })));
const SchedulesPage = safeLazy(() => import("@/pages/SchedulesPage").then(module => ({ default: module.SchedulesPage })));

// --- Katering Operational Pages ---
const MoJobDeskPage = safeLazy(() => import("@/pages/katering/MoJobDeskPage").then(module => ({ default: module.MoJobDeskPage })));
const OperationalJobDeskPage = safeLazy(() => import("@/pages/katering/OperationalJobDeskPage").then(module => ({ default: module.OperationalJobDeskPage })));
const CoMoReviewPage = safeLazy(() => import("@/pages/katering/CoMoReviewPage").then(module => ({ default: module.CoMoReviewPage })));

// --- MBG (Makan Bergizi Gratis) Pages ---
const MbgAdminPage = safeLazy(() => import("@/pages/mbg/MbgAdminPage").then(module => ({ default: module.MbgAdminPage })));
const MbgProductionPage = safeLazy(() => import("@/pages/mbg/MbgProductionPage").then(module => ({ default: module.MbgProductionPage })));
const MbgDistributionPage = safeLazy(() => import("@/pages/mbg/MbgDistributionPage").then(module => ({ default: module.MbgDistributionPage })));
const MbgDeliveryPage = safeLazy(() => import("@/pages/mbg/MbgDeliveryPage").then(module => ({ default: module.MbgDeliveryPage })));
const MbgArchivePage = safeLazy(() => import("@/pages/mbg/MbgArchivePage").then(module => ({ default: module.MbgArchivePage })));
const MbgPersiapanPage = safeLazy(() => import("@/pages/mbg/MbgPersiapanPage").then(module => ({ default: module.MbgPersiapanPage })));
const MbgLaporan2MingguPage = safeLazy(() => import("@/pages/mbg/MbgLaporan2MingguPage").then(module => ({ default: module.MbgLaporan2MingguPage })));
const TugasSayaPage = safeLazy(() => import("@/pages/kurir/TugasSayaPage").then(module => ({ default: module.TugasSayaPage })));
const ToksanInputHarianPage = safeLazy(() => import("@/toksan/pages/InputHarianPage").then(module => ({ default: module.InputHarianPage })));
const ToksanObralPage = safeLazy(() => import("@/toksan/pages/ObralPage").then(module => ({ default: module.ObralPage })));
const ToksanRekapPage = safeLazy(() => import("@/toksan/pages/RekapPage").then(module => ({ default: module.RekapPage })));
const ToksanTrafikPage = safeLazy(() => import("@/toksan/pages/TrafikPage").then(module => ({ default: module.TrafikPage })));
const ToksanProdukPage = safeLazy(() => import("@/toksan/pages/ProdukPage").then(module => ({ default: module.ProdukPage })));
// --- Modul Keuangan (Rilis 1, hanya role keuangan) ---
const KeuanganBerandaPage = safeLazy(() => import("@/keuangan/pages/BerandaPage").then(module => ({ default: module.BerandaPage })));
const KeuanganKasBankPage = safeLazy(() => import("@/keuangan/pages/KasBankPage").then(module => ({ default: module.KasBankPage })));
const KeuanganBkuPage = safeLazy(() => import("@/keuangan/pages/BkuPage").then(module => ({ default: module.BkuPage })));
const KeuanganDaftarAkunPage = safeLazy(() => import("@/keuangan/pages/DaftarAkunPage").then(module => ({ default: module.DaftarAkunPage })));
const KeuanganSaldoAwalPage = safeLazy(() => import("@/keuangan/pages/SaldoAwalPage").then(module => ({ default: module.SaldoAwalPage })));
const KeuanganJurnalUmumPage = safeLazy(() => import("@/keuangan/pages/JurnalUmumPage").then(module => ({ default: module.JurnalUmumPage })));
const KeuanganKontakPage = safeLazy(() => import("@/keuangan/pages/KontakPage").then(module => ({ default: module.KontakPage })));
const KeuanganDaftarLainnyaPage = safeLazy(() => import("@/keuangan/pages/DaftarLainnyaPage").then(module => ({ default: module.DaftarLainnyaPage })));
const KeuanganKunciTutupBukuPage = safeLazy(() => import("@/keuangan/pages/KunciTutupBukuPage").then(module => ({ default: module.KunciTutupBukuPage })));
const KeuanganPengaturanPage = safeLazy(() => import("@/keuangan/pages/PengaturanPage").then(module => ({ default: module.PengaturanPage })));
const KeuanganLaporanHubPage = safeLazy(() => import("@/keuangan/pages/LaporanHubPage").then(module => ({ default: module.LaporanHubPage })));
const KeuanganNeracaPage = safeLazy(() => import("@/keuangan/pages/ReportNeracaPage").then(module => ({ default: module.ReportNeracaPage })));
const KeuanganLabaRugiPage = safeLazy(() => import("@/keuangan/pages/ReportLabaRugiPage").then(module => ({ default: module.ReportLabaRugiPage })));
const KeuanganArusKasPage = safeLazy(() => import("@/keuangan/pages/ReportArusKasPage").then(module => ({ default: module.ReportArusKasPage })));
const KeuanganPerubahanModalPage = safeLazy(() => import("@/keuangan/pages/ReportPerubahanModalPage").then(module => ({ default: module.ReportPerubahanModalPage })));
const KeuanganBukuBesarPage = safeLazy(() => import("@/keuangan/pages/ReportBukuBesarPage").then(module => ({ default: module.ReportBukuBesarPage })));
const KeuanganJurnalPage = safeLazy(() => import("@/keuangan/pages/ReportJurnalPage").then(module => ({ default: module.ReportJurnalPage })));
const KeuanganNeracaSaldoPage = safeLazy(() => import("@/keuangan/pages/ReportNeracaSaldoPage").then(module => ({ default: module.ReportNeracaSaldoPage })));
const KeuanganRingkasanBisnisPage = safeLazy(() => import("@/keuangan/pages/ReportRingkasanBisnisPage").then(module => ({ default: module.ReportRingkasanBisnisPage })));
const KeuanganExtendedReportPage = safeLazy(() => import("@/keuangan/pages/ReportExtendedPage").then(module => ({ default: module.ReportExtendedPage })));
const KeuanganPenjualanPage = safeLazy(() => import("@/keuangan/pages/PenjualanPage").then(module => ({ default: module.PenjualanPage })));
const KeuanganPembelianPage = safeLazy(() => import("@/keuangan/pages/PembelianPage").then(module => ({ default: module.PembelianPage })));
const KeuanganBiayaPage = safeLazy(() => import("@/keuangan/pages/BiayaPage").then(module => ({ default: module.BiayaPage })));
const KeuanganProdukPage = safeLazy(() => import("@/keuangan/pages/ProdukPage").then(module => ({ default: module.ProdukPage })));
const KeuanganProduksiPage = safeLazy(() => import("@/keuangan/pages/ProduksiPage").then(module => ({ default: module.ProduksiPage })));
const KeuanganAsetPage = safeLazy(() => import("@/keuangan/pages/AsetPage").then(module => ({ default: module.AsetPage })));
const KeuanganRekonsiliasiPage = safeLazy(() => import("@/keuangan/pages/RekonsiliasiPage").then(module => ({ default: module.RekonsiliasiPage })));
const KeuanganAnggaranPage = safeLazy(() => import("@/keuangan/pages/AnggaranPage").then(module => ({ default: module.AnggaranPage })));
const KeuanganPublicDocPage = safeLazy(() => import("@/keuangan/pages/PublicDocumentPage").then(module => ({ default: module.PublicDocumentPage })));
const PerformancePage = safeLazy(() => import("@/pages/PerformancePage").then(module => ({ default: module.PerformancePage })));
const SuperAdminControlCenterPage = safeLazy(() => import("@/pages/SuperAdminControlCenterPage").then(module => ({ default: module.SuperAdminControlCenterPage })));
const UnitControlCenterPage = safeLazy(() => import("@/pages/SuperAdminControlCenterPage").then(module => ({ default: module.UnitControlCenterPage })));
const DeveloperControlCenterPage = safeLazy(() => import("@/pages/DeveloperControlCenterPage").then(module => ({ default: module.DeveloperControlCenterPage })));

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
 * visitors and customers) sees the storefront homepage. The installed PWA
 * also weighs the Absensi session and may open the /masuk door instead
 * (see rootTarget).
 */
function RootRoute() {
  const { profile, loading } = useAuth();
  const standalone = isStandalone();
  const absensi = useAbsensiAuthUser(standalone);
  if (loading || absensi.loading) {
    return <LoadingScreen message="Memuat..." />;
  }
  const target = rootTarget({
    standalone,
    kasmaRole: profile?.role ?? null,
    absensiSignedIn: absensi.user !== null,
  });
  if (target) {
    return <Navigate to={target} replace />;
  }
  return (
    <StorefrontLayout>
      <HomePage />
    </StorefrontLayout>
  );
}

/** Toksan: admin Toko Santri, plus super_admin/developer untuk mengecek. */
const TOKSAN_ROLES = ["toksan", "super_admin", "developer"];
/** Modul Keuangan: hanya role `keuangan` (tidak ada akses untuk super_admin/developer). */
const KEUANGAN_ROLES = ["keuangan"];

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
  if (!allowedRoles.includes(profile.role)) {
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

  if (!allowedRoles.includes(profile.role)) {
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
      {/* Pintu masuk: KASMA JOB atau Absensi */}
      <Route path="/masuk" element={<MasukPage />} />
      {/* Absensi punya sesi Firebase sendiri; tidak lewat Protected/AuthContext. */}
      <Route path="/absensi/*" element={<AbsensiRoutes />} />
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
      <Route path="/f/:token" element={<KeuanganPublicDocPage />} />

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
              allowedRoles={["admin", "monitoring", "mo_katering", "co_mo_katering"]}
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
        path="/admin/orders/:id/edit"
        element={
          <Protected>
            <ShelledRoute pageTitle="Edit Pesanan" allowedRoles={["admin"]}>
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
              allowedRoles={["tim_produksi", "produksi_1"]}
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
              allowedRoles={["tim_produksi", "produksi_1"]}
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
            <ShelledRoute pageTitle="Jadwal Makanan" allowedRoles={["tim_produksi", "produksi_1"]}>
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
              allowedRoles={[
                "distribusi",
                "distribusi_1",
                "tim_produksi",
                "produksi_1",
                "produksi_2",
                "admin",
                "monitoring",
              ]}
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
              allowedRoles={[
                "distribusi",
                "distribusi_1",
                "tim_produksi",
                "produksi_1",
                "produksi_2",
                "admin",
                "monitoring",
              ]}
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
              allowedRoles={["admin", "monitoring"]}
            >
              <SchedulesPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/kurir/tugas"
        element={
          <Protected>
            <ShelledRoute pageTitle="Tugas Saya" allowedRoles={["kurir", "kurir_mbg"]}>
              <TugasSayaPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/distribusi/delivery"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Antar Katering"
              allowedRoles={["kurir", "kurir_mbg"]}
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
                "produksi_1",
                "distribusi_1",
                "produksi_2",
                "distribusi_2",
                "mo_katering",
                "co_mo_katering",
                "produksi_mbg",
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
            <ShelledRoute pageTitle="Daftar Produk" allowedRoles={["tim_produksi", "produksi_1", "produksi_mbg", "admin_mbg"]}>
              <ProductsPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/products/new"
        element={
          <Protected>
            <ShelledRoute pageTitle="Tambah Produk" allowedRoles={["tim_produksi", "produksi_1", "produksi_mbg"]}>
              <ProductFormPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/products/:id/edit"
        element={
          <Protected>
            <ShelledRoute pageTitle="Ubah Produk" allowedRoles={["tim_produksi", "produksi_1", "produksi_mbg"]}>
              <ProductFormPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/admin/categories"
        element={
          <Protected>
            <ShelledRoute pageTitle="Kategori" allowedRoles={["tim_produksi", "produksi_1", "produksi_mbg"]}>
              <CategoriesPage />
            </ShelledRoute>
          </Protected>
        }
      />

      {/* ================================================================ */}
      {/* Katering Operational Routes                                     */}
      {/* ================================================================ */}
      <Route
        path="/katering/mo/jobdesk"
        element={
          <Protected>
            <ShelledRoute pageTitle="Manajemen Job Desk" allowedRoles={["mo_katering"]}>
              <MoJobDeskPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/katering/jobdesk"
        element={
          <Protected>
            <ShelledRoute
              pageTitle="Job Desk Teklap"
              allowedRoles={[
                "produksi_1",
                "distribusi_1",
                "produksi_2",
                "distribusi_2",
                "tim_produksi",
                "distribusi",
                "produksi_mbg",
                "distribusi_mbg",
                "MBG2",
                "mbg2",
                "produksi_mbg_2",
                "distribusi_mbg_2",
                "admin_mbg",
              ]}
            >
              <OperationalJobDeskPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/katering/co-mo/review"
        element={
          <Protected>
            <ShelledRoute pageTitle="Review Job Desk" allowedRoles={["co_mo_katering"]}>
              <CoMoReviewPage />
            </ShelledRoute>
          </Protected>
        }
      />

      {/* ================================================================ */}
      {/* MBG (Makan Bergizi Gratis) Routes                               */}
      {/* ================================================================ */}
      <Route path="/mbg/orders" element={<Navigate to="/mbg/admin" replace />} />
      <Route
        path="/mbg/admin"
        element={
          <Protected>
            <ShelledRoute pageTitle="Admin MBG" allowedRoles={["admin_mbg"]}>
              <MbgAdminPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/mbg/archive"
        element={
          <Protected>
            <ShelledRoute pageTitle="Arsip PM" allowedRoles={["admin_mbg", "produksi_mbg"]}>
              <MbgArchivePage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route path="/mbg/reports" element={<Navigate to="/mbg/admin" replace />} />
      <Route
        path="/mbg/production"
        element={
          <Protected>
            <ShelledRoute pageTitle="Produksi MBG" allowedRoles={["produksi_mbg", "dokumentasi_produksiMBG", "MBG2", "mbg2", "produksi_mbg_2"]}>
              <MbgProductionPage />
            </ShelledRoute>
          </Protected>
        }
      />
      {/* Masak MBG dihapus -> Redirect ke Distribusi MBG */}
      <Route path="/mbg/cooking" element={<Navigate to="/mbg/distribution" replace />} />
      {/* Streamlined Purchasing MBG Routes -> Redirect to Produksi MBG */}
      <Route path="/mbg/purchasing" element={<Navigate to="/mbg/production" replace />} />
      <Route path="/mbg/sub-purchasing" element={<Navigate to="/mbg/production" replace />} />
      <Route path="/mbg/purchasing/recap" element={<Navigate to="/mbg/production" replace />} />
      <Route path="/mbg/purchasing/archive" element={<Navigate to="/mbg/production" replace />} />
      <Route path="/mbg/suppliers" element={<Navigate to="/mbg/production" replace />} />
      <Route
        path="/mbg/distribution"
        element={
          <Protected>
            <ShelledRoute pageTitle="Distribusi MBG" allowedRoles={["distribusi_mbg_2", "admin_mbg"]}>
              <MbgDistributionPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/mbg/delivery"
        element={
          <Protected>
            <ShelledRoute pageTitle="Kurir MBG" allowedRoles={["kurir_mbg", "kurir", "distribusi_mbg_2", "admin_mbg"]}>
              <MbgDeliveryPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route
        path="/mbg/persiapan"
        element={
          <Protected>
            <ShelledRoute pageTitle="Persiapan" allowedRoles={["distribusi_mbg", "distribusi_mbg_2", "distribusi"]}>
              <MbgPersiapanPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route path="/mbg/checklist-bahan" element={<Navigate to="/mbg/persiapan" replace />} />
      <Route
        path="/mbg/laporan-2-minggu"
        element={
          <Protected>
            <ShelledRoute pageTitle="Laporan 2 Minggu" allowedRoles={["distribusi_mbg", "distribusi_mbg_2", "admin_mbg"]}>
              <MbgLaporan2MingguPage />
            </ShelledRoute>
          </Protected>
        }
      />
      <Route path="/performance" element={<Protected><ShelledRoute pageTitle="Performa Saya" allowedRoles={["admin", "monitoring", "tim_produksi", "distribusi", "produksi_1", "distribusi_1", "mo_katering", "co_mo_katering", "admin_mbg", "produksi_mbg", "dokumentasi_produksiMBG", "distribusi_mbg", "MBG2", "mbg2", "produksi_mbg_2", "distribusi_mbg_2", "kepala_unit", "tim_unit"]}><PerformancePage /></ShelledRoute></Protected>} />
      <Route path="/super-admin/control-center" element={<Protected><ShelledRoute pageTitle="SDM Performance Control Center" allowedRoles={["super_admin", "developer"]}><SuperAdminControlCenterPage /></ShelledRoute></Protected>} />
      {/* Toko Santri (Toksan) */}
      <Route path="/toksan/input" element={<Protected><ShelledRoute pageTitle="Input Harian" allowedRoles={TOKSAN_ROLES}><ToksanInputHarianPage /></ShelledRoute></Protected>} />
      <Route path="/toksan/obral" element={<Protected><ShelledRoute pageTitle="Obral" allowedRoles={TOKSAN_ROLES}><ToksanObralPage /></ShelledRoute></Protected>} />
      <Route path="/toksan/rekap" element={<Protected><ShelledRoute pageTitle="Rekap" allowedRoles={TOKSAN_ROLES}><ToksanRekapPage /></ShelledRoute></Protected>} />
      <Route path="/toksan/trafik" element={<Protected><ShelledRoute pageTitle="Trafik Produk" allowedRoles={TOKSAN_ROLES}><ToksanTrafikPage /></ShelledRoute></Protected>} />
      <Route path="/toksan/produk" element={<Protected><ShelledRoute pageTitle="Produk Toksan" allowedRoles={TOKSAN_ROLES}><ToksanProdukPage /></ShelledRoute></Protected>} />
      {/* Modul Keuangan (Hanya role keuangan) */}
      <Route path="/keuangan/beranda" element={<Protected><ShelledRoute pageTitle="Beranda Keuangan" allowedRoles={KEUANGAN_ROLES}><KeuanganBerandaPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/dasbor" element={<Protected><ShelledRoute pageTitle="Ringkasan Bisnis" allowedRoles={KEUANGAN_ROLES}><KeuanganRingkasanBisnisPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan" element={<Protected><ShelledRoute pageTitle="Laporan Keuangan" allowedRoles={KEUANGAN_ROLES}><KeuanganLaporanHubPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan/neraca" element={<Protected><ShelledRoute pageTitle="Neraca" allowedRoles={KEUANGAN_ROLES}><KeuanganNeracaPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan/laba-rugi" element={<Protected><ShelledRoute pageTitle="Laba Rugi" allowedRoles={KEUANGAN_ROLES}><KeuanganLabaRugiPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan/arus-kas" element={<Protected><ShelledRoute pageTitle="Arus Kas" allowedRoles={KEUANGAN_ROLES}><KeuanganArusKasPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan/perubahan-modal" element={<Protected><ShelledRoute pageTitle="Perubahan Modal" allowedRoles={KEUANGAN_ROLES}><KeuanganPerubahanModalPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan/buku-besar" element={<Protected><ShelledRoute pageTitle="Buku Besar" allowedRoles={KEUANGAN_ROLES}><KeuanganBukuBesarPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan/jurnal" element={<Protected><ShelledRoute pageTitle="Laporan Jurnal" allowedRoles={KEUANGAN_ROLES}><KeuanganJurnalPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan/neraca-saldo" element={<Protected><ShelledRoute pageTitle="Neraca Saldo" allowedRoles={KEUANGAN_ROLES}><KeuanganNeracaSaldoPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan/ringkasan-bisnis" element={<Protected><ShelledRoute pageTitle="Ringkasan Bisnis" allowedRoles={KEUANGAN_ROLES}><KeuanganRingkasanBisnisPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/laporan/detail/:slug" element={<Protected><ShelledRoute pageTitle="Laporan Keuangan" allowedRoles={KEUANGAN_ROLES}><KeuanganExtendedReportPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/kas-bank" element={<Protected><ShelledRoute pageTitle="Kas & Bank" allowedRoles={KEUANGAN_ROLES}><KeuanganKasBankPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/kas-bank/rekonsiliasi" element={<Protected><ShelledRoute pageTitle="Rekonsiliasi Bank" allowedRoles={KEUANGAN_ROLES}><KeuanganRekonsiliasiPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/kas-bank/:kode/bku" element={<Protected><ShelledRoute pageTitle="Buku Kas Umum" allowedRoles={KEUANGAN_ROLES}><KeuanganBkuPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/penjualan" element={<Protected><ShelledRoute pageTitle="Penjualan" allowedRoles={KEUANGAN_ROLES}><KeuanganPenjualanPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/pembelian" element={<Protected><ShelledRoute pageTitle="Pembelian" allowedRoles={KEUANGAN_ROLES}><KeuanganPembelianPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/biaya" element={<Protected><ShelledRoute pageTitle="Biaya" allowedRoles={KEUANGAN_ROLES}><KeuanganBiayaPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/kontak" element={<Protected><ShelledRoute pageTitle="Kontak" allowedRoles={KEUANGAN_ROLES}><KeuanganKontakPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/produk" element={<Protected><ShelledRoute pageTitle="Produk & Gudang" allowedRoles={KEUANGAN_ROLES}><KeuanganProdukPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/produksi" element={<Protected><ShelledRoute pageTitle="Produksi & Manufaktur" allowedRoles={KEUANGAN_ROLES}><KeuanganProduksiPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/aset" element={<Protected><ShelledRoute pageTitle="Aset Tetap" allowedRoles={KEUANGAN_ROLES}><KeuanganAsetPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/anggaran" element={<Protected><ShelledRoute pageTitle="Manajemen Anggaran" allowedRoles={KEUANGAN_ROLES}><KeuanganAnggaranPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/akun" element={<Protected><ShelledRoute pageTitle="Daftar Akun" allowedRoles={KEUANGAN_ROLES}><KeuanganDaftarAkunPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/akun/saldo-awal" element={<Protected><ShelledRoute pageTitle="Atur Saldo Awal" allowedRoles={KEUANGAN_ROLES}><KeuanganSaldoAwalPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/jurnal-umum" element={<Protected><ShelledRoute pageTitle="Jurnal Umum" allowedRoles={KEUANGAN_ROLES}><KeuanganJurnalUmumPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/daftar-lainnya" element={<Protected><ShelledRoute pageTitle="Daftar Lainnya" allowedRoles={KEUANGAN_ROLES}><KeuanganDaftarLainnyaPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/daftar-lainnya/tutup-buku" element={<Protected><ShelledRoute pageTitle="Kunci Periode & Tutup Buku" allowedRoles={KEUANGAN_ROLES}><KeuanganKunciTutupBukuPage /></ShelledRoute></Protected>} />
      <Route path="/keuangan/pengaturan" element={<Protected><ShelledRoute pageTitle="Pengaturan Keuangan" allowedRoles={KEUANGAN_ROLES}><KeuanganPengaturanPage /></ShelledRoute></Protected>} />
      <Route path="/unit/control-center" element={<Protected><ShelledRoute pageTitle="KPI & Task Unit" allowedRoles={["kepala_unit"]}><UnitControlCenterPage /></ShelledRoute></Protected>} />
      <Route path="/developer/control-center" element={<Protected><ShelledRoute pageTitle="Developer Control Center" allowedRoles={["developer"]}><DeveloperControlCenterPage /></ShelledRoute></Protected>} />

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

/**
 * Cadangan saat push belum aktif di perangkat ini: notifikasi baru yang masuk
 * selagi aplikasi terbuka ditampilkan lewat service worker. Izin diminta oleh
 * PushNotificationCenter (harus dari klik user, syarat Chrome & iOS).
 */
function BrowserNotificationListener() {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!user) return;

    const subscriptionStartTime = Date.now();

    const unsubscribe = subscribeNotifications(
      user.uid,
      profile?.role,
      (notifications) => {
        // Perangkat dengan push aktif sudah menerima notifikasi dari Worker.
        if (isPushActiveOnThisDevice()) return;
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        if (!("serviceWorker" in navigator)) return;

        const newUnread = notifications.filter(
          (n) => !n.read && Date.parse(n.createdAt) > subscriptionStartTime
        );
        newUnread.forEach((n) => {
          const sessionKey = `browser-notif-shown-${n.id}`;
          if (sessionStorage.getItem(sessionKey)) return;
          sessionStorage.setItem(sessionKey, "true");
          // `new Notification()` tidak didukung Chrome Android; lewat SW berfungsi di semua browser.
          navigator.serviceWorker.ready
            .then((registration) => registration.showNotification(n.title, {
              body: n.message,
              icon: "/icons/icon-192x192.png",
              badge: "/icons/badge-96x96.png",
              tag: n.id,
            }))
            .catch(() => { /* service worker belum aktif */ });
        });
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

  // Jangan pernah mengganti seluruh pohon aplikasi saat offline: itu membongkar
  // semua halaman dan menghapus isian form yang belum disubmit.
  return (
    <>
    {!isOnline && <OfflineBanner />}
    <BrowserRouter>
      <AuthProvider>
        <BrowserNotificationListener />
        <PushNotificationCenter />
        <Suspense fallback={<LoadingScreen message="Memuat halaman..." />}>
          <RoutesTree />
        </Suspense>
        <GlobalSignOutModal />
      </AuthProvider>
    </BrowserRouter>
    </>
  );
}

export default AppRouter;
