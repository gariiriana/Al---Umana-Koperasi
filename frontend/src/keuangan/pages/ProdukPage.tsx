// Halaman Produk, Gudang, Penyesuaian Stok & Transfer Gudang (Rilis 2).
import { useEffect, useState } from "react";
import { ArrowRightLeft, Boxes, ClipboardCheck, Eye, Package, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import {
  createProduct,
  createStockAdjustment,
  createWarehouse,
  createWarehouseTransfer,
  deleteProduct,
  deleteWarehouse,
  getProduct,
  listAccounts,
  listProducts,
  listStockAdjustments,
  listTaxes,
  listUnits,
  listUoms,
  listWarehouseTransfers,
  listWarehouses,
  updateProduct,
} from "@/keuangan/api";
import { formatQtyMilli, formatSen, formatTanggalShort, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import type { Account, Product, ProductDetailResponse, Tax, TransactionDocument, Unit, Warehouse } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, EmptyState, INPUT_CLS, ModalFrame, RupiahInput, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

type TabKey = "produk" | "gudang" | "mutasi";

export function ProdukPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>("produk");
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [uoms, setUoms] = useState<string[]>(["pcs", "kg", "liter", "box"]);
  const [adjustments, setAdjustments] = useState<TransactionDocument[]>([]);
  const [transfers, setTransfers] = useState<TransactionDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [showProdModal, setShowProdModal] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  // Form produk
  const [pNama, setPNama] = useState("");
  const [pSku, setPSku] = useState("");
  const [pBarcode, setPBarcode] = useState("");
  const [pSatuan, setPSatuan] = useState("pcs");
  const [pTipe, setPTipe] = useState<"single" | "bundle">("single");
  const [pMonitor, setPMonitor] = useState(true);
  const [pBatasMin, setPBatasMin] = useState(0);
  const [pHargaBeli, setPHargaBeli] = useState(0);
  const [pHargaJual, setPHargaJual] = useState(0);
  const [pPajakBeli, setPPajakBeli] = useState("");
  const [pPajakJual, setPPajakJual] = useState("");
  const [pAkunPers, setPAkunPers] = useState("1-10200");
  const [pAkunBeli, setPAkunBeli] = useState("5-50000");
  const [pAkunJual, setPAkunJual] = useState("4-40000");
  const [pBundleItems, setPBundleItems] = useState<{ product_id: string; qty_milli: number }[]>([]);

  // Modal Gudang
  const [showWhModal, setShowWhModal] = useState(false);
  const [wNama, setWNama] = useState("");
  const [wKode, setWKode] = useState("");
  const [wUnit, setWUnit] = useState("");
  const [wAlamat, setWAlamat] = useState("");

  // Modal Penyesuaian Stok
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjTanggal, setAdjTanggal] = useState(todayWib());
  const [adjUnit, setAdjUnit] = useState("");
  const [adjWh, setAdjWh] = useState("");
  const [adjAcc, setAdjAcc] = useState("8-80100");
  const [adjProd, setAdjProd] = useState("");
  const [adjQtySelisih, setAdjQtySelisih] = useState(1);
  const [adjHarga, setAdjHarga] = useState(0);
  const [adjMemo, setAdjMemo] = useState("");

  // Modal Transfer Gudang
  const [showTrfModal, setShowTrfModal] = useState(false);
  const [trfTanggal, setTrfTanggal] = useState(todayWib());
  const [trfFrom, setTrfFrom] = useState("");
  const [trfTo, setTrfTo] = useState("");
  const [trfProd, setTrfProd] = useState("");
  const [trfQty, setTrfQty] = useState(1);
  const [trfMemo, setTrfMemo] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [prods, whs, u, accRes, tx, uomList, adjs, trfs] = await Promise.all([
        listProducts({ q }),
        listWarehouses(),
        listUnits(),
        listAccounts(),
        listTaxes(),
        listUoms(),
        listStockAdjustments(),
        listWarehouseTransfers(),
      ]);
      setProducts(prods);
      setWarehouses(whs);
      setUnits(u);
      setAccounts(accRes.accounts.filter((a) => !a.is_header && !a.arsip));
      setTaxes(tx.filter((t) => t.aktif));
      if (uomList.length > 0) setUoms(uomList.map((x) => x.nama));
      setAdjustments(adjs);
      setTransfers(trfs);
      if (!wUnit && u[0]) setWUnit(u[0].kode);
      if (!adjUnit && u[0]) setAdjUnit(u[0].kode);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [q]);

  const openNewProduct = () => {
    setEditingProd(null);
    setPNama("");
    setPSku("");
    setPBarcode("");
    setPSatuan("pcs");
    setPTipe("single");
    setPMonitor(true);
    setPBatasMin(0);
    setPHargaBeli(0);
    setPHargaJual(0);
    setPPajakBeli("");
    setPPajakJual("");
    setPAkunPers("1-10200");
    setPAkunBeli("5-50000");
    setPAkunJual("4-40000");
    setPBundleItems([]);
    setShowProdModal(true);
  };

  const openEditProduct = async (p: Product) => {
    try {
      const d = await getProduct(p.id);
      const pr = d.product;
      setEditingProd(pr);
      setPNama(pr.nama);
      setPSku(pr.sku || "");
      setPBarcode(pr.barcode || "");
      setPSatuan(pr.satuan);
      setPTipe(pr.tipe);
      setPMonitor(Boolean(pr.monitor_stok));
      setPBatasMin(Math.round((pr.batas_min || 0) / 1000));
      setPHargaBeli(pr.harga_beli);
      setPHargaJual(pr.harga_jual);
      setPPajakBeli(pr.pajak_beli || "");
      setPPajakJual(pr.pajak_jual || "");
      setPAkunPers(pr.akun_persediaan || "1-10200");
      setPAkunBeli(pr.akun_beli || "5-50000");
      setPAkunJual(pr.akun_jual || "4-40000");
      setPBundleItems(pr.bundle_items.map((b) => ({ product_id: b.product_id, qty_milli: b.qty_milli })));
      setShowProdModal(true);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        nama: pNama,
        sku: pSku || null,
        barcode: pBarcode || null,
        satuan: pSatuan,
        tipe: pTipe,
        monitor_stok: pTipe === "bundle" ? 0 : pMonitor ? 1 : 0,
        batas_min: Math.round(pBatasMin * 1000),
        dibeli: 1,
        harga_beli: pHargaBeli,
        akun_beli: pAkunBeli,
        pajak_beli: pPajakBeli || null,
        dijual: 1,
        harga_jual: pHargaJual,
        akun_jual: pAkunJual,
        pajak_jual: pPajakJual || null,
        akun_persediaan: pAkunPers,
        bundle_items: pTipe === "bundle" ? pBundleItems : [],
      };
      if (editingProd) await updateProduct(editingProd.id, payload);
      else await createProduct(payload);
      showToast({ message: editingProd ? "Produk diperbarui." : "Produk berhasil ditambahkan.", variant: "success" });
      setShowProdModal(false);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createWarehouse({ nama: wNama, kode: wKode, unit_kode: wUnit, alamat: wAlamat });
      showToast({ message: "Gudang ditambahkan.", variant: "success" });
      setShowWhModal(false);
      setWNama("");
      setWKode("");
      setWAlamat("");
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createStockAdjustment({
        tanggal: adjTanggal,
        unit_kode: adjUnit,
        warehouse_id: adjWh || null,
        account_kode: adjAcc,
        memo: adjMemo,
        lines: [
          {
            product_id: adjProd,
            qty_selisih_milli: Math.round(adjQtySelisih * 1000),
            harga_satuan: adjHarga || undefined,
          },
        ],
      });
      showToast({ message: "Penyesuaian stok berhasil disimpan.", variant: "success" });
      setShowAdjModal(false);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createWarehouseTransfer({
        tanggal: trfTanggal,
        dari_warehouse_id: trfFrom,
        ke_warehouse_id: trfTo,
        memo: trfMemo,
        lines: [{ product_id: trfProd, qty_milli: Math.round(trfQty * 1000) }],
      });
      showToast({ message: "Transfer gudang berhasil dicatat.", variant: "success" });
      setShowTrfModal(false);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const stockProducts = products.filter((p) => p.monitor_stok === 1);

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Produk & Gudang
          </h1>
          <p className="text-sm text-[#6B7280]">Kelola katalog barang/jasa, gudang, stok rata-rata bergerak, dan transfer stok.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowAdjModal(true)} className={BTN_SECONDARY}>
            <ClipboardCheck className="h-4 w-4 text-amber-700" /> Penyesuaian Stok
          </button>
          <button type="button" onClick={() => setShowTrfModal(true)} className={BTN_SECONDARY}>
            <ArrowRightLeft className="h-4 w-4 text-amber-700" /> Transfer Gudang
          </button>
          <button type="button" onClick={openNewProduct} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" /> Produk Baru
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#E5E7EB] pb-2">
        {[
          { key: "produk", label: "Daftar Produk", icon: Package },
          { key: "gudang", label: "Gudang", icon: WarehouseIcon },
          { key: "mutasi", label: "Penyesuaian & Transfer", icon: Boxes },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as TabKey)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold cursor-pointer transition ${
                active ? "bg-amber-100 text-amber-900" : "text-[#6B7280] hover:bg-gray-100"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "produk" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Cari nama produk, SKU, atau barcode..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={`${INPUT_CLS} max-w-md`}
            />
          </div>

          {!loading && products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Belum ada produk"
              description="Tambahkan produk atau jasa pertama untuk transaksi penjualan dan pembelian."
              action={
                <button type="button" onClick={openNewProduct} className={BTN_PRIMARY}>
                  <Plus className="h-4 w-4" /> Tambah Produk
                </button>
              }
            />
          ) : (
            <>
            {/* HP: kartu per produk */}
            <div className="sm:hidden space-y-2">
              {products.map((p) => (
                <div key={p.id} className="rounded-2xl bg-white border border-[#E5E7EB] p-3 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-[#111827] truncate">{p.nama}</div>
                      <div className="text-xs text-[#6B7280]">{p.sku || "-"} · {p.tipe === "bundle" ? "Bundle" : p.monitor_stok ? "Stok" : "Jasa"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-sm">{formatSen(p.harga_jual)}</div>
                      <div className="text-[11px] text-[#6B7280]">harga jual</div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
                    <div className="rounded-lg bg-[#F9FAFB] px-2 py-1"><div className="text-[#6B7280]">Stok</div><div className="font-mono font-semibold">{p.monitor_stok ? formatQtyMilli(p.stok_milli || 0, p.satuan) : "-"}</div></div>
                    <div className="rounded-lg bg-[#F9FAFB] px-2 py-1"><div className="text-[#6B7280]">HPP rata2</div><div className="font-mono font-semibold">{p.monitor_stok ? formatSen(p.harga_rata_rata || 0) : "-"}</div></div>
                    <div className="rounded-lg bg-[#F9FAFB] px-2 py-1"><div className="text-[#6B7280]">Harga beli</div><div className="font-mono font-semibold">{formatSen(p.harga_beli)}</div></div>
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    <button type="button" onClick={async () => setDetail(await getProduct(p.id))} className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-gray-50 text-[#374151] inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> Kartu Stok
                    </button>
                    <button type="button" onClick={() => openEditProduct(p)} className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-amber-50 text-amber-700">
                      Ubah
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
              <table className="min-w-full text-sm">
                <thead className="bg-[#F9FAFB] text-[#6B7280] text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Produk</th>
                    <th className="px-4 py-3 text-left">SKU / Tipe</th>
                    <th className="px-4 py-3 text-right">Stok</th>
                    <th className="px-4 py-3 text-right">HPP Rata2</th>
                    <th className="px-4 py-3 text-right">Harga Beli</th>
                    <th className="px-4 py-3 text-right">Harga Jual</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-amber-50/40">
                      <td className="px-4 py-3 font-semibold text-[#111827]">{p.nama}</td>
                      <td className="px-4 py-3 text-xs text-[#6B7280]">
                        {p.sku || "-"} · {p.tipe === "bundle" ? "Bundle" : p.monitor_stok ? "Stok" : "Jasa"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {p.monitor_stok ? formatQtyMilli(p.stok_milli || 0, p.satuan) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{p.monitor_stok ? formatSen(p.harga_rata_rata || 0) : "-"}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatSen(p.harga_beli)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{formatSen(p.harga_jual)}</td>
                      <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={async () => setDetail(await getProduct(p.id))}
                          className="rounded-lg p-1.5 text-[#374151] hover:bg-gray-100 cursor-pointer"
                          title="Kartu Stok & Detail"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditProduct(p)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 cursor-pointer"
                        >
                          Ubah
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Hapus/arsipkan produk "${p.nama}"?`)) return;
                            try {
                              await deleteProduct(p.id);
                              showToast({ message: "Produk dihapus/diarsipkan.", variant: "success" });
                              await load();
                            } catch (e) {
                              showToast({ message: keuanganErrorMessage(e), variant: "error" });
                            }
                          }}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 cursor-pointer"
                          title="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      {tab === "gudang" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={() => setShowWhModal(true)} className={BTN_PRIMARY}>
              <Plus className="h-4 w-4" /> Tambah Gudang
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.map((w) => (
              <div key={w.id} className="rounded-2xl bg-white border border-[#E5E7EB] p-4 space-y-2 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-mono text-[#6B7280]">{w.kode}</div>
                    <h3 className="font-bold text-[#111827]">{w.nama}</h3>
                  </div>
                  <UnitBadge kode={w.unit_kode} />
                </div>
                <p className="text-xs text-[#6B7280]">{w.alamat || "Alamat belum diisi"}</p>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteWarehouse(w.id);
                        showToast({ message: "Gudang dihapus.", variant: "success" });
                        await load();
                      } catch (e) {
                        showToast({ message: keuanganErrorMessage(e), variant: "error" });
                      }
                    }}
                    className={BTN_DANGER}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "mutasi" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 space-y-3">
            <h2 className="font-bold text-[#111827]">Penyesuaian Stok Terbaru</h2>
            <div className="divide-y divide-[#F3F4F6] text-sm">
              {adjustments.map((a) => (
                <div key={a.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#111827]">{a.no}</div>
                    <div className="text-xs text-[#6B7280]">{formatTanggalShort(a.tanggal)} · {a.unit_kode} · {a.memo || "-"}</div>
                  </div>
                  <div className="font-mono font-semibold">{formatSen(a.total)}</div>
                </div>
              ))}
              {adjustments.length === 0 && <p className="text-xs text-[#6B7280] py-4 text-center">Belum ada penyesuaian stok.</p>}
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 space-y-3">
            <h2 className="font-bold text-[#111827]">Transfer Gudang Terbaru</h2>
            <div className="divide-y divide-[#F3F4F6] text-sm">
              {transfers.map((t) => (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#111827]">{t.no}</div>
                    <div className="text-xs text-[#6B7280]">{formatTanggalShort(t.tanggal)} · {t.unit_kode} · {t.memo || "-"}</div>
                  </div>
                  <div className="font-mono font-semibold">{formatSen(t.total)}</div>
                </div>
              ))}
              {transfers.length === 0 && <p className="text-xs text-[#6B7280] py-4 text-center">Belum ada transfer gudang.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Modal Produk */}
      <ModalFrame open={showProdModal} title={editingProd ? "Ubah Produk" : "Produk Baru"} onClose={() => setShowProdModal(false)}>
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Nama Produk *</label>
              <input type="text" required value={pNama} onChange={(e) => setPNama(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">SKU</label>
              <input type="text" value={pSku} onChange={(e) => setPSku(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Barcode</label>
              <input type="text" value={pBarcode} onChange={(e) => setPBarcode(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Satuan</label>
              <select value={pSatuan} onChange={(e) => setPSatuan(e.target.value)} className={INPUT_CLS}>
                {uoms.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Tipe</label>
              <select value={pTipe} onChange={(e) => setPTipe(e.target.value as "single" | "bundle")} className={INPUT_CLS}>
                <option value="single">Produk Tunggal / Jasa</option>
                <option value="bundle">Paket / Bundle</option>
              </select>
            </div>
            {pTipe === "single" && (
              <div className="flex items-center gap-3 pt-5">
                <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input type="checkbox" checked={pMonitor} onChange={(e) => setPMonitor(e.target.checked)} className="h-4 w-4 accent-amber-600" />
                  Monitor Stok (Barang)
                </label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[#E5E7EB] pt-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Harga Beli Standar</label>
              <RupiahInput valueSen={pHargaBeli} onChangeSen={setPHargaBeli} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Harga Jual Standar</label>
              <RupiahInput valueSen={pHargaJual} onChangeSen={setPHargaJual} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Akun Pembelian / HPP</label>
              <select value={pAkunBeli} onChange={(e) => setPAkunBeli(e.target.value)} className={INPUT_CLS}>
                {accounts.map((a) => (
                  <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Akun Penjualan</label>
              <select value={pAkunJual} onChange={(e) => setPAkunJual(e.target.value)} className={INPUT_CLS}>
                {accounts.map((a) => (
                  <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Pajak Beli Default</label>
              <select value={pPajakBeli} onChange={(e) => setPPajakBeli(e.target.value)} className={INPUT_CLS}>
                <option value="">Tanpa Pajak</option>
                {taxes.map((t) => (
                  <option key={t.id} value={t.id}>{t.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Pajak Jual Default</label>
              <select value={pPajakJual} onChange={(e) => setPPajakJual(e.target.value)} className={INPUT_CLS}>
                <option value="">Tanpa Pajak</option>
                {taxes.map((t) => (
                  <option key={t.id} value={t.id}>{t.nama}</option>
                ))}
              </select>
            </div>
            {pMonitor && pTipe === "single" && (
              <>
                <div>
                  <label className="block text-xs font-bold text-[#6B7280] mb-1">Akun Persediaan</label>
                  <select value={pAkunPers} onChange={(e) => setPAkunPers(e.target.value)} className={INPUT_CLS}>
                    {accounts.filter((a) => a.kategori === 4).map((a) => (
                      <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6B7280] mb-1">Batas Stok Minimum</label>
                  <input type="number" min={0} value={pBatasMin} onChange={(e) => setPBatasMin(Number(e.target.value || 0))} className={INPUT_CLS} />
                </div>
              </>
            )}
          </div>

          {pTipe === "bundle" && (
            <div className="space-y-2 border-t border-[#E5E7EB] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#6B7280]">Komponen Bundle</span>
                <button
                  type="button"
                  onClick={() => setPBundleItems([...pBundleItems, { product_id: stockProducts[0]?.id || "", qty_milli: 1000 }])}
                  className={BTN_SECONDARY}
                >
                  <Plus className="h-3.5 w-3.5" /> Tambah Item
                </button>
              </div>
              {pBundleItems.map((bi, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={bi.product_id}
                    onChange={(e) => setPBundleItems(pBundleItems.map((x, i) => (i === idx ? { ...x, product_id: e.target.value } : x)))}
                    className={INPUT_CLS}
                  >
                    {products.filter((pr) => pr.tipe !== "bundle").map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.nama}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={Math.round(bi.qty_milli / 1000)}
                    onChange={(e) => setPBundleItems(pBundleItems.map((x, i) => (i === idx ? { ...x, qty_milli: Math.max(1, Number(e.target.value)) * 1000 } : x)))}
                    className={`${INPUT_CLS} w-24`}
                  />
                  <button type="button" onClick={() => setPBundleItems(pBundleItems.filter((_, i) => i !== idx))} className="text-red-600 p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowProdModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Menyimpan..." : "Simpan Produk"}</button>
          </div>
        </form>
      </ModalFrame>

      {/* Modal Gudang */}
      <ModalFrame open={showWhModal} title="Tambah Gudang" onClose={() => setShowWhModal(false)} maxWidth="max-w-lg">
        <form onSubmit={handleSaveWarehouse} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Anak Perusahaan *</label>
            <select required value={wUnit} onChange={(e) => setWUnit(e.target.value)} className={INPUT_CLS}>
              {units.map((u) => (
                <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Kode</label>
              <input type="text" value={wKode} onChange={(e) => setWKode(e.target.value)} placeholder="GDG-TKS" className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Nama Gudang *</label>
              <input type="text" required value={wNama} onChange={(e) => setWNama(e.target.value)} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Alamat</label>
            <input type="text" value={wAlamat} onChange={(e) => setWAlamat(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowWhModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Menyimpan..." : "Simpan Gudang"}</button>
          </div>
        </form>
      </ModalFrame>

      {/* Modal Penyesuaian Stok */}
      <ModalFrame open={showAdjModal} title="Penyesuaian Stok" onClose={() => setShowAdjModal(false)} maxWidth="max-w-lg">
        <form onSubmit={handleSaveAdjustment} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Tanggal</label>
              <input type="date" required value={adjTanggal} onChange={(e) => setAdjTanggal(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Anak Perusahaan</label>
              <select required value={adjUnit} onChange={(e) => setAdjUnit(e.target.value)} className={INPUT_CLS}>
                {units.map((u) => (
                  <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Gudang</label>
            <select value={adjWh} onChange={(e) => setAdjWh(e.target.value)} className={INPUT_CLS}>
              <option value="">-- Pilih Gudang --</option>
              {warehouses.filter((w) => !adjUnit || w.unit_kode === adjUnit).map((w) => (
                <option key={w.id} value={w.id}>{w.nama} ({w.unit_kode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Produk Berstok *</label>
            <select required value={adjProd} onChange={(e) => setAdjProd(e.target.value)} className={INPUT_CLS}>
              <option value="">-- Pilih Produk --</option>
              {stockProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.nama} ({p.satuan})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Selisih Qty (+ masuk / - keluar)</label>
              <input type="number" step="0.001" required value={adjQtySelisih} onChange={(e) => setAdjQtySelisih(Number(e.target.value))} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Nilai Satuan (jika masuk)</label>
              <RupiahInput valueSen={adjHarga} onChangeSen={setAdjHarga} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Akun Penyesuaian</label>
            <select value={adjAcc} onChange={(e) => setAdjAcc(e.target.value)} className={INPUT_CLS}>
              {accounts.map((a) => (
                <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Catatan</label>
            <input type="text" value={adjMemo} onChange={(e) => setAdjMemo(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdjModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Menyimpan..." : "Simpan Penyesuaian"}</button>
          </div>
        </form>
      </ModalFrame>

      {/* Modal Transfer Gudang */}
      <ModalFrame open={showTrfModal} title="Transfer Antar Gudang" onClose={() => setShowTrfModal(false)} maxWidth="max-w-lg">
        <form onSubmit={handleSaveTransfer} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Tanggal</label>
            <input type="date" required value={trfTanggal} onChange={(e) => setTrfTanggal(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Gudang Asal *</label>
              <select required value={trfFrom} onChange={(e) => setTrfFrom(e.target.value)} className={INPUT_CLS}>
                <option value="">-- Pilih --</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.nama} ({w.unit_kode})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Gudang Tujuan *</label>
              <select required value={trfTo} onChange={(e) => setTrfTo(e.target.value)} className={INPUT_CLS}>
                <option value="">-- Pilih --</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.nama} ({w.unit_kode})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Produk *</label>
              <select required value={trfProd} onChange={(e) => setTrfProd(e.target.value)} className={INPUT_CLS}>
                <option value="">-- Pilih --</option>
                {stockProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Qty *</label>
              <input type="number" step="0.001" min={0.001} required value={trfQty} onChange={(e) => setTrfQty(Number(e.target.value))} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Catatan</label>
            <input type="text" value={trfMemo} onChange={(e) => setTrfMemo(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowTrfModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Memproses..." : "Kirim Transfer"}</button>
          </div>
        </form>
      </ModalFrame>

      {/* Modal Kartu Stok Produk */}
      <ModalFrame open={Boolean(detail)} title={detail ? `Kartu Stok: ${detail.product.nama}` : ""} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-[#F9FAFB] p-3">
                <div className="text-[#6B7280]">Total Stok</div>
                <div className="font-bold text-base">{formatQtyMilli(detail.product.stok_milli, detail.product.satuan)}</div>
              </div>
              <div className="rounded-xl bg-[#F9FAFB] p-3">
                <div className="text-[#6B7280]">HPP Rata-rata</div>
                <div className="font-bold text-base font-mono">{formatSen(detail.product.harga_rata_rata)}</div>
              </div>
              <div className="rounded-xl bg-[#F9FAFB] p-3">
                <div className="text-[#6B7280]">Harga Jual</div>
                <div className="font-bold text-base font-mono">{formatSen(detail.product.harga_jual)}</div>
              </div>
              <div className="rounded-xl bg-[#F9FAFB] p-3">
                <div className="text-[#6B7280]">Rekalkulasi HPP</div>
                <div className="font-bold text-base">{detail.product.recalc_running ? "Antre" : "Terbaru"}</div>
              </div>
            </div>

            {detail.perWarehouse.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-[#6B7280] mb-1">Stok per Gudang</h4>
                <div className="flex flex-wrap gap-2">
                  {detail.perWarehouse.map((w, i) => (
                    <span key={i} className="rounded-xl border border-[#E5E7EB] px-3 py-1.5 text-xs">
                      <b>{w.warehouse_nama}</b>: {formatQtyMilli(w.qty_milli, detail.product.satuan)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-[#E5E7EB] rounded-xl">
              <table className="min-w-full text-xs">
                <thead className="bg-[#F9FAFB] text-[#6B7280]">
                  <tr>
                    <th className="px-3 py-2 text-left">Tanggal</th>
                    <th className="px-3 py-2 text-left">Dokumen</th>
                    <th className="px-3 py-2 text-left">Gudang</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-right">Nilai</th>
                    <th className="px-3 py-2 text-right">Avg Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {detail.history.map((h) => (
                    <tr key={h.id}>
                      <td className="px-3 py-2">{formatTanggalShort(h.tanggal)}</td>
                      <td className="px-3 py-2 font-semibold">{h.doc_no}</td>
                      <td className="px-3 py-2">{h.warehouse_nama || "-"}</td>
                      <td className={`px-3 py-2 text-right font-mono ${h.qty_milli < 0 ? "text-red-600" : "text-emerald-700"}`}>
                        {h.qty_milli > 0 ? "+" : ""}{formatQtyMilli(h.qty_milli)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatQtyMilli(h.running_qty_milli)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatSen(h.nilai)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatSen(h.avg_unit_cost)}</td>
                    </tr>
                  ))}
                  {detail.history.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-4 text-center text-[#6B7280]">Belum ada pergerakan stok.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ModalFrame>
    </div>
  );
}
