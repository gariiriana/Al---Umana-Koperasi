// Kontrol akses: HANYA role "keuangan" yang diizinkan (super_admin dan developer pun ditolak 403).
import { KeuanganError } from "./http.js";

export const ALLOWED_ROLES = ["keuangan"];

export async function requireKeuangan({ request, deps }) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const verified = token ? await deps.verifyToken(token) : null;
  if (!verified) throw new KeuanganError("UNAUTHENTICATED", 401, "Silakan masuk terlebih dahulu.");
  const profile = await deps.getUserProfile(verified.uid);
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    throw new KeuanganError("FORBIDDEN", 403, "Akses ditolak. Hanya akun Keuangan yang diizinkan.");
  }
  return { uid: verified.uid, role: profile.role, name: profile.name || verified.uid };
}
