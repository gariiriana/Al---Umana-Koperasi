/**
 * Maps each Firestore-stored role to the list of admin-shell paths the
 * user is allowed to navigate to. Every path is prefixed with `/admin`
 * so the admin/AppShell area lives entirely under `/admin/*` and never
 * collides with the public Storefront routes (e.g. `/orders`,
 * `/category/:name`).
 */
/** Halaman Toko Santri (Toksan): hanya admin Toksan, plus super_admin/developer untuk mengecek. */
export const TOKSAN_PATHS: readonly string[] = ["/toksan/input", "/toksan/obral", "/toksan/rekap", "/toksan/trafik", "/toksan/produk"];

export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  developer: ["/developer/control-center", "/super-admin/control-center", ...TOKSAN_PATHS],
  super_admin: ["/super-admin/control-center", ...TOKSAN_PATHS],
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
    // distributor@alumana.id (Ustadz Dwi) ikut mengisi Cek List & Dokumentasi Bahan MBG.
    "/mbg/persiapan",
  ],

  /**
   * Kurir katering & kurir MBG satu pool sejak 2026-11-13: keduanya bisa menerima
   * pesanan katering maupun tugas MBG, dengan "Tugas Saya" sebagai halaman utama.
   */
  kurir: [
    "/kurir/tugas",
    "/distribusi/delivery",
    "/mbg/delivery",
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
   * Administrasi MBG — Kang Wandi (adminmbg@alumana.id): buat data PM, penugasan kurir
   * (Distribusi MBG), monitoring dokumentasi kurir (Kurir MBG), Arsip PM, dan Job Desk Teklap
   * (dipetakan ke distribusi_2).
   */
  admin_mbg: [
    "/katering/jobdesk",
    "/mbg/admin",
    "/mbg/admin/batch/new",
    "/mbg/archive",
    "/mbg/distribution",
    "/mbg/delivery",
  ],

  /**
   * Produksi MBG — Ustadzah Hashifah (produksimbg@alumana.id): Produksi MBG, Arsip PM
   * (hanya lihat), dan Job Desk Teklap.
   */
  produksi_mbg: [
    "/katering/jobdesk",
    "/mbg/archive",
    "/mbg/production",
  ],

  /**
   * Sub Akun Dokumentasi Memasak MBG: dokumentasi foto & status masak.
   */
  dokumentasi_produksiMBG: [
    "/mbg/production",
  ],

  /**
   * Distribusi MBG — Ustadz Dwi (distribusimbg@alumana.id): hanya Persiapan
   * (Cek List Bahan & Dokumentasi Bahan) dan Job Desk Teklap.
   */
  distribusi_mbg: [
    "/katering/jobdesk",
    "/mbg/persiapan",
  ],

  /**
   * Kurir MBG: serah terima, antar makanan, bukti foto, export PDF — dan sejak
   * 2026-11-13 juga pesanan katering (menu sama dengan `kurir`).
   */
  kurir_mbg: [
    "/kurir/tugas",
    "/distribusi/delivery",
    "/mbg/delivery",
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
    "/mbg/persiapan",
  ],

  // ==========================================================================
  // Unit Usaha (Fish n Kids, Kasma Tani, Toko Santri, …) — lihat constants/units.ts
  // ==========================================================================

  /**
   * Kepala Unit: memberi task dan memantau task & KPI anggota unitnya sendiri.
   * Performa Saya tetap ada untuk task dari unit lain tempat ia menjadi anggota.
   */
  kepala_unit: ["/unit/control-center"],

  /** Tim Unit: mengerjakan task dari Kepala Unit-nya (menu Performa Saya). */
  tim_unit: [],

  /** Admin Toko Santri: input penjualan harian, obral, rekap, trafik produk, master produk. */
  toksan: TOKSAN_PATHS,
};

/**
 * Role unit usaha. Tidak masuk ALL_ROLES: akun unit butuh `unitId`/`unitIds`,
 * jadi tidak boleh dibuat lewat dropdown "Pindahkan role" Super Admin, dan
 * notifikasinya selalu per uid (tidak ada broadcast role ke Worker push).
 */
export const UNIT_ROLES: readonly string[] = ["kepala_unit", "tim_unit"];

/**
 * Role yang tidak pernah diberi task oleh Super Admin, jadi tidak punya KPI:
 * kurir katering & MBG, serta akun Produksi 2 dan Distribusi 2.
 */
export const NO_TASK_ROLES: readonly string[] = ["kurir", "kurir_mbg", "produksi_2", "distribusi_2", "toksan"];

/** Akun kurir (katering & MBG): satu pool, menu dan halaman utama sama. */
export const COURIER_ROLES: readonly string[] = ["kurir", "kurir_mbg"];

export function isCourierRole(role?: string | null): boolean {
  return Boolean(role && COURIER_ROLES.includes(role));
}

/** Role yang tidak tampil di Monitoring KPI dan tidak bisa diberi task. */
export const KPI_EXCLUDED_ROLES: readonly string[] = ["super_admin", "developer", "pelanggan", "customer", ...NO_TASK_ROLES];

// Performa Saya tersedia bagi semua role internal yang bisa menerima task
// (super_admin, developer, dan kurir tidak punya KPI, jadi tidak diberi menu ini).
// Menambahkannya di satu tempat mencegah navigasi desktop dan mobile tidak sinkron.
for (const role of Object.keys(ROLE_PERMISSIONS)) {
  if (!KPI_EXCLUDED_ROLES.includes(role) && !ROLE_PERMISSIONS[role].includes("/performance")) {
    ROLE_PERMISSIONS[role] = [...ROLE_PERMISSIONS[role], "/performance"];
  }
}

/** Roles that land on the admin AppShell when authenticated. */
export const ADMIN_SHELL_ROLES = [
  "developer",
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
  "distribusi_mbg",
  "kurir_mbg",
  "MBG2",
  "mbg2",
  "produksi_mbg_2",
  "distribusi_mbg_2",
  "kepala_unit",
  "tim_unit",
  "toksan",
] as const;

export const ALL_ROLES = [
  "developer",
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
  "distribusi_mbg",
  "kurir_mbg",
  "MBG2",
  "mbg2",
  "produksi_mbg_2",
  "distribusi_mbg_2",
  "toksan",
] as const;

/**
 * Role-based default landing path used after sign-in and as a fallback when
 * a user navigates to a path their role is not allowed to view.
 */
export const ROLE_DEFAULT_REDIRECT: Record<string, string> = {
  developer: "/developer/control-center",
  super_admin: "/super-admin/control-center",
  admin: "/",
  monitoring: "/admin/dashboard",
  tim_produksi: "/admin/production",
  distribusi: "/distribusi/handover",
  kurir: "/kurir/tugas",
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
  dokumentasi_produksiMBG: "/mbg/production",
  distribusi_mbg: "/mbg/persiapan",
  kurir_mbg: "/kurir/tugas",
  MBG2: "/katering/jobdesk",
  mbg2: "/katering/jobdesk",
  produksi_mbg_2: "/katering/jobdesk",
  distribusi_mbg_2: "/katering/jobdesk",
  // Unit usaha
  kepala_unit: "/unit/control-center",
  tim_unit: "/performance",
  // Toko Santri
  toksan: "/toksan/input",
};
