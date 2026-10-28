// Semua query D1 absensi. `db` = env.DB ("absensi"), `photos` = env.PHOTOS ("absensi_foto").

const first = async (statement) => (await statement.first()) ?? null;
const all = async (statement) => (await statement.all()).results;
const changes = async (statement) => (await statement.run()).meta.changes;

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

export const recentShifts = (db, uid, limit = 5) =>
  all(db.prepare("SELECT * FROM shifts WHERE uid = ? ORDER BY masuk_at DESC LIMIT ?").bind(uid, limit));

/** Melempar kalau `(uid, work_date)` sudah ada (indeks unik). */
export async function insertShift(db, { id, uid, workDate, masukAt, lat, lng, accuracy, areaId, faceDistance, photoId }) {
  await db.prepare(
    `INSERT INTO shifts (id, uid, work_date, masuk_at, masuk_lat, masuk_lng, masuk_accuracy, masuk_area_id, masuk_face_distance, masuk_photo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, uid, workDate, masukAt, lat, lng, accuracy, areaId, faceDistance ?? null, photoId).run();
}

export const closeShift = (db, id, { pulangAt, lat, lng, accuracy, areaId, faceDistance, photoId }) => changes(db.prepare(
  `UPDATE shifts SET pulang_at = ?, pulang_lat = ?, pulang_lng = ?, pulang_accuracy = ?, pulang_area_id = ?,
     pulang_face_distance = ?, pulang_photo_id = ?, status = 'selesai'
   WHERE id = ? AND status = 'terbuka'`,
).bind(pulangAt, lat, lng, accuracy, areaId, faceDistance ?? null, photoId, id));

export const shiftsForMonth = (db, uid, bulan) => all(db.prepare(
  "SELECT * FROM shifts WHERE uid = ? AND work_date BETWEEN ? AND ? ORDER BY work_date DESC",
).bind(uid, `${bulan}-01`, `${bulan}-31`));

export function rekapShifts(db, { from, to, uid }) {
  const filter = uid ? " AND s.uid = ?" : "";
  const values = uid ? [from, to, uid] : [from, to];
  return all(db.prepare(
    `SELECT s.*, e.name AS name, a.name AS area_name FROM shifts s
     JOIN employees e ON e.uid = s.uid
     LEFT JOIN areas a ON a.id = s.masuk_area_id
     WHERE s.work_date BETWEEN ? AND ?${filter}
     ORDER BY s.work_date, e.name COLLATE NOCASE`,
  ).bind(...values));
}

/** Karyawan aktif beserta shift hari ini atau shift yang masih terbuka (bisa 0–2 baris per orang). */
export const todayOverview = (db, workDate) => all(db.prepare(
  `SELECT e.uid AS uid, e.name AS name, s.id AS shift_id, s.work_date, s.masuk_at, s.pulang_at, s.status
   FROM employees e
   LEFT JOIN shifts s ON s.uid = e.uid AND (s.work_date = ? OR s.status = 'terbuka')
   WHERE e.role = 'absen_karyawan' AND e.status = 'aktif'
   ORDER BY e.name COLLATE NOCASE, s.masuk_at DESC`,
).bind(workDate));

// ---------------------------------------------------------------------------
// Pengajuan (Cuti / Sakit / Izin & Pergantian Shift)
// ---------------------------------------------------------------------------

const REQUEST_SELECT = `
  SELECT r.*, e.name AS employee_name, rev.name AS reviewer_name
  FROM requests r
  JOIN employees e ON e.uid = r.uid
  LEFT JOIN employees rev ON rev.uid = r.reviewed_by
`;

export async function insertRequest(db, {
  id, uid, kind, leaveType, startDate, endDate, fromShift, toShift, partnerUid, partnerName, reason, createdAt,
}) {
  await db.prepare(
    `INSERT INTO requests (
       id, uid, kind, leave_type, start_date, end_date, from_shift, to_shift,
       partner_uid, partner_name, reason, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).bind(
    id, uid, kind, leaveType ?? null, startDate, endDate, fromShift ?? null, toShift ?? null,
    partnerUid ?? null, partnerName ?? null, reason, createdAt,
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
