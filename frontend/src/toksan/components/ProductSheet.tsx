// "Pilih Produk": semua produk aktif per dapur, centang banyak sekaligus, sesi & Rijal/Nisaa dipilih sekali di atas.
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { ChipToggle } from "@/toksan/components/ChipToggle";
import { DAPUR_LABEL, PIHAK_LABEL, SESI_LABEL, formatRupiah } from "@/toksan/format";
import type { InputRow } from "@/toksan/logic/inputRows";
import { DAPUR_LIST, PIHAK_LIST, SESI_LIST, type Dapur, type Pihak, type Produk, type Sesi } from "@/toksan/types";

const SESI_OPTIONS = SESI_LIST.map((value) => ({ value, label: SESI_LABEL[value] }));
const PIHAK_OPTIONS = PIHAK_LIST.map((value) => ({ value, label: PIHAK_LABEL[value] }));

interface ProductSheetProps {
  produk: Produk[];
  /** Rows already on the day: a product with the same sesi + pihak is shown as "sudah ada". */
  rows: InputRow[];
  serverRows?: InputRow[];
  initialSesi: Sesi;
  initialPihak: Pihak | null;
  onAdd: (picked: Produk[], sesi: Sesi, pihak: Pihak) => void;
  onClose: () => void;
}

export function ProductSheet({ produk, rows, serverRows = [], initialSesi, initialPihak, onAdd, onClose }: ProductSheetProps) {
  const [sesi, setSesi] = useState<Sesi>(initialSesi);
  const [pihak, setPihak] = useState<Pihak | null>(initialPihak);
  const [tab, setTab] = useState<Dapur>("bakery");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active = useMemo(
    () => produk.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "id")),
    [produk],
  );
  const allRows = useMemo(() => [...rows, ...serverRows], [rows, serverRows]);
  const already = useMemo(
    () => new Set(pihak ? allRows.filter((r) => r.sesi === sesi && r.pihak === pihak).map((r) => r.productId) : []),
    [allRows, sesi, pihak],
  );
  const q = query.trim().toLowerCase();
  const shown = q ? active.filter((p) => p.name.toLowerCase().includes(q)) : active.filter((p) => p.dapur === tab);
  const toAdd = active.filter((p) => picked.has(p.id) && !already.has(p.id));
  const countIn = (d: Dapur) => toAdd.filter((p) => p.dapur === d).length;

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center md:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pilih Produk"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl md:rounded-3xl font-['Hanken_Grotesk',system-ui,sans-serif]"
      >
        <header className="flex items-center justify-between border-b border-[#F3F4F6] px-5 pb-3 pt-4">
          <h2 className="text-lg font-bold text-[#111827]">Pilih Produk</h2>
          <button type="button" aria-label="Tutup" onClick={onClose} className="rounded-full p-2 text-[#6B7280] hover:bg-[#F3F4F6]">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-3 border-b border-[#F3F4F6] px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="w-24 text-sm font-semibold text-[#374151]">Sesi</span>
            <ChipToggle label="Sesi" options={SESI_OPTIONS} value={sesi} onChange={setSesi} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="w-24 text-sm font-semibold text-[#374151]">Rijal / Nisaa</span>
            <ChipToggle label="Pihak" options={PIHAK_OPTIONS} value={pihak} onChange={setPihak} invalid={!pihak && picked.size > 0} />
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 py-2 focus-within:border-[#FBBF24]">
            <Search className="h-4 w-4 text-[#9CA3AF]" aria-hidden="true" />
            <input
              aria-label="Cari produk"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari di semua dapur (opsional)"
              className="w-full bg-transparent text-base text-[#111827] outline-none placeholder:text-[#9CA3AF]"
            />
          </label>
          {!q && (
            <div role="tablist" aria-label="Dapur" className="flex gap-2 overflow-x-auto">
              {DAPUR_LIST.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={tab === d}
                  onClick={() => setTab(d)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${
                    tab === d ? "bg-[#111827] text-white" : "bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]"
                  }`}
                >
                  {DAPUR_LABEL[d]}{countIn(d) > 0 ? ` · ${countIn(d)}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <ul className="min-h-[200px] flex-1 divide-y divide-[#F3F4F6] overflow-y-auto px-2">
          {shown.length === 0 && <li className="px-3 py-8 text-center text-sm text-[#6B7280]">Produk tidak ditemukan.</li>}
          {shown.map((p) => {
            const exists = already.has(p.id);
            const checked = picked.has(p.id) && !exists;
            return (
              <li key={p.id}>
                <label className={`flex items-center gap-3 rounded-xl px-3 py-3 ${exists ? "opacity-60" : "cursor-pointer hover:bg-[#FFFBEB]"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={exists}
                    onChange={() => toggle(p.id)}
                    className="h-5 w-5 shrink-0 accent-[#F59E0B]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-[#111827]">{p.name}</span>
                    {q && <span className="block text-xs text-[#6B7280]">{DAPUR_LABEL[p.dapur]}</span>}
                  </span>
                  {exists && <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-xs font-semibold text-[#6B7280]">sudah ada</span>}
                  <span className="shrink-0 text-sm font-semibold text-[#374151]">{formatRupiah(p.harga)}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <footer className="border-t border-[#F3F4F6] px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {!pihak && <p className="mb-2 text-sm font-semibold text-red-600">Pilih Rijal atau Nisaa dulu.</p>}
          <button
            type="button"
            disabled={!pihak || toAdd.length === 0}
            onClick={() => { if (pihak) onAdd(toAdd, sesi, pihak); }}
            className="w-full rounded-full bg-[#FBBF24] px-5 py-3 text-base font-bold text-[#111827] shadow-sm hover:bg-[#F59E0B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {toAdd.length > 0 ? `Tambahkan ${toAdd.length} produk` : "Tambahkan"}
            {pihak && toAdd.length > 0 && <span aria-hidden="true">{` · ${SESI_LABEL[sesi]} · ${PIHAK_LABEL[pihak]}`}</span>}
          </button>
        </footer>
      </div>
    </div>
  );
}
