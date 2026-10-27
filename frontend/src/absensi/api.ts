// Klien Worker absensi (/api/absensi/*). Tidak memakai Firestore sama sekali.
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import { getAbsensiAuth } from "@/absensi/firebaseAbsensi";
import type {
  AbsenKind, AbsenOptions, AbsenResult, AbsensiRole, ActivateOptions, AreaView, EmployeeView, HariIniRow,
  LocationInput, Me, RekapRow, ShiftView,
} from "@/absensi/types";

const BASE = `${import.meta.env.VITE_ABSENSI_API_BASE_URL ?? ""}/api/absensi`;

export class AbsensiApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: { distanceM?: number | null };

  constructor(code: string, status: number, details?: { distanceM?: number | null }) {
    super(code);
    this.name = "AbsensiApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await getAbsensiAuth().currentUser?.getIdToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  try {
    return await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new AbsensiApiError("JARINGAN", 0);
  }
}

export async function absensiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(path, init);
  // Path /api yang tidak dirutekan ke Worker dibalas index.html SPA dengan status 200.
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw new AbsensiApiError("LAYANAN_TIDAK_TERSEDIA", response.status);
  }
  const body = await response.json().catch(() => {
    throw new AbsensiApiError("LAYANAN_TIDAK_TERSEDIA", response.status);
  });
  if (!response.ok) {
    throw new AbsensiApiError(body?.error?.code ?? "INTERNAL", response.status, body?.error?.details);
  }
  return body as T;
}

const post = <T>(path: string, body: unknown, method = "POST") =>
  absensiFetch<T>(path, { method, body: JSON.stringify(body) });

// --- Karyawan ---------------------------------------------------------------

export const getMe = () => absensiFetch<Me>("/me");

export const activateOptions = () => post<ActivateOptions>("/activate/options", {});

export interface ActivateBody {
  challengeId: string;
  consent: true;
  registration: RegistrationResponseJSON;
  location: LocationInput;
  reference: { jpegBase64: string; descriptor: number[] | null };
}
export const activate = (body: ActivateBody) => post<Me>("/activate", body);

export const absenOptions = (kind: AbsenKind) => post<AbsenOptions>("/absen/options", { kind });

export interface AbsenBody {
  challengeId: string;
  kind: AbsenKind;
  location: LocationInput;
  selfieBase64: string;
  faceDistance: number | null;
  authentication: AuthenticationResponseJSON;
}
export const absen = (body: AbsenBody) => post<AbsenResult>("/absen", body);

export const getRiwayat = (bulan: string) =>
  absensiFetch<{ rows: ShiftView[] }>(`/riwayat?bulan=${encodeURIComponent(bulan)}`);

// --- Admin ------------------------------------------------------------------

export const getHariIni = () => absensiFetch<{ date: string; rows: HariIniRow[] }>("/admin/hari-ini");

export function getRekap(q: { from: string; to: string; uid?: string }) {
  const params = new URLSearchParams({ from: q.from, to: q.to });
  if (q.uid) params.set("uid", q.uid);
  return absensiFetch<{ rows: RekapRow[] }>(`/admin/rekap?${params}`);
}

/** Object URL untuk satu foto, atau null kalau sudah dihapus (lewat 90 hari). */
export async function fetchPhotoUrl(id: string): Promise<string | null> {
  const response = await authorizedFetch(`/admin/foto/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new AbsensiApiError("INTERNAL", response.status);
  return URL.createObjectURL(await response.blob());
}

export const listEmployees = () => absensiFetch<{ employees: EmployeeView[] }>("/admin/karyawan");

export interface CreateEmployeeInput {
  name: string;
  email: string;
  password: string;
  role: AbsensiRole;
  faceRequired: boolean;
}
export const createEmployee = (input: CreateEmployeeInput) => post<EmployeeView>("/admin/karyawan", input);

export type PatchEmployeeBody =
  | { action: "nonaktifkan" | "aktifkan" | "reset_perangkat" }
  | { action: "set_face_required"; faceRequired: boolean };
export const patchEmployee = (uid: string, body: PatchEmployeeBody) =>
  post<EmployeeView>(`/admin/karyawan/${encodeURIComponent(uid)}`, body, "PATCH");

export const getAreas = () => absensiFetch<{ areas: AreaView[] }>("/admin/area");

export const putAreas = (areas: Array<Omit<AreaView, "id"> & { id?: string }>) =>
  post<{ areas: AreaView[] }>("/admin/area", { areas }, "PUT");
