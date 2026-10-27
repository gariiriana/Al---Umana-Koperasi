// Who is calling: Firebase ID token → baris `employees` yang aktif.
import { getEmployee } from "./db.js";
import { AbsensiError } from "./http.js";

export async function requireEmployee(ctx, { role } = {}) {
  const header = ctx.request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const verified = token ? await ctx.deps.verifyToken(token) : null;
  if (!verified) throw new AbsensiError("UNAUTHENTICATED", 401);

  const employee = await getEmployee(ctx.env.DB, verified.uid);
  if (!employee) throw new AbsensiError("BUKAN_AKUN_ABSENSI", 403);
  if (employee.status !== "aktif") throw new AbsensiError("AKUN_NONAKTIF", 403);
  if (role && employee.role !== role) throw new AbsensiError("FORBIDDEN", 403);
  return employee;
}
