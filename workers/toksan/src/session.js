// Who is calling: Firebase ID token → users/{uid} role. Only Toksan staff get through.
import { ToksanError } from "./http.js";

export const ALLOWED_ROLES = ["toksan", "super_admin", "developer"];

export async function requireStaff({ request, deps }) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const verified = token ? await deps.verifyToken(token) : null;
  if (!verified) throw new ToksanError("UNAUTHENTICATED", 401);
  const profile = await deps.getUserProfile(verified.uid);
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) throw new ToksanError("FORBIDDEN", 403);
  return { uid: verified.uid, role: profile.role, name: profile.name };
}
