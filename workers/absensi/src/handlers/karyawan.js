// Endpoint untuk akun absensi sendiri: profil, status tombol, riwayat.
import { listAreas, recentShifts, shiftsForMonth } from "../db.js";
import { AbsensiError } from "../http.js";
import { requireEmployee } from "../session.js";
import { shiftStatus, toShiftView } from "../shifts.js";

const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function meView(ctx, employee) {
  const now = ctx.deps.now();
  const faceRequired = employee.face_required === 1;
  return {
    uid: employee.uid,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    faceRequired,
    activated: employee.activated_at !== null,
    status: shiftStatus(await recentShifts(ctx.env.DB, employee.uid), now),
    areas: await listAreas(ctx.env.DB, { activeOnly: true }),
    faceDescriptor: faceRequired && employee.face_descriptor ? JSON.parse(employee.face_descriptor) : null,
  };
}

export async function getMe(ctx) {
  return meView(ctx, await requireEmployee(ctx));
}

export async function getRiwayat(ctx) {
  const employee = await requireEmployee(ctx);
  const bulan = ctx.url.searchParams.get("bulan") || "";
  if (!BULAN.test(bulan)) throw new AbsensiError("VALIDATION_ERROR", 400);
  const now = ctx.deps.now();
  const rows = await shiftsForMonth(ctx.env.DB, employee.uid, bulan);
  return { rows: rows.map((row) => toShiftView(row, now)) };
}
