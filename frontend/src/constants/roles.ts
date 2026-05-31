/**
 * Maps each Firestore-stored role to the list of admin-shell paths the
 * user is allowed to navigate to. Every path is prefixed with `/admin`
 * so the admin/AppShell area lives entirely under `/admin/*` and never
 * collides with the public Storefront routes (e.g. `/orders`,
 * `/category/:name`).
 */
export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  /**
   * Admin: mengelola produk, menyetujui pembayaran, dan melihat dashboard.
   * Tidak perlu akses ke fitur produksi atau distribusi.
   */
  admin: [
    "/admin/dashboard",
    "/admin/products",
    "/admin/products/new",
    "/admin/categories",
    "/admin/payment-approvals",
  ],

  /**
   * Tim Produksi: mengelola proses produksi dan quality control.
   */
  tim_produksi: [
    "/admin/production",
    "/admin/qc",
  ],

  /**
   * Distribusi: mengelola pengiriman dan pengantaran.
   */
  distribusi: [
    "/distribusi/dispatch",
  ],

  kurir: [
    "/distribusi/delivery",
  ],

  monitoring: [
    "/admin/dashboard",
    "/admin/orders",
    "/admin/tracking",
  ],

  pelanggan: [],
};

/** Roles that land on the admin AppShell when authenticated. */
export const ADMIN_SHELL_ROLES = [
  "admin",
  "monitoring",
  "tim_produksi",
  "distribusi",
  "kurir",
] as const;

/**
 * Role-based default landing path used after sign-in and as a fallback when
 * a user navigates to a path their role is not allowed to view.
 */
export const ROLE_DEFAULT_REDIRECT: Record<string, string> = {
  admin: "/admin/dashboard",
  monitoring: "/admin/dashboard",
  tim_produksi: "/admin/production",
  distribusi: "/distribusi/dispatch",
  kurir: "/distribusi/delivery",
  pelanggan: "/",
};
