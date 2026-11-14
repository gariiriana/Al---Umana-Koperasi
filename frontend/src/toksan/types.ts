// Bentuk data Worker Toksan (/api/toksan/*). Lihat workers/toksan/src/handlers.

export type Dapur = "bakery" | "hangat_saji" | "depan";
export type Kategori = "makanan" | "minuman" | "lainnya";
export type Sesi = "pagi" | "siang" | "sore";
export type Pihak = "rijal" | "nisaa";

export const DAPUR_LIST: readonly Dapur[] = ["bakery", "hangat_saji", "depan"];
export const SESI_LIST: readonly Sesi[] = ["pagi", "siang", "sore"];
export const PIHAK_LIST: readonly Pihak[] = ["rijal", "nisaa"];

export interface Me {
  uid: string;
  role: string;
  name: string;
}

export interface Produk {
  id: string;
  name: string;
  dapur: Dapur;
  kategori: Kategori;
  harga: number;
  active: boolean;
  updatedAt: number;
}

export type ProdukInput = Pick<Produk, "name" | "dapur" | "kategori" | "harga">;

export interface Penjualan {
  id: string;
  tanggal: string;
  productId: string;
  productName: string;
  dapur: Dapur;
  harga: number;
  sesi: Sesi;
  pihak: Pihak;
  jumlah: number;
  retur: number;
  updatedAt: number;
  updatedBy: string;
}

/** A row as the Input page edits it: sesi/pihak/jumlah/retur may still be empty. */
export interface PenjualanInput {
  id?: string;
  productId: string;
  sesi: Sesi | null;
  pihak: Pihak | null;
  jumlah: number | null;
  retur: number | null;
}

export interface Obral {
  id: string;
  tanggal: string;
  productId: string;
  productName: string;
  dapur: Dapur;
  hargaNormal: number;
  hargaObral: number;
  jumlah: number;
  catatan: string | null;
}

export interface ObralInput {
  id?: string;
  productId: string;
  hargaObral: number;
  jumlah: number;
  catatan?: string | null;
}

export interface Sums {
  produksi: number;
  terjual: number;
  retur: number;
  omzet: number;
}

export interface ProdukLine extends Sums {
  productId: string;
  productName: string;
  dapur: Dapur;
}

export interface RekapData {
  dari: string;
  sampai: string;
  totals: Sums & { obralJumlah: number; obralOmzet: number; produkTerjual: number };
  produk: (ProdukLine & { harga: number })[];
  produkPerSesi: (ProdukLine & { harga: number; sesi: Sesi })[];
  produkPerPihak: (ProdukLine & { pihak: Pihak })[];
  perHari: (Sums & { tanggal: string })[];
  perSesi: { sesi: Sesi; terjual: number; omzet: number }[];
  perPihak: { pihak: Pihak; terjual: number; omzet: number }[];
  perDapur: (Sums & { dapur: Dapur })[];
  obral: Obral[];
}
