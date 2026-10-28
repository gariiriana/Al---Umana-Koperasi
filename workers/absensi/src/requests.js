// Helper validasi, tampilan, dan teks notifikasi untuk pengajuan cuti & pergantian shift.
import { AbsensiError } from "./http.js";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const DAY_MS = 86_400_000;

export function parseIsoDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new AbsensiError("VALIDATION_ERROR", 400);
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new AbsensiError("VALIDATION_ERROR", 400);
  }
  return value;
}

export const LEAVE_LABEL = {
  cuti: "Cuti",
  sakit: "Sakit",
  izin: "Izin",
};

export function requestKindTitle(row) {
  if (row.kind === "pergantian_shift") return "Pergantian Shift";
  return `Permohonan ${LEAVE_LABEL[row.leave_type] || "Cuti"}`;
}

export function requestDetailSummary(row) {
  if (row.kind === "pergantian_shift") {
    const partner = row.partner_name ? ` (rekan: ${row.partner_name})` : "";
    return `${row.start_date} · ${row.from_shift} → ${row.to_shift}${partner}`;
  }
  const label = LEAVE_LABEL[row.leave_type] || "Cuti";
  const range = row.start_date === row.end_date ? row.start_date : `${row.start_date} s/d ${row.end_date}`;
  return `${label} (${range})`;
}

export const toRequestView = (row) => ({
  id: row.id,
  uid: row.uid,
  employeeName: row.employee_name ?? "",
  kind: row.kind,
  leaveType: row.leave_type ?? null,
  startDate: row.start_date,
  endDate: row.end_date,
  fromShift: row.from_shift ?? null,
  toShift: row.to_shift ?? null,
  partnerUid: row.partner_uid ?? null,
  partnerName: row.partner_name ?? null,
  reason: row.reason,
  status: row.status,
  reviewedBy: row.reviewed_by ?? null,
  reviewerName: row.reviewer_name ?? null,
  reviewedAt: row.reviewed_at ?? null,
  reviewNote: row.review_note ?? null,
  createdAt: row.created_at,
});

export const toNotificationView = (row) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  requestId: row.request_id ?? null,
  readAt: row.read_at ?? null,
  createdAt: row.created_at,
});

