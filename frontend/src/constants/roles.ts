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
    "/distribusi/schedules",
  ],

  /**
   * Distribusi: mengelola pengiriman, penugasan kurir, dan delivery scheduler.
   */
  distribusi: [
    "/distribusi/handover",
    "/distribusi/scheduler",
    "/distribusi/schedules",
  ],

  kurir: [
    "/distribusi/delivery",
    "/distribusi/schedules",
  ],

  monitoring: [
    "/admin/dashboard",
    "/admin/orders",
    "/distribusi/schedules",
  ],
};

/** Roles that land on the admin AppShell when authenticated. */
export const ADMIN_SHELL_ROLES = [
  "tim_produksi",
  "distribusi",
  "kurir",
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
};

