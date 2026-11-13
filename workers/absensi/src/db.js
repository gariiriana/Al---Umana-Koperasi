// Semua query D1 absensi. `db` = env.DB ("absensi"), `photos` = env.PHOTOS ("absensi_foto").

const first = async (statement) => (await statement.first()) ?? null;
const all = async (statement) => (await statement.all()).results;
const changes = async (statement) => (await statement.run()).meta.changes;

/** Status absen luar zona (masuk & pulang) + clock in di hari Silah per shift `s`; dibaca toShiftView. */
const ZONE_COLUMNS = `zm.id AS zone_masuk_id, zm.status AS zone_masuk_status, zm.reason AS zone_masuk_reason,
  zm.distance_m AS zone_masuk_distance, zp.id AS zone_pulang_id, zp.status AS zone_pulang_status,
  zp.reason AS zone_pulang_reason, zp.distance_m AS zone_pulang_distance,
  sx.id AS silah_ex_id, sx.status AS silah_ex_status, sx.reason AS silah_ex_reason`;
const ZONE_JOINS = `LEFT JOIN zone_exceptions zm ON zm.shift_id = s.id AND zm.kind = 'masuk'
  LEFT JOIN zone_exceptions zp ON zp.shift_id = s.id AND zp.kind = 'pulang'
  LEFT JOIN silah_exceptions sx ON sx.shift_id = s.id`;

// ---------------------------------------------------------------------------
// Karyawan
// ---------------------------------------------------------------------------

export const getEmployee = (db, uid) => first(db.prepare("SELECT * FROM employees WHERE uid = ?").bind(uid));

export const listEmployees = (db) => all(db.prepare("SELECT * FROM employees ORDER BY name COLLATE NOCASE"));

export const listActiveEmployeesByRole = (db, role) => all(
  db.prepare("SELECT uid, name, email FROM employees WHERE role = ? AND status = 'aktif' ORDER BY name COLLATE NOCASE").bind(role),
);

export async function insertEmployee(db, { uid, name, email, role, faceRequired, createdAt, createdBy }) {
  await db.prepare(
    "INSERT INTO employees (uid, name, email, role, face_required, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(uid, name, email, role, faceRequired ? 1 : 0, createdAt, createdBy ?? null).run();
}

export async function setEmployeeStatus(db, uid, status) {
  await db.prepare("UPDATE employees SET status = ? WHERE uid = ?").bind(status, uid).run();
}

export async function setFaceRequired(db, uid, required) {
  await db.prepare("UPDATE employees SET face_required = ? WHERE uid = ?").bind(required ? 1 : 0, uid).run();
}

export async function activateEmployee(db, uid, { faceDescriptor, referencePhotoId, consentAt, activatedAt }) {
  await db.prepare(
    "UPDATE employees SET face_descriptor = ?, reference_photo_id = ?, consent_at = ?, activated_at = ? WHERE uid = ?",
  ).bind(faceDescriptor ? JSON.stringify(faceDescriptor) : null, referencePhotoId, consentAt, activatedAt, uid).run();
}

/** Hapus passkey dan data wajah supaya karyawan aktivasi ulang di HP baru. */
export async function resetEmployeeDevice(db, uid) {
  const employee = await getEmployee(db, uid);
  await db.batch([
    db.prepare("DELETE FROM passkeys WHERE uid = ?").bind(uid),
    db.prepare("UPDATE employees SET face_descriptor = NULL, reference_photo_id = NULL, activated_at = NULL WHERE uid = ?").bind(uid),
  ]);
  return { referencePhotoId: employee?.reference_photo_id ?? null };
}

// ---------------------------------------------------------------------------
// Passkey
// ---------------------------------------------------------------------------

export const listPasskeys = (db, uid) => all(db.prepare("SELECT * FROM passkeys WHERE uid = ?").bind(uid));

export async function insertPasskey(db, { credentialId, uid, publicKey, counter, transports, createdAt }) {
  await db.prepare(
    "INSERT INTO passkeys (credential_id, uid, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(credentialId, uid, publicKey, counter, JSON.stringify(transports ?? []), createdAt).run();
}

export async function updatePasskeyCounter(db, credentialId, counter, usedAt) {
  await db.prepare("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE credential_id = ?").bind(counter, usedAt, credentialId).run();
}

// ---------------------------------------------------------------------------
// Area
// ---------------------------------------------------------------------------

const areaView = (row) => ({
  id: row.id,
  name: row.name,
  polygon: JSON.parse(row.polygon),
  toleranceM: row.tolerance_m,
  active: row.active === 1,
});

export async function listAreas(db, { activeOnly = false } = {}) {
  const sql = activeOnly ? "SELECT * FROM areas WHERE active = 1 ORDER BY name" : "SELECT * FROM areas ORDER BY name";
  return (await all(db.prepare(sql))).map(areaView);
}

/** Ganti seluruh daftar area dengan `areas` (yang belum punya id dibuatkan). */
export async function replaceAreas(db, areas, byUid, nowMs) {
  await db.batch([
    db.prepare("DELETE FROM areas"),
    ...areas.map((a) => db.prepare(
      "INSERT INTO areas (id, name, polygon, tolerance_m, active, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(a.id || crypto.randomUUID(), a.name, JSON.stringify(a.polygon), a.toleranceM, a.active ? 1 : 0, nowMs, byUid)),
  ]);
}

// ---------------------------------------------------------------------------
// Challenge sekali pakai
// ---------------------------------------------------------------------------

export async function createChallenge(db, { uid, purpose, kind, nonce, expiresAt }) {
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO challenges (id, uid, nonce, purpose, kind, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, uid, nonce, purpose, kind ?? null, expiresAt).run();
  return id;
}

/** Tandai terpakai secara atomik; `null` kalau salah pemilik, sudah dipakai, atau kedaluwarsa. */
export const consumeChallenge = (db, id, uid, purpose, nowMs) => first(db.prepare(
  "UPDATE challenges SET used_at = ? WHERE id = ? AND uid = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? RETURNING *",
).bind(nowMs, id, uid, purpose, nowMs));

// ---------------------------------------------------------------------------
// Shift
// ---------------------------------------------------------------------------

export const recentShifts = (db, uid, limit = 5) => all(db.prepare(
  `SELECT s.*, ${ZONE_COLUMNS} FROM shifts s ${ZONE_JOINS} WHERE s.uid = ? ORDER BY s.masuk_at DESC LIMIT ?`,
).bind(uid, limit));

/** Melempar kalau `(uid, work_date)` sudah ada (indeks unik). */
export async function insertShift(db, {
  id, uid, workDate, masukAt, lat, lng, accuracy, areaId, faceDistance, photoId, lateReason, latePhotoId,
}) {
  await db.prepare(
    `INSERT INTO shifts (id, uid, work_date, masuk_at, masuk_lat, masuk_lng, masuk_accuracy, masuk_area_id, masuk_face_distance,
       masuk_photo_id, late_reason, late_photo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, uid, workDate, masukAt, lat, lng, accuracy, areaId, faceDistance ?? null, photoId, lateReason ?? null, latePhotoId ?? null,
  ).run();
}

export const closeShift = (db, id, { pulangAt, lat, lng, accuracy, areaId, faceDistance, photoId }) => changes(db.prepare(
  `UPDATE shifts SET pulang_at = ?, pulang_lat = ?, pulang_lng = ?, pulang_accuracy = ?, pulang_area_id = ?,
     pulang_face_distance = ?, pulang_photo_id = ?, status = 'selesai'
   WHERE id = ? AND status = 'terbuka'`,
).bind(pulangAt, lat, lng, accuracy, areaId, faceDistance ?? null, photoId, id));

/** Hapus shift hari ini / terbuka (atau shift terakhir) untuk reset simulasi akun testing. */
export async function deleteShiftsForReset(db, uid, workDate) {
  const cols = "id, masuk_photo_id, pulang_photo_id, late_photo_id";
  let rows = await all(
    db.prepare(`SELECT ${cols} FROM shifts WHERE uid = ? AND (work_date = ? OR status = 'terbuka')`).bind(uid, workDate),
  );
  if (rows.length === 0) {
    rows = await all(
      db.prepare(`SELECT ${cols} FROM shifts WHERE uid = ? ORDER BY masuk_at DESC LIMIT 1`).bind(uid),
    );
  }
  if (rows.length === 0) return { deletedCount: 0, photoIds: [] };
  const photoIds = [];
  for (const r of rows) {
    if (r.masuk_photo_id) photoIds.push(r.masuk_photo_id);
    if (r.pulang_photo_id) photoIds.push(r.pulang_photo_id);
    if (r.late_photo_id) photoIds.push(r.late_photo_id);
  }
  await db.batch(rows.flatMap((r) => [
    db.prepare("DELETE FROM zone_exceptions WHERE shift_id = ?").bind(r.id),
    db.prepare("DELETE FROM silah_exceptions WHERE shift_id = ?").bind(r.id),
    db.prepare("DELETE FROM shifts WHERE id = ?").bind(r.id),
  ]));
  return { deletedCount: rows.length, photoIds };
}

/** Reset hanya data Clock Out (pulang) pada shift hari ini / terakhir agar kembali ke status terbuka (sudah Clock In). */
export async function resetShiftPulangForSimulasi(db, uid, workDate) {
  let row = await first(
    db.prepare("SELECT id, pulang_photo_id FROM shifts WHERE uid = ? AND work_date = ? AND pulang_at IS NOT NULL ORDER BY masuk_at DESC LIMIT 1").bind(uid, workDate),
  );
  if (!row) {
    row = await first(
      db.prepare("SELECT id, pulang_photo_id FROM shifts WHERE uid = ? AND pulang_at IS NOT NULL ORDER BY masuk_at DESC LIMIT 1").bind(uid),
    );
  }
  if (!row) return { deletedCount: 0, photoIds: [] };
  await db.prepare("DELETE FROM zone_exceptions WHERE shift_id = ? AND kind = 'pulang'").bind(row.id).run();
  await db.prepare(
    `UPDATE shifts SET pulang_at = NULL, pulang_lat = NULL, pulang_lng = NULL, pulang_accuracy = NULL,
       pulang_area_id = NULL, pulang_face_distance = NULL, pulang_photo_id = NULL, status = 'terbuka'
     WHERE id = ?`,
  ).bind(row.id).run();
  return { deletedCount: 1, photoIds: row.pulang_photo_id ? [row.pulang_photo_id] : [] };
}

export const shiftsForMonth = (db, uid, bulan) => all(db.prepare(
  `SELECT s.*, ${ZONE_COLUMNS} FROM shifts s ${ZONE_JOINS}
   WHERE s.uid = ? AND s.work_date BETWEEN ? AND ? ORDER BY s.work_date DESC`,
).bind(uid, `${bulan}-01`, `${bulan}-31`));

export function rekapShifts(db, { from, to, uid }) {
  const filter = uid ? " AND s.uid = ?" : "";
  const values = uid ? [from, to, uid] : [from, to];
  return all(db.prepare(
    `SELECT s.*, e.name AS name, a.name AS area_name, ${ZONE_COLUMNS} FROM shifts s
     JOIN employees e ON e.uid = s.uid
     LEFT JOIN areas a ON a.id = s.masuk_area_id
     ${ZONE_JOINS}
     WHERE s.work_date BETWEEN ? AND ?${filter}
     ORDER BY s.work_date, e.name COLLATE NOCASE`,
  ).bind(...values));
}

/** Karyawan aktif beserta shift hari ini atau shift yang masih terbuka (bisa 0–2 baris per orang). */
export const todayOverview = (db, workDate) => all(db.prepare(
  `SELECT e.uid AS uid, e.name AS name, e.unit_id AS unit_id, s.id AS shift_id, s.work_date, s.masuk_at, s.pulang_at,
     s.status, s.late_reason, s.late_photo_id, ${ZONE_COLUMNS}
   FROM employees e
   LEFT JOIN shifts s ON s.uid = e.uid AND (s.work_date = ? OR s.status = 'terbuka')
   ${ZONE_JOINS}
   WHERE e.role = 'absen_karyawan' AND e.status = 'aktif'
   ORDER BY e.name COLLATE NOCASE, s.masuk_at DESC`,
).bind(workDate));

// ---------------------------------------------------------------------------
// Pengajuan (Cuti / Sakit / Izin & Pergantian Shift)
// ---------------------------------------------------------------------------

const REQUEST_SELECT = `
  SELECT r.*, e.name AS employee_name, rev.name AS reviewer_name, un.name AS unit_name
  FROM requests r
  JOIN employees e ON e.uid = r.uid
  LEFT JOIN employees rev ON rev.uid = r.reviewed_by
  LEFT JOIN units un ON un.id = e.unit_id
`;

export async function insertRequest(db, {
  id, uid, kind, leaveType, leaveSubtype, startDate, endDate, fromShift, toShift,
  partnerUid, partnerName, attachmentName, reason, createdAt,
}) {
  await db.prepare(
    `INSERT INTO requests (
       id, uid, kind, leave_type, leave_subtype, start_date, end_date, from_shift, to_shift,
       partner_uid, partner_name, attachment_name, reason, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).bind(
    id, uid, kind, leaveType ?? null, leaveSubtype ?? null, startDate, endDate,
    fromShift ?? null, toShift ?? null,
    partnerUid ?? null, partnerName ?? null, attachmentName ?? null, reason, createdAt,
  ).run();
}

export const getRequestById = (db, id) =>
  first(db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).bind(id));

export const listEmployeeRequests = (db, uid, limit = 100) =>
  all(db.prepare(`${REQUEST_SELECT} WHERE r.uid = ? ORDER BY r.created_at DESC LIMIT ?`).bind(uid, limit));

export const requestsForMonth = (db, uid, bulan) =>
  all(db.prepare(
    `${REQUEST_SELECT} WHERE r.uid = ? AND r.start_date <= ? AND r.end_date >= ? ORDER BY r.start_date DESC, r.created_at DESC`,
  ).bind(uid, `${bulan}-31`, `${bulan}-01`));

export function listAdminRequests(db, { status, limit = 200 } = {}) {
  if (status && status !== "all") {
    return all(db.prepare(`${REQUEST_SELECT} WHERE r.status = ? ORDER BY r.created_at DESC LIMIT ?`).bind(status, limit));
  }
  return all(db.prepare(`${REQUEST_SELECT} ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT ?`).bind(limit));
}

export async function countPendingRequests(db) {
  const row = await first(db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'pending'"));
  return Number(row?.n ?? 0);
}

export const reviewRequest = (db, id, { status, reviewedBy, reviewedAt, reviewNote }) => changes(db.prepare(
  `UPDATE requests SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
   WHERE id = ? AND status = 'pending'`,
).bind(status, reviewedBy, reviewedAt, reviewNote ?? null, id));

export function approvedRequestsInRange(db, { from, to, uid }) {
  const filter = uid ? " AND r.uid = ?" : "";
  const values = uid ? [to, from, uid] : [to, from];
  return all(db.prepare(
    `${REQUEST_SELECT}
     WHERE r.status = 'approved' AND r.start_date <= ? AND r.end_date >= ?${filter}
     ORDER BY r.start_date, e.name COLLATE NOCASE`,
  ).bind(...values));
}

// ---------------------------------------------------------------------------
// Notifikasi
// ---------------------------------------------------------------------------

export async function insertNotifications(db, items) {
  if (!items || items.length === 0) return;
  await db.batch(items.map((item) => db.prepare(
    `INSERT INTO notifications (id, recipient_uid, kind, title, body, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    item.id || crypto.randomUUID(),
    item.recipientUid,
    item.kind,
    item.title,
    item.body,
    item.requestId ?? null,
    item.createdAt,
  )));
}

export const listNotifications = (db, recipientUid, limit = 50) =>
  all(db.prepare(
    "SELECT * FROM notifications WHERE recipient_uid = ? ORDER BY created_at DESC LIMIT ?",
  ).bind(recipientUid, limit));

export async function countUnreadNotifications(db, recipientUid) {
  const row = await first(db.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE recipient_uid = ? AND read_at IS NULL",
  ).bind(recipientUid));
  return Number(row?.n ?? 0);
}

export const markNotificationRead = (db, recipientUid, id, nowMs) => changes(db.prepare(
  "UPDATE notifications SET read_at = ? WHERE id = ? AND recipient_uid = ? AND read_at IS NULL",
).bind(nowMs, id, recipientUid));

export const markAllNotificationsRead = (db, recipientUid, nowMs) => changes(db.prepare(
  "UPDATE notifications SET read_at = ? WHERE recipient_uid = ? AND read_at IS NULL",
).bind(nowMs, recipientUid));

// ---------------------------------------------------------------------------
// Foto
// ---------------------------------------------------------------------------

export async function insertPhoto(photos, { id, uid, kind, jpeg, createdAt }) {
  await photos.prepare("INSERT INTO photos (id, uid, kind, jpeg, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, uid, kind, jpeg, createdAt).run();
}

export async function getPhoto(photos, id) {
  const row = await first(photos.prepare("SELECT * FROM photos WHERE id = ?").bind(id));
  return row ? { ...row, jpeg: new Uint8Array(row.jpeg) } : null;
}

export async function deletePhoto(photos, id) {
  await photos.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

export const markStaleShifts = (db, cutoffMs) =>
  changes(db.prepare("UPDATE shifts SET status = 'lupa_pulang' WHERE status = 'terbuka' AND masuk_at < ?").bind(cutoffMs));

export const purgeSelfies = (photos, cutoffMs) =>
  changes(photos.prepare("DELETE FROM photos WHERE kind = 'selfie' AND created_at < ?").bind(cutoffMs));

export const purgeChallenges = (db, nowMs) => changes(db.prepare("DELETE FROM challenges WHERE expires_at < ?").bind(nowMs));

// ---------------------------------------------------------------------------
// Silah (hari libur mingguan tetap)
// ---------------------------------------------------------------------------

/**
 * Riwayat jadwal Silah karyawan aktif yang sudah berlaku sampai `to` (termasuk), urut per karyawan.
 * Berisi `uid, name, effective_from, days`.
 */
export function listSilahHistory(db, { to, uid } = {}) {
  const filter = uid ? " AND s.uid = ?" : "";
  const values = uid ? [to, uid] : [to];
  return all(db.prepare(
    `SELECT s.uid, e.name, s.effective_from, s.days FROM silah s
     JOIN employees e ON e.uid = s.uid
     WHERE e.status = 'aktif' AND e.role = 'absen_karyawan' AND s.effective_from <= ?${filter}
     ORDER BY e.name COLLATE NOCASE, s.effective_from`,
  ).bind(...values));
}

/** Simpan jadwal Silah yang berlaku mulai `effectiveFrom`; diubah lagi di hari yang sama = ditimpa. */
export async function setSilah(db, { uid, days, effectiveFrom, nowMs, byUid }) {
  await db.prepare(
    `INSERT INTO silah (uid, effective_from, days, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (uid, effective_from) DO UPDATE SET days = excluded.days, updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).bind(uid, effectiveFrom, days.join(","), nowMs, byUid ?? null).run();
}

// ---------------------------------------------------------------------------
// Unit kerja & kepala unit
// ---------------------------------------------------------------------------

export const listUnits = (db) => all(db.prepare(
  `SELECT u.*, h.name AS head_name,
     (SELECT COUNT(*) FROM employees m WHERE m.unit_id = u.id AND m.status = 'aktif') AS member_count
   FROM units u LEFT JOIN employees h ON h.uid = u.head_uid
   ORDER BY u.name COLLATE NOCASE`,
));

export const getUnit = (db, id) => first(db.prepare("SELECT * FROM units WHERE id = ?").bind(id));

export async function insertUnit(db, { id, name, headUid, nowMs, byUid }) {
  await db.prepare(
    "INSERT INTO units (id, name, head_uid, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(id, name, headUid ?? null, nowMs, nowMs, byUid ?? null).run();
}

export const updateUnit = (db, id, { name, headUid, nowMs, byUid }) => changes(db.prepare(
  "UPDATE units SET name = ?, head_uid = ?, updated_at = ?, updated_by = ? WHERE id = ?",
).bind(name, headUid ?? null, nowMs, byUid ?? null, id));

export const setEmployeeUnit = (db, uid, unitId) =>
  changes(db.prepare("UPDATE employees SET unit_id = ? WHERE uid = ?").bind(unitId ?? null, uid));

/** Unit yang dikepalai `uid`. */
export const unitsHeadedBy = (db, uid) =>
  all(db.prepare("SELECT id, name FROM units WHERE head_uid = ? ORDER BY name COLLATE NOCASE").bind(uid));

/** Kepala unit aktif dari karyawan `uid`; null bila tidak ada atau kepala unitnya dirinya sendiri. */
export const unitHeadOf = (db, uid) => first(db.prepare(
  `SELECT h.uid AS uid, h.name AS name FROM employees e
   JOIN units u ON u.id = e.unit_id
   JOIN employees h ON h.uid = u.head_uid
   WHERE e.uid = ? AND h.uid <> e.uid AND h.status = 'aktif'`,
).bind(uid));

/** Anggota semua unit yang dikepalai `?` (dua kali uid kepala unit), tanpa kepala unit itu sendiri. */
const TEAM_UIDS = `(SELECT m.uid FROM employees m JOIN units u ON u.id = m.unit_id WHERE u.head_uid = ? AND m.uid <> ?)`;

export function listTeamRequests(db, headUid, { status, limit = 200 } = {}) {
  if (status && status !== "all") {
    return all(db.prepare(
      `${REQUEST_SELECT} WHERE r.uid IN ${TEAM_UIDS} AND r.status = ? ORDER BY r.created_at DESC LIMIT ?`,
    ).bind(headUid, headUid, status, limit));
  }
  return all(db.prepare(
    `${REQUEST_SELECT} WHERE r.uid IN ${TEAM_UIDS}
     ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT ?`,
  ).bind(headUid, headUid, limit));
}

// ---------------------------------------------------------------------------
// Absen di luar zona (menunggu persetujuan)
// ---------------------------------------------------------------------------

const ZONE_SELECT = `
  SELECT z.*, e.name AS employee_name, rev.name AS reviewer_name, un.name AS unit_name, s.work_date AS work_date
  FROM zone_exceptions z
  JOIN employees e ON e.uid = z.uid
  LEFT JOIN employees rev ON rev.uid = z.reviewed_by
  LEFT JOIN units un ON un.id = e.unit_id
  LEFT JOIN shifts s ON s.id = z.shift_id
`;

export async function insertZoneException(db, {
  id, shiftId, uid, kind, at, lat, lng, accuracy, distanceM, reason, photoId, createdAt,
}) {
  await db.prepare(
    `INSERT INTO zone_exceptions (id, shift_id, uid, kind, at, lat, lng, accuracy, distance_m, reason, photo_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).bind(id, shiftId, uid, kind, at, lat, lng, accuracy, distanceM ?? null, reason, photoId ?? null, createdAt).run();
}

export const getZoneException = (db, id) => first(db.prepare(`${ZONE_SELECT} WHERE z.id = ?`).bind(id));

/** `teamOf` = uid kepala unit: hanya anggota timnya. Tanpa `teamOf` = semua (admin). */
export function listZoneExceptions(db, { status, teamOf, limit = 200 } = {}) {
  const where = [];
  const values = [];
  if (teamOf) {
    where.push(`z.uid IN ${TEAM_UIDS}`);
    values.push(teamOf, teamOf);
  }
  if (status && status !== "all") {
    where.push("z.status = ?");
    values.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return all(db.prepare(
    `${ZONE_SELECT} ${clause} ORDER BY CASE WHEN z.status = 'pending' THEN 0 ELSE 1 END, z.created_at DESC LIMIT ?`,
  ).bind(...values, limit));
}

export const reviewZoneException = (db, id, { status, reviewedBy, reviewedAt, reviewNote }) => changes(db.prepare(
  `UPDATE zone_exceptions SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
   WHERE id = ? AND status = 'pending'`,
).bind(status, reviewedBy, reviewedAt, reviewNote ?? null, id));

// ---------------------------------------------------------------------------
// Clock in di hari Silah (menunggu persetujuan)
// ---------------------------------------------------------------------------

const SILAH_EX_SELECT = `
  SELECT x.*, e.name AS employee_name, rev.name AS reviewer_name, un.name AS unit_name
  FROM silah_exceptions x
  JOIN employees e ON e.uid = x.uid
  LEFT JOIN employees rev ON rev.uid = x.reviewed_by
  LEFT JOIN units un ON un.id = e.unit_id
`;

export async function insertSilahException(db, { id, shiftId, uid, workDate, at, reason, photoId, createdAt }) {
  await db.prepare(
    `INSERT INTO silah_exceptions (id, shift_id, uid, work_date, at, reason, photo_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).bind(id, shiftId, uid, workDate, at, reason, photoId ?? null, createdAt).run();
}

export const getSilahException = (db, id) => first(db.prepare(`${SILAH_EX_SELECT} WHERE x.id = ?`).bind(id));

/** `teamOf` = uid kepala unit: hanya anggota timnya. Tanpa `teamOf` = semua (admin). */
export function listSilahExceptions(db, { status, teamOf, limit = 200 } = {}) {
  const where = [];
  const values = [];
  if (teamOf) {
    where.push(`x.uid IN ${TEAM_UIDS}`);
    values.push(teamOf, teamOf);
  }
  if (status && status !== "all") {
    where.push("x.status = ?");
    values.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return all(db.prepare(
    `${SILAH_EX_SELECT} ${clause} ORDER BY CASE WHEN x.status = 'pending' THEN 0 ELSE 1 END, x.created_at DESC LIMIT ?`,
  ).bind(...values, limit));
}

export const reviewSilahException = (db, id, { status, reviewedBy, reviewedAt, reviewNote }) => changes(db.prepare(
  `UPDATE silah_exceptions SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
   WHERE id = ? AND status = 'pending'`,
).bind(status, reviewedBy, reviewedAt, reviewNote ?? null, id));

/** Jumlah yang menunggu persetujuan (pengajuan + absen luar zona + masuk di hari Silah); `teamOf` = tim kepala unit. */
export async function countPendingApprovals(db, { teamOf } = {}) {
  const team = teamOf ? ` AND uid IN ${TEAM_UIDS}` : "";
  const values = teamOf ? [teamOf, teamOf] : [];
  const counts = await Promise.all(["requests", "zone_exceptions", "silah_exceptions"].map((table) =>
    first(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE status = 'pending'${team}`).bind(...values))));
  return counts.reduce((sum, row) => sum + Number(row?.n ?? 0), 0);
}
