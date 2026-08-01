/**
 * Maps each Firestore-stored role to the list of admin-shell paths the
 * user is allowed to navigate to. Every path is prefixed with `/admin`
 * so the admin/AppShell area lives entirely under `/admin/*` and never
 * collides with the public Storefront routes (e.g. `/orders`,
 * `/category/:name`).
 */
export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  /**
   * Admin: mengelola pesanan, invoice, dan melihat dashboard.
   */
  admin: [
    "/admin/dashboard",
    "/admin/orders",
    "/admin/orders/new",
    "/admin/invoices",
    "/admin/promos",
    "/distribusi/schedules",
  ],

  /**
   * Tim Produksi: mengelola proses produksi, quality control, produk, kategori, dan jadwal makanan.
   */
  tim_produksi: [
    "/admin/production",
    "/admin/production/history",
    "/admin/products",
    "/admin/products/new",
    "/admin/categories",
    "/admin/food-schedule",
  ],

  /**
   * Distribusi: mengelola pengiriman, penugasan kurir, dan delivery scheduler.
   */
  distribusi: [
    "/distribusi/handover",
    "/distribusi/scheduler",
  ],

  kurir: [
    "/distribusi/delivery",
  ],

  monitoring: [
    "/admin/dashboard",
    "/admin/orders",
    "/distribusi/schedules",
  ],

  // ==========================================================================
  // MBG (Makan Bergizi Gratis) Roles
  // ==========================================================================

  /**
   * Administrasi MBG: Akses penuh ke seluruh fitur MBG.
   */
  admin_mbg: [
    "/mbg/admin",
    "/mbg/admin/batch/new",
    "/mbg/archive",
    "/mbg/production",
    "/mbg/cooking",
    "/mbg/reports",
    "/mbg/orders",
    "/mbg/purchasing",
    "/mbg/purchasing/recap",
    "/mbg/purchasing/archive",
    "/mbg/suppliers",
    "/mbg/distribution",
    "/mbg/delivery",
    "/mbg/sub-purchasing",
  ],

  /**
   * Tim Produksi MBG: Akses penuh ke seluruh fitur MBG.
   */
  produksi_mbg: [
    "/mbg/admin",
    "/mbg/admin/batch/new",
    "/mbg/archive",
    "/mbg/production",
    "/mbg/cooking",
    "/mbg/reports",
    "/mbg/orders",
    "/mbg/purchasing",
    "/mbg/purchasing/recap",
    "/mbg/purchasing/archive",
    "/mbg/suppliers",
    "/mbg/distribution",
    "/mbg/delivery",
    "/mbg/sub-purchasing",
  ],

  /**
   * Sub Akun Dokumentasi Memasak MBG: dokumentasi foto & status masak.
   */
  dokumentasi_produksiMBG: [
    "/mbg/cooking",
    "/mbg/orders",
  ],

  /**
   * Purchasing MBG: belanja bahan, kelola supplier, grouping pesanan, arsip purchasing.
   */
  purchasing_mbg: [
    "/mbg/purchasing",
    "/mbg/purchasing/recap",
    "/mbg/purchasing/archive",
    "/mbg/suppliers",
    "/mbg/orders",
  ],

  /**
   * Distribusi MBG: QC barang masuk, assign tugas kurir, serta akses & edit fitur kurir.
   */
  distribusi_mbg: [
    "/mbg/distribution",
    "/mbg/delivery",
    "/mbg/orders",
  ],

  /**
   * Kurir MBG: serah terima, antar makanan, bukti foto, export PDF.
   */
  kurir_mbg: [
    "/mbg/delivery",
    "/mbg/orders",
  ],

  /**
   * Sub Purchasing MBG: belanja bahan yang ditugaskan oleh Purchasing.
   */
  sub_purchasing_mbg: [
    "/mbg/sub-purchasing",
    "/mbg/orders",
  ],
};

/** Roles that land on the admin AppShell when authenticated. */
export const ADMIN_SHELL_ROLES = [
  "tim_produksi",
  "distribusi",
  "kurir",
  "admin_mbg",
  "produksi_mbg",
  "dokumentasi_produksiMBG",
  "purchasing_mbg",
  "distribusi_mbg",
  "kurir_mbg",
  "sub_purchasing_mbg",
] as const;

/**
 * Role-based default landing path used after sign-in and as a fallback when
 * a user navigates to a path their role is not allowed to view.
 */
export const ROLE_DEFAULT_REDIRECT: Record<string, string> = {
  admin: "/",
  monitoring: "/admin/dashboard",
  tim_produksi: "/admin/production",
  distribusi: "/distribusi/handover",
  kurir: "/distribusi/delivery",
  admin_mbg: "/mbg/admin",
  produksi_mbg: "/mbg/production",
  dokumentasi_produksiMBG: "/mbg/cooking",
  purchasing_mbg: "/mbg/purchasing",
  distribusi_mbg: "/mbg/distribution",
  kurir_mbg: "/mbg/delivery",
  sub_purchasing_mbg: "/mbg/sub-purchasing",
};
