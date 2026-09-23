/**
 * Maps each Firestore-stored role to the list of admin-shell paths the
 * user is allowed to navigate to. Every path is prefixed with `/admin`
 * so the admin/AppShell area lives entirely under `/admin/*` and never
 * collides with the public Storefront routes (e.g. `/orders`,
 * `/category/:name`).
 */
export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  super_admin: ["/super-admin/control-center", "/performance"],
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
   * Tim Produksi (legacy alias for produksi_1): mengelola proses produksi,
   * quality control, produk, kategori, dan jadwal makanan, serta melihat penugasan kurir (read-only).
   */
  tim_produksi: [
    "/admin/production",
    "/admin/production/history",
    "/admin/products",
    "/admin/products/new",
    "/admin/categories",
    "/admin/food-schedule",
    "/katering/jobdesk",
    "/distribusi/scheduler",
    "/distribusi/handover",
  ],

  /**
   * Distribusi (legacy alias for distribusi_1): mengelola pengiriman, penugasan kurir, dan delivery scheduler.
   */
  distribusi: [
    "/distribusi/handover",
    "/distribusi/scheduler",
    "/katering/jobdesk",
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
  // Katering Operational Roles (New)
  // ==========================================================================

  /**
   * Produksi 1 — Ust. Joko: Tim akun produksi katering.
   */
  produksi_1: [
    "/admin/production",
    "/admin/production/history",
    "/admin/products",
    "/admin/products/new",
    "/admin/categories",
    "/admin/food-schedule",
    "/katering/jobdesk",
    "/distribusi/scheduler",
    "/distribusi/handover",
  ],

  /**
   * Distribusi 1 — Dwi: Akun distribusi katering (= distribusi lama).
   */
  distribusi_1: [
    "/distribusi/handover",
    "/distribusi/scheduler",
    "/katering/jobdesk",
  ],

  /**
   * Produksi 2 — Shifa: Tim produksi baru.
   */
  produksi_2: [
    "/katering/jobdesk",
    "/distribusi/scheduler",
    "/distribusi/handover",
  ],

  /**
   * Distribusi 2 — Wandi: Tim distribusi baru.
   */
  distribusi_2: [
    "/katering/jobdesk",
  ],

  /**
   * Manager Operational (MO): Menerima pesanan dari admin, membuat &
   * mendistribusikan job desk ke role operasional.
   */
  mo_katering: [
    "/katering/mo/jobdesk",
    "/admin/orders",
  ],

  /**
   * Wakil Kepala Manager Operational (CO_MO): Mereview job desk yang
   * di-submit oleh role operasional, approve / reject.
   */
  co_mo_katering: [
    "/katering/co-mo/review",
    "/admin/orders",
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
    "/mbg/reports",
    "/mbg/orders",
    "/mbg/distribution",
    "/mbg/delivery",
  ],

  /**
   * Tim Produksi MBG: Akses penuh ke seluruh fitur MBG.
   */
  produksi_mbg: [
    "/mbg/admin",
    "/mbg/admin/batch/new",
    "/mbg/archive",
    "/mbg/production",
    "/mbg/reports",
    "/mbg/orders",
    "/mbg/distribution",
    "/mbg/delivery",
  ],

  /**
   * Sub Akun Dokumentasi Memasak MBG: dokumentasi foto & status masak.
   */
  dokumentasi_produksiMBG: [
    "/mbg/production",
    "/mbg/orders",
  ],

  /**
   * Purchasing MBG: Dialihkan ke Produksi MBG (Laporan Pembelian Harian Excel).
   */
  purchasing_mbg: [
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
   * Sub Purchasing MBG: Dialihkan ke Produksi MBG.
   */
  sub_purchasing_mbg: [
  ],

  /**
   * Produksi MBG 2 — MBG2: Tim produksi MBG 2.
   */
  MBG2: [
    "/katering/jobdesk",
    "/mbg/production",
  ],
  mbg2: [
    "/katering/jobdesk",
    "/mbg/production",
  ],
  produksi_mbg_2: [
    "/katering/jobdesk",
    "/mbg/production",
  ],

  /**
   * Distribusi MBG 2 — Dstribusi2@alumana.id
   */
  distribusi_mbg_2: [
    "/katering/jobdesk",
    "/mbg/distribution",
    "/mbg/delivery",
  ],
};

// Performa Saya tersedia bagi semua role internal. Menambahkannya di satu
// tempat mencegah navigasi desktop dan mobile tidak sinkron.
for (const role of Object.keys(ROLE_PERMISSIONS)) {
  if (role !== "super_admin" && !ROLE_PERMISSIONS[role].includes("/performance")) {
    ROLE_PERMISSIONS[role] = [...ROLE_PERMISSIONS[role], "/performance"];
  }
}

/** Roles that land on the admin AppShell when authenticated. */
export const ADMIN_SHELL_ROLES = [
  "super_admin",
  "tim_produksi",
  "distribusi",
  "kurir",
  "produksi_1",
  "distribusi_1",
  "produksi_2",
  "distribusi_2",
  "mo_katering",
  "co_mo_katering",
  "admin_mbg",
  "produksi_mbg",
  "dokumentasi_produksiMBG",
  "purchasing_mbg",
  "distribusi_mbg",
  "kurir_mbg",
  "sub_purchasing_mbg",
  "MBG2",
  "mbg2",
  "produksi_mbg_2",
  "distribusi_mbg_2",
] as const;

export const ALL_ROLES = [
  "super_admin",
  "admin",
  "customer",
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
  "admin_mbg",
  "produksi_mbg",
  "dokumentasi_produksiMBG",
  "purchasing_mbg",
  "distribusi_mbg",
  "kurir_mbg",
  "sub_purchasing_mbg",
  "MBG2",
  "mbg2",
  "produksi_mbg_2",
  "distribusi_mbg_2",
] as const;

/**
 * Role-based default landing path used after sign-in and as a fallback when
 * a user navigates to a path their role is not allowed to view.
 */
export const ROLE_DEFAULT_REDIRECT: Record<string, string> = {
  super_admin: "/super-admin/control-center",
  admin: "/",
  monitoring: "/admin/dashboard",
  tim_produksi: "/admin/production",
  distribusi: "/distribusi/handover",
  kurir: "/distribusi/delivery",
  // New katering operational roles
  produksi_1: "/katering/jobdesk",
  distribusi_1: "/katering/jobdesk",
  produksi_2: "/katering/jobdesk",
  distribusi_2: "/katering/jobdesk",
  mo_katering: "/katering/mo/jobdesk",
  co_mo_katering: "/katering/co-mo/review",
  // MBG roles
  admin_mbg: "/mbg/admin",
  produksi_mbg: "/mbg/production",
  dokumentasi_produksiMBG: "/mbg/orders",
  purchasing_mbg: "/performance",
  distribusi_mbg: "/mbg/distribution",
  kurir_mbg: "/mbg/delivery",
  sub_purchasing_mbg: "/performance",
  MBG2: "/katering/jobdesk",
  mbg2: "/katering/jobdesk",
  produksi_mbg_2: "/katering/jobdesk",
  distribusi_mbg_2: "/katering/jobdesk",
};
