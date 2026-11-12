// Bentuk data API Worker absensi (workers/absensi/src/handlers).
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import type { AreaView, LatLng, LocationInput } from "../../../workers/absensi/shared/geo.js";

export type { AreaView, LatLng, LocationInput };

export type AbsenKind = "masuk" | "pulang";
export type AbsensiRole = "absen_karyawan" | "admin_absensi";
export type ShiftStatusName = "terbuka" | "selesai" | "lupa_pulang";
export type RequestKind = "cuti" | "pergantian_shift";
export type LeaveType = "cuti" | "sakit" | "izin";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface ShiftView {
  id: string;
  workDate: string;
  masukAt: number;
  pulangAt: number | null;
  status: ShiftStatusName;
  durationMin: number | null;
  /** Alasan clock in lewat 08:00 WIB (kosong untuk shift tepat waktu / sebelum fitur ini). */
  lateReason?: string | null;
  /** Foto bukti alasan terlambat (dihapus otomatis setelah 90 hari). */
  latePhotoId?: string | null;
  /** Clock in di luar zona (menunggu / disetujui / ditolak kepala unit atau admin). */
  zoneMasuk?: ZoneStatusView | null;
  /** Clock out di luar zona. */
  zonePulang?: ZoneStatusView | null;
}

export interface ZoneStatusView {
  id: string;
  status: RequestStatus;
  reason: string;
  distanceM: number | null;
}

export interface UnitRef {
  id: string;
  name: string;
}

export interface ShiftStatus {
  today: ShiftView | null;
  open: ShiftView | null;
  last: ShiftView | null;
}

export interface Me {
  uid: string;
  name: string;
  email: string;
  role: AbsensiRole;
  faceRequired: boolean;
  activated: boolean;
  status: ShiftStatus;
  areas: AreaView[];
  faceDescriptor: number[] | null;
  unreadNotifications?: number;
  pendingRequests?: number;
  /** Unit tempat karyawan bernaung (kepala unitnya ikut menyetujui pengajuan). */
  unit?: UnitRef | null;
  /** Unit yang dikepalai akun ini; kosong = bukan kepala unit. */
  headOf?: UnitRef[];
  /** Pengajuan + absen luar zona anggota tim yang menunggu persetujuan kepala unit ini. */
  teamPending?: number;
  /** Hari ini jadwal Silah (libur mingguan) akun ini; clock in ditolak server. */
  silahToday?: boolean;
}

export interface ActivateOptions {
  challengeId: string;
  optionsJSON: PublicKeyCredentialCreationOptionsJSON;
}

export interface AbsenOptions {
  challengeId: string;
  nonce: string;
  rpId: string;
  allowCredentials: { id: string; transports?: string[] }[];
}

export interface AbsenResult {
  serverTime: number;
  status: ShiftStatus;
}

export interface RekapRow {
  shiftId: string;
  uid: string;
  name: string;
  workDate: string;
  masukAt: number;
  pulangAt: number | null;
  durationMin: number | null;
  status: ShiftStatusName;
  areaName: string | null;
  masukPhotoId: string | null;
  pulangPhotoId: string | null;
  lateReason?: string | null;
  latePhotoId?: string | null;
  zoneMasuk?: ZoneStatusView | null;
  zonePulang?: ZoneStatusView | null;
}

export interface EmployeeView {
  uid: string;
  name: string;
  email: string;
  role: AbsensiRole;
  status: "aktif" | "nonaktif";
  faceRequired: boolean;
  activated: boolean;
  referencePhotoId: string | null;
  unitId?: string | null;
  /** Hari Silah (libur mingguan) yang berlaku sekarang; 0 = Minggu … 6 = Sabtu. */
  silahDays?: number[];
  createdAt: number;
}

export interface UnitView {
  id: string;
  name: string;
  headUid: string | null;
  headName: string | null;
  memberCount: number;
}

export interface HariIniRow {
  uid: string;
  name: string;
  masukAt: number | null;
  pulangAt: number | null;
  state: "belum" | "masuk" | "pulang" | "tidak_clock_out";
  lateReason?: string | null;
  latePhotoId?: string | null;
  zoneMasuk?: ZoneStatusView | null;
  zonePulang?: ZoneStatusView | null;
  leaveType?: LeaveType | null;
  shiftSwap?: {
    fromShift: string;
    toShift: string;
    partnerName: string | null;
  } | null;
  /** Hari ini jadwal Silah (libur mingguan) orang ini. */
  silah?: boolean;
}

/** Satu versi jadwal Silah karyawan (berlaku mulai effectiveFrom). */
export interface SilahEntry {
  uid: string;
  name: string;
  effectiveFrom: string;
  days: number[];
}

export interface AbsensiRequestView {
  id: string;
  uid: string;
  employeeName: string;
  unitName?: string | null;
  kind: RequestKind;
  leaveType: LeaveType | null;
  leaveSubtype?: string | null;
  startDate: string;
  endDate: string;
  fromShift: string | null;
  toShift: string | null;
  partnerUid: string | null;
  partnerName: string | null;
  attachmentName?: string | null;
  reason: string;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
  createdAt: number;
}

/** Clock in / clock out di luar zona yang perlu disetujui. */
export interface ZoneExceptionView {
  id: string;
  shiftId: string;
  uid: string;
  employeeName: string;
  unitName: string | null;
  kind: AbsenKind;
  workDate: string | null;
  at: number;
  lat: number;
  lng: number;
  accuracy: number;
  distanceM: number | null;
  reason: string;
  photoId: string | null;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
  createdAt: number;
}

export interface ApprovalList {
  requests: AbsensiRequestView[];
  zoneExceptions: ZoneExceptionView[];
  pendingCount: number;
}

export interface AbsensiNotificationView {
  id: string;
  kind: "pengajuan_baru" | "pengajuan_disetujui" | "pengajuan_ditolak";
  title: string;
  body: string;
  requestId: string | null;
  readAt: number | null;
  createdAt: number;
}

export interface CoworkerView {
  uid: string;
  name: string;
}
