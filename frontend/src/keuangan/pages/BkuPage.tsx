// Halaman BKU (Buku Kas Umum / Rincian Akun Kas & Bank) sesuai PRD 02-kas-bank.md.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDownLeft, ArrowLeft, ArrowRightLeft, ArrowUpRight, Download, FileSpreadsheet, FileText, Lock, Paperclip, Search } from "lucide-react";
import { getBku, listAccounts, listContacts, listTaxes, listUnits } from "@/keuangan/api";
import { firstDayOfMonthWib, formatSen, formatTanggal, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportBkuPdf, exportReportCsv, exportReportExcel, senCell } from "@/keuangan/export/reportExport";
import type { Account, BkuResponse, Contact, Tax, Unit } from "@/keuangan/types";
import { CashTxModal, type CashTxMode } from "@/keuangan/components/CashTxModal";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function BkuPage() {
  const { kode = "" } = useParams();
  const decodedKode = decodeURIComponent(kode);
  const { showToast } = useToast();

  const [dari, setDari] = useState(firstDayOfMonthWib());
  const [sampai, setSampai] = useState(todayWib());
  const [unitKode, setUnitKode] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [q, setQ] = useState("");

  const [bku, setBku] = useState<BkuResponse | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [modal, setModal] = useState<{ mode: CashTxMode; editDocId?: string } | null>(null);

  const load = async () => {
    if (!decodedKode) return;
    try {
      const [res, u, a, c, t] = await Promise.all([
        getBku(decodedKode, { dari, sampai, unit_kode: unitKode || undefined, type: typeFilter || undefined, q: q || undefined }),
        listUnits(),
        listAccounts(),
        listContacts(),
        listTaxes(),
      ]);
      setBku(res);
      setUnits(u);
      setAccounts(a.accounts);
      setContacts(c);
      setTaxes(t);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, [decodedKode]);

  const buildExport = () => {
    if (!bku) return null;
    const activeUnit = units.find((u) => u.kode === (unitKode || bku.account.unit_kode));
    const headers = ["Tanggal", "No. Bukti", "Tipe", "Unit", "Kontak", "Kode Akun", "Nama Akun", "Uraian", "Penerimaan", "Pengeluaran", "Saldo"];
    const rows = [
      ["", "Saldo Awal", "", "", "", "", "", `Saldo sebelum ${formatTanggal(bku.periode.dari)}`, "", "", senCell(bku.ringkasan.saldoAwal, false)],
      ...bku.rows.map((r) => [
        formatTanggal(r.tanggal),
        r.no_bukti,
        r.tipe_label,
        r.unit_kode,
        r.contact_nama || "-",
        r.kode_akun,
        r.nama_akun,
        r.uraian,
        r.penerimaan ? senCell(r.penerimaan, false) : "",
        r.pengeluaran ? senCell(r.pengeluaran, false) : "",
        senCell(r.saldo, false),
      ]),
      ["", "Saldo Akhir", "", "", "", "", "", "", senCell(bku.ringkasan.totalPenerimaan, false), senCell(bku.ringkasan.totalPengeluaran, false), senCell(bku.ringkasan.saldoAkhir, false)],
    ];
    return {
      laporan: "bku",
      title: `Buku Kas Umum — ${bku.account.kode} ${bku.account.nama}`,
      subtitle: `Periode ${formatTanggal(bku.periode.dari)} s.d. ${formatTanggal(bku.periode.sampai)}`,
      unitLabel: unitKode || bku.account.unit_kode || "Gabungan",
      accountName: `${bku.account.kode} ${bku.account.nama}`,
      bankInfo: bku.account.bank_nama ? `${bku.account.bank_nama} ${bku.account.no_rekening || ""}`.trim() : "",
      pjNama: activeUnit?.pj_nama || "",
      pjJabatan: activeUnit?.pj_jabatan || "",
      headers,
      rows,
      filenameBase: `bku-${bku.account.kode}-${bku.periode.dari}-${bku.periode.sampai}`,
      filter: { kode: decodedKode, dari, sampai, unit_kode: unitKode },
    };
  };

  const openRow = (row: BkuResponse["rows"][number]) => {
    if (row.tipe === "receive_money" || row.tipe === "send_money" || row.tipe === "transfer_money") {
      setModal({ mode: row.tipe, editDocId: row.document_id });
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/keuangan/kas-bank" className={BTN_SECONDARY}>
            <ArrowLeft className="h-4 w-4" /> Kas & Bank
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-['Manrope',system-ui,sans-serif] text-xl sm:text-2xl font-extrabold text-[#111827]">
                BKU: {bku?.account.kode} — {bku?.account.nama || "..."}
              </h1>
              {bku && <UnitBadge kode={bku.account.unit_kode} />}
            </div>
            <p className="text-xs text-[#6B7280]">
              {bku?.account.bank_nama ? `${bku.account.bank_nama} ${bku.account.no_rekening || ""}` : "Buku Kas Umum dengan saldo berjalan"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setModal({ mode: "receive_money" })} className={BTN_SECONDARY}>
            <ArrowDownLeft className="h-4 w-4 text-emerald-600" /> Terima Uang
          </button>
          <button type="button" onClick={() => setModal({ mode: "send_money" })} className={BTN_SECONDARY}>
            <ArrowUpRight className="h-4 w-4 text-red-600" /> Kirim Uang
          </button>
          <button type="button" onClick={() => setModal({ mode: "transfer_money" })} className={BTN_SECONDARY}>
            <ArrowRightLeft className="h-4 w-4 text-blue-600" /> Transfer
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 flex flex-wrap items-end gap-3 shadow-xs">
        <div>
          <label className="block text-xs font-bold text-[#6B7280] mb-1">Dari</label>
          <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#6B7280] mb-1">Sampai</label>
          <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#6B7280] mb-1">Unit</label>
          <select value={unitKode} onChange={(e) => setUnitKode(e.target.value)} className={INPUT_CLS}>
            <option value="">Semua Unit</option>
            {units.map((u) => (
              <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-[#6B7280] mb-1">Jenis</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={INPUT_CLS}>
            <option value="">Semua Jenis</option>
            <option value="receive_money">Terima Uang</option>
            <option value="send_money">Kirim Uang</option>
            <option value="transfer_money">Transfer Uang</option>
            <option value="sales_payment">Terima Pembayaran</option>
            <option value="purchase_payment">Kirim Pembayaran</option>
            <option value="expense">Biaya</option>
            <option value="journal">Jurnal Umum</option>
            <option value="opening_balance">Saldo Awal</option>
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-bold text-[#6B7280] mb-1">Cari</label>
          <div className="relative">
            <Search className="h-4 w-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nomor / deskripsi..." className={`${INPUT_CLS} pl-9`} />
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={load} className={BTN_PRIMARY}>Tampilkan</button>
          <button type="button" onClick={() => { const ex = buildExport(); if (ex) exportBkuPdf(ex); }} className={BTN_SECONDARY}>
            <FileText className="h-4 w-4 text-red-600" /> PDF
          </button>
          <button type="button" onClick={() => { const ex = buildExport(); if (ex) exportReportExcel(ex); }} className={BTN_SECONDARY}>
            <FileSpreadsheet className="h-4 w-4 text-emerald-700" /> Excel
          </button>
          <button type="button" onClick={() => { const ex = buildExport(); if (ex) exportReportCsv(ex); }} className={BTN_SECONDARY}>
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {/* Ringkasan Saldo BKU */}
      {bku && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white border border-[#E5E7EB] p-3">
            <div className="text-xs font-bold text-[#6B7280]">Saldo Awal</div>
            <div className="text-base font-extrabold text-[#111827] font-mono">{formatSen(bku.ringkasan.saldoAwal)}</div>
          </div>
          <div className="rounded-xl bg-white border border-emerald-200 p-3">
            <div className="text-xs font-bold text-[#6B7280]">Total Penerimaan</div>
            <div className="text-base font-extrabold text-emerald-700 font-mono">{formatSen(bku.ringkasan.totalPenerimaan)}</div>
          </div>
          <div className="rounded-xl bg-white border border-red-200 p-3">
            <div className="text-xs font-bold text-[#6B7280]">Total Pengeluaran</div>
            <div className="text-base font-extrabold text-red-700 font-mono">{formatSen(bku.ringkasan.totalPengeluaran)}</div>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <div className="text-xs font-bold text-amber-800">Saldo Akhir</div>
            <div className="text-base font-extrabold text-amber-950 font-mono">{formatSen(bku.ringkasan.saldoAkhir)}</div>
          </div>
        </div>
      )}

      {/* Tabel BKU */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
            <tr>
              <th className="px-3 py-3 text-left">Tanggal</th>
              <th className="px-3 py-3 text-left">No. Bukti & Tipe</th>
              <th className="px-3 py-3 text-left">Unit</th>
              <th className="px-3 py-3 text-left">Kontak / Akun Lawan</th>
              <th className="px-3 py-3 text-left">Uraian</th>
              <th className="px-3 py-3 text-right">Penerimaan</th>
              <th className="px-3 py-3 text-right">Pengeluaran</th>
              <th className="px-3 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {bku && (
              <tr className="bg-slate-50 font-semibold text-xs text-[#4B5563]">
                <td colSpan={7} className="px-3 py-2">Saldo Awal (sebelum {formatTanggal(bku.periode.dari)})</td>
                <td className="px-3 py-2 text-right font-mono">{formatSen(bku.ringkasan.saldoAwal)}</td>
              </tr>
            )}
            {bku?.rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => openRow(r)}
                className={r.tipe === "receive_money" || r.tipe === "send_money" || r.tipe === "transfer_money" ? "hover:bg-amber-50/50 cursor-pointer" : ""}
              >
                <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                  {r.locked && <Lock className="inline h-3 w-3 mr-1 text-amber-600" />}
                  {formatTanggal(r.tanggal)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="text-xs font-bold text-[#111827]">{r.tipe_label}</div>
                  <div className="font-mono text-[11px] text-amber-700">{r.no_bukti}</div>
                </td>
                <td className="px-3 py-2.5"><UnitBadge kode={r.unit_kode} /></td>
                <td className="px-3 py-2.5 text-xs">
                  {r.contact_nama && <div className="font-semibold text-[#111827]">{r.contact_nama}</div>}
                  <div className="text-[#4B5563]">{r.kode_akun} {r.nama_akun}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-[#4B5563]">
                  <span>{r.uraian}</span>
                  {r.attachment_count > 0 && <Paperclip className="inline h-3.5 w-3.5 ml-1.5 text-amber-600" />}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-emerald-700 whitespace-nowrap">
                  {r.penerimaan ? formatSen(r.penerimaan) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-red-700 whitespace-nowrap">
                  {r.pengeluaran ? formatSen(r.pengeluaran) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap">{formatSen(r.saldo)}</td>
              </tr>
            ))}
            {bku && bku.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-[#6B7280]">Tidak ada transaksi pada periode & filter ini.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <CashTxModal
          open={Boolean(modal)}
          mode={modal.mode}
          editDocId={modal.editDocId}
          defaultCashKode={decodedKode}
          accounts={accounts}
          units={units}
          contacts={contacts}
          taxes={taxes}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
