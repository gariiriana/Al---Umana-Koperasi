// Obral: produk dari dapur mana pun dijual lagi dengan harga yang diketik admin.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Tag, Trash2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { getObral, listProduk, saveObral } from "@/toksan/api";
import { ProductSheet } from "@/toksan/components/ProductSheet";
import { DAPUR_LABEL, formatRupiah, formatTanggalPanjang, toksanErrorMessage } from "@/toksan/format";
import { digitsOnly } from "@/toksan/logic/inputRows";
import { todayWib } from "@/toksan/logic/period";
import type { Dapur, Obral, ObralInput, Produk } from "@/toksan/types";

interface ObralRow {
  key: string;
  id?: string;
  productId: string;
  productName: string;
  dapur: Dapur;
  hargaNormal: number;
  hargaObral: number | null;
  jumlah: number | null;
  catatan: string;
}

let counter = 0;
const fromSaved = (rows: Obral[]): ObralRow[] => rows.map((r) => ({
  key: r.id, id: r.id, productId: r.productId, productName: r.productName, dapur: r.dapur,
  hargaNormal: r.hargaNormal, hargaObral: r.hargaObral, jumlah: r.jumlah, catatan: r.catatan ?? "",
}));
const isValid = (r: ObralRow) => r.hargaObral !== null && r.jumlah !== null && r.jumlah >= 1;
const rowTotal = (r: ObralRow) => (r.hargaObral ?? 0) * (r.jumlah ?? 0);

export function ObralPage() {
  const { showToast } = useToast();
  const today = todayWib();
  const [tanggal, setTanggal] = useState(today);
  const [produk, setProduk] = useState<Produk[]>([]);
  const [rows, setRows] = useState<ObralRow[]>([]);
  const [hapus, setHapus] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [list, saved] = await Promise.all([listProduk(), getObral(date)]);
      setProduk(list);
      setRows(fromSaved(saved));
      setHapus([]);
      setDirty(false);
    } catch (err) {
      showToast({ message: toksanErrorMessage(err), variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(tanggal); }, [load, tanggal]);

  const update = (next: ObralRow[]) => { setRows(next); setDirty(true); };
  const patch = (key: string, change: Partial<ObralRow>) => update(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const invalidCount = useMemo(() => rows.filter((r) => !isValid(r)).length, [rows]);
  const total = rows.reduce((sum, r) => sum + rowTotal(r), 0);

  const [sheetOpen, setSheetOpen] = useState(false);
  const onPick = (picked: Produk[]) => {
    update([...rows, ...picked.map((p) => ({
      key: `o${(counter++).toString(36)}`, productId: p.id, productName: p.name, dapur: p.dapur,
      hargaNormal: p.harga, hargaObral: null, jumlah: null, catatan: "",
    }))]);
    setSheetOpen(false);
  };

  const remove = (row: ObralRow) => {
    if (row.id) setHapus((ids) => [...ids, row.id as string]);
    update(rows.filter((r) => r.key !== row.key));
  };

  const changeDate = (next: string) => {
    if (!next || next === tanggal) return;
    if (dirty && !window.confirm("Perubahan belum disimpan. Pindah tanggal dan buang perubahan?")) return;
    setTanggal(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: ObralInput[] = rows.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        productId: r.productId,
        hargaObral: r.hargaObral as number,
        jumlah: r.jumlah as number,
        catatan: r.catatan.trim() || null,
      }));
      setRows(fromSaved(await saveObral(tanggal, payload, hapus)));
      setHapus([]);
      setDirty(false);
      showToast({ message: "Obral tersimpan.", variant: "success" });
    } catch (err) {
      showToast({ message: toksanErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const numberField = "mt-1 w-full rounded-xl border px-3 py-2 text-base font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FDE68A]";

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-3 sm:px-4 py-4 sm:py-5 pb-52 font-['Hanken_Grotesk',system-ui,sans-serif] md:pb-28">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Obral</h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">{formatTanggalPanjang(tanggal)} · harga obral diisi sendiri</p>
        </div>
        <label className="text-sm font-semibold text-[#374151]">
          Tanggal
          <input
            type="date"
            value={tanggal}
            max={today}
            onChange={(e) => changeDate(e.target.value)}
            className="ml-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-base text-[#111827] focus:border-[#FBBF24] focus:outline-none"
          />
        </label>
      </header>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#F59E0B] bg-white px-4 py-4 text-base font-bold text-[#B45309] hover:bg-[#FFFBEB]"
      >
        <Plus className="h-5 w-5 text-[#B45309]" aria-hidden="true" /> Pilih Produk
      </button>
      {sheetOpen && (
        <ProductSheet
          forObral
          produk={produk}
          rows={[]}
          initialSesi="pagi"
          initialPihak={null}
          onAdd={(picked) => onPick(picked)}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {loading ? (
        <p role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-6 text-[#6B7280]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memuat...
        </p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-6 py-10 text-center">
          <Tag className="h-10 w-10 text-[#D1D5DB]" aria-hidden="true" />
          <p className="text-lg font-bold text-[#111827]">Belum ada obral di tanggal ini</p>
          <p className="text-sm text-[#6B7280]">Tekan "Pilih Produk" di atas, lalu ketik harga obral dan jumlahnya.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.key} aria-label={`Obral ${row.productName}`} className={`rounded-2xl border bg-white p-4 shadow-sm ${isValid(row) ? "border-[#E5E7EB]" : "border-[#FCA5A5]"}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-[#111827]">{row.productName}</p>
                  <p className="text-xs text-[#6B7280]">{DAPUR_LABEL[row.dapur]} · Normal {formatRupiah(row.hargaNormal)}</p>
                </div>
                <button type="button" aria-label={`Hapus obral ${row.productName}`} onClick={() => remove(row)} className="rounded-full p-2 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
                <label className="text-xs font-semibold text-[#6B7280]">
                  Harga obral
                  <input
                    inputMode="numeric"
                    aria-label={`Harga obral ${row.productName}`}
                    value={row.hargaObral ?? ""}
                    onChange={(e) => patch(row.key, { hargaObral: digitsOnly(e.target.value) })}
                    className={`${numberField} ${row.hargaObral === null ? "border-red-400" : "border-[#E5E7EB]"}`}
                  />
                </label>
                <label className="text-xs font-semibold text-[#6B7280]">
                  Jumlah
                  <input
                    inputMode="numeric"
                    aria-label={`Jumlah obral ${row.productName}`}
                    value={row.jumlah ?? ""}
                    onChange={(e) => patch(row.key, { jumlah: digitsOnly(e.target.value) })}
                    className={`${numberField} ${row.jumlah === null || row.jumlah < 1 ? "border-red-400" : "border-[#E5E7EB]"}`}
                  />
                </label>
                <label className="col-span-2 text-xs font-semibold text-[#6B7280] sm:col-span-1">
                  Catatan (opsional)
                  <input
                    aria-label={`Catatan obral ${row.productName}`}
                    value={row.catatan}
                    maxLength={200}
                    placeholder="mis. sisa kemarin"
                    onChange={(e) => patch(row.key, { catatan: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FDE68A]"
                  />
                </label>
                <p className="col-span-2 pb-2 text-right text-sm font-bold text-[#111827] sm:col-span-1">{formatRupiah(rowTotal(row))}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-30 px-3 sm:px-4 md:bottom-4 md:left-60">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white/95 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-lg backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] sm:text-xs text-[#6B7280]">Total obral{invalidCount > 0 ? ` · ${invalidCount} baris belum lengkap` : ""}</p>
            <p className="text-base sm:text-lg font-bold text-[#111827]">{formatRupiah(total)}</p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty || invalidCount > 0}
            className="flex items-center gap-2 rounded-full bg-[#FBBF24] px-4 py-2 sm:px-5 sm:py-3 text-sm sm:text-base font-bold text-[#111827] shadow-sm hover:bg-[#F59E0B] disabled:cursor-not-allowed disabled:opacity-50 shrink-0 cursor-pointer"
          >
            {saving ? <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />}
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
