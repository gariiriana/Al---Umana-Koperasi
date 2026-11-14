// Input Harian Toksan: pilih produk, centang sesi & pihak sekaligus, ketik jumlah & retur saja.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { ToksanApiError, getPenjualan, listProduk, savePenjualan } from "@/toksan/api";
import { ChipToggle } from "@/toksan/components/ChipToggle";
import { ProductPicker } from "@/toksan/components/ProductPicker";
import { DAPUR_LABEL, PIHAK_LABEL, SESI_LABEL, formatAngka, formatRupiah, formatTanggalPanjang, toksanErrorMessage } from "@/toksan/format";
import {
  addProduct, applyToSelected, dayTotal, digitsOnly, fromPenjualan, rowTotal, toPayload, validateRows, type InputRow, type RowProblem,
} from "@/toksan/logic/inputRows";
import { todayWib } from "@/toksan/logic/period";
import { PIHAK_LIST, SESI_LIST, type Produk, type Sesi } from "@/toksan/types";

const SESI_OPTIONS = SESI_LIST.map((value) => ({ value, label: SESI_LABEL[value] }));
const PIHAK_OPTIONS = PIHAK_LIST.map((value) => ({ value, label: PIHAK_LABEL[value] }));

const PROBLEM_TEXT: Record<RowProblem, string> = {
  sesi: "pilih sesi",
  pihak: "pilih Rijal/Nisaa",
  jumlah: "isi jumlah",
  retur: "retur melebihi jumlah",
  duplikat: "dobel (produk, sesi & pihak sama)",
};

// Draft per tanggal di browser ini: pindah menu / tutup aplikasi tidak menghapus isian yang belum disimpan.
interface Draft { rows: InputRow[]; hapus: string[] }
const draftKey = (tanggal: string) => `toksan:input-draft:${tanggal}`;
function readDraft(tanggal: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(tanggal));
    const draft = raw ? (JSON.parse(raw) as Draft) : null;
    return draft && Array.isArray(draft.rows) && Array.isArray(draft.hapus) ? draft : null;
  } catch {
    return null;
  }
}
function writeDraft(tanggal: string, draft: Draft) {
  try { localStorage.setItem(draftKey(tanggal), JSON.stringify(draft)); } catch { /* storage penuh/diblok: tetap jalan tanpa draft */ }
}
function clearDraft(tanggal: string) {
  try { localStorage.removeItem(draftKey(tanggal)); } catch { /* ignore */ }
}

const BULK_BUTTON =
  "rounded-full border border-[#F59E0B] bg-white px-3 py-1.5 text-sm font-semibold text-[#92400E] hover:bg-[#FEF3C7] disabled:cursor-not-allowed disabled:opacity-40";

export function InputHarianPage() {
  const { showToast } = useToast();
  const today = todayWib();
  const [tanggal, setTanggal] = useState(today);
  const [produk, setProduk] = useState<Produk[]>([]);
  const [rows, setRows] = useState<InputRow[]>([]);
  const [hapus, setHapus] = useState<string[]>([]);
  const [lastSesi, setLastSesi] = useState<Sesi>("pagi");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [serverRows, setServerRows] = useState<InputRow[]>([]);
  const [draftRestored, setDraftRestored] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const loadSeq = useRef(0);

  const load = useCallback(async (date: string) => {
    // Rows of the previous date never stay on screen under a new date; only the latest request may fill the page.
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(false);
    setRows([]);
    setHapus([]);
    setDirty(false);
    setDraftRestored(false);
    try {
      const [list, saved] = await Promise.all([listProduk(), getPenjualan(date)]);
      if (seq !== loadSeq.current) return;
      const fromServer = fromPenjualan(saved);
      setProduk(list);
      setServerRows(fromServer);
      const draft = readDraft(date);
      if (draft) {
        setRows(draft.rows);
        setHapus(draft.hapus);
        setDirty(true);
        setDraftRestored(true);
      } else {
        setRows(fromServer);
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setLoadError(true);
      showToast({ message: toksanErrorMessage(err), variant: "error" });
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(tanggal); }, [load, tanggal]);

  useEffect(() => {
    if (dirty && !loading) writeDraft(tanggal, { rows, hapus });
  }, [dirty, loading, tanggal, rows, hapus]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (focusKey) rowRefs.current.get(focusKey)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [focusKey]);

  const problems = useMemo(() => validateRows(rows), [rows]);
  const problemCount = Object.keys(problems).length;
  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const update = (next: InputRow[]) => {
    setRows(next);
    setDirty(true);
  };
  const patchRow = (key: string, patch: Partial<InputRow>) => update(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggleSelect = (key: string) => setRows(rows.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));

  const onPick = (p: Produk) => {
    if (loading || loadError) return;
    const result = addProduct(rows, p, lastSesi);
    if (result.rows !== rows) update(result.rows);
    setFocusKey(result.focusKey);
  };

  const removeRow = (row: InputRow) => {
    if (row.id) setHapus((ids) => [...ids, row.id as string]);
    update(rows.filter((r) => r.key !== row.key));
  };

  const changeDate = (next: string) => {
    if (!next || next === tanggal) return;
    if (dirty && !window.confirm("Perubahan belum disimpan. Pindah tanggal dan buang perubahan?")) return;
    if (dirty) clearDraft(tanggal);
    // Same render as the date change, so the draft effect never files these rows under the new date.
    setRows([]);
    setHapus([]);
    setDirty(false);
    setLoading(true);
    setTanggal(next);
  };

  const discardDraft = () => {
    clearDraft(tanggal);
    setRows(serverRows);
    setHapus([]);
    setDirty(false);
    setDraftRestored(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await savePenjualan(tanggal, toPayload(rows), hapus);
      const fresh = fromPenjualan(saved);
      clearDraft(tanggal);
      setRows(fresh);
      setServerRows(fresh);
      setHapus([]);
      setDirty(false);
      setDraftRestored(false);
      setFocusKey(null);
      showToast({ message: "Penjualan tersimpan.", variant: "success" });
    } catch (err) {
      const index = err instanceof ToksanApiError ? err.details?.row : undefined;
      if (index !== undefined && rows[index]) setFocusKey(rows[index].key);
      showToast({ message: toksanErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-40 font-['Hanken_Grotesk',system-ui,sans-serif] md:pb-28">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Input Harian</h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">{formatTanggalPanjang(tanggal)}</p>
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

      <ProductPicker produk={produk} onPick={onPick} />

      <div
        role="toolbar"
        aria-label="Ubah yang dicentang"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3"
      >
        <label className="flex items-center gap-2 text-sm font-semibold text-[#374151]">
          <input
            type="checkbox"
            aria-label="Pilih semua"
            checked={allSelected}
            disabled={rows.length === 0}
            onChange={() => setRows(rows.map((r) => ({ ...r, selected: !allSelected })))}
            className="h-5 w-5 accent-[#F59E0B]"
          />
          {selectedCount > 0 ? `${selectedCount} dicentang` : "Centang semua"}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {SESI_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={selectedCount === 0}
              onClick={() => { update(applyToSelected(rows, { sesi: o.value })); setLastSesi(o.value); }}
              className={BULK_BUTTON}
            >
              {o.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-[#FCD34D]" aria-hidden="true" />
          {PIHAK_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={selectedCount === 0}
              onClick={() => update(applyToSelected(rows, { pihak: o.value }))}
              className={BULK_BUTTON}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {draftRestored && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#FCD34D] bg-[#FEF3C7] px-4 py-3 text-sm text-[#92400E]">
          <span className="font-semibold">Isian yang belum disimpan sudah dipulihkan. Cek lalu tekan Simpan.</span>
          <button type="button" onClick={discardDraft} className="rounded-full border border-[#F59E0B] bg-white px-3 py-1 font-semibold hover:bg-[#FFFBEB]">
            Buang draft
          </button>
        </div>
      )}

      {loading ? (
        <p role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-6 text-[#6B7280]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memuat...
        </p>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
          <p className="text-base font-bold text-red-700">Data tanggal ini gagal dimuat.</p>
          <p className="mt-1 text-sm text-red-600">Cek koneksi, lalu coba lagi.</p>
          <button type="button" onClick={() => void load(tanggal)} className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-bold text-red-700 shadow-sm hover:bg-red-100">
            Coba lagi
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-6 py-10 text-center">
          <p className="text-lg font-bold text-[#111827]">Belum ada penjualan di tanggal ini</p>
          <p className="mt-1 text-sm text-[#6B7280]">Cari produk di atas untuk mulai menambah.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const issues = problems[row.key] ?? [];
            const { terjual, total } = rowTotal(row);
            const focused = focusKey === row.key;
            return (
              <li
                key={row.key}
                ref={(el) => { if (el) rowRefs.current.set(row.key, el); else rowRefs.current.delete(row.key); }}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors ${
                  focused ? "border-[#F59E0B] ring-2 ring-[#FDE68A]" : issues.length ? "border-[#FCA5A5]" : "border-[#E5E7EB]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Pilih ${row.productName}`}
                    checked={row.selected}
                    onChange={() => toggleSelect(row.key)}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#F59E0B]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-[#111827]">{row.productName}</p>
                    <p className="text-xs text-[#6B7280]">{DAPUR_LABEL[row.dapur]} · {formatRupiah(row.harga)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Hapus ${row.productName}`}
                    onClick={() => removeRow(row)}
                    className="rounded-full p-2 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <ChipToggle
                      label={`Sesi ${row.productName}`}
                      options={SESI_OPTIONS}
                      value={row.sesi}
                      invalid={issues.includes("sesi")}
                      size="sm"
                      onChange={(sesi) => { patchRow(row.key, { sesi }); setLastSesi(sesi); }}
                    />
                    <ChipToggle
                      label={`Pihak ${row.productName}`}
                      options={PIHAK_OPTIONS}
                      value={row.pihak}
                      invalid={issues.includes("pihak") || issues.includes("duplikat")}
                      size="sm"
                      onChange={(pihak) => patchRow(row.key, { pihak })}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex-1 text-xs font-semibold text-[#6B7280]">
                      Jumlah
                      <input
                        inputMode="numeric"
                        aria-label={`Jumlah ${row.productName}`}
                        value={row.jumlah ?? ""}
                        onChange={(e) => patchRow(row.key, { jumlah: digitsOnly(e.target.value) })}
                        className={`mt-1 w-full rounded-xl border px-3 py-2 text-base font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FDE68A] ${
                          issues.includes("jumlah") ? "border-red-400" : "border-[#E5E7EB]"
                        }`}
                      />
                    </label>
                    <label className="flex-1 text-xs font-semibold text-[#6B7280]">
                      Retur
                      <input
                        inputMode="numeric"
                        aria-label={`Retur ${row.productName}`}
                        value={row.retur ?? ""}
                        placeholder="0"
                        onChange={(e) => patchRow(row.key, { retur: digitsOnly(e.target.value) })}
                        className={`mt-1 w-full rounded-xl border px-3 py-2 text-base font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FDE68A] ${
                          issues.includes("retur") ? "border-red-400" : "border-[#E5E7EB]"
                        }`}
                      />
                    </label>
                    <div className="min-w-[96px] pb-2 text-right">
                      <p className="text-xs text-[#6B7280]">Terjual {formatAngka(terjual)}</p>
                      <p className="text-sm font-bold text-[#111827]">{formatRupiah(total)}</p>
                    </div>
                  </div>
                </div>
                {issues.length > 0 && (
                  <p className="mt-2 text-xs font-semibold text-red-600">Belum lengkap: {issues.map((i) => PROBLEM_TEXT[i]).join(", ")}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-30 px-4 md:bottom-4 md:left-60">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#6B7280]">Total hari ini{problemCount > 0 ? ` · ${problemCount} baris belum lengkap` : ""}</p>
            <p data-testid="total-hari" className="text-lg font-bold text-[#111827]">{formatRupiah(dayTotal(rows))}</p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading || loadError || !dirty || problemCount > 0}
            className="flex items-center gap-2 rounded-full bg-[#FBBF24] px-5 py-3 text-base font-bold text-[#111827] shadow-sm hover:bg-[#F59E0B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Save className="h-5 w-5" aria-hidden="true" />}
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
