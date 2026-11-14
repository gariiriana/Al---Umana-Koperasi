// Klien Worker Toksan (/api/toksan/*). Data penjualan tidak pernah lewat Firestore.
import { auth } from "@/lib/firebase";
import type { Me, Obral, ObralInput, Penjualan, PenjualanInput, Produk, ProdukInput, RekapData } from "@/toksan/types";

const BASE = `${import.meta.env.VITE_TOKSAN_API_BASE_URL ?? ""}/api/toksan`;

export interface ToksanErrorDetails {
  row?: number;
  field?: string;
}

export class ToksanApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ToksanErrorDetails;

  constructor(code: string, status: number, details?: ToksanErrorDetails) {
    super(code);
    this.name = "ToksanApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function toksanFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = await auth.currentUser?.getIdToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ToksanApiError("JARINGAN", 0);
  }
  // Path /api yang belum dirutekan ke Worker dibalas index.html SPA dengan status 200.
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw new ToksanApiError("LAYANAN_TIDAK_TERSEDIA", response.status);
  }
  const body = await response.json().catch(() => {
    throw new ToksanApiError("LAYANAN_TIDAK_TERSEDIA", response.status);
  });
  if (!response.ok) throw new ToksanApiError(body?.error?.code ?? "INTERNAL", response.status, body?.error?.details);
  return body as T;
}

const send = <T>(method: string, path: string, body: unknown) => toksanFetch<T>(path, { method, body: JSON.stringify(body) });

export const getMe = () => toksanFetch<Me>("/me");

export const listProduk = async () => (await toksanFetch<{ produk: Produk[] }>("/produk")).produk;
export const createProduk = async (input: ProdukInput) => (await send<{ produk: Produk }>("POST", "/produk", input)).produk;
export const updateProduk = async (id: string, patch: Partial<ProdukInput & { active: boolean }>) =>
  (await send<{ produk: Produk }>("PATCH", `/produk/${encodeURIComponent(id)}`, patch)).produk;

export const getPenjualan = async (tanggal: string) =>
  (await toksanFetch<{ rows: Penjualan[] }>(`/penjualan?tanggal=${tanggal}`)).rows;
export const savePenjualan = async (tanggal: string, rows: PenjualanInput[], hapus: string[]) =>
  (await send<{ rows: Penjualan[] }>("PUT", "/penjualan", { tanggal, rows, hapus })).rows;

export const getObral = async (tanggal: string) => (await toksanFetch<{ rows: Obral[] }>(`/obral?tanggal=${tanggal}`)).rows;
export const saveObral = async (tanggal: string, rows: ObralInput[], hapus: string[]) =>
  (await send<{ rows: Obral[] }>("PUT", "/obral", { tanggal, rows, hapus })).rows;

export const getRekap = (dari: string, sampai: string) => toksanFetch<RekapData>(`/rekap?dari=${dari}&sampai=${sampai}`);
