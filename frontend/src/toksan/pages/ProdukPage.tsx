// Master produk Toksan: nama, dapur, kategori, harga reseller. Produk tidak dihapus, hanya dinonaktifkan.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { ToksanApiError, createProduk, listProduk, updateProduk } from "@/toksan/api";
import { DAPUR_LABEL, KATEGORI_LABEL, formatRupiah, toksanErrorMessage } from "@/toksan/format";
import { digitsOnly } from "@/toksan/logic/inputRows";
import { DAPUR_LIST, type Dapur, type Kategori, type Produk } from "@/toksan/types";

const KATEGORI_LIST: Kategori[] = ["makanan", "minuman", "lainnya"];

interface Draft {
  id?: string;
  name: string;
  dapur: Dapur;
  kategori: Kategori;
  harga: number | null;
}

const EMPTY: Draft = { name: "", dapur: "bakery", kategori: "makanan", harga: null };
const field = "mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-base text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FDE68A]";

export function ProdukPage() {
  const { showToast } = useToast();
  const [produk, setProduk] = useState<Produk[] | null>(null);
  const [query, setQuery] = useState("");
  const [dapur, setDapur] = useState<Dapur | "semua">("semua");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listProduk().then(setProduk).catch((err) => {
      showToast({ message: toksanErrorMessage(err), variant: "error" });
      setProduk([]);
    });
  }, [showToast]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (produk ?? []).filter((p) => (dapur === "semua" || p.dapur === dapur) && (!q || p.name.toLowerCase().includes(q)));
  }, [produk, query, dapur]);

  const replace = (saved: Produk) => setProduk((list) => {
    const rest = (list ?? []).filter((p) => p.id !== saved.id);
    return [...rest, saved].sort((a, b) => DAPUR_LIST.indexOf(a.dapur) - DAPUR_LIST.indexOf(b.dapur) || a.name.localeCompare(b.name, "id"));
  });

  const open = (next: Draft) => { setDraft(next); setNameError(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || draft.harga === null || !draft.name.trim()) return;
    setBusy(true);
    setNameError(null);
    try {
      const input = { name: draft.name.trim(), dapur: draft.dapur, kategori: draft.kategori, harga: draft.harga };
      const saved = draft.id ? await updateProduk(draft.id, input) : await createProduk(input);
      replace(saved);
      setDraft(null);
      showToast({ message: draft.id ? "Produk diperbarui." : "Produk ditambahkan.", variant: "success" });
    } catch (err) {
      if (err instanceof ToksanApiError && err.code === "NAMA_SUDAH_ADA") setNameError(toksanErrorMessage(err));
      else showToast({ message: toksanErrorMessage(err), variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (p: Produk) => {
    try {
      replace(await updateProduk(p.id, { active: !p.active }));
    } catch (err) {
      showToast({ message: toksanErrorMessage(err), variant: "error" });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-28 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Produk Toksan</h1>
          <p className="mt-0.5 text-sm text-[#6B7280]">Harga di sini harga reseller. Ganti harga tidak mengubah penjualan yang sudah tersimpan.</p>
        </div>
        <button
          type="button"
          onClick={() => open(EMPTY)}
          className="flex items-center gap-2 rounded-full bg-[#FBBF24] px-4 py-2.5 text-sm font-bold text-[#111827] hover:bg-[#F59E0B]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Tambah produk
        </button>
      </header>

      {draft && (
        <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4" aria-label={draft.id ? "Ubah produk" : "Tambah produk"}>
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-[#111827]">{draft.id ? "Ubah produk" : "Produk baru"}</p>
            <button type="button" aria-label="Tutup" onClick={() => setDraft(null)} className="rounded-full p-1.5 text-[#6B7280] hover:bg-white">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <label className="block text-sm font-semibold text-[#374151]">
            Nama produk
            <input value={draft.name} maxLength={80} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} />
            {nameError && <span className="mt-1 block text-xs font-semibold text-red-600">{nameError}</span>}
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-semibold text-[#374151]">
              Dapur
              <select value={draft.dapur} onChange={(e) => setDraft({ ...draft, dapur: e.target.value as Dapur })} className={field}>
                {DAPUR_LIST.map((d) => <option key={d} value={d}>{DAPUR_LABEL[d]}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#374151]">
              Kategori
              <select value={draft.kategori} onChange={(e) => setDraft({ ...draft, kategori: e.target.value as Kategori })} className={field}>
                {KATEGORI_LIST.map((k) => <option key={k} value={k}>{KATEGORI_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#374151]">
              Harga reseller
              <input inputMode="numeric" required value={draft.harga ?? ""} onChange={(e) => setDraft({ ...draft, harga: digitsOnly(e.target.value) })} className={field} />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy || draft.harga === null || !draft.name.trim()}
            className="flex items-center gap-2 rounded-full bg-[#111827] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Simpan produk
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2">
          <Search className="h-4 w-4 text-[#9CA3AF]" aria-hidden="true" />
          <span className="sr-only">Cari nama produk</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama produk" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
        </label>
        <select aria-label="Filter dapur" value={dapur} onChange={(e) => setDapur(e.target.value as Dapur | "semua")} className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold">
          <option value="semua">Semua dapur</option>
          {DAPUR_LIST.map((d) => <option key={d} value={d}>{DAPUR_LABEL[d]}</option>)}
        </select>
      </div>

      {produk === null ? (
        <p role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-6 text-[#6B7280]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memuat...
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-6 text-center text-sm text-[#6B7280]">Tidak ada produk yang cocok.</p>
      ) : (
        <ul className="divide-y divide-[#F3F4F6] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          {visible.map((p) => (
            <li key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.active ? "" : "bg-[#F9FAFB]"}`}>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${p.active ? "text-[#111827]" : "text-[#9CA3AF] line-through"}`}>{p.name}</p>
                <p className="text-xs text-[#6B7280]">{DAPUR_LABEL[p.dapur]} · {KATEGORI_LABEL[p.kategori]}</p>
              </div>
              <p className="text-sm font-bold text-[#111827]">{formatRupiah(p.harga)}</p>
              <button
                type="button"
                aria-label={`Ubah ${p.name}`}
                onClick={() => open({ id: p.id, name: p.name, dapur: p.dapur, kategori: p.kategori, harga: p.harga })}
                className="rounded-full p-2 text-[#6B7280] hover:bg-[#FEF3C7]"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`${p.active ? "Nonaktifkan" : "Aktifkan"} ${p.name}`}
                onClick={() => void toggleActive(p)}
                className={`rounded-full px-3 py-1 text-xs font-bold ${p.active ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"}`}
              >
                {p.active ? "Aktif" : "Nonaktif"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
