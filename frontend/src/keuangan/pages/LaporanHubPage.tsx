// Halaman Indeks Laporan Sekilas Bisnis (Rilis 1).
import { Link } from "react-router-dom";
import { BarChart3, BookOpen, Calculator, DollarSign, FileSpreadsheet, Layers, Scale, TrendingUp } from "lucide-react";

const REPORTS = [
  {
    to: "/keuangan/laporan/neraca",
    title: "Neraca",
    desc: "Posisi aset, liabilitas, dan ekuitas per tanggal tertentu. Otomatis mengeliminasi transaksi antar unit pada tampilan gabungan.",
    icon: Scale,
  },
  {
    to: "/keuangan/laporan/laba-rugi",
    title: "Laba Rugi",
    desc: "Pendapatan, HPP, biaya operasional, hingga laba bersih. Mendukung bandingkan antar unit & template laporan.",
    icon: TrendingUp,
  },
  {
    to: "/keuangan/laporan/arus-kas",
    title: "Arus Kas",
    desc: "Penerimaan dan pengeluaran kas metode Langsung & Tidak Langsung, terverifikasi ke saldo Kas & Bank.",
    icon: DollarSign,
  },
  {
    to: "/keuangan/laporan/perubahan-modal",
    title: "Perubahan Modal",
    desc: "Format asli Jurnal: Kode Akun, Nama Akun, Permulaan, Debit, Kredit, Saldo Akhir, Total & Pergerakan.",
    icon: Layers,
  },
  {
    to: "/keuangan/laporan/buku-besar",
    title: "Buku Besar",
    desc: "Rincian mutasi dan saldo berjalan tiap akun pada rentang tanggal yang dipilih.",
    icon: BookOpen,
  },
  {
    to: "/keuangan/laporan/jurnal",
    title: "Jurnal",
    desc: "Daftar lengkap ayat jurnal debit & kredit per transaksi secara kronologis.",
    icon: FileSpreadsheet,
  },
  {
    to: "/keuangan/laporan/neraca-saldo",
    title: "Neraca Saldo",
    desc: "Saldo awal, pergerakan debit/kredit periode, dan saldo akhir seluruh akun.",
    icon: Calculator,
  },
  {
    to: "/keuangan/laporan/ringkasan-bisnis",
    title: "Ringkasan Bisnis",
    desc: "Ikhtisar Laba Rugi, Neraca, Arus Kas, serta 7 rasio & wawasan kesehatan keuangan.",
    icon: BarChart3,
  },
];

export function LaporanHubPage() {
  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Laporan — Sekilas Bisnis</h1>
        <p className="text-sm text-[#6B7280]">
          Semua laporan mendukung filter per Anak Perusahaan atau Gabungan serta ekspor ke PDF, Excel, dan CSV.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((r) => {
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
                  <h2 className="font-['Manrope',system-ui,sans-serif] font-extrabold text-base text-[#111827]">{r.title}</h2>
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
