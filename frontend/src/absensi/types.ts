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
  createdAt: number;
}

export interface HariIniRow {
  uid: string;
  name: string;
  masukAt: number | null;
  pulangAt: number | null;
  state: "belum" | "masuk" | "pulang" | "tidak_clock_out";
  leaveType?: LeaveType | null;
  shiftSwap?: {
    fromShift: string;
    toShift: string;
    partnerName: string | null;
  } | null;
}

export interface AbsensiRequestView {
  id: string;
  uid: string;
  employeeName: string;
  kind: RequestKind;
  leaveType: LeaveType | null;
  startDate: string;
  endDate: string;
  fromShift: string | null;
  toShift: string | null;
  partnerUid: string | null;
  partnerName: string | null;
  reason: string;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
  createdAt: number;
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
