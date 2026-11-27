// Penampil Laporan Lanjutan Rilis 2-4 (Tab Penjualan, Pembelian, Produk, Aset, Bank, Pajak, Produksi, Kurs).
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getExtendedReport, listUnits } from "@/keuangan/api";
import { formatQtyMilli, formatSen, formatTanggalShort, firstDayOfMonthWib, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import { exportReportCsv, exportReportExcel, exportReportPdf, senCell, type ExportCell } from "@/keuangan/export/reportExport";
import type { ReportFilter, Unit } from "@/keuangan/types";
import { ReportFilterBar } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

interface ColDef {
  key: string;
  label: string;
  kind?: "text" | "sen" | "qty" | "date";
}

interface ReportSpec {
  endpoint: string;
  title: string;
  desc: string;
  singleDate?: boolean;
  rowsKey?: string;
  cols: ColDef[];
}

export const EXTENDED_REPORT_SPECS: Record<string, ReportSpec> = {
  "penjualan-daftar": {
    endpoint: "penjualan/daftar",
    title: "Daftar Penjualan",
    desc: "Seluruh faktur penjualan, retur, dan kredit memo pada rentang tanggal.",
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "no", label: "Nomor" },
      { key: "contact_nama", label: "Pelanggan" },
      { key: "unit_kode", label: "Unit" },
      { key: "status", label: "Status" },
      { key: "subtotal", label: "Subtotal", kind: "sen" },
      { key: "pajak", label: "Pajak", kind: "sen" },
      { key: "total", label: "Total", kind: "sen" },
      { key: "sisa", label: "Sisa", kind: "sen" },
    ],
  },
  "penjualan-per-pelanggan": {
    endpoint: "penjualan/per-pelanggan",
    title: "Penjualan per Pelanggan",
    desc: "Agregasi omzet, diskon, retur, pajak, dan piutang per pelanggan.",
    cols: [
      { key: "contact_nama", label: "Pelanggan" },
      { key: "jumlah_faktur", label: "Jml Faktur" },
      { key: "penjualan_bruto", label: "Bruto", kind: "sen" },
      { key: "diskon", label: "Diskon", kind: "sen" },
      { key: "retur_kredit", label: "Retur", kind: "sen" },
      { key: "pajak", label: "Pajak", kind: "sen" },
      { key: "total_neto", label: "Neto", kind: "sen" },
      { key: "sisa_piutang", label: "Sisa Piutang", kind: "sen" },
    ],
  },
  "penjualan-per-produk": {
    endpoint: "penjualan/per-produk",
    title: "Penjualan per Produk",
    desc: "Kuantitas terjual, penjualan neto, HPP, dan laba kotor per produk.",
    cols: [
      { key: "sku", label: "SKU" },
      { key: "nama_produk", label: "Produk" },
      { key: "qty_milli", label: "Qty Terjual", kind: "qty" },
      { key: "penjualan_neto", label: "Penjualan", kind: "sen" },
      { key: "hpp", label: "HPP", kind: "sen" },
      { key: "laba_kotor", label: "Laba Kotor", kind: "sen" },
    ],
  },
  "piutang-pelanggan": {
    endpoint: "penjualan/piutang-pelanggan",
    title: "Piutang Pelanggan",
    desc: "Daftar faktur piutang terbuka beserta hari keterlambatan.",
    singleDate: true,
    rowsKey: "details",
    cols: [
      { key: "no", label: "No Faktur" },
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "jatuh_tempo", label: "Jatuh Tempo", kind: "date" },
      { key: "contact_nama", label: "Pelanggan" },
      { key: "unit_kode", label: "Unit" },
      { key: "total", label: "Total", kind: "sen" },
      { key: "sisa", label: "Sisa Piutang", kind: "sen" },
    ],
  },
  "umur-piutang": {
    endpoint: "penjualan/umur-piutang",
    title: "Umur Piutang",
    desc: "Pengelompokan piutang jatuh tempo (Belum JT, 1-30, 31-60, 61-90, >90 hari).",
    singleDate: true,
    rowsKey: "summary",
    cols: [
      { key: "contact_nama", label: "Pelanggan" },
      { key: "belum_jatuh_tempo", label: "Belum JT", kind: "sen" },
      { key: "hari_1_30", label: "1-30 Hari", kind: "sen" },
      { key: "hari_31_60", label: "31-60 Hari", kind: "sen" },
      { key: "hari_61_90", label: "61-90 Hari", kind: "sen" },
      { key: "lebih_90", label: "> 90 Hari", kind: "sen" },
      { key: "total", label: "Total", kind: "sen" },
    ],
  },
  "pengiriman-penjualan": {
    endpoint: "penjualan/pengiriman",
    title: "Pengiriman Penjualan",
    desc: "Daftar surat jalan / pengiriman penjualan.",
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "no", label: "Nomor" },
      { key: "contact_nama", label: "Pelanggan" },
      { key: "warehouse_nama", label: "Gudang" },
      { key: "unit_kode", label: "Unit" },
      { key: "total", label: "Nilai", kind: "sen" },
    ],
  },
  "pesanan-penjualan": {
    endpoint: "penjualan/penyelesaian-pesanan",
    title: "Penyelesaian Pemesanan Penjualan",
    desc: "Status pemesanan penjualan dan jumlah dokumen turunannya.",
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "no", label: "No SO" },
      { key: "contact_nama", label: "Pelanggan" },
      { key: "status", label: "Status" },
      { key: "uang_muka", label: "Uang Muka", kind: "sen" },
      { key: "total", label: "Total", kind: "sen" },
    ],
  },
  "pembelian-daftar": {
    endpoint: "pembelian/daftar",
    title: "Daftar Pembelian",
    desc: "Daftar tagihan pembelian, retur pembelian, dan debit memo.",
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "no", label: "Nomor" },
      { key: "contact_nama", label: "Vendor" },
      { key: "unit_kode", label: "Unit" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total", kind: "sen" },
      { key: "sisa", label: "Sisa", kind: "sen" },
    ],
  },
  "pembelian-per-vendor": {
    endpoint: "pembelian/per-vendor",
    title: "Pembelian per Vendor",
    desc: "Total pembelian neto dan sisa hutang per supplier.",
    cols: [
      { key: "contact_nama", label: "Vendor" },
      { key: "jumlah_tagihan", label: "Jml Tagihan" },
      { key: "pembelian_bruto", label: "Bruto", kind: "sen" },
      { key: "retur_debit", label: "Retur", kind: "sen" },
      { key: "pajak", label: "Pajak", kind: "sen" },
      { key: "total_neto", label: "Neto", kind: "sen" },
      { key: "sisa_hutang", label: "Sisa Hutang", kind: "sen" },
    ],
  },
  "pembelian-per-produk": {
    endpoint: "pembelian/per-produk",
    title: "Pembelian per Produk",
    desc: "Total kuantitas dan nilai pembelian per produk.",
    cols: [
      { key: "sku", label: "SKU" },
      { key: "nama_produk", label: "Produk" },
      { key: "qty_milli", label: "Qty", kind: "qty" },
      { key: "total_pembelian", label: "Total Pembelian", kind: "sen" },
      { key: "pajak", label: "Pajak", kind: "sen" },
    ],
  },
  "hutang-vendor": {
    endpoint: "pembelian/hutang-vendor",
    title: "Hutang Vendor",
    desc: "Tagihan pembelian dan biaya belum lunas.",
    singleDate: true,
    rowsKey: "details",
    cols: [
      { key: "no", label: "Nomor" },
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "jatuh_tempo", label: "Jatuh Tempo", kind: "date" },
      { key: "contact_nama", label: "Vendor" },
      { key: "total", label: "Total", kind: "sen" },
      { key: "sisa", label: "Sisa Hutang", kind: "sen" },
    ],
  },
  "umur-hutang": {
    endpoint: "pembelian/umur-hutang",
    title: "Umur Hutang",
    desc: "Pengelompokan hutang usaha menurut umur jatuh tempo.",
    singleDate: true,
    rowsKey: "summary",
    cols: [
      { key: "contact_nama", label: "Vendor" },
      { key: "belum_jatuh_tempo", label: "Belum JT", kind: "sen" },
      { key: "hari_1_30", label: "1-30 Hari", kind: "sen" },
      { key: "hari_31_60", label: "31-60 Hari", kind: "sen" },
      { key: "hari_61_90", label: "61-90 Hari", kind: "sen" },
      { key: "lebih_90", label: "> 90 Hari", kind: "sen" },
      { key: "total", label: "Total", kind: "sen" },
    ],
  },
  "biaya-daftar": {
    endpoint: "biaya/daftar",
    title: "Daftar Biaya",
    desc: "Rekapitulasi biaya langsung dan bayar nanti.",
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "no", label: "Nomor" },
      { key: "contact_nama", label: "Penerima" },
      { key: "memo", label: "Memo" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total", kind: "sen" },
    ],
  },
  "produk-ringkasan": {
    endpoint: "produk/ringkasan-persediaan",
    title: "Ringkasan Persediaan",
    desc: "Stok awal, masuk, keluar, stok akhir, HPP rata-rata, dan nilai persediaan.",
    cols: [
      { key: "sku", label: "SKU" },
      { key: "nama", label: "Produk" },
      { key: "qty_awal", label: "Awal", kind: "qty" },
      { key: "qty_masuk", label: "Masuk", kind: "qty" },
      { key: "qty_keluar", label: "Keluar", kind: "qty" },
      { key: "qty_akhir", label: "Akhir", kind: "qty" },
      { key: "harga_rata_rata", label: "HPP Rata2", kind: "sen" },
      { key: "nilai_akhir", label: "Nilai Akhir", kind: "sen" },
    ],
  },
  "produk-pergerakan": {
    endpoint: "produk/pergerakan-stok",
    title: "Pergerakan Stok",
    desc: "Kartu stok kronologis seluruh transaksi keluar masuk barang.",
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "doc_no", label: "Dokumen" },
      { key: "product_nama", label: "Produk" },
      { key: "warehouse_nama", label: "Gudang" },
      { key: "qty_milli", label: "Qty", kind: "qty" },
      { key: "nilai", label: "Nilai", kind: "sen" },
    ],
  },
  "produk-gudang": {
    endpoint: "produk/nilai-gudang",
    title: "Kuantitas & Nilai per Gudang",
    desc: "Posisi stok dan nilai persediaan per gudang.",
    singleDate: true,
    cols: [
      { key: "warehouse_nama", label: "Gudang" },
      { key: "unit_kode", label: "Unit" },
      { key: "product_nama", label: "Produk" },
      { key: "qty_milli", label: "Qty", kind: "qty" },
      { key: "nilai", label: "Nilai", kind: "sen" },
    ],
  },
  "produk-min-stok": {
    endpoint: "produk/stok-minimum",
    title: "Peringatan Stok Minimum",
    desc: "Daftar barang dengan stok mendekati atau di bawah batas minimum.",
    singleDate: true,
    cols: [
      { key: "sku", label: "SKU" },
      { key: "nama", label: "Produk" },
      { key: "batas_min", label: "Batas Min", kind: "qty" },
      { key: "qty_tersedia", label: "Tersedia", kind: "qty" },
      { key: "nilai", label: "Nilai", kind: "sen" },
    ],
  },
  "aset-daftar": {
    endpoint: "aset/daftar",
    title: "Daftar Aset Tetap",
    desc: "Biaya perolehan, akumulasi penyusutan, dan nilai buku seluruh aset tetap.",
    singleDate: true,
    cols: [
      { key: "no", label: "Nomor" },
      { key: "nama", label: "Nama Aset" },
      { key: "unit_kode", label: "Unit" },
      { key: "tgl_akuisisi", label: "Tgl Akuisisi", kind: "date" },
      { key: "biaya", label: "Biaya", kind: "sen" },
      { key: "total_akumulasi", label: "Akumulasi", kind: "sen" },
      { key: "nilai_buku", label: "Nilai Buku", kind: "sen" },
    ],
  },
  "aset-penyusutan": {
    endpoint: "aset/penyusutan",
    title: "Jadwal & Realisasi Penyusutan Aset",
    desc: "Rincian jadwal penyusutan bulanan aset tetap beserta status penerapannya.",
    singleDate: true,
    cols: [
      { key: "bulan", label: "Bulan" },
      { key: "no", label: "No Aset" },
      { key: "nama", label: "Nama Aset" },
      { key: "unit_kode", label: "Unit" },
      { key: "nilai", label: "Penyusutan", kind: "sen" },
      { key: "status", label: "Status" },
    ],
  },
  "bank-rekonsiliasi": {
    endpoint: "bank/rekonsiliasi",
    title: "Ringkasan Rekonsiliasi Bank",
    desc: "Perbandingan saldo buku pembukuan dengan saldo rekening koran yang diimpor.",
    singleDate: true,
    cols: [
      { key: "kode", label: "Kode Akun" },
      { key: "nama", label: "Nama Rekening" },
      { key: "unit_kode", label: "Unit" },
      { key: "saldo_buku", label: "Saldo Buku", kind: "sen" },
      { key: "saldo_rekening", label: "Saldo Bank", kind: "sen" },
      { key: "belum_cocok", label: "Belum Cocok" },
    ],
  },
  "pajak-faktur": {
    endpoint: "pajak/faktur",
    title: "Laporan Pajak PPN Keluaran",
    desc: "Daftar faktur penjualan ber-PPN beserta Nomor Faktur Pajak dan NPWP pelanggan (siap ekspor CSV e-Faktur).",
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "no", label: "No Faktur" },
      { key: "no_faktur_pajak", label: "No Faktur Pajak" },
      { key: "contact_nama", label: "Pelanggan" },
      { key: "npwp", label: "NPWP" },
      { key: "dpp", label: "DPP", kind: "sen" },
      { key: "pajak", label: "PPN", kind: "sen" },
      { key: "total", label: "Total", kind: "sen" },
    ],
  },
  "pajak-pemotongan": {
    endpoint: "pajak/pemotongan",
    title: "Laporan Pajak Pemotongan (Withholding)",
    desc: "Daftar pemotongan PPh 23/21/lainnya pada faktur dan pembayaran (siap ekspor CSV).",
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "no", label: "No Dokumen" },
      { key: "contact_nama", label: "Kontak" },
      { key: "npwp", label: "NPWP" },
      { key: "account_nama", label: "Akun Pajak" },
      { key: "amount", label: "Nominal", kind: "sen" },
    ],
  },
  "produksi-daftar": {
    endpoint: "produksi/daftar",
    title: "Laporan Perintah Kerja Produksi",
    desc: "Biaya bahan baku, overhead, nilai hasil produksi, dan selisih biaya standar.",
    singleDate: true,
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "no", label: "No WO" },
      { key: "unit_kode", label: "Unit" },
      { key: "total_input", label: "Bahan", kind: "sen" },
      { key: "total_overhead", label: "Overhead", kind: "sen" },
      { key: "total_output", label: "Output", kind: "sen" },
      { key: "variance", label: "Selisih", kind: "sen" },
    ],
  },
  "kurs-realisasi": {
    endpoint: "kurs/realisasi",
    title: "Laba / Rugi Selisih Kurs Terealisasi",
    desc: "Selisih kurs yang terealisasi saat pelunasan faktur mata uang asing.",
    singleDate: true,
    cols: [
      { key: "tanggal", label: "Tanggal", kind: "date" },
      { key: "no", label: "No Dokumen" },
      { key: "keterangan", label: "Keterangan" },
      { key: "debit", label: "Rugi Kurs", kind: "sen" },
      { key: "kredit", label: "Laba Kurs", kind: "sen" },
    ],
  },
  "kurs-belum-terealisasi": {
    endpoint: "kurs/belum-terealisasi",
    title: "Selisih Kurs Belum Terealisasi",
    desc: "Valuasi piutang/hutang valuta asing terbuka terhadap kurs manual terkini.",
    singleDate: true,
    cols: [
      { key: "no", label: "No Faktur" },
      { key: "currency", label: "Mata Uang" },
      { key: "contact_nama", label: "Kontak" },
      { key: "nilai_buku_idr", label: "Nilai Buku IDR", kind: "sen" },
      { key: "nilai_pasar_idr", label: "Nilai Kurs Kini IDR", kind: "sen" },
      { key: "selisih_kurs", label: "Selisih Belum Realisasi", kind: "sen" },
    ],
  },
};

export function ReportExtendedPage() {
  const { slug = "" } = useParams();
  const spec = EXTENDED_REPORT_SPECS[slug];
  const { showToast } = useToast();

  const [units, setUnits] = useState<Unit[]>([]);
  const [filter, setFilter] = useState<ReportFilter>({ dari: firstDayOfMonthWib(), sampai: todayWib() });
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!spec) return;
    setLoading(true);
    try {
      const res = await getExtendedReport(spec.endpoint, filter);
      const list = res[spec.rowsKey || "rows"] as Record<string, unknown>[] | undefined;
      setRows(list || []);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    listUnits().then(setUnits).catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchData();
  }, [slug]);

  if (!spec) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl border border-[#E5E7EB]">
        <p className="font-bold">Laporan "{slug}" tidak ditemukan.</p>
        <Link to="/keuangan/laporan" className="text-amber-700 text-sm font-bold hover:underline mt-2 inline-block">
          ← Kembali ke Indeks Laporan
        </Link>
      </div>
    );
  }

  const buildExport = () => ({
    laporan: spec.endpoint,
    title: spec.title,
    subtitle: spec.singleDate ? `Per ${formatTanggalShort(filter.sampai || todayWib())}` : `${formatTanggalShort(filter.dari || "")} – ${formatTanggalShort(filter.sampai || "")}`,
    unitLabel: filter.unit_kode || "Semua Unit",
    headers: spec.cols.map((c) => c.label),
    rows: rows.map((r) =>
      spec.cols.map((c): ExportCell => {
        const val = r[c.key];
        if (c.kind === "sen") return senCell(Number(val || 0));
        if (c.kind === "qty") return Number(((Number(val || 0)) / 1000).toFixed(3));
        if (c.kind === "date") return formatTanggalShort(String(val || ""));
        return String(val ?? "-");
      }),
    ),
    filenameBase: `${slug}-${filter.sampai || todayWib()}`,
    filter: filter as Record<string, unknown>,
  });

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/keuangan/laporan" className="rounded-xl p-2 bg-white border border-[#E5E7EB] hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">{spec.title}</h1>
          <p className="text-sm text-[#6B7280]">{spec.desc}</p>
        </div>
      </div>

      <ReportFilterBar
        filter={filter}
        onChange={setFilter}
        onRefresh={fetchData}
        units={units}
        loading={loading}
        singleDateMode={spec.singleDate}
        allowCompare={false}
        onExportPdf={() => exportReportPdf(buildExport())}
        onExportExcel={() => exportReportExcel(buildExport())}
        onExportCsv={() => exportReportCsv(buildExport())}
      />

      <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F9FAFB] text-xs uppercase text-[#6B7280]">
            <tr>
              {spec.cols.map((c) => (
                <th key={c.key} className={`px-4 py-3 ${c.kind === "sen" || c.kind === "qty" ? "text-right" : "text-left"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-amber-50/40">
                {spec.cols.map((c) => {
                  const v = r[c.key];
                  const formatted =
                    c.kind === "sen"
                      ? formatSen(Number(v || 0))
                      : c.kind === "qty"
                        ? formatQtyMilli(Number(v || 0), String(r.satuan || ""))
                        : c.kind === "date"
                          ? formatTanggalShort(String(v || ""))
                          : String(v ?? "-");
                  return (
                    <td key={c.key} className={`px-4 py-3 ${c.kind === "sen" || c.kind === "qty" ? "text-right font-mono" : "text-left"}`}>
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={spec.cols.length} className="px-4 py-8 text-center text-[#6B7280]">
                  Tidak ada data pada periode yang dipilih.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
