// Kotak cari produk: ketik sebagian nama, ketuk hasilnya untuk menambah baris. Hanya produk aktif.
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { DAPUR_LABEL, formatRupiah } from "@/toksan/format";
import type { Produk } from "@/toksan/types";

const MAX_RESULTS = 8;

interface ProductPickerProps {
  produk: Produk[];
  onPick: (produk: Produk) => void;
  placeholder?: string;
}

export function ProductPicker({ produk, onPick, placeholder = "Ketik nama produk, mis. risol" }: ProductPickerProps) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return produk.filter((p) => p.active && p.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
  }, [produk, query]);

  const pick = (p: Produk) => {
    onPick(p);
    setQuery("");
  };

  return (
    <div className="relative">
      <label htmlFor="toksan-cari-produk" className="sr-only">Cari produk</label>
      <div className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm focus-within:border-[#FBBF24] focus-within:ring-2 focus-within:ring-[#FDE68A]">
        <Search className="h-5 w-5 shrink-0 text-[#9CA3AF]" aria-hidden="true" />
        <input
          id="toksan-cari-produk"
          type="search"
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              pick(results[0]);
            }
            if (e.key === "Escape") setQuery("");
          }}
          className="min-w-0 flex-1 bg-transparent text-base text-[#111827] outline-none placeholder:text-[#9CA3AF]"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="toksan-hasil-produk"
        />
      </div>
      {query.trim() && (
        <ul
          id="toksan-hasil-produk"
          role="listbox"
          aria-label="Hasil cari produk"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-2xl border border-[#E5E7EB] bg-white p-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-[#6B7280]">Produk tidak ditemukan. Tambahkan dulu di menu Produk Toksan.</li>
          ) : (
            results.map((p) => (
              <li
                key={p.id}
                role="option"
                aria-selected={false}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#FEF3C7]"
              >
                <Plus className="h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[#111827]">{p.name}</span>
                  <span className="block text-xs text-[#6B7280]">{DAPUR_LABEL[p.dapur]} · {formatRupiah(p.harga)}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
