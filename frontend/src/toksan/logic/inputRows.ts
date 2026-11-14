// Baris di halaman Input Harian: tambah produk, centang massal sesi/pihak, validasi sebelum simpan.
import type { Dapur, Penjualan, PenjualanInput, Pihak, Produk, Sesi } from "@/toksan/types";

export interface InputRow extends PenjualanInput {
  key: string;
  productName: string;
  dapur: Dapur;
  harga: number;
  selected: boolean;
}

export type RowProblem = "sesi" | "pihak" | "jumlah" | "retur" | "duplikat";

/** Only whole numbers can be typed; an empty box means "not filled". */
export const digitsOnly = (raw: string): number | null => {
  const digits = raw.replace(/\D/g, "");
  return digits === "" ? null : Number(digits);
};

let counter = 0;
const newKey = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

export function fromPenjualan(rows: Penjualan[]): InputRow[] {
  return rows.map((r) => ({
    key: r.id,
    id: r.id,
    productId: r.productId,
    productName: r.productName,
    dapur: r.dapur,
    harga: r.harga,
    sesi: r.sesi,
    pihak: r.pihak,
    jumlah: r.jumlah,
    retur: r.retur,
    selected: false,
  }));
}

/** Adds a row for `produk`; an existing row of the same product and sesi still waiting for its pihak is focused instead. */
export function addProduct(rows: InputRow[], produk: Produk, lastSesi: Sesi | null): { rows: InputRow[]; focusKey: string } {
  const pending = rows.find((r) => r.productId === produk.id && r.sesi === lastSesi && r.pihak === null);
  if (pending) return { rows, focusKey: pending.key };
  const row: InputRow = {
    key: newKey(),
    productId: produk.id,
    productName: produk.name,
    dapur: produk.dapur,
    harga: produk.harga,
    sesi: lastSesi,
    pihak: null,
    jumlah: null,
    retur: null,
    selected: false,
  };
  return { rows: [...rows, row], focusKey: row.key };
}

/**
 * Adds every picked product as a complete row (sesi + pihak set; only jumlah/retur left to type).
 * A product already on the day for the same sesi and pihak is skipped, not doubled.
 * Focus goes to the first new row, or to the first skipped one when nothing was new.
 */
export function addProducts(
  rows: InputRow[], picked: Produk[], sesi: Sesi, pihak: Pihak,
): { rows: InputRow[]; focusKey: string | null; skipped: string[] } {
  const existing = new Map(rows.filter((r) => r.sesi === sesi && r.pihak === pihak).map((r) => [r.productId, r.key]));
  const added: InputRow[] = [];
  const skipped: string[] = [];
  let firstSkippedKey: string | null = null;
  for (const p of picked) {
    const key = existing.get(p.id);
    if (key) {
      skipped.push(p.name);
      firstSkippedKey ??= key;
      continue;
    }
    const row: InputRow = {
      key: newKey(), productId: p.id, productName: p.name, dapur: p.dapur, harga: p.harga,
      sesi, pihak, jumlah: null, retur: null, selected: false,
    };
    existing.set(p.id, row.key);
    added.push(row);
  }
  return { rows: added.length ? [...rows, ...added] : rows, focusKey: added[0]?.key ?? firstSkippedKey, skipped };
}

export function applyToSelected(rows: InputRow[], patch: { sesi?: Sesi; pihak?: Pihak }): InputRow[] {
  return rows.map((r) => (r.selected ? { ...r, ...patch } : r));
}

const isCount = (n: number | null): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/** Problems per row key; an empty object means the day can be saved. */
export function validateRows(rows: InputRow[], serverRows: InputRow[] = []): Record<string, RowProblem[]> {
  const problems: Record<string, RowProblem[]> = {};
  const seen = new Set<string>();
  const serverKeys = new Set(
    serverRows
      .filter((s) => s.sesi && s.pihak)
      .map((s) => `${s.productId}|${s.sesi}|${s.pihak}`),
  );
  for (const r of rows) {
    const list: RowProblem[] = [];
    if (!r.sesi) list.push("sesi");
    if (!r.pihak) list.push("pihak");
    if (!isCount(r.jumlah)) list.push("jumlah");
    if (r.retur !== null && (!isCount(r.retur) || (isCount(r.jumlah) && r.retur > r.jumlah))) list.push("retur");
    if (r.sesi && r.pihak) {
      const key = `${r.productId}|${r.sesi}|${r.pihak}`;
      if (seen.has(key) || (!r.id && serverKeys.has(key))) list.push("duplikat");
      seen.add(key);
    }
    if (list.length) problems[r.key] = list;
  }
  return problems;
}

export function rowTotal(row: Pick<InputRow, "jumlah" | "retur" | "harga">): { terjual: number; total: number } {
  const terjual = Math.max(0, (row.jumlah ?? 0) - (row.retur ?? 0));
  return { terjual, total: terjual * row.harga };
}

export const dayTotal = (rows: InputRow[]) => rows.reduce((sum, r) => sum + rowTotal(r).total, 0);

/** Valid rows → the body of PUT /penjualan (empty retur counts as 0). */
export function toPayload(rows: InputRow[]): PenjualanInput[] {
  return rows.map((r) => ({
    ...(r.id ? { id: r.id } : {}),
    productId: r.productId,
    sesi: r.sesi,
    pihak: r.pihak,
    jumlah: r.jumlah,
    retur: r.retur ?? 0,
  }));
}
