// Indeks Laporan Lengkap per Tab (Sekilas Bisnis, Penjualan, Pembelian, Produk + Tab Rilis 3-4).
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Calculator,
  DollarSign,
  FileSpreadsheet,
  Layers,
  Package,
  Scale,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

type TabId = "sekilas" | "penjualan" | "pembelian" | "produk" | "aset" | "bank" | "pajak" | "produksi" | "kurs";

const SECTIONS: Record<TabId, { title: string; items: { to: string; title: string; desc: string; icon: typeof BarChart3 }[] }> = {
  sekilas: {
    title: "Sekilas Bisnis",
    items: [
      { to: "/keuangan/laporan/neraca", title: "Neraca", desc: "Posisi aset, liabilitas, dan ekuitas per tanggal dengan eliminasi antar unit otomatis.", icon: Scale },
      { to: "/keuangan/laporan/laba-rugi", title: "Laba Rugi", desc: "Pendapatan, HPP, biaya operasional, hingga laba bersih beserta template & banding tag.", icon: TrendingUp },
      { to: "/keuangan/laporan/arus-kas", title: "Arus Kas", desc: "Metode Langsung & Tidak Langsung terverifikasi ke saldo Kas & Bank.", icon: DollarSign },
      { to: "/keuangan/laporan/perubahan-modal", title: "Perubahan Modal", desc: "Mutasi ekuitas & laba ditahan dalam format standar Jurnal.", icon: Layers },
      { to: "/keuangan/laporan/buku-besar", title: "Buku Besar", desc: "Rincian mutasi dan saldo berjalan per akun.", icon: BookOpen },
      { to: "/keuangan/laporan/jurnal", title: "Jurnal", desc: "Daftar lengkap ayat jurnal debit & kredit kronologis.", icon: FileSpreadsheet },
      { to: "/keuangan/laporan/neraca-saldo", title: "Neraca Saldo", desc: "Saldo awal, pergerakan debit/kredit, dan saldo akhir semua akun.", icon: Calculator },
      { to: "/keuangan/laporan/ringkasan-bisnis", title: "Ringkasan Bisnis", desc: "Ikhtisar Laba Rugi, Neraca, Arus Kas, & rasio konversi piutang/hutang.", icon: BarChart3 },
    ],
  },
  penjualan: {
    title: "Penjualan & Piutang",
    items: [
      { to: "/keuangan/laporan/detail/penjualan-daftar", title: "Daftar Penjualan", desc: "Semua faktur, retur, dan kredit memo penjualan.", icon: ShoppingBag },
      { to: "/keuangan/laporan/detail/penjualan-per-pelanggan", title: "Penjualan per Pelanggan", desc: "Omzet, diskon, retur, dan sisa piutang per pelanggan.", icon: ShoppingBag },
      { to: "/keuangan/laporan/detail/penjualan-per-produk", title: "Penjualan per Produk", desc: "Kuantitas terjual, penjualan neto, HPP, dan laba kotor per produk.", icon: Package },
      { to: "/keuangan/laporan/detail/piutang-pelanggan", title: "Piutang Pelanggan", desc: "Daftar faktur piutang terbuka dan tanggal jatuh tempo.", icon: DollarSign },
      { to: "/keuangan/laporan/detail/umur-piutang", title: "Umur Piutang", desc: "Analisis umur piutang Belum JT hingga > 90 hari.", icon: Calculator },
      { to: "/keuangan/laporan/detail/pengiriman-penjualan", title: "Pengiriman Penjualan", desc: "Riwayat pengiriman barang penjualan.", icon: Boxes },
      { to: "/keuangan/laporan/detail/pesanan-penjualan", title: "Penyelesaian Pemesanan Penjualan", desc: "Monitoring pesanan penjualan dan uang muka.", icon: FileSpreadsheet },
    ],
  },
  pembelian: {
    title: "Pembelian, Hutang & Biaya",
    items: [
      { to: "/keuangan/laporan/detail/pembelian-daftar", title: "Daftar Pembelian", desc: "Tagihan pembelian, retur, dan debit memo.", icon: ShoppingCart },
      { to: "/keuangan/laporan/detail/pembelian-per-vendor", title: "Pembelian per Vendor", desc: "Total pembelian neto dan hutang per supplier.", icon: ShoppingCart },
      { to: "/keuangan/laporan/detail/pembelian-per-produk", title: "Pembelian per Produk", desc: "Kuantitas dan nilai beli per item.", icon: Package },
      { to: "/keuangan/laporan/detail/hutang-vendor", title: "Hutang Vendor", desc: "Tagihan dan biaya bayar nanti yang belum dilunasi.", icon: DollarSign },
      { to: "/keuangan/laporan/detail/umur-hutang", title: "Umur Hutang", desc: "Analisis umur hutang usaha.", icon: Calculator },
      { to: "/keuangan/laporan/detail/biaya-daftar", title: "Detail Pengeluaran Biaya", desc: "Riwayat biaya operasional langsung dan bayar nanti.", icon: FileSpreadsheet },
    ],
  },
  produk: {
    title: "Produk & Persediaan",
    items: [
      { to: "/keuangan/laporan/detail/produk-ringkasan", title: "Ringkasan Persediaan", desc: "Stok awal, masuk, keluar, stok akhir & nilai moving average.", icon: Package },
      { to: "/keuangan/laporan/detail/produk-pergerakan", title: "Pergerakan Stok", desc: "Kartu stok kronologis per produk dan gudang.", icon: Boxes },
      { to: "/keuangan/laporan/detail/produk-gudang", title: "Kuantitas & Nilai per Gudang", desc: "Sebaran stok barang di setiap gudang/unit.", icon: Layers },
      { to: "/keuangan/laporan/detail/produk-min-stok", title: "Peringatan Stok Minimum", desc: "Daftar barang dengan stok mendekati atau di bawah batas minimum.", icon: TrendingUp },
    ],
  },
  aset: {
    title: "Aset Tetap",
    items: [
      { to: "/keuangan/laporan/detail/aset-daftar", title: "Daftar Aset Tetap", desc: "Biaya akuisisi, akumulasi penyusutan & nilai buku seluruh aset.", icon: Layers },
      { to: "/keuangan/laporan/detail/aset-penyusutan", title: "Jadwal Penyusutan Aset", desc: "Penyusutan bulanan aset tetap beserta status penerapannya.", icon: Calculator },
    ],
  },
  bank: {
    title: "Kas & Bank",
    items: [
      { to: "/keuangan/laporan/detail/bank-rekonsiliasi", title: "Ringkasan Rekonsiliasi Bank", desc: "Perbandingan saldo buku akuntansi dan saldo mutasi rekening bank.", icon: DollarSign },
    ],
  },
  pajak: {
    title: "Perpajakan (Ekspor CSV DJP)",
    items: [
      { to: "/keuangan/laporan/detail/pajak-faktur", title: "Pajak PPN Keluaran", desc: "Daftar faktur PPN beserta No Faktur Pajak dan NPWP, siap ekspor CSV.", icon: FileSpreadsheet },
      { to: "/keuangan/laporan/detail/pajak-pemotongan", title: "Pajak Pemotongan (PPh)", desc: "Daftar pemotongan PPh 23/21 pada faktur dan pembayaran.", icon: Calculator },
    ],
  },
  produksi: {
    title: "Produksi & Manufaktur",
    items: [
      { to: "/keuangan/laporan/detail/produksi-daftar", title: "Perintah Kerja Produksi", desc: "Biaya bahan baku, overhead, output barang jadi & selisih biaya.", icon: Boxes },
    ],
  },
  kurs: {
    title: "Pertukaran Kurs",
    items: [
      { to: "/keuangan/laporan/detail/kurs-realisasi", title: "Selisih Kurs Terealisasi", desc: "Laba atau rugi selisih kurs saat pelunasan tagihan valas.", icon: TrendingUp },
      { to: "/keuangan/laporan/detail/kurs-belum-terealisasi", title: "Selisih Kurs Belum Terealisasi", desc: "Revaluasi piutang/hutang mata uang asing terbuka.", icon: Scale },
    ],
  },
};

export function LaporanHubPage() {
  const [tab, setTab] = useState<TabId>("sekilas");
  const cur = SECTIONS[tab];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Pusat Laporan Keuangan</h1>
        <p className="text-sm text-[#6B7280]">
          Semua laporan mendukung filter Anak Perusahaan atau Gabungan serta ekspor ke PDF, Excel (.xlsx angka asli), dan CSV.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#E5E7EB] pb-2">
        {(
          [
            ["sekilas", "Sekilas Bisnis"],
            ["penjualan", "Penjualan"],
            ["pembelian", "Pembelian & Biaya"],
            ["produk", "Produk & Stok"],
            ["aset", "Aset Tetap"],
            ["bank", "Bank"],
            ["pajak", "Pajak"],
            ["produksi", "Produksi"],
            ["kurs", "Kurs"],
          ] as [TabId, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-xl px-4 py-2 text-sm font-bold cursor-pointer ${
              tab === id ? "bg-amber-600 text-white" : "bg-white border border-[#E5E7EB] text-[#374151] hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <h2 className="font-bold text-base text-[#111827]">{cur.title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cur.items.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.to}
              to={r.to}
              className="rounded-2xl bg-white border border-[#E5E7EB] p-5 hover:border-amber-400 hover:shadow-sm transition flex flex-col justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-['Manrope',system-ui,sans-serif] font-extrabold text-base text-[#111827]">{r.title}</h3>
                  <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">{r.desc}</p>
                </div>
              </div>
              <div className="text-xs font-bold text-amber-700">Buka Laporan →</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
