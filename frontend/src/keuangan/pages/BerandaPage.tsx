// Beranda Modul Keuangan (Rilis 1: Onboarding Status + Aksi Cepat Kas/Bank, Jurnal Umum, Laporan).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  FilePlus2,
  Landmark,
  Lock,
  TrendingUp,
} from "lucide-react";
import { getMe, listAccounts, listContacts, listTaxes, listUnits } from "@/keuangan/api";
import { formatSen, keuanganErrorMessage } from "@/keuangan/format";
import type { Account, Contact, KeuanganMe, Tax, Unit } from "@/keuangan/types";
import { CashTxModal, type CashTxMode } from "@/keuangan/components/CashTxModal";
import { useToast } from "@/contexts/ToastContext";

export function BerandaPage() {
  const { showToast } = useToast();
  const [me, setMe] = useState<KeuanganMe | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [cashModal, setCashModal] = useState<CashTxMode | null>(null);

  const load = async () => {
    try {
      const [m, u, accRes, c, t] = await Promise.all([getMe(), listUnits(), listAccounts(), listContacts(), listTaxes()]);
      setMe(m);
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
  }, []);

  const cashCount = accounts.filter((a) => !a.is_header && a.kategori === 3).length;
  const totalKas = accounts.filter((a) => !a.is_header && a.kategori === 3).reduce((s, a) => s + (a.saldo || 0), 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Beranda Keuangan Al-Umanaa
          </h1>
          <p className="text-sm text-[#6B7280]">
            Akuntansi Inti (Rilis 1): Daftar Akun, Saldo Awal, Jurnal Umum, Kas & Bank (BKU), dan 8 Laporan Sekilas Bisnis.
          </p>
        </div>
        <Link
          to="/keuangan/laporan/ringkasan-bisnis"
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-bold text-white shadow-xs"
        >
          <TrendingUp className="h-4 w-4" /> Ringkasan Bisnis
        </Link>
      </div>

      {/* Onboarding alerts */}
      {me && (!me.onboarding.hasUnits || !me.onboarding.hasOpeningBalance) && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Langkah Awal Penyiapan Pembukuan
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-white border border-amber-100 px-3 py-2.5">
              <div className="flex items-center gap-2">
                {me.onboarding.hasUnits ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <span>1. Tambah Anak Perusahaan (TKS, KTR, PST, dll.)</span>
              </div>
              <Link to="/keuangan/daftar-lainnya" className="font-bold text-amber-700 hover:underline">
                Atur →
              </Link>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white border border-amber-100 px-3 py-2.5">
              <div className="flex items-center gap-2">
                {me.onboarding.hasOpeningBalance ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <span>2. Atur Saldo Awal per Anak Perusahaan</span>
              </div>
              <Link to="/keuangan/akun/saldo-awal" className="font-bold text-amber-700 hover:underline">
                Isi Saldo →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Status Ringkas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Total Saldo Kas & Bank</div>
          <div className="mt-1 text-xl font-extrabold text-[#111827]">{formatSen(totalKas)}</div>
          <div className="mt-1 text-xs text-[#6B7280]">{cashCount} akun kas/bank aktif</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Anak Perusahaan</div>
          <div className="mt-1 text-xl font-extrabold text-[#111827]">{units.length} Unit</div>
          <div className="mt-1 text-xs text-[#6B7280] truncate">
            {units.length ? units.map((u) => u.kode).join(", ") : "Belum ada unit"}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Kontak Terdaftar</div>
          <div className="mt-1 text-xl font-extrabold text-[#111827]">{contacts.length}</div>
          <div className="mt-1 text-xs text-[#6B7280]">Pelanggan, Supplier, Karyawan</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-xs font-bold text-[#6B7280]">Kunci Periode Terakhir</div>
          <div className="mt-1 text-xl font-extrabold text-[#111827] flex items-center gap-1.5">
            <Lock className="h-4 w-4 text-amber-600" />
            {me?.onboarding.maxLockedDate || "Belum dikunci"}
          </div>
          <div className="mt-1 text-xs text-[#6B7280]">
            Lampiran: {Math.round((me?.onboarding.attachmentBytes || 0) / 1024)} KB
          </div>
        </div>
      </div>

      {/* Grid Aksi Cepat (sesuai PRD 08 & Rilis 1) */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] p-5 shadow-xs space-y-4">
        <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-[#111827]">Aksi Cepat</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => setCashModal("receive_money")}
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] p-4 hover:border-amber-400 hover:bg-amber-50/50 transition cursor-pointer"
          >
            <ArrowDownLeft className="h-6 w-6 text-emerald-600" />
            <span className="text-xs font-bold text-[#111827]">Terima Uang</span>
          </button>
          <button
            type="button"
            onClick={() => setCashModal("send_money")}
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] p-4 hover:border-amber-400 hover:bg-amber-50/50 transition cursor-pointer"
          >
            <ArrowUpRight className="h-6 w-6 text-red-600" />
            <span className="text-xs font-bold text-[#111827]">Kirim Uang</span>
          </button>
          <button
            type="button"
            onClick={() => setCashModal("transfer_money")}
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] p-4 hover:border-amber-400 hover:bg-amber-50/50 transition cursor-pointer"
          >
            <ArrowRightLeft className="h-6 w-6 text-blue-600" />
            <span className="text-xs font-bold text-[#111827]">Transfer Uang</span>
          </button>
          <Link
            to="/keuangan/jurnal-umum"
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] p-4 hover:border-amber-400 hover:bg-amber-50/50 transition"
          >
            <FilePlus2 className="h-6 w-6 text-amber-600" />
            <span className="text-xs font-bold text-[#111827]">Jurnal Umum</span>
          </Link>
          <Link
            to="/keuangan/kas-bank"
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] p-4 hover:border-amber-400 hover:bg-amber-50/50 transition"
          >
            <Landmark className="h-6 w-6 text-amber-700" />
            <span className="text-xs font-bold text-[#111827]">Kas & Bank (BKU)</span>
          </Link>
          <Link
            to="/keuangan/laporan"
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] p-4 hover:border-amber-400 hover:bg-amber-50/50 transition"
          >
            <BarChart3 className="h-6 w-6 text-purple-600" />
            <span className="text-xs font-bold text-[#111827]">Semua Laporan</span>
          </Link>
        </div>
      </div>

      {/* Pintasan Master */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/keuangan/akun" className="rounded-2xl bg-white border border-[#E5E7EB] p-4 hover:border-amber-400 transition flex items-start gap-3">
          <BookOpen className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-[#111827]">Daftar Akun & Saldo Awal</div>
            <p className="text-xs text-[#6B7280] mt-1">Kelola COA 17 kategori, impor/ekspor akun, dan input Saldo Awal per anak perusahaan.</p>
          </div>
        </Link>
        <Link to="/keuangan/daftar-lainnya/tutup-buku" className="rounded-2xl bg-white border border-[#E5E7EB] p-4 hover:border-amber-400 transition flex items-start gap-3">
          <Lock className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-[#111827]">Kunci Periode & Tutup Buku</div>
            <p className="text-xs text-[#6B7280] mt-1">Kunci transaksi per tanggal atau jalankan Tutup Buku dengan jurnal penutup otomatis.</p>
          </div>
        </Link>
        <Link to="/keuangan/pengaturan" className="rounded-2xl bg-white border border-[#E5E7EB] p-4 hover:border-amber-400 transition flex items-start gap-3">
          <FilePlus2 className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-[#111827]">Pemetaan Akun & Audit Log</div>
            <p className="text-xs text-[#6B7280] mt-1">Atur akun default sistem, penomoran otomatis, profil lembaga, dan lihat jejak audit.</p>
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
