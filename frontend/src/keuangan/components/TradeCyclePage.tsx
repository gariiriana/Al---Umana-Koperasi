// Komponen bersama Siklus Penjualan & Pembelian (Rilis 2-3): Daftar, Form Multi-Baris, Pembayaran, Retur, Cetak/WA Publik.
import { useEffect, useState } from "react";
import { CheckCircle2, Eye, Plus, Printer, Repeat, RotateCcw, Share2, Trash2 } from "lucide-react";
import {
  createOrGetPublicLink,
  createTransaction,
  deleteTransaction,
  getTransaction,
  listAccounts,
  listContacts,
  listPaymentTerms,
  listProducts,
  listTaxes,
  listTransactions,
  listUnits,
  listWarehouses,
  saveRecurring,
} from "@/keuangan/api";
import { DOC_TYPE_LABELS, formatQtyMilli, formatSen, formatTanggalShort, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import type { Account, Contact, PaymentTerm, Product, Tax, TransactionDetailResponse, TransactionDocument, Unit, Warehouse } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, EmptyState, INPUT_CLS, ModalFrame, RupiahInput, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

interface LineDraft {
  product_id: string;
  deskripsi: string;
  qty: number;
  satuan: string;
  harga: number;
  diskon: string;
  tax_id: string;
}

export function TradeCyclePage({ family }: { family: "sales" | "purchase" }) {
  const isSales = family === "sales";
  const { showToast } = useToast();

  const [docs, setDocs] = useState<TransactionDocument[]>([]);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const [units, setUnits] = useState<Unit[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);

  const [detail, setDetail] = useState<TransactionDetailResponse | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form state
  const [docType, setDocType] = useState(isSales ? "sales_invoice" : "purchase_invoice");
  const [tanggal, setTanggal] = useState(todayWib());
  const [unitKode, setUnitKode] = useState("");
  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [termId, setTermId] = useState("term_net30");
  const [parentId, setParentId] = useState("");
  const [hargaTermasukPajak, setHargaTermasukPajak] = useState(false);
  const [diskonGlobal, setDiskonGlobal] = useState(0);
  const [ongkir, setOngkir] = useState(0);
  const [noFakturPajak, setNoFakturPajak] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { product_id: "", deskripsi: "", qty: 1, satuan: "pcs", harga: 0, diskon: "", tax_id: "" },
  ]);

  // Pay modal
  const [payDoc, setPayDoc] = useState<TransactionDocument | null>(null);
  const [payTanggal, setPayTanggal] = useState(todayWib());
  const [payCashAcc, setPayCashAcc] = useState("1-10002");
  const [payAmount, setPayAmount] = useState(0);
  const [payWithholdingAcc, setPayWithholdingAcc] = useState("");
  const [payWithholdingAmt, setPayWithholdingAmt] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [docList, u, c, p, w, a, tx, tm] = await Promise.all([
        listTransactions({ family, type: filterType, status: filterStatus, q }),
        listUnits(),
        listContacts(),
        listProducts(),
        listWarehouses(),
        listAccounts(),
        listTaxes(),
        listPaymentTerms(),
      ]);
      setDocs(docList);
      setUnits(u);
      setContacts(c);
      setProducts(p);
      setWarehouses(w);
      setAccounts(a.accounts.filter((x) => !x.is_header && !x.arsip));
      setTaxes(tx.filter((t) => t.aktif));
      setTerms(tm);
      if (!unitKode && u[0]) setUnitKode(u[0].kode);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [family, filterType, filterStatus, q]);

  const openNewForm = (presetType?: string, fromDetail?: TransactionDetailResponse) => {
    const defaultType = presetType || (isSales ? "sales_invoice" : "purchase_invoice");
    setDocType(defaultType);
    setTanggal(todayWib());
    setDiskonGlobal(0);
    setOngkir(0);
    setNoFakturPajak("");
    if (fromDetail) {
      const d = fromDetail.document;
      setUnitKode(d.unit_kode);
      setContactId(d.contact_id || "");
      setWarehouseId(d.warehouse_id || "");
      setParentId(d.id);
      setMemo(d.memo || "");
      setLines(
        fromDetail.lines.map((l) => ({
          product_id: l.product_id || "",
          deskripsi: l.deskripsi || "",
          qty: Math.max(0.001, (l.qty_milli || 1000) / 1000),
          satuan: l.satuan || "pcs",
          harga: l.harga || 0,
          diskon: l.diskon_bp ? String(l.diskon_bp / 100) : "",
          tax_id: l.tax_id || "",
        })),
      );
    } else {
      setUnitKode(units[0]?.kode || "");
      setContactId("");
      setWarehouseId("");
      setParentId("");
      setMemo("");
      setLines([{ product_id: "", deskripsi: "", qty: 1, satuan: "pcs", harga: 0, diskon: "", tax_id: "" }]);
    }
    setShowCreate(true);
  };

  const handleProductPick = (idx: number, prodId: string) => {
    const pr = products.find((x) => x.id === prodId);
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              product_id: prodId,
              deskripsi: pr?.nama || l.deskripsi,
              satuan: pr?.satuan || l.satuan,
              harga: pr ? (isSales ? pr.harga_jual : pr.harga_beli) : l.harga,
              tax_id: pr ? (isSales ? pr.pajak_jual || "" : pr.pajak_beli || "") : l.tax_id,
            }
          : l,
      ),
    );
  };

  const handleSubmitDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createTransaction({
        type: docType,
        tanggal,
        unit_kode: unitKode,
        contact_id: contactId || null,
        warehouse_id: warehouseId || null,
        term_id: termId || null,
        parent_id: parentId || null,
        harga_termasuk_pajak: hargaTermasukPajak,
        diskon: diskonGlobal,
        ongkir,
        no_faktur_pajak: noFakturPajak,
        memo,
        lines: lines.map((l) => ({
          product_id: l.product_id || null,
          deskripsi: l.deskripsi,
          qty_milli: Math.round(l.qty * 1000),
          satuan: l.satuan,
          harga: l.harga,
          diskon: l.diskon,
          tax_id: l.tax_id || null,
        })),
      });
      showToast({ message: `${DOC_TYPE_LABELS[docType] || "Dokumen"} berhasil disimpan.`, variant: "success" });
      setShowCreate(false);
      setDetail(null);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDoc) return;
    setSaving(true);
    try {
      await createTransaction({
        type: isSales ? "sales_payment" : "purchase_payment",
        tanggal: payTanggal,
        unit_kode: payDoc.unit_kode,
        contact_id: payDoc.contact_id,
        [isSales ? "setor_ke" : "bayar_dari"]: payCashAcc,
        allocations: [{ document_id: payDoc.id, amount: payAmount }],
        withholdings:
          payWithholdingAcc && payWithholdingAmt > 0
            ? [{ account_kode: payWithholdingAcc, mode: "nominal", nilai: payWithholdingAmt }]
            : [],
      });
      showToast({ message: "Pembayaran berhasil dicatat.", variant: "success" });
      setPayDoc(null);
      setDetail(null);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleShareWa = async (doc: TransactionDocument) => {
    try {
      const link = await createOrGetPublicLink(doc.id);
      const url = `${window.location.origin}/f/${link.token}`;
      const text = encodeURIComponent(
        `Assalamu'alaikum ${doc.contact_nama || "Bapak/Ibu"}, berikut tautan ${DOC_TYPE_LABELS[doc.type] || "dokumen"} ${doc.no} sebesar ${formatSen(doc.total)}: ${url}`,
      );
      window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  const cashAccounts = accounts.filter((a) => a.kategori === 3 || a.kategori === 9);
  const typeTabs = isSales
    ? [
        { k: "", l: "Semua" },
        { k: "sales_invoice", l: "Faktur" },
        { k: "sales_order", l: "Pemesanan" },
        { k: "sales_quote", l: "Penawaran" },
        { k: "sales_delivery", l: "Pengiriman" },
        { k: "sales_return", l: "Retur" },
      ]
    : [
        { k: "", l: "Semua" },
        { k: "purchase_invoice", l: "Tagihan" },
        { k: "purchase_order", l: "Pemesanan" },
        { k: "purchase_delivery", l: "Penerimaan" },
        { k: "purchase_quote", l: "Penawaran" },
        { k: "purchase_return", l: "Retur" },
      ];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            {isSales ? "Penjualan" : "Pembelian"}
          </h1>
          <p className="text-sm text-[#6B7280]">
            {isSales
              ? "Penawaran, pemesanan, pengiriman, faktur, pembayaran piutang, retur & kredit memo."
              : "Permintaan, penawaran, pemesanan, penerimaan barang, tagihan, pembayaran hutang & retur."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openNewForm(isSales ? "sales_order" : "purchase_order")} className={BTN_SECONDARY}>
            <Plus className="h-4 w-4" /> {isSales ? "Pemesanan" : "PO Baru"}
          </button>
          <button type="button" onClick={() => openNewForm(isSales ? "sales_invoice" : "purchase_invoice")} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" /> {isSales ? "Buat Faktur Penjualan" : "Buat Tagihan Pembelian"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {typeTabs.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setFilterType(t.k)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer ${
                filterType === t.k ? "bg-amber-600 text-white" : "bg-white border border-[#E5E7EB] text-[#374151]"
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`${INPUT_CLS} w-auto`}>
            <option value="">Semua Status</option>
            <option value="belum_dibayar">Belum Dibayar</option>
            <option value="sebagian">Dibayar Sebagian</option>
            <option value="jatuh_tempo">Lewat Jatuh Tempo</option>
            <option value="lunas">Lunas</option>
          </select>
          <input
            type="text"
            placeholder="Cari nomor atau kontak..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`${INPUT_CLS} w-52`}
          />
        </div>
      </div>

      {/* Table */}
      {!loading && docs.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={isSales ? "Belum ada transaksi penjualan" : "Belum ada transaksi pembelian"}
          description="Klik tombol buat transaksi baru di kanan atas untuk memulai."
        />
      ) : (
        <>
        {/* HP: kartu per transaksi, tidak perlu geser ke samping */}
        <div className="sm:hidden space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-2xl bg-white border border-[#E5E7EB] p-3 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-[#111827] truncate">{d.no}</div>
                  <div className="text-xs text-[#6B7280]">
                    {formatTanggalShort(d.tanggal)} · {DOC_TYPE_LABELS[d.type] || d.type}
                  </div>
                  <div className="text-xs text-[#374151] truncate">{d.contact_nama || "-"}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-sm">{formatSen(d.total)}</div>
                  {d.sisa > 0 && <div className="font-mono text-xs text-amber-700">Sisa {formatSen(d.sisa)}</div>}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <UnitBadge kode={d.unit_kode} />
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      d.status === "lunas" || d.status === "selesai"
                        ? "bg-emerald-100 text-emerald-800"
                        : d.status === "menunggu_persetujuan"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {d.status}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={async () => setDetail(await getTransaction(d.id))} className="rounded-lg p-2 bg-gray-50 text-[#374151]" title="Detail & Jurnal">
                    <Eye className="h-4 w-4" />
                  </button>
                  {d.sisa > 0 && (d.type === "sales_invoice" || d.type === "purchase_invoice") && (
                    <button
                      type="button"
                      onClick={() => {
                        setPayDoc(d);
                        setPayAmount(d.sisa);
                        setPayWithholdingAmt(0);
                        setPayTanggal(todayWib());
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700"
                    >
                      Bayar
                    </button>
                  )}
                  {isSales && d.type === "sales_invoice" && (
                    <button type="button" onClick={() => handleShareWa(d)} className="rounded-lg p-2 bg-emerald-50 text-emerald-700" title="Bagikan WhatsApp + Tautan Publik">
                      <Share2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden sm:block rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-xs uppercase text-[#6B7280]">
              <tr>
                <th className="px-4 py-3 text-left">Tanggal / No</th>
                <th className="px-4 py-3 text-left">Jenis</th>
                <th className="px-4 py-3 text-left">Kontak</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Sisa</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {docs.map((d) => (
                <tr key={d.id} className="hover:bg-amber-50/40">
                  <td className="px-4 py-3">
                    <div className="font-bold text-[#111827]">{d.no}</div>
                    <div className="text-xs text-[#6B7280]">{formatTanggalShort(d.tanggal)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-[#374151]">{DOC_TYPE_LABELS[d.type] || d.type}</td>
                  <td className="px-4 py-3">{d.contact_nama || "-"}</td>
                  <td className="px-4 py-3"><UnitBadge kode={d.unit_kode} /></td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        d.status === "lunas" || d.status === "selesai"
                          ? "bg-emerald-100 text-emerald-800"
                          : d.status === "menunggu_persetujuan"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatSen(d.total)}</td>
                  <td className="px-4 py-3 text-right font-mono">{d.sisa > 0 ? formatSen(d.sisa) : "-"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                    <button
                      type="button"
                      onClick={async () => setDetail(await getTransaction(d.id))}
                      className="rounded-lg p-1.5 hover:bg-gray-100 text-[#374151] cursor-pointer"
                      title="Detail & Jurnal"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {d.sisa > 0 && (d.type === "sales_invoice" || d.type === "purchase_invoice") && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayDoc(d);
                          setPayAmount(d.sisa);
                          setPayWithholdingAmt(0);
                          setPayTanggal(todayWib());
                        }}
                        className="rounded-lg px-2 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                      >
                        Bayar
                      </button>
                    )}
                    {isSales && d.type === "sales_invoice" && (
                      <button
                        type="button"
                        onClick={() => handleShareWa(d)}
                        className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                        title="Bagikan WhatsApp + Tautan Publik"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Modal Detail Transaksi */}
      <ModalFrame open={Boolean(detail)} title={detail ? `${DOC_TYPE_LABELS[detail.document.type] || detail.document.type} — ${detail.document.no}` : ""} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><span className="text-[#6B7280] block">Tanggal</span><b>{formatTanggalShort(detail.document.tanggal)}</b></div>
              <div><span className="text-[#6B7280] block">Kontak</span><b>{detail.document.contact_nama || "-"}</b></div>
              <div><span className="text-[#6B7280] block">Unit</span><b>{detail.document.unit_kode}</b></div>
              <div><span className="text-[#6B7280] block">Total / Sisa</span><b className="font-mono">{formatSen(detail.document.total)} / {formatSen(detail.document.sisa)}</b></div>
            </div>

            <div className="overflow-x-auto border border-[#E5E7EB] rounded-xl">
              <table className="min-w-full text-xs">
                <thead className="bg-[#F9FAFB] text-[#6B7280]">
                  <tr>
                    <th className="px-3 py-2 text-left">Item / Uraian</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Harga</th>
                    <th className="px-3 py-2 text-right">Pajak</th>
                    <th className="px-3 py-2 text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {detail.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{l.product_nama || l.deskripsi}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatQtyMilli(l.qty_milli || 0, l.satuan)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatSen(l.harga || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatSen(l.tax_amount || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{formatSen(l.jumlah || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail.journal.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-[#6B7280] mb-1">Ayat Jurnal Akuntansi</h4>
                <div className="overflow-x-auto border border-[#E5E7EB] rounded-xl">
                  <table className="min-w-full text-xs">
                    <thead className="bg-[#F9FAFB] text-[#6B7280]">
                      <tr>
                        <th className="px-3 py-2 text-left">Akun</th>
                        <th className="px-3 py-2 text-right">Debit</th>
                        <th className="px-3 py-2 text-right">Kredit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                      {detail.journal.map((j) => (
                        <tr key={j.id}>
                          <td className="px-3 py-2">{j.account_kode} — {j.account_nama}</td>
                          <td className="px-3 py-2 text-right font-mono">{j.debit ? formatSen(j.debit) : "-"}</td>
                          <td className="px-3 py-2 text-right font-mono">{j.kredit ? formatSen(j.kredit) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-[#E5E7EB]">
              <div className="flex flex-wrap gap-2">
                {detail.document.type === (isSales ? "sales_order" : "purchase_order") && (
                  <>
                    <button type="button" onClick={() => openNewForm(isSales ? "sales_delivery" : "purchase_delivery", detail)} className={BTN_SECONDARY}>
                      Buat Pengiriman
                    </button>
                    <button type="button" onClick={() => openNewForm(isSales ? "sales_invoice" : "purchase_invoice", detail)} className={BTN_PRIMARY}>
                      Konversi ke Faktur
                    </button>
                  </>
                )}
                {detail.document.type === (isSales ? "sales_invoice" : "purchase_invoice") && (
                  <>
                    <button type="button" onClick={() => openNewForm(isSales ? "sales_return" : "purchase_return", detail)} className={BTN_SECONDARY}>
                      <RotateCcw className="h-3.5 w-3.5" /> Buat Retur
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await saveRecurring({ template_document_id: detail.document.id, interval_n: 1, interval_unit: "bulan", berikut: todayWib() });
                          showToast({ message: "Jadwal transaksi berulang bulanan dibuat.", variant: "success" });
                        } catch (e) {
                          showToast({ message: keuanganErrorMessage(e), variant: "error" });
                        }
                      }}
                      className={BTN_SECONDARY}
                    >
                      <Repeat className="h-3.5 w-3.5" /> Jadikan Berulang
                    </button>
                    {isSales && (
                      <button type="button" onClick={() => window.print()} className={BTN_SECONDARY}>
                        <Printer className="h-3.5 w-3.5" /> Cetak
                      </button>
                    )}
                  </>
                )}
              </div>
              {!detail.document.locked && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await deleteTransaction(detail.document.id);
                      showToast({ message: "Dokumen dihapus.", variant: "success" });
                      setDetail(null);
                      await load();
                    } catch (e) {
                      showToast({ message: keuanganErrorMessage(e), variant: "error" });
                    }
                  }}
                  className={BTN_DANGER}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </button>
              )}
            </div>
          </div>
        )}
      </ModalFrame>

      {/* Modal Buat Transaksi */}
      <ModalFrame open={showCreate} title={`Buat ${DOC_TYPE_LABELS[docType] || docType}`} onClose={() => setShowCreate(false)} maxWidth="max-w-4xl">
        <form onSubmit={handleSubmitDoc} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Jenis Dokumen</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className={INPUT_CLS}>
                {isSales ? (
                  <>
                    <option value="sales_quote">Penawaran Penjualan</option>
                    <option value="sales_order">Pemesanan Penjualan</option>
                    <option value="sales_delivery">Pengiriman Penjualan</option>
                    <option value="sales_invoice">Faktur Penjualan</option>
                    <option value="sales_return">Retur Penjualan</option>
                    <option value="credit_memo">Kredit Memo</option>
                  </>
                ) : (
                  <>
                    <option value="purchase_request">Permintaan Pembelian</option>
                    <option value="purchase_quote">Penawaran Pembelian</option>
                    <option value="purchase_order">Pemesanan Pembelian</option>
                    <option value="purchase_delivery">Penerimaan Barang</option>
                    <option value="purchase_invoice">Tagihan Pembelian</option>
                    <option value="purchase_return">Retur Pembelian</option>
                    <option value="debit_memo">Debit Memo</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Tanggal *</label>
              <input type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Anak Perusahaan *</label>
              <select required value={unitKode} onChange={(e) => setUnitKode(e.target.value)} className={INPUT_CLS}>
                {units.map((u) => (
                  <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">{isSales ? "Pelanggan" : "Vendor / Supplier"}</label>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={INPUT_CLS}>
                <option value="">-- Pilih Kontak --</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.nama_tampilan}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Gudang</label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={INPUT_CLS}>
                <option value="">Otomatis (Default Unit)</option>
                {warehouses.filter((w) => !unitKode || w.unit_kode === unitKode).map((w) => (
                  <option key={w.id} value={w.id}>{w.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Syarat Pembayaran</label>
              <select value={termId} onChange={(e) => setTermId(e.target.value)} className={INPUT_CLS}>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.nama}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2 border-t border-[#E5E7EB] pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6B7280]">Daftar Item</span>
              <button
                type="button"
                onClick={() => setLines([...lines, { product_id: "", deskripsi: "", qty: 1, satuan: "pcs", harga: 0, diskon: "", tax_id: "" }])}
                className={BTN_SECONDARY}
              >
                <Plus className="h-3.5 w-3.5" /> Tambah Baris
              </button>
            </div>
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center rounded-xl bg-[#F9FAFB] p-2.5">
                <select value={l.product_id} onChange={(e) => handleProductPick(idx, e.target.value)} className={`${INPUT_CLS} sm:col-span-3`}>
                  <option value="">-- Pilih Produk --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.nama}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Deskripsi"
                  value={l.deskripsi}
                  onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, deskripsi: e.target.value } : x)))}
                  className={`${INPUT_CLS} sm:col-span-2`}
                />
                <input
                  type="number"
                  step="0.001"
                  min={0.001}
                  value={l.qty}
                  onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value || 1) } : x)))}
                  className={`${INPUT_CLS} sm:col-span-1`}
                />
                <div className="sm:col-span-2">
                  <RupiahInput valueSen={l.harga} onChangeSen={(v) => setLines(lines.map((x, i) => (i === idx ? { ...x, harga: v } : x)))} />
                </div>
                <input
                  type="text"
                  placeholder="Diskon % (10 / 50+20)"
                  value={l.diskon}
                  onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, diskon: e.target.value } : x)))}
                  className={`${INPUT_CLS} sm:col-span-2`}
                />
                <select
                  value={l.tax_id}
                  onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, tax_id: e.target.value } : x)))}
                  className={`${INPUT_CLS} sm:col-span-1`}
                >
                  <option value="">Non-Pajak</option>
                  {taxes.map((t) => (
                    <option key={t.id} value={t.id}>{t.nama}</option>
                  ))}
                </select>
                <button type="button" onClick={() => lines.length > 1 && setLines(lines.filter((_, i) => i !== idx))} className="text-red-600 p-1 justify-self-end sm:col-span-1">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-[#E5E7EB] pt-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Diskon Tambahan</label>
              <RupiahInput valueSen={diskonGlobal} onChangeSen={setDiskonGlobal} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Ongkos Kirim</label>
              <RupiahInput valueSen={ongkir} onChangeSen={setOngkir} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">No. Faktur Pajak</label>
              <input type="text" value={noFakturPajak} onChange={(e) => setNoFakturPajak(e.target.value)} className={INPUT_CLS} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={hargaTermasukPajak} onChange={(e) => setHargaTermasukPajak(e.target.checked)} className="h-4 w-4 accent-amber-600" />
              Harga sudah termasuk pajak
            </label>
            <input type="text" placeholder="Memo internal..." value={memo} onChange={(e) => setMemo(e.target.value)} className={`${INPUT_CLS} max-w-sm`} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Menyimpan..." : "Simpan Transaksi"}</button>
          </div>
        </form>
      </ModalFrame>

      {/* Modal Pembayaran Faktur / Tagihan */}
      <ModalFrame open={Boolean(payDoc)} title={payDoc ? `Pembayaran ${payDoc.no}` : ""} onClose={() => setPayDoc(null)} maxWidth="max-w-lg">
        {payDoc && (
          <form onSubmit={handlePaySubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#6B7280] mb-1">Tanggal Bayar</label>
                <input type="date" required value={payTanggal} onChange={(e) => setPayTanggal(e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6B7280] mb-1">{isSales ? "Setor Ke" : "Bayar Dari"}</label>
                <select required value={payCashAcc} onChange={(e) => setPayCashAcc(e.target.value)} className={INPUT_CLS}>
                  {cashAccounts.map((a) => (
                    <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Nominal Tagihan Dilunasi (Sisa {formatSen(payDoc.sisa)})</label>
              <RupiahInput valueSen={payAmount} onChangeSen={setPayAmount} />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-[#E5E7EB] pt-2">
              <div>
                <label className="block text-xs font-bold text-[#6B7280] mb-1">Akun Pemotongan / Biaya Bank</label>
                <select value={payWithholdingAcc} onChange={(e) => setPayWithholdingAcc(e.target.value)} className={INPUT_CLS}>
                  <option value="">-- Tidak ada --</option>
                  {accounts.map((a) => (
                    <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6B7280] mb-1">Nominal Pemotongan</label>
                <RupiahInput valueSen={payWithholdingAmt} onChangeSen={setPayWithholdingAmt} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayDoc(null)} className={BTN_SECONDARY}>Batal</button>
              <button type="submit" disabled={saving} className={BTN_PRIMARY}>
                <CheckCircle2 className="h-4 w-4" /> {saving ? "Memproses..." : "Catat Pembayaran"}
              </button>
            </div>
          </form>
        )}
      </ModalFrame>
    </div>
  );
}
