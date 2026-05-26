export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: ["/dashboard", "/orders", "/production", "/qc", "/dispatch", "/delivery", "/tracking", "/settings"],
  monitoring: ["/dashboard", "/orders", "/tracking", "/settings"],
  tim_produksi: ["/production", "/settings"],
  distribusi: ["/dispatch", "/delivery", "/tracking", "/settings"],
  pelanggan: ["/orders", "/settings"],
};
