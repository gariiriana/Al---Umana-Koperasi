// Beranda Modul Keuangan (Rilis 1-4): Onboarding, KPI Penjualan/Biaya/Piutang/Hutang/Kas, Arus 6 Bulan, Notifikasi & Aksi Cepat.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  FilePlus2,
  Landmark,
  Package,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { getBerandaSummary, getMe, listAccounts, listContacts, listTaxes, listUnits } from "@/keuangan/api";
import { DOC_TYPE_LABELS, formatQtyMilli, formatSen, formatTanggalShort, keuanganErrorMessage } from "@/keuangan/format";
import type { Account, BerandaSummaryResponse, Contact, KeuanganMe, Tax, Unit } from "@/keuangan/types";
import { CashTxModal, type CashTxMode } from "@/keuangan/components/CashTxModal";
import { useToast } from "@/contexts/ToastContext";

export function BerandaPage() {
  const { showToast } = useToast();
  const [me, setMe] = useState<KeuanganMe | null>(null);
  const [summary, setSummary] = useState<BerandaSummaryResponse | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [unitFilter, setUnitFilter] = useState("");
  const [cashModal, setCashModal] = useState<CashTxMode | null>(null);

  const load = async () => {
    try {
      const [m, sum, u, accRes, c, t] = await Promise.all([
        getMe(),
        getBerandaSummary(unitFilter || undefined),
        listUnits(),
        listAccounts(),
        listContacts(),
        listTaxes(),
      ]);
      setMe(m);
      setSummary(sum);
      setUnits(u);
      setAccounts(accRes.accounts);
      setContacts(c);
      setTaxes(t);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, [unitFilter]);

  const maxFlow = Math.max(1, ...(summary?.monthly_flow || []).flatMap((m) => [Math.abs(m.pendapatan), Math.abs(m.beban)]));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Beranda Keuangan Al-Umanaa
          </h1>
          <p className="text-sm text-[#6B7280]">Ringkasan arus kas, penjualan, pembelian, stok & pengingat periode berjalan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="">Semua Unit (Gabungan)</option>
            {units.map((u) => (
              <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
            ))}
          </select>
          <Link
            to="/keuangan/laporan/ringkasan-bisnis"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-bold text-white shadow-xs"
          >
            <TrendingUp className="h-4 w-4" /> Ringkasan Bisnis
          </Link>
        </div>
      </div>

      {/* Onboarding alerts */}
      {me && (!me.onboarding.hasUnits || !me.onboarding.hasOpeningBalance) && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Langkah Awal Penyiapan Pembukuan
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <Link to="/keuangan/daftar-lainnya" className="flex items-center justify-between rounded-xl bg-white border border-amber-100 px-3 py-2.5 font-semibold">
              <span>1. Tambah Anak Perusahaan ({me.onboarding.hasUnits ? "Selesai" : "Belum"})</span>
              <span className="text-amber-700">Atur →</span>
            </Link>
            <Link to="/keuangan/akun/saldo-awal" className="flex items-center justify-between rounded-xl bg-white border border-amber-100 px-3 py-2.5 font-semibold">
              <span>2. Atur Saldo Awal ({me.onboarding.hasOpeningBalance ? "Selesai" : "Belum"})</span>
              <span className="text-amber-700">Isi Saldo →</span>
            </Link>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Total Saldo Kas & Bank</div>
          <div className="mt-1 text-xl font-extrabold text-[#111827] font-mono">{formatSen(summary?.kpi.saldo_kas_bank || 0)}</div>
          <div className="mt-1 text-xs text-[#6B7280]">{summary?.kas_accounts.length || 0} akun kas & bank</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Penjualan Bulan Ini</div>
          <div className="mt-1 text-xl font-extrabold text-emerald-700 font-mono">{formatSen(summary?.kpi.penjualan_bulan_ini || 0)}</div>
          <div className="mt-1 text-xs text-[#6B7280]">Laba berjalan: {formatSen(summary?.kpi.laba_bulan_ini || 0)}</div>
        </div>
        <Link to="/keuangan/penjualan" className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs hover:border-amber-400 transition">
          <div className="text-xs font-bold text-[#6B7280]">Piutang Belum Dibayar ({summary?.kpi.piutang_count || 0})</div>
          <div className="mt-1 text-xl font-extrabold text-[#111827] font-mono">{formatSen(summary?.kpi.piutang_terbuka || 0)}</div>
          <div className="mt-1 text-xs text-red-600 font-semibold">Jatuh tempo: {formatSen(summary?.kpi.piutang_jatuh_tempo || 0)}</div>
        </Link>
        <Link to="/keuangan/pembelian" className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs hover:border-amber-400 transition">
          <div className="text-xs font-bold text-[#6B7280]">Hutang & Biaya Terbuka ({summary?.kpi.hutang_count || 0})</div>
          <div className="mt-1 text-xl font-extrabold text-[#111827] font-mono">{formatSen(summary?.kpi.hutang_terbuka || 0)}</div>
          <div className="mt-1 text-xs text-red-600 font-semibold">Jatuh tempo: {formatSen(summary?.kpi.hutang_jatuh_tempo || 0)}</div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-3">
        <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-[#111827]">Aksi Cepat</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <Link to="/keuangan/penjualan" className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E7EB] p-3 hover:border-amber-400 hover:bg-amber-50/40">
            <ShoppingBag className="h-5 w-5 text-amber-600" />
            <span className="text-xs font-bold text-center">Faktur Jual</span>
          </Link>
          <Link to="/keuangan/pembelian" className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E7EB] p-3 hover:border-amber-400 hover:bg-amber-50/40">
            <ShoppingCart className="h-5 w-5 text-indigo-600" />
            <span className="text-xs font-bold text-center">Tagihan Beli</span>
          </Link>
          <Link to="/keuangan/biaya" className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E7EB] p-3 hover:border-amber-400 hover:bg-amber-50/40">
            <Receipt className="h-5 w-5 text-rose-600" />
            <span className="text-xs font-bold text-center">Catat Biaya</span>
          </Link>
          <Link to="/keuangan/produk" className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E7EB] p-3 hover:border-amber-400 hover:bg-amber-50/40">
            <Package className="h-5 w-5 text-teal-600" />
            <span className="text-xs font-bold text-center">Produk & Stok</span>
          </Link>
          <button type="button" onClick={() => setCashModal("receive_money")} className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E7EB] p-3 hover:border-amber-400 hover:bg-amber-50/40 cursor-pointer">
            <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
            <span className="text-xs font-bold text-center">Terima Uang</span>
          </button>
          <button type="button" onClick={() => setCashModal("send_money")} className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E7EB] p-3 hover:border-amber-400 hover:bg-amber-50/40 cursor-pointer">
            <ArrowUpRight className="h-5 w-5 text-red-600" />
            <span className="text-xs font-bold text-center">Kirim Uang</span>
          </button>
          <button type="button" onClick={() => setCashModal("transfer_money")} className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E7EB] p-3 hover:border-amber-400 hover:bg-amber-50/40 cursor-pointer">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            <span className="text-xs font-bold text-center">Transfer</span>
          </button>
          <Link to="/keuangan/laporan" className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E7EB] p-3 hover:border-amber-400 hover:bg-amber-50/40">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            <span className="text-xs font-bold text-center">Laporan</span>
          </Link>
        </div>
      </div>

      {/* Tren 6 Bulan & Top Produk + Notifikasi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-[#E5E7EB] p-5 space-y-3">
          <h2 className="font-bold text-sm text-[#111827]">Pendapatan vs Beban (6 Bulan Terakhir)</h2>
          <div className="space-y-2">
            {(summary?.monthly_flow || []).map((m) => (
              <div key={m.bulan} className="text-xs space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>{m.bulan}</span>
                  <span className="font-mono text-emerald-700">+{formatSen(m.pendapatan)} / <span className="text-rose-700">-{formatSen(m.beban)}</span></span>
                </div>
                <div className="grid grid-cols-2 gap-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-l-full" style={{ width: `${Math.min(100, Math.round((Math.max(0, m.pendapatan) / maxFlow) * 100))}%` }} />
                  <div className="bg-rose-400 h-full rounded-r-full" style={{ width: `${Math.min(100, Math.round((Math.max(0, m.beban) / maxFlow) * 100))}%` }} />
                </div>
              </div>
            ))}
            {(!summary || summary.monthly_flow.length === 0) && (
              <p className="text-xs text-[#6B7280] py-6 text-center">Belum ada transaksi pendapatan atau beban.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-[#111827]">
            <Bell className="h-4 w-4 text-amber-600" /> Pengingat & Notifikasi
          </div>
          <div className="space-y-2 text-xs max-h-60 overflow-y-auto">
            {(summary?.notifications || []).map((n) => (
              <div key={n.id} className="rounded-xl bg-amber-50/70 border border-amber-100 px-3 py-2">
                <div className="font-bold text-[#111827]">{n.payload.title || n.kind}</div>
                {n.payload.message && <div className="text-[#6B7280] mt-0.5">{n.payload.message}</div>}
              </div>
            ))}
            {(!summary || summary.notifications.length === 0) && (
              <p className="text-[#6B7280] py-4 text-center">Tidak ada pengingat jatuh tempo atau stok menipis.</p>
            )}
          </div>
        </div>
      </div>

      {/* Produk Terlaris & Transaksi Terbaru */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-[#111827]">Produk Terlaris Bulan Ini</h2>
            <Link to="/keuangan/produk" className="text-xs font-bold text-amber-700 hover:underline">Lihat Produk →</Link>
          </div>
          <div className="divide-y divide-[#F3F4F6] text-xs">
            {(summary?.top_products || []).map((p) => (
              <div key={p.id} className="py-2 flex justify-between">
                <span className="font-semibold">{p.nama} ({formatQtyMilli(p.qty_milli, p.satuan)})</span>
                <span className="font-mono font-bold">{formatSen(p.omzet)}</span>
              </div>
            ))}
            {(!summary || summary.top_products.length === 0) && <p className="text-[#6B7280] py-3">Belum ada penjualan produk bulan ini.</p>}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-[#111827]">Transaksi Terbaru</h2>
            <Link to="/keuangan/kas-bank" className="text-xs font-bold text-amber-700 hover:underline">Kas & Bank →</Link>
          </div>
          <div className="divide-y divide-[#F3F4F6] text-xs">
            {(summary?.recent_documents || []).map((d) => (
              <div key={d.id} className="py-2 flex justify-between items-center">
                <div>
                  <span className="font-bold">{d.no}</span> · {DOC_TYPE_LABELS[d.type] || d.type}
                  <div className="text-[#6B7280]">{formatTanggalShort(d.tanggal)} {d.contact_nama ? `· ${d.contact_nama}` : ""}</div>
                </div>
                <span className="font-mono font-bold">{formatSen(d.total)}</span>
              </div>
            ))}
            {(!summary || summary.recent_documents.length === 0) && <p className="text-[#6B7280] py-3">Belum ada transaksi tercatat.</p>}
          </div>
        </div>
      </div>

      {/* Pintasan Master */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/keuangan/kas-bank" className="rounded-2xl bg-white border border-[#E5E7EB] p-4 hover:border-amber-400 transition flex items-start gap-3">
          <Landmark className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-[#111827]">Kas & Bank (BKU)</div>
            <p className="text-xs text-[#6B7280] mt-1">Lihat Buku Kas Umum per rekening dan mutasi masuk/keluar.</p>
          </div>
        </Link>
        <Link to="/keuangan/daftar-lainnya/tutup-buku" className="rounded-2xl bg-white border border-[#E5E7EB] p-4 hover:border-amber-400 transition flex items-start gap-3">
          <FilePlus2 className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-[#111827]">Kunci Periode & Tutup Buku</div>
            <p className="text-xs text-[#6B7280] mt-1">Kunci transaksi atau tutup buku periode dengan jurnal penutup.</p>
          </div>
        </Link>
        <Link to="/keuangan/pengaturan" className="rounded-2xl bg-white border border-[#E5E7EB] p-4 hover:border-amber-400 transition flex items-start gap-3">
          <FilePlus2 className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-[#111827]">Pemetaan Akun & Penomoran</div>
            <p className="text-xs text-[#6B7280] mt-1">Pengaturan profil, akun default, penomoran otomatis & audit log.</p>
          </div>
        </Link>
      </div>

      {cashModal && (
        <CashTxModal
          open={Boolean(cashModal)}
          mode={cashModal}
          accounts={accounts}
          units={units}
          contacts={contacts}
          taxes={taxes}
          onClose={() => setCashModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
