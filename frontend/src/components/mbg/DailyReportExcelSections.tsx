import { useState } from 'react';
import type {
  MbgProductionDailyReport,
  MbgPortionDailyData,
} from '@/types/mbg';
import {
  Utensils,
  ChefHat,
  Baby,
  Heart,
  Package,
  Truck,
  ClipboardCheck,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  School,
} from 'lucide-react';

export type MbgDailyReportSubTab =
  | 'kecil'
  | 'besar'
  | 'balita'
  | 'bumil'
  | 'paket3b'
  | 'po'
  | 'qc'
  | 'waste'
  | 'sekolah';

interface DailyReportExcelSectionsProps {
  report?: MbgProductionDailyReport | null;
  defaultSubTab?: MbgDailyReportSubTab;
  activeSubTab?: MbgDailyReportSubTab;
  onSubTabChange?: (tab: MbgDailyReportSubTab) => void;
}

function formatRp(val: number | undefined | null): string {
  if (val == null || isNaN(val)) return 'Rp 0';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

function formatNum(val: number | undefined | null, decimals = 2): string {
  if (val == null || isNaN(val)) return '0';
  if (Number.isInteger(val)) return val.toString();
  return Number(val.toFixed(decimals)).toString();
}

export function DailyReportExcelSections({
  report,
  defaultSubTab = 'kecil',
  activeSubTab,
  onSubTabChange,
}: DailyReportExcelSectionsProps) {
  const [internalSubTab, setInternalSubTab] = useState<MbgDailyReportSubTab>(defaultSubTab);

  if (!report) {
    return null;
  }

  const currentTab = activeSubTab || internalSubTab;
  const setTab = (tab: MbgDailyReportSubTab) => {
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setInternalSubTab(tab);
    }
  };

  const TABS_CONFIG = [
    {
      key: 'kecil' as const,
      label: 'Porsi Kecil',
      icon: Utensils,
      countBadge: `${report.porsiKecil?.pmCount || 0} porsi`,
      itemCount: (report.porsiKecil?.nutritionItems || []).length,
      color: 'emerald',
    },
    {
      key: 'besar' as const,
      label: 'Porsi Besar',
      icon: ChefHat,
      countBadge: `${report.porsiBesar?.pmCount || 0} porsi`,
      itemCount: (report.porsiBesar?.nutritionItems || []).length,
      color: 'blue',
    },
    {
      key: 'balita' as const,
      label: 'Porsi Balita',
      icon: Baby,
      countBadge: `${report.porsiBalita?.pmCount || 0} porsi`,
      itemCount: (report.porsiBalita?.nutritionItems || []).length,
      color: 'amber',
    },
    {
      key: 'bumil' as const,
      label: 'Bumil / Busui',
      icon: Heart,
      countBadge: `${report.porsiBumilBusui?.pmCount || 0} porsi`,
      itemCount: (report.porsiBumilBusui?.nutritionItems || []).length,
      color: 'rose',
    },
    {
      key: 'paket3b' as const,
      label: 'Paket Sehat 3B',
      icon: Package,
      countBadge: `${(report.paketSehat3b?.keringanItems || []).length} item`,
      itemCount: (report.paketSehat3b?.keringanItems || []).length,
      color: 'purple',
    },
    {
      key: 'po' as const,
      label: 'PO & Realisasi Belanja',
      icon: Truck,
      countBadge: `${(report.poRows || []).length} kedatangan`,
      itemCount: (report.realisasiPembelianRows || []).length,
      color: 'teal',
    },
    {
      key: 'qc' as const,
      label: 'QC Penerimaan Bahan',
      icon: ClipboardCheck,
      countBadge: `${(report.inspectionForm?.rows || []).length} bahan`,
      itemCount: (report.inspectionForm?.rows || []).length,
      color: 'indigo',
    },
    {
      key: 'waste' as const,
      label: 'Rekap Limbah',
      icon: Trash2,
      countBadge: `${(report.wasteLogs || []).length} menu`,
      itemCount: (report.wasteLogs || []).length,
      color: 'slate',
    },
    ...(report.sekolahList && report.sekolahList.length > 0
      ? [
          {
            key: 'sekolah' as const,
            label: 'Distribusi Sekolah / PM',
            icon: School,
            countBadge: `${report.sekolahList.length} lembaga`,
            itemCount: report.sekolahList.length,
            color: 'emerald',
          },
        ]
      : []),
  ];

  // Helper renderer for portion data (Kecil, Besar, Balita, Bumil)
  const renderPortionSection = (
    portionData: MbgPortionDailyData | undefined,
    defaultTitle: string,
    badgeColor: string
  ) => {
    const data = portionData || {
      portionType: 'kecil',
      portionTitle: defaultTitle,
      pmCount: 0,
      menuList: [],
      nutritionItems: [],
      bahanItems: [],
      bumbuItems: [],
      totalGizi: { beratBersih: 0, energi: 0, protein: 0, lemak: 0, karbohidrat: 0, serat: 0 },
      akgMetrics: {},
      totalBelanjaBahan: 0,
      hargaBahanPerPorsi: 0,
      totalBelanjaBumbu: 0,
      hargaBumbuPerPorsi: 0,
      totalBelanjaOverall: 0,
      hargaPerPorsiOverall: 0,
    };

    const hasNutrition = (data.nutritionItems || []).length > 0;
    const hasBahan = (data.bahanItems || []).length > 0;
    const hasBumbu = (data.bumbuItems || []).length > 0;

    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        {/* Header Banner & Metric Overview */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-black text-slate-900 tracking-tight">
                {data.portionTitle || defaultTitle}
              </h4>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold shadow-2xs ${badgeColor}`}>
                {data.pmCount || 0} Porsi Sasaran
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Data terpisah sesuai lembar kerja Excel: Kandungan Gizi, Pesanan Bahan Baku, dan Pesanan Bumbu.
            </p>
          </div>

          {/* Mini Stats Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="bg-slate-50 rounded-xl p-2 border border-slate-200/60">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Energi</span>
              <span className="text-xs font-black text-amber-700">
                {formatNum(data.totalGizi?.energi, 1)} kkal
              </span>
            </div>
            <div className="bg-slate-50 rounded-xl p-2 border border-slate-200/60">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Belanja Bahan</span>
              <span className="text-xs font-black text-slate-800">
                {formatRp(data.totalBelanjaBahan)}
              </span>
            </div>
            <div className="bg-slate-50 rounded-xl p-2 border border-slate-200/60">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Belanja Bumbu</span>
              <span className="text-xs font-black text-slate-800">
                {formatRp(data.totalBelanjaBumbu)}
              </span>
            </div>
            <div className="bg-emerald-50/80 rounded-xl p-2 border border-emerald-200/80">
              <span className="text-[10px] font-bold text-emerald-800 uppercase block">Biaya / Porsi</span>
              <span className="text-xs font-black text-emerald-900">
                {formatRp(data.hargaPerPorsiOverall || (data.pmCount ? data.totalBelanjaOverall / data.pmCount : 0))}
              </span>
            </div>
          </div>
        </div>

        {/* TABEL 1: KANDUNGAN GIZI */}
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
          <div className="px-4 py-2.5 bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>1. Kandungan Gizi Menu — {data.portionTitle || defaultTitle}</span>
              <span className="text-[10px] font-medium text-slate-300 normal-case">
                ({data.nutritionItems?.length || 0} Komponen)
              </span>
            </div>
            <span className="text-[10px] font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
              Realisasi Menu Excel
            </span>
          </div>

          {!hasNutrition ? (
            <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50/50">
              Tidak ada data kandungan gizi untuk porsi ini di dalam file Excel.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <th className="px-3 py-2 w-10 text-center">No</th>
                    <th className="px-3 py-2">Menu</th>
                    <th className="px-3 py-2">Rincian Bahan</th>
                    <th className="px-2 py-2 text-center">Berat Bersih (g)</th>
                    <th className="px-2 py-2 text-center text-amber-700">Energi (kkal)</th>
                    <th className="px-2 py-2 text-center">Protein (g)</th>
                    <th className="px-2 py-2 text-center">Lemak (g)</th>
                    <th className="px-2 py-2 text-center">Karbohidrat (g)</th>
                    <th className="px-2 py-2 text-center">Serat (g)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.nutritionItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-amber-50/40 transition-colors font-medium text-slate-800">
                      <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{item.menuName}</td>
                      <td className="px-3 py-2 text-slate-600">{item.rincianBahan}</td>
                      <td className="px-2 py-2 text-center font-medium">{formatNum(item.beratBersih, 1)}</td>
                      <td className="px-2 py-2 text-center font-bold text-amber-700">{formatNum(item.energi, 1)}</td>
                      <td className="px-2 py-2 text-center">{formatNum(item.protein, 2)}</td>
                      <td className="px-2 py-2 text-center">{formatNum(item.lemak, 2)}</td>
                      <td className="px-2 py-2 text-center">{formatNum(item.karbohidrat, 2)}</td>
                      <td className="px-2 py-2 text-center">{formatNum(item.serat, 2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-900">
                    <td colSpan={3} className="px-3 py-2.5 text-right tracking-wider uppercase">
                      Total Gizi per Porsi:
                    </td>
                    <td className="px-2 py-2.5 text-center">{formatNum(data.totalGizi?.beratBersih, 1)}</td>
                    <td className="px-2 py-2.5 text-center text-amber-300 font-extrabold">{formatNum(data.totalGizi?.energi, 1)}</td>
                    <td className="px-2 py-2.5 text-center">{formatNum(data.totalGizi?.protein, 2)}</td>
                    <td className="px-2 py-2.5 text-center">{formatNum(data.totalGizi?.lemak, 2)}</td>
                    <td className="px-2 py-2.5 text-center">{formatNum(data.totalGizi?.karbohidrat, 2)}</td>
                    <td className="px-2 py-2.5 text-center">{formatNum(data.totalGizi?.serat, 2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* AKG Reference Strips if available */}
          {data.akgMetrics && Object.keys(data.akgMetrics).length > 0 && (
            <div className="bg-amber-50/70 p-3 border-t border-amber-200/60 text-xs">
              <span className="text-[11px] font-extrabold text-amber-900 block mb-1.5 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                <span>% Capaian Pemenuhan Angka Kecukupan Gizi (AKG) Hasil Excel:</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.akgMetrics).map(([key, metric]) => (
                  <div key={key} className="bg-white px-2.5 py-1 rounded-lg border border-amber-200 shadow-2xs flex items-center gap-2 text-[11px]">
                    <span className="font-bold text-slate-800 uppercase">{key.replace('_', ' ')}:</span>
                    <span className="text-amber-800 font-black">
                      Makan Siang {formatNum(metric.percentMakanSiang, 1)}%
                    </span>
                    {metric.percentHarian > 0 && (
                      <span className="text-slate-500 font-medium">
                        | Harian {formatNum(metric.percentHarian, 1)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* TABEL 2: PESANAN BAHAN MAKANAN */}
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
          <div className="px-4 py-2.5 bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>2. Pesanan Bahan Makanan Pokok — {data.portionTitle || defaultTitle}</span>
              <span className="text-[10px] font-medium text-slate-300 normal-case">
                ({data.bahanItems?.length || 0} Bahan)
              </span>
            </div>
            <span className="text-emerald-300 text-xs font-black">
              Subtotal: {formatRp(data.totalBelanjaBahan)}
            </span>
          </div>

          {!hasBahan ? (
            <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50/50">
              Tidak ada rincian pesanan bahan makanan pokok untuk porsi ini di dalam file Excel.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <th className="px-3 py-2 w-10 text-center">No</th>
                    <th className="px-3 py-2">Rincian Bahan</th>
                    <th className="px-2 py-2 text-center">%BDD</th>
                    <th className="px-2 py-2 text-center">Berat Kotor (g)</th>
                    <th className="px-2 py-2 text-center">Total (g/ml)</th>
                    <th className="px-2 py-2 text-center">Kebutuhan</th>
                    <th className="px-2 py-2 text-center">Satuan</th>
                    <th className="px-3 py-2 text-right">Harga Satuan</th>
                    <th className="px-3 py-2 text-right">Total Harga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.bahanItems.map((b, idx) => (
                    <tr key={idx} className="hover:bg-emerald-50/40 transition-colors font-medium text-slate-800">
                      <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{b.rincianBahan}</td>
                      <td className="px-2 py-2 text-center text-slate-500">{formatNum(b.bddPercent, 0)}%</td>
                      <td className="px-2 py-2 text-center text-slate-600">{formatNum(b.beratKotor, 1)}</td>
                      <td className="px-2 py-2 text-center text-slate-600">{formatNum(b.totalGml, 1)}</td>
                      <td className="px-2 py-2 text-center font-black text-slate-900 bg-slate-50/80">{formatNum(b.kebutuhan, 2)}</td>
                      <td className="px-2 py-2 text-center font-bold text-slate-600">{b.satuan || 'kg'}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-600">
                        {b.hargaBahan ? formatRp(b.hargaBahan) : '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-800">
                        {b.harga ? formatRp(b.harga) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 text-slate-900 font-black text-xs border-t-2 border-slate-300">
                    <td colSpan={8} className="px-3 py-2.5 text-right uppercase tracking-wider">
                      Total Belanja Bahan Pokok:
                    </td>
                    <td className="px-3 py-2.5 text-right text-emerald-800 font-extrabold text-sm">
                      {formatRp(data.totalBelanjaBahan)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* TABEL 3: PESANAN BUMBU */}
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
          <div className="px-4 py-2.5 bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>3. Pesanan Bumbu Masak — {data.portionTitle || defaultTitle}</span>
              <span className="text-[10px] font-medium text-slate-300 normal-case">
                ({data.bumbuItems?.length || 0} Bumbu)
              </span>
            </div>
            <span className="text-amber-300 text-xs font-black">
              Subtotal: {formatRp(data.totalBelanjaBumbu)}
            </span>
          </div>

          {!hasBumbu ? (
            <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50/50">
              Tidak ada rincian pesanan bumbu masak untuk porsi ini di dalam file Excel.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <th className="px-3 py-2 w-10 text-center">No</th>
                    <th className="px-3 py-2">Menu Terkait</th>
                    <th className="px-3 py-2">Nama Bumbu</th>
                    <th className="px-2 py-2 text-center">Kebutuhan</th>
                    <th className="px-2 py-2 text-center">Satuan</th>
                    <th className="px-3 py-2 text-right">Harga Satuan</th>
                    <th className="px-3 py-2 text-right">Total Harga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.bumbuItems.map((b, idx) => (
                    <tr key={idx} className="hover:bg-amber-50/40 transition-colors font-medium text-slate-800">
                      <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                      <td className="px-3 py-2 text-slate-600 font-medium">{b.namaMenu || '-'}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{b.namaBumbu}</td>
                      <td className="px-2 py-2 text-center font-black text-slate-900 bg-slate-50/80">{formatNum(b.kebutuhan, 3)}</td>
                      <td className="px-2 py-2 text-center font-bold text-slate-600">{b.satuan || 'kg'}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-600">
                        {b.hargaBumbu ? formatRp(b.hargaBumbu) : '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-amber-800">
                        {b.harga ? formatRp(b.harga) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 text-slate-900 font-black text-xs border-t-2 border-slate-300">
                    <td colSpan={6} className="px-3 py-2.5 text-right uppercase tracking-wider">
                      Total Belanja Bumbu Masak:
                    </td>
                    <td className="px-3 py-2.5 text-right text-amber-800 font-extrabold text-sm">
                      {formatRp(data.totalBelanjaBumbu)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 font-['Hanken_Grotesk']">
      {/* Production Notes / Catatan Dapur Banner dari Excel */}
      {report.productionNotes && report.productionNotes.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                  Catatan / Evaluasi Produksi Dapur
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900">
                  Dari Lembar Excel
                </span>
              </div>
              <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4 font-medium">
                {report.productionNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* NAVBAR / TAB SELECTION BAR */}
      <div className="bg-slate-900 p-1.5 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {TABS_CONFIG.map((t) => {
            const Icon = t.icon;
            const isActive = currentTab === t.key;

            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer select-none ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 shadow-md font-black scale-[1.02]'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-amber-400/80'}`} />
                <span>{t.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${
                    isActive
                      ? 'bg-slate-950 text-amber-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {t.countBadge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENT PER SELECTED TAB */}
      <div className="transition-all">
        {/* TAB 1: PORSI KECIL */}
        {currentTab === 'kecil' &&
          renderPortionSection(
            report.porsiKecil,
            'PORSI KECIL (PAUD / TK & SD 1-3)',
            'bg-emerald-100 text-emerald-900 border border-emerald-300'
          )}

        {/* TAB 2: PORSI BESAR */}
        {currentTab === 'besar' &&
          renderPortionSection(
            report.porsiBesar,
            'PORSI BESAR (SD KELAS 4-6, SMP, SMA)',
            'bg-blue-100 text-blue-900 border border-blue-300'
          )}

        {/* TAB 3: PORSI BALITA */}
        {currentTab === 'balita' &&
          renderPortionSection(
            report.porsiBalita,
            'PORSI BALITA (USIA 6-59 BULAN)',
            'bg-amber-100 text-amber-900 border border-amber-300'
          )}

        {/* TAB 4: PORSI BUMIL / BUSUI */}
        {currentTab === 'bumil' &&
          renderPortionSection(
            report.porsiBumilBusui,
            'PORSI IBU HAMIL & IBU MENYUSUI (BUMIL / BUSUI)',
            'bg-rose-100 text-rose-900 border border-rose-300'
          )}

        {/* TAB 5: PAKET SEHAT 3B (KERINGAN) */}
        {currentTab === 'paket3b' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Paket Sehat 3B (Bahan Keringan Balita & Bumil)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar item kudapan / suplemen makanan kering khusus sasaran 3B.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-purple-50 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold">
                  Balita: {report.paketSehat3b?.balitaCount || 0} Anak
                </span>
                <span className="px-3 py-1 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold">
                  Bumil: {report.paketSehat3b?.bumilBusuiCount || 0} Orang
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-between">
                <span>Daftar Item Paket Keringan</span>
                <span className="text-purple-300 text-xs font-bold">
                  {(report.paketSehat3b?.keringanItems || []).length} Item
                </span>
              </div>
              {!(report.paketSehat3b?.keringanItems || []).length ? (
                <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50/50">
                  Tidak ada item paket keringan pada laporan batch ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                        <th className="px-3 py-2 w-10 text-center">No</th>
                        <th className="px-3 py-2">Item Bahan Keringan</th>
                        <th className="px-2 py-2 text-center">Qty (Pcs)</th>
                        <th className="px-2 py-2 text-center">Qty Kebutuhan</th>
                        <th className="px-2 py-2 text-center">Satuan</th>
                        <th className="px-3 py-2 text-right">Harga Satuan</th>
                        <th className="px-3 py-2 text-right">Total Biaya</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.paketSehat3b.keringanItems.map((k, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/40 transition-colors font-medium text-slate-800">
                          <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-slate-900">{k.item}</td>
                          <td className="px-2 py-2 text-center font-medium">{formatNum(k.qtyPcs, 0)}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-900 bg-slate-50">{formatNum(k.qty, 1)}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-600">{k.satuan || 'pcs'}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-600">
                            {k.hargaSatuan ? formatRp(k.hargaSatuan) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-purple-900">
                            {k.totalHarga ? formatRp(k.totalHarga) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 text-slate-900 font-black text-xs border-t-2 border-slate-300">
                        <td colSpan={6} className="px-3 py-2.5 text-right uppercase tracking-wider">
                          Total Biaya Paket Keringan:
                        </td>
                        <td className="px-3 py-2.5 text-right text-purple-900 font-extrabold text-sm">
                          {formatRp(
                            report.paketSehat3b.keringanItems.reduce(
                              (s, k) => s + (k.totalHarga || (k.qty || 0) * (k.hargaSatuan || 0)),
                              0
                            )
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: PO & REALISASI PEMBELIAN */}
        {currentTab === 'po' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Tabel 1: PO Kedatangan Supplier */}
            <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                  <span>1. PO Logistik Kedatangan Supplier (Hasil Excel)</span>
                </div>
                <span className="text-teal-300 text-xs font-bold">
                  {(report.poRows || []).length} Jadwal
                </span>
              </div>
              {!(report.poRows || []).length ? (
                <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50/50">
                  Tidak ada jadwal kedatangan logistik supplier pada file Excel ini.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                        <th className="px-3 py-2 w-10 text-center">No</th>
                        <th className="px-3 py-2">Supplier</th>
                        <th className="px-3 py-2">List Pesanan Bahan</th>
                        <th className="px-2 py-2 text-center">Jam Tiba</th>
                        <th className="px-2 py-2 text-center">Jumlah</th>
                        <th className="px-2 py-2 text-center">Satuan</th>
                        <th className="px-3 py-2">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.poRows.map((po, idx) => (
                        <tr key={idx} className="hover:bg-teal-50/40 transition-colors font-medium text-slate-800">
                          <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-slate-900">{po.supplier}</td>
                          <td className="px-3 py-2 text-slate-700">{po.item}</td>
                          <td className="px-2 py-2 text-center font-bold text-teal-800 bg-teal-50/50">{po.jamKedatangan}</td>
                          <td className="px-2 py-2 text-center font-black text-slate-900">{formatNum(po.jumlah, 1)}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-600">{po.satuan}</td>
                          <td className="px-3 py-2 text-slate-600 text-[11px]">{po.keterangan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Tabel 2: Realisasi Pembelian vs Anggaran */}
            <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>2. Realisasi Pembelian Bahan Baku vs Anggaran</span>
                </div>
                <span className="text-emerald-300 text-xs font-black">
                  Total Realisasi: {formatRp(report.totalPengeluaran)}
                </span>
              </div>
              {!(report.realisasiPembelianRows || []).length ? (
                <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50/50">
                  Tidak ada rekapitulasi realisasi pembelian bahan baku.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                        <th className="px-3 py-2 w-10 text-center">No</th>
                        <th className="px-3 py-2">Tanggal</th>
                        <th className="px-3 py-2">Nama Bahan</th>
                        <th className="px-2 py-2 text-center">Kuantitas</th>
                        <th className="px-2 py-2 text-center">Satuan</th>
                        <th className="px-3 py-2 text-right">Harga Satuan</th>
                        <th className="px-3 py-2 text-right">Total Harga</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.realisasiPembelianRows.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors font-medium text-slate-800">
                          <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                          <td className="px-3 py-2 text-slate-500">{r.tanggal}</td>
                          <td className="px-3 py-2 font-bold text-slate-900">{r.namaBahan}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-900 bg-slate-50">{formatNum(r.kuantitas, 1)}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-600">{r.satuan}</td>
                          <td className="px-3 py-2 text-right text-slate-600">
                            {r.hargaPerUnit ? formatRp(r.hargaPerUnit) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-800">
                            {r.totalHarga ? formatRp(r.totalHarga) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 text-slate-900 font-black text-xs border-t-2 border-slate-300">
                        <td colSpan={6} className="px-3 py-2.5 text-right uppercase tracking-wider">
                          Total Realisasi Belanja:
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-800 font-extrabold text-sm">
                          {formatRp(report.totalPengeluaran)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 7: FORM QC PEMERIKSAAN BAHAN */}
        {currentTab === 'qc' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header info form */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Formulir Pemeriksaan Mutu Bahan Baku (QC Inspection)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dari: <strong className="text-slate-800">{report.inspectionForm?.dari || 'Koperasi Al Umanaa'}</strong> | Kepada: <strong className="text-slate-800">{report.inspectionForm?.kepada || 'SPPG Sukabumi'}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-bold">
                  Petugas QC: {report.inspectionForm?.officerName || 'Gari Iriana'}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-between">
                <span>Pemeriksaan Kondisi & Mutu Fisik Bahan</span>
                <span className="text-indigo-300 text-xs font-bold">
                  {(report.inspectionForm?.rows || []).length} Item Diperiksa
                </span>
              </div>
              {!(report.inspectionForm?.rows || []).length ? (
                <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50/50">
                  Tidak ada checklist QC pada file Excel ini.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                        <th className="px-3 py-2 w-10 text-center">No</th>
                        <th className="px-3 py-2">Jenis Bahan Makanan</th>
                        <th className="px-2 py-2 text-center">Banyaknya</th>
                        <th className="px-2 py-2 text-center">Satuan</th>
                        <th className="px-2 py-2 text-center">Kesesuaian</th>
                        <th className="px-2 py-2 text-center">Kondisi Fisik</th>
                        <th className="px-3 py-2">Catatan Pemeriksa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.inspectionForm.rows.map((qc, idx) => (
                        <tr key={idx} className="hover:bg-indigo-50/30 transition-colors font-medium text-slate-800">
                          <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-slate-900">{qc.jenisBahan}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-900">{formatNum(qc.banyaknya, 1)}</td>
                          <td className="px-2 py-2 text-center text-slate-600">{qc.satuan}</td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                qc.isSesuai
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-red-100 text-red-800 border border-red-300'
                              }`}
                            >
                              {qc.isSesuai ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                              <span>{qc.isSesuai ? 'Sesuai' : 'Tidak Sesuai'}</span>
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                qc.isBaik
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-amber-100 text-amber-800 border border-amber-300'
                              }`}
                            >
                              <span>{qc.isBaik ? 'Baik / Segar' : 'Rusak / Afkir'}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 text-[11px]">{qc.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 8: REKAPAN LIMBAH (FOOD WASTE) */}
        {currentTab === 'waste' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Rekapitulasi Pemantauan Limbah Sisa Makanan (Food Waste)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pencatatan sisa makanan yang terbuang setelah proses produksi & distribusi selesai.
                </p>
              </div>
              <span className="px-3 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold">
                Total Menu Terpantau: {(report.wasteLogs || []).length}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-between">
                <span>Daftar Sisa Makanan Terbuang</span>
                <span className="text-slate-300 text-xs font-bold">Laporan Harian</span>
              </div>
              {!(report.wasteLogs || []).length ? (
                <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50/50">
                  Tidak ada catatan limbah sisa makanan pada laporan batch ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                        <th className="px-3 py-2 w-10 text-center">No</th>
                        <th className="px-3 py-2">Nama Menu / Makanan</th>
                        <th className="px-2 py-2 text-center">Kuantitas Limbah</th>
                        <th className="px-2 py-2 text-center">Satuan</th>
                        <th className="px-3 py-2">Status / Dokumentasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.wasteLogs.map((w, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors font-medium text-slate-800">
                          <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{w.no || idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-slate-900">{w.namaMakanan}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-900 bg-slate-50">{formatNum(w.kuantitas, 2)}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-600">{w.satuan || 'kg'}</td>
                          <td className="px-3 py-2 text-slate-500 text-[11px]">{w.dokumentasi || 'Nihil / Habis Terkonsumsi'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 9: DISTRIBUSI SEKOLAH / SASARAN PENERIMA */}
        {currentTab === 'sekolah' && (() => {
          const list = report.sekolahList || [];
          const totalMurid = list.reduce((s, it) => s + (it.murid || 0), 0);
          const totalGuru = list.reduce((s, it) => s + (it.guru || 0), 0);
          const totalPorsi = totalMurid + totalGuru;

          return (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    Daftar Distribusi Sekolah & Sasaran Penerima Manfaat
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rincian alokasi porsi yang dikirimkan ke masing-masing sekolah, lembaga, dan posyandu sesuai dokumen Excel MBG.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                    {list.length} Titik Sasaran
                  </span>
                  <span className="px-3 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold">
                    Total Murid: {totalMurid.toLocaleString('id-ID')}
                  </span>
                  <span className="px-3 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold">
                    Total Guru: {totalGuru.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
                <div className="px-4 py-2.5 bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider flex items-center justify-between">
                  <span>Rincian Distribusi Lembaga / Sekolah Penerima</span>
                  <span className="text-amber-300 text-xs font-bold">
                    Grand Total Porsi: {totalPorsi.toLocaleString('id-ID')}
                  </span>
                </div>
                {!list.length ? (
                  <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50/50">
                    Tidak ada data daftar distribusi sekolah pada laporan harian ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                          <th className="px-3 py-2.5 w-12 text-center">No</th>
                          <th className="px-4 py-2.5">Nama Sekolah / Sasaran Penerima</th>
                          <th className="px-3 py-2.5 text-center">Porsi Murid / Balita</th>
                          <th className="px-3 py-2.5 text-center">Porsi Guru / Petugas</th>
                          <th className="px-3 py-2.5 text-right font-black">Total Porsi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {list.map((item, idx) => {
                          const itemTotal = (item.murid || 0) + (item.guru || 0);
                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors font-medium text-slate-800">
                              <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                              <td className="px-4 py-2 font-bold text-slate-900">{item.nama}</td>
                              <td className="px-3 py-2 text-center font-bold text-emerald-800 bg-emerald-50/30">
                                {item.murid ? item.murid.toLocaleString('id-ID') : '-'}
                              </td>
                              <td className="px-3 py-2 text-center font-medium text-slate-700">
                                {item.guru ? item.guru.toLocaleString('id-ID') : '-'}
                              </td>
                              <td className="px-3 py-2 text-right font-black text-slate-900 bg-slate-50">
                                {itemTotal.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-900">
                          <td colSpan={2} className="px-4 py-3 uppercase tracking-wider">
                            Total Keseluruhan ({list.length} Lembaga):
                          </td>
                          <td className="px-3 py-3 text-center text-emerald-300 font-black">
                            {totalMurid.toLocaleString('id-ID')}
                          </td>
                          <td className="px-3 py-3 text-center text-slate-200">
                            {totalGuru.toLocaleString('id-ID')}
                          </td>
                          <td className="px-3 py-3 text-right text-amber-300 font-extrabold text-sm">
                            {totalPorsi.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
