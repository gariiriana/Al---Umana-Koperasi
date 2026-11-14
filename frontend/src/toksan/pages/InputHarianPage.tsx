// Input Harian Toksan: pilih produk, centang sesi & pihak sekaligus, ketik jumlah & retur saja.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { ToksanApiError, getPenjualan, listProduk, savePenjualan } from "@/toksan/api";
import { ChipToggle } from "@/toksan/components/ChipToggle";
import { ProductSheet } from "@/toksan/components/ProductSheet";
import { DAPUR_LABEL, PIHAK_LABEL, SESI_LABEL, formatAngka, formatRupiah, formatTanggalPanjang, toksanErrorMessage } from "@/toksan/format";
import {
  addProducts, applyToSelected, dayTotal, digitsOnly, fromPenjualan, rowTotal, toPayload, validateRows, type InputRow, type RowProblem,
} from "@/toksan/logic/inputRows";
import { todayWib } from "@/toksan/logic/period";
import { PIHAK_LIST, SESI_LIST, type Pihak, type Produk, type Sesi } from "@/toksan/types";

const SESI_OPTIONS = SESI_LIST.map((value) => ({ value, label: SESI_LABEL[value] }));
const PIHAK_OPTIONS = PIHAK_LIST.map((value) => ({ value, label: PIHAK_LABEL[value] }));

const PROBLEM_TEXT: Record<RowProblem, string> = {
  sesi: "pilih sesi",
  pihak: "pilih Rijal/Nisaa",
  jumlah: "isi jumlah",
  retur: "retur melebihi jumlah",
  duplikat: "dobel (sudah ada untuk sesi & pihak ini)",
};

// Draft per tanggal di browser ini: pindah menu / tutup aplikasi tidak menghapus isian yang belum disimpan.
interface Draft { rows: InputRow[]; hapus: string[] }
const draftKey = (tanggal: string) => `toksan:input-draft:${tanggal}`;
function readDraft(tanggal: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(tanggal));
    const draft = raw ? (JSON.parse(raw) as Draft) : null;
    return draft && Array.isArray(draft.rows) && Array.isArray(draft.hapus) && (draft.rows.length > 0 || draft.hapus.length > 0)
      ? draft
      : null;
  } catch {
    return null;
  }
}
function writeDraft(tanggal: string, draft: Draft) {
  try {
    if (draft.rows.length === 0 && draft.hapus.length === 0) {
      localStorage.removeItem(draftKey(tanggal));
    } else {
      localStorage.setItem(draftKey(tanggal), JSON.stringify(draft));
    }
  } catch { /* storage penuh/diblok: tetap jalan tanpa draft */ }
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
  const [lastPihak, setLastPihak] = useState<Pihak | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
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
    setServerRows([]);
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
      if (draft && draft.rows.length > 0) {
        setRows(draft.rows);
        setHapus(draft.hapus);
        setDirty(true);
        setDraftRestored(true);
      } else {
        clearDraft(date);
        setRows([]);
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
    if (dirty && !loading && (rows.length > 0 || hapus.length > 0)) {
      writeDraft(tanggal, { rows, hapus });
    }
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

  const problems = useMemo(() => validateRows(rows, serverRows), [rows, serverRows]);
  const problemCount = Object.keys(problems).length;
  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const update = (next: InputRow[]) => {
    setRows(next);
    setDirty(true);
  };
  const patchRow = (key: string, patch: Partial<InputRow>) => update(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggleSelect = (key: string) => setRows(rows.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));

  const onAddProducts = (picked: Produk[], sesi: Sesi, pihak: Pihak) => {
    setSheetOpen(false);
    setLastSesi(sesi);
    setLastPihak(pihak);
    if (loading || loadError) return;
    const result = addProducts(rows, picked, sesi, pihak);
    if (result.rows !== rows) update(result.rows);
    setFocusKey(result.focusKey);
    if (result.skipped.length) {
      showToast({ message: `Sudah ada di ${SESI_LABEL[sesi]} · ${PIHAK_LABEL[pihak]}: ${result.skipped.join(", ")}`, variant: "info" });
    }
  };

  const removeRow = (row: InputRow) => {
    if (row.id) setHapus((ids) => [...ids, row.id as string]);
    update(rows.filter((r) => r.key !== row.key));
  };

  const deleteServerRow = async (row: InputRow) => {
    if (!row.id) return;
    const sesiLabel = row.sesi ? SESI_LABEL[row.sesi] : "-";
    const pihakLabel = row.pihak ? PIHAK_LABEL[row.pihak] : "-";
    if (!window.confirm(`Hapus entri ${row.productName} (${sesiLabel} · ${pihakLabel}) dari rekap?`)) return;
    setSaving(true);
    try {
      const saved = await savePenjualan(tanggal, [], [row.id]);
      const fresh = fromPenjualan(saved);
      setServerRows(fresh);
      showToast({ message: `${row.productName} berhasil dihapus dari rekap.`, variant: "success" });
    } catch (err) {
      showToast({ message: toksanErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const editServerRow = (row: InputRow) => {
    if (rows.some((r) => r.id === row.id)) {
      setFocusKey(row.id ?? row.key);
      return;
    }
    update([...rows, { ...row, selected: false }]);
    setFocusKey(row.key);
    showToast({ message: `${row.productName} dimasukkan ke form untuk diedit.`, variant: "info" });
  };

  const changeDate = (next: string) => {
    if (!next || next === tanggal) return;
    if (dirty && !window.confirm("Perubahan belum disimpan. Pindah tanggal dan buang perubahan?")) return;
    if (dirty) clearDraft(tanggal);
    // Same render as the date change, so the draft effect never files these rows under the new date.
    setRows([]);
    setServerRows([]);
    setHapus([]);
    setDirty(false);
    setLoading(true);
    setTanggal(next);
  };

  const discardDraft = () => {
    clearDraft(tanggal);
    setRows([]);
    setHapus([]);
    setDirty(false);
    setDraftRestored(false);
  };

  const save = async () => {
    if (rows.length === 0 && hapus.length === 0) return;
    setSaving(true);
    try {
      const saved = await savePenjualan(tanggal, toPayload(rows), hapus);
      const fresh = fromPenjualan(saved);
      clearDraft(tanggal);
      setRows([]); // Form input harian kosong lagi, siap untuk input sesi berikutnya!
      setServerRows(fresh);
      setHapus([]);
      setDirty(false);
      setDraftRestored(false);
      setFocusKey(null);
      showToast({ message: "Penjualan berhasil disimpan dan masuk ke rekap.", variant: "success" });
    } catch (err) {
      const index = err instanceof ToksanApiError ? err.details?.row : undefined;
      if (index !== undefined && rows[index]) setFocusKey(rows[index].key);
      showToast({ message: toksanErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-3 sm:px-4 py-4 sm:py-5 pb-52 font-['Hanken_Grotesk',system-ui,sans-serif] md:pb-28">
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

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        disabled={loading || loadError}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#F59E0B] bg-white px-4 py-4 text-base font-bold text-[#92400E] shadow-xs hover:bg-[#FFFBEB] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-5 w-5 text-[#B45309]" aria-hidden="true" /> Pilih Produk
      </button>
      {sheetOpen && (
        <ProductSheet
          produk={produk}
          rows={rows}
          serverRows={serverRows}
          initialSesi={lastSesi}
          initialPihak={lastPihak}
          onAdd={onAddProducts}
          onClose={() => setSheetOpen(false)}
        />
      )}

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

      {draftRestored && rows.length > 0 && (
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
          <p className="text-lg font-bold text-[#111827]">
            {serverRows.length > 0 ? "Form input kosong, siap untuk sesi berikutnya" : "Belum ada penjualan di tanggal ini"}
          </p>
          <p className="mt-1 text-sm text-[#6B7280]">
            {serverRows.length > 0
              ? "Tekan \"Pilih Produk\" di atas untuk menambah penjualan sesi Siang / Sore."
              : "Tekan \"Pilih Produk\" di atas untuk mulai menambah."}
          </p>
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

      {serverRows.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 sm:p-4 shadow-xs">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-sm font-bold text-emerald-950">
                  Data Tersimpan di Rekap Hari Ini
                </p>
                <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  {serverRows.length} entri
                </span>
              </div>
              <p className="mt-1 text-xs text-emerald-700">
                Total tersimpan: <span className="font-bold text-emerald-900">{formatRupiah(dayTotal(serverRows))}</span> · Sesi otomatis disatukan di menu Rekap.
              </p>
            </div>
            <a
              href="/toksan/rekap"
              className="inline-flex items-center justify-center self-start sm:self-auto rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 shrink-0"
            >
              Buka Rekap →
            </a>
          </div>

          <div className="mt-3 border-t border-emerald-200/80 pt-3">
            <div className="space-y-2">
              {serverRows.map((sr) => {
                const { terjual, total } = rowTotal(sr);
                const sesiLabel = sr.sesi ? SESI_LABEL[sr.sesi] : "-";
                const pihakLabel = sr.pihak ? PIHAK_LABEL[sr.pihak] : "-";
                return (
                  <div
                    key={sr.id ?? sr.key}
                    className="rounded-xl border border-emerald-100 bg-white p-3 shadow-2xs"
                  >
                    {/* Baris 1: Nama Produk, Sesi-Pihak badge, Harga/pcs di kiri; Total Rupiah & Terjual di kanan */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-sm text-[#111827]">{sr.productName}</span>
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                            {sesiLabel} · {pihakLabel}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#6B7280]">
                          Harga: <span className="font-semibold text-[#374151]">{formatRupiah(sr.harga)}/pcs</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block font-bold text-sm text-[#111827]">{formatRupiah(total)}</span>
                        <span className="block text-[11px] text-[#6B7280]">({formatAngka(terjual)} terjual)</span>
                      </div>
                    </div>

                    {/* Baris 2: Breakdown Jumlah, Retur, Terjual di kiri; Tombol Edit & Hapus di kanan */}
                    <div className="mt-2.5 flex items-center justify-between border-t border-emerald-50/80 pt-2 text-xs">
                      <div className="text-[11px] sm:text-xs text-[#6B7280]">
                        <span>Jml: <strong className="text-[#111827]">{formatAngka(sr.jumlah ?? 0)}</strong></span>
                        <span className="mx-1.5 text-gray-300">·</span>
                        <span>Retur: <strong className="text-[#111827]">{formatAngka(sr.retur ?? 0)}</strong></span>
                        <span className="mx-1.5 text-gray-300">·</span>
                        <span>Terjual: <strong className="text-emerald-700">{formatAngka(terjual)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          aria-label={`Edit ${sr.productName}`}
                          onClick={() => editServerRow(sr)}
                          className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-label={`Hapus ${sr.productName}`}
                          onClick={() => void deleteServerRow(sr)}
                          className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-30 px-3 sm:px-4 md:bottom-4 md:left-60">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white/95 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-lg backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] sm:text-xs text-[#6B7280] truncate">
              {rows.length > 0
                ? `Total input saat ini${problemCount > 0 ? ` · ${problemCount} baris belum lengkap` : ""}`
                : serverRows.length > 0
                ? `Total hari ini (tersimpan di rekap)`
                : `Total hari ini`}
            </p>
            <p data-testid="total-hari" className="text-base sm:text-lg font-bold text-[#111827]">
              {rows.length > 0 ? formatRupiah(dayTotal(rows)) : formatRupiah(dayTotal(serverRows))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading || loadError || rows.length === 0 || !dirty || problemCount > 0}
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
