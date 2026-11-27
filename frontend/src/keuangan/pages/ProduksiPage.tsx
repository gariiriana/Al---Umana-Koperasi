// Halaman Produksi (Rilis 4): Bill of Materials (BoM), Biaya Overhead & Perintah Kerja Produksi.
import { useEffect, useState } from "react";
import { Factory, Plus, Trash2 } from "lucide-react";
import { createWorkOrder, deleteBom, listBoms, listProducts, listUnits, listWarehouses, listWorkOrders, saveBom } from "@/keuangan/api";
import { formatSen, formatTanggalShort, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import type { BomItem, Product, TransactionDocument, Unit, Warehouse } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, EmptyState, INPUT_CLS, ModalFrame, RupiahInput, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function ProduksiPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"wo" | "bom">("wo");
  const [boms, setBoms] = useState<BomItem[]>([]);
  const [workOrders, setWorkOrders] = useState<TransactionDocument[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [saving, setSaving] = useState(false);

  const [showBomModal, setShowBomModal] = useState(false);
  const [bNama, setBNama] = useState("");
  const [bKode, setBKode] = useState("");
  const [bKategori, setBKategori] = useState<"penyusunan" | "pemisahan">("penyusunan");
  const [bOutProd, setBOutProd] = useState("");
  const [bComps, setBComps] = useState<{ product_id: string; qty: number }[]>([{ product_id: "", qty: 1 }]);

  const [showWoModal, setShowWoModal] = useState(false);
  const [woTanggal, setWoTanggal] = useState(todayWib());
  const [woUnit, setWoUnit] = useState("");
  const [woWh, setWoWh] = useState("");
  const [woInProd, setWoInProd] = useState("");
  const [woInQty, setWoInQty] = useState(1);
  const [woOutProd, setWoOutProd] = useState("");
  const [woOutQty, setWoOutQty] = useState(1);
  const [woOverhead, setWoOverhead] = useState(0);

  const load = async () => {
    try {
      const [bm, wo, pr, wh, u] = await Promise.all([listBoms(), listWorkOrders(), listProducts(), listWarehouses(), listUnits()]);
      setBoms(bm);
      setWorkOrders(wo);
      setProducts(pr.filter((p) => p.monitor_stok === 1));
      setWarehouses(wh);
      setUnits(u);
      if (!woUnit && u[0]) setWoUnit(u[0].kode);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveBom = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveBom({
        nama: bNama,
        kode: bKode,
        kategori: bKategori,
        output_product_id: bOutProd || null,
        components: bComps.filter((c) => c.product_id).map((c) => ({ product_id: c.product_id, qty_milli: Math.round(c.qty * 1000) })),
      });
      showToast({ message: "BoM disimpan.", variant: "success" });
      setShowBomModal(false);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createWorkOrder({
        tanggal: woTanggal,
        unit_kode: woUnit,
        warehouse_id: woWh,
        kategori: "penyusunan",
        inputs: [{ product_id: woInProd, qty_milli: Math.round(woInQty * 1000) }],
        overhead_costs: woOverhead > 0 ? [{ account_kode: "5-50401", nama: "Overhead Produksi", jumlah: woOverhead }] : [],
        outputs: [{ product_id: woOutProd, qty_milli: Math.round(woOutQty * 1000) }],
      });
      showToast({ message: "Perintah kerja produksi selesai dijalankan.", variant: "success" });
      setShowWoModal(false);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Produksi & Manufaktur</h1>
          <p className="text-sm text-[#6B7280]">Kelola Bill of Materials (BoM) penyusunan/pemisahan dan jalankan Perintah Kerja Produksi.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowBomModal(true)} className={BTN_SECONDARY}>
            <Plus className="h-4 w-4" /> BoM Baru
          </button>
          <button type="button" onClick={() => setShowWoModal(true)} className={BTN_PRIMARY}>
            <Factory className="h-4 w-4" /> Perintah Kerja Baru
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[#E5E7EB] pb-2">
        <button type="button" onClick={() => setTab("wo")} className={`rounded-xl px-4 py-2 text-sm font-bold cursor-pointer ${tab === "wo" ? "bg-amber-600 text-white" : "bg-white border border-[#E5E7EB]"}`}>
          Perintah Kerja ({workOrders.length})
        </button>
        <button type="button" onClick={() => setTab("bom")} className={`rounded-xl px-4 py-2 text-sm font-bold cursor-pointer ${tab === "bom" ? "bg-amber-600 text-white" : "bg-white border border-[#E5E7EB]"}`}>
          Bill of Materials ({boms.length})
        </button>
      </div>

      {tab === "wo" ? (
        workOrders.length === 0 ? (
          <EmptyState icon={Factory} title="Belum ada perintah kerja produksi" description="Buat perintah kerja untuk mengonversi bahan baku & biaya overhead menjadi barang jadi." />
        ) : (
          <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#F9FAFB] text-xs uppercase text-[#6B7280]">
                <tr><th className="px-4 py-3 text-left">Tanggal / No</th><th className="px-4 py-3 text-left">Unit</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Biaya Aktual</th></tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {workOrders.map((w) => (
                  <tr key={w.id}>
                    <td className="px-4 py-3"><b>{w.no}</b> <span className="text-xs text-[#6B7280]">{formatTanggalShort(w.tanggal)}</span></td>
                    <td className="px-4 py-3"><UnitBadge kode={w.unit_kode} /></td>
                    <td className="px-4 py-3 text-xs font-bold text-emerald-700">{w.status}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{formatSen(w.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {boms.map((b) => (
            <div key={b.id} className="rounded-2xl bg-white border border-[#E5E7EB] p-4 flex justify-between items-start">
              <div>
                <div className="text-xs font-mono text-[#6B7280]">{b.kode} · {b.kategori}</div>
                <div className="font-bold text-base">{b.nama}</div>
                <div className="text-xs text-[#6B7280] mt-1">{b.config.components?.length || 0} bahan komponen</div>
              </div>
              <button type="button" onClick={async () => { await deleteBom(b.id); await load(); }} className={BTN_DANGER}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {boms.length === 0 && <EmptyState icon={Factory} title="Belum ada BoM" description="Definisikan resep bahan baku (BoM) terlebih dahulu." />}
        </div>
      )}

      <ModalFrame open={showBomModal} title="Buat Bill of Materials (BoM)" onClose={() => setShowBomModal(false)} maxWidth="max-w-lg">
        <form onSubmit={handleSaveBom} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input type="text" required placeholder="Kode BoM (BOM-01)" value={bKode} onChange={(e) => setBKode(e.target.value)} className={INPUT_CLS} />
            <input type="text" required placeholder="Nama BoM" value={bNama} onChange={(e) => setBNama(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={bKategori} onChange={(e) => setBKategori(e.target.value as "penyusunan" | "pemisahan")} className={INPUT_CLS}>
              <option value="penyusunan">Penyusunan (Assembly)</option>
              <option value="pemisahan">Pemisahan (Disassembly)</option>
            </select>
            <select value={bOutProd} onChange={(e) => setBOutProd(e.target.value)} className={INPUT_CLS}>
              <option value="">-- Produk Hasil --</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </select>
          </div>
          <div className="space-y-2 border-t border-[#E5E7EB] pt-2">
            <span className="text-xs font-bold text-[#6B7280]">Bahan Baku</span>
            {bComps.map((c, idx) => (
              <div key={idx} className="flex gap-2">
                <select value={c.product_id} onChange={(e) => setBComps(bComps.map((x, i) => i === idx ? { ...x, product_id: e.target.value } : x))} className={INPUT_CLS}>
                  <option value="">-- Pilih Bahan --</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
                </select>
                <input type="number" step="0.001" min={0.001} value={c.qty} onChange={(e) => setBComps(bComps.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value || 1) } : x))} className={`${INPUT_CLS} w-24`} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowBomModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Menyimpan..." : "Simpan BoM"}</button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame open={showWoModal} title="Buat Perintah Kerja Produksi" onClose={() => setShowWoModal(false)} maxWidth="max-w-lg">
        <form onSubmit={handleSaveWo} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input type="date" required value={woTanggal} onChange={(e) => setWoTanggal(e.target.value)} className={INPUT_CLS} />
            <select required value={woUnit} onChange={(e) => setWoUnit(e.target.value)} className={INPUT_CLS}>
              {units.map((u) => <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>)}
            </select>
          </div>
          <select required value={woWh} onChange={(e) => setWoWh(e.target.value)} className={INPUT_CLS}>
            <option value="">-- Pilih Gudang Produksi --</option>
            {warehouses.filter((w) => !woUnit || w.unit_kode === woUnit).map((w) => <option key={w.id} value={w.id}>{w.nama}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <select required value={woInProd} onChange={(e) => setWoInProd(e.target.value)} className={`${INPUT_CLS} col-span-2`}>
              <option value="">-- Bahan Baku --</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </select>
            <input type="number" step="0.001" min={0.001} value={woInQty} onChange={(e) => setWoInQty(Number(e.target.value || 1))} className={INPUT_CLS} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select required value={woOutProd} onChange={(e) => setWoOutProd(e.target.value)} className={`${INPUT_CLS} col-span-2`}>
              <option value="">-- Produk Jadi --</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </select>
            <input type="number" step="0.001" min={0.001} value={woOutQty} onChange={(e) => setWoOutQty(Number(e.target.value || 1))} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Biaya Overhead Tambahan</label>
            <RupiahInput valueSen={woOverhead} onChangeSen={setWoOverhead} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowWoModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Memproses..." : "Selesaikan Produksi"}</button>
          </div>
        </form>
      </ModalFrame>
    </div>
  );
}
