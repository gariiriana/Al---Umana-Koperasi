import { useState, useEffect } from 'react';
import type {
  MbgProductionDailyReport,
  MbgPortionDailyData,
  MbgPmEntry,
  MbgPoReportRow,
  MbgPortionNutritionItem,
  MbgPortionBahanItem,
  MbgPortionBumbuItem,
} from '@/types/mbg';
import {
  Utensils,
  ChefHat,
  Baby,
  Heart,
  Truck,
  ClipboardCheck,
  Trash2,
  AlertCircle,
  School,
  Search,
  Building2,
  Clock,
  UserCheck,
  Layers,
  ChevronDown,
  Pencil,
  Plus,
  Save,
  X,
  Loader2,
  Check,
  CheckCheck,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type MbgDailyReportSubTab =
  | 'kecil'
  | 'besar'
  | 'balita'
  | 'bumil'
  | 'po'
  | 'paket3b'
  | 'qc'
  | 'waste'
  | 'sekolah';

interface DailyReportExcelSectionsProps {
  report?: MbgProductionDailyReport | null;
  defaultSubTab?: MbgDailyReportSubTab;
  activeSubTab?: MbgDailyReportSubTab;
  onSubTabChange?: (tab: MbgDailyReportSubTab) => void;
  entries?: MbgPmEntry[];
  onSaveReport?: (updatedReport: MbgProductionDailyReport) => Promise<void>;
  batchTanggal?: string;
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

// ─── HELPER: Filter PM Entries Inputted by Admin MBG for each Portion ──────────
import {
  getAllDetailedPmEntries,
  type FilteredPmRow,
  type DetailedPmRow,
} from '../../utils/mbgPmFilter';
export type { FilteredPmRow, DetailedPmRow };


// ─── COMPONENT UTAMA ─────────────────────────────────────────────────────────

export function DailyReportExcelSections({
  report,
  defaultSubTab = 'kecil',
  activeSubTab,
  onSubTabChange,
  entries = [],
  onSaveReport,
  batchTanggal,
}: DailyReportExcelSectionsProps) {
  const navigate = useNavigate();
  const [internalSubTab, setInternalSubTab] = useState<MbgDailyReportSubTab>(defaultSubTab);
  const [pmSearchQuery, setPmSearchQuery] = useState('');
  const [showAuxTabs, setShowAuxTabs] = useState(false);

  // EDIT MODE STATES
  const [editingTab, setEditingTab] = useState<MbgDailyReportSubTab | null>(null);
  const [draftReport, setDraftReport] = useState<MbgProductionDailyReport | null>(report || null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  useEffect(() => {
    if (report && !editingTab) {
      setDraftReport(report);
    }
  }, [report, editingTab]);

  if (!report && !draftReport) {
    return null;
  }

  const curReport = draftReport || report!;

  const currentTab = activeSubTab || internalSubTab;
  const setTab = (tab: MbgDailyReportSubTab) => {
    if (editingTab && editingTab !== tab) {
      if (!window.confirm('Ada perubahan yang belum disimpan di tabel ini. Pindah tab dan batalkan edit?')) {
        return;
      }
      setEditingTab(null);
      setDraftReport(report || null);
    }
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setInternalSubTab(tab);
    }
  };

  // 5 TABS UTAMA
  const CORE_5_TABS = [
    {
      key: 'kecil' as const,
      number: '1',
      label: 'Tabel Porsi Kecil',
      icon: Utensils,
      countBadge: `${curReport.porsiKecil?.pmCount || 0} Porsi`,
      itemCount: (curReport.porsiKecil?.nutritionItems || []).length,
      color: 'emerald',
    },
    {
      key: 'besar' as const,
      number: '2',
      label: 'Tabel Porsi Besar',
      icon: ChefHat,
      countBadge: `${curReport.porsiBesar?.pmCount || 0} Porsi`,
      itemCount: (curReport.porsiBesar?.nutritionItems || []).length,
      color: 'blue',
    },
    {
      key: 'balita' as const,
      number: '3',
      label: 'Tabel Porsi Balita',
      icon: Baby,
      countBadge: `${curReport.porsiBalita?.pmCount || 0} Porsi`,
      itemCount: (curReport.porsiBalita?.nutritionItems || []).length,
      color: 'amber',
    },
    {
      key: 'bumil' as const,
      number: '4',
      label: 'Tabel Porsi Bumil / Busui',
      icon: Heart,
      countBadge: `${curReport.porsiBumilBusui?.pmCount || 0} Porsi`,
      itemCount: (curReport.porsiBumilBusui?.nutritionItems || []).length,
      color: 'rose',
    },
    {
      key: 'po' as const,
      number: '5',
      label: 'Daftar Pesanan Bahan',
      icon: Truck,
      countBadge: `${(curReport.poRows || []).length} Item PO`,
      itemCount: (curReport.poRows || []).length,
      color: 'amber',
    },
  ];

  const AUX_TABS = [
    { key: 'paket3b' as const, label: 'Paket Sehat 3B (Keringan)', icon: Layers },
    { key: 'qc' as const, label: 'QC Penerimaan Bahan', icon: ClipboardCheck },
    { key: 'waste' as const, label: 'Rekap Limbah Makanan', icon: Trash2 },
    { key: 'sekolah' as const, label: 'Rekap Distribusi Sekolah', icon: School },
  ];

  // ─── HELPER EDIT PER-TAB ───────────────────────────────────────────────────

  const handleStartEdit = (tab: MbgDailyReportSubTab) => {
    setDraftReport(JSON.parse(JSON.stringify(report || curReport)));
    setEditingTab(tab);
    setSaveSuccessNotice(false);
  };

  const handleCancelEdit = () => {
    setDraftReport(report || null);
    setEditingTab(null);
  };

  const handleSaveEdit = async () => {
    if (!draftReport) return;
    try {
      setIsSaving(true);
      if (onSaveReport) {
        await onSaveReport(draftReport);
      }
      setEditingTab(null);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 4000);
    } catch (err) {
      console.error('Failed to save table edits:', err);
      alert('Gagal menyimpan perubahan ke database!');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper: Recalculate Portion Totals
  const recalculatePortion = (portion: MbgPortionDailyData): MbgPortionDailyData => {
    const totalGizi = {
      beratBersih: (portion.nutritionItems || []).reduce((s, it) => s + (Number(it.beratBersih) || 0), 0),
      energi: (portion.nutritionItems || []).reduce((s, it) => s + (Number(it.energi) || 0), 0),
      protein: (portion.nutritionItems || []).reduce((s, it) => s + (Number(it.protein) || 0), 0),
      lemak: (portion.nutritionItems || []).reduce((s, it) => s + (Number(it.lemak) || 0), 0),
      karbohidrat: (portion.nutritionItems || []).reduce((s, it) => s + (Number(it.karbohidrat) || 0), 0),
      serat: (portion.nutritionItems || []).reduce((s, it) => s + (Number(it.serat) || 0), 0),
    };

    const totalBelanjaBahan = (portion.bahanItems || []).reduce((s, b) => s + (Number(b.harga) || 0), 0);
    const totalBelanjaBumbu = (portion.bumbuItems || []).reduce((s, bm) => s + (Number(bm.harga) || 0), 0);
    const totalBelanjaOverall = totalBelanjaBahan + totalBelanjaBumbu;
    const pmCount = portion.pmCount || 1;

    return {
      ...portion,
      totalGizi,
      totalBelanjaBahan,
      hargaBahanPerPorsi: pmCount > 0 ? totalBelanjaBahan / pmCount : 0,
      totalBelanjaBumbu,
      hargaBumbuPerPorsi: pmCount > 0 ? totalBelanjaBumbu / pmCount : 0,
      totalBelanjaOverall,
      hargaPerPorsiOverall: pmCount > 0 ? totalBelanjaOverall / pmCount : 0,
    };
  };

  const getPortionDataKey = (portionType: 'kecil' | 'besar' | 'balita' | 'bumil'): keyof Pick<MbgProductionDailyReport, 'porsiKecil' | 'porsiBesar' | 'porsiBalita' | 'porsiBumilBusui'> => {
    if (portionType === 'kecil') return 'porsiKecil';
    if (portionType === 'besar') return 'porsiBesar';
    if (portionType === 'balita') return 'porsiBalita';
    return 'porsiBumilBusui';
  };

  const updatePortionCell = (
    portionType: 'kecil' | 'besar' | 'balita' | 'bumil',
    section: 'nutrition' | 'bahan' | 'bumbu',
    idx: number,
    field: string,
    val: unknown
  ) => {
    if (!draftReport) return;
    const pKey = getPortionDataKey(portionType);
    const pData = JSON.parse(JSON.stringify(draftReport[pKey] || {})) as MbgPortionDailyData;

    if (section === 'nutrition') {
      pData.nutritionItems = pData.nutritionItems || [];
      if (!pData.nutritionItems[idx]) {
        pData.nutritionItems[idx] = { menuName: '', rincianBahan: '', beratBersih: 0, energi: 0, protein: 0, lemak: 0, karbohidrat: 0, serat: 0 };
      }
      pData.nutritionItems[idx] = {
        ...pData.nutritionItems[idx],
        [field]: typeof val === 'number' || !isNaN(Number(val)) ? Number(val) : val,
      };
    } else if (section === 'bahan') {
      pData.bahanItems = pData.bahanItems || [];
      if (!pData.bahanItems[idx]) {
        pData.bahanItems[idx] = { rincianBahan: '', hargaBahan: 0, bddPercent: 100, beratKotor: 0, totalGml: 0, sparePercent: 0, kebutuhan: 0, satuan: 'kg', harga: 0 };
      }
      const bItem = { ...pData.bahanItems[idx], [field]: typeof val === 'number' || !isNaN(Number(val)) ? Number(val) : val };
      // Auto compute harga if kebutuhan or hargaBahan changes
      if (field === 'kebutuhan' || field === 'hargaBahan') {
        const keb = field === 'kebutuhan' ? Number(val) : bItem.kebutuhan;
        const hb = field === 'hargaBahan' ? Number(val) : bItem.hargaBahan;
        if (keb > 0 && hb > 0) {
          bItem.harga = Math.round(keb * hb);
        }
      }
      pData.bahanItems[idx] = bItem;
    } else if (section === 'bumbu') {
      pData.bumbuItems = pData.bumbuItems || [];
      if (!pData.bumbuItems[idx]) {
        pData.bumbuItems[idx] = { namaMenu: '', namaBumbu: '', hargaBumbu: 0, kebutuhan: 0, satuan: 'kg', harga: 0 };
      }
      const bmItem = { ...pData.bumbuItems[idx], [field]: typeof val === 'number' || !isNaN(Number(val)) ? Number(val) : val };
      if (field === 'kebutuhan' || field === 'hargaBumbu') {
        const keb = field === 'kebutuhan' ? Number(val) : bmItem.kebutuhan;
        const hb = field === 'hargaBumbu' ? Number(val) : bmItem.hargaBumbu;
        if (keb > 0 && hb > 0) {
          bmItem.harga = Math.round(keb * hb);
        }
      }
      pData.bumbuItems[idx] = bmItem;
    }

    const recalculated = recalculatePortion(pData);
    setDraftReport({
      ...draftReport,
      [pKey]: recalculated,
    });
  };

  const handleAddPortionRow = (portionType: 'kecil' | 'besar' | 'balita' | 'bumil') => {
    if (!draftReport) return;
    const pKey = getPortionDataKey(portionType);
    const pData = JSON.parse(JSON.stringify(draftReport[pKey] || {})) as MbgPortionDailyData;

    const newNut: MbgPortionNutritionItem = {
      menuName: 'Menu Baru',
      rincianBahan: 'Bahan Baru',
      beratBersih: 50,
      energi: 0,
      protein: 0,
      lemak: 0,
      karbohidrat: 0,
      serat: 0,
    };
    const newBah: MbgPortionBahanItem = {
      rincianBahan: 'Bahan Baru',
      hargaBahan: 0,
      bddPercent: 100,
      beratKotor: 0,
      totalGml: 0,
      sparePercent: 0,
      kebutuhan: 0,
      satuan: 'kg',
      harga: 0,
    };
    const newBum: MbgPortionBumbuItem = {
      namaMenu: 'Menu Baru',
      namaBumbu: 'Bumbu Baru',
      hargaBumbu: 0,
      kebutuhan: 0,
      satuan: 'kg',
      harga: 0,
    };

    pData.nutritionItems = [...(pData.nutritionItems || []), newNut];
    pData.bahanItems = [...(pData.bahanItems || []), newBah];
    pData.bumbuItems = [...(pData.bumbuItems || []), newBum];

    const recalculated = recalculatePortion(pData);
    setDraftReport({
      ...draftReport,
      [pKey]: recalculated,
    });
  };

  const handleDeletePortionRow = (portionType: 'kecil' | 'besar' | 'balita' | 'bumil', idx: number) => {
    if (!draftReport) return;
    const pKey = getPortionDataKey(portionType);
    const pData = JSON.parse(JSON.stringify(draftReport[pKey] || {})) as MbgPortionDailyData;

    if (pData.nutritionItems && pData.nutritionItems.length > idx) {
      pData.nutritionItems.splice(idx, 1);
    }
    if (pData.bahanItems && pData.bahanItems.length > idx) {
      pData.bahanItems.splice(idx, 1);
    }
    if (pData.bumbuItems && pData.bumbuItems.length > idx) {
      pData.bumbuItems.splice(idx, 1);
    }

    const recalculated = recalculatePortion(pData);
    setDraftReport({
      ...draftReport,
      [pKey]: recalculated,
    });
  };

  // ─── HELPER EDIT SUPPLIER TABLE ────────────────────────────────────────────

  const updateSupplierCell = (idx: number, field: keyof MbgPoReportRow, val: unknown) => {
    if (!draftReport) return;
    const rows = JSON.parse(JSON.stringify(draftReport.poRows || [])) as MbgPoReportRow[];
    if (!rows[idx]) return;

    const row = { ...rows[idx], [field]: val };
    if (field === 'jumlah' || field === 'hargaSatuan') {
      const j = field === 'jumlah' ? Number(val) : row.jumlah;
      const h = field === 'hargaSatuan' ? Number(val) : row.hargaSatuan || 0;
      if (j > 0 && h > 0) {
        row.totalHarga = Math.round(j * h);
      }
    }
    rows[idx] = row;

    const totalPengeluaran = rows.reduce((s, r) => s + (r.totalHarga || (r.jumlah && r.hargaSatuan ? r.jumlah * r.hargaSatuan : 0)), 0);

    setDraftReport({
      ...draftReport,
      poRows: rows,
      totalPengeluaran,
    });
  };

  const handleAddSupplierRow = () => {
    if (!draftReport) return;
    const rows = JSON.parse(JSON.stringify(draftReport.poRows || [])) as MbgPoReportRow[];
    rows.push({
      supplier: 'Supplier Baru',
      item: 'Nama Bahan / Barang',
      jamKedatangan: '06:00',
      jumlah: 1,
      satuan: 'kg',
      keterangan: 'Sesuai Spesifikasi',
      hargaSatuan: 0,
      totalHarga: 0,
    });
    setDraftReport({
      ...draftReport,
      poRows: rows,
    });
  };

  const handleDeleteSupplierRow = (idx: number) => {
    if (!draftReport) return;
    const rows = JSON.parse(JSON.stringify(draftReport.poRows || [])) as MbgPoReportRow[];
    rows.splice(idx, 1);
    const totalPengeluaran = rows.reduce((s, r) => s + (r.totalHarga || (r.jumlah && r.hargaSatuan ? r.jumlah * r.hargaSatuan : 0)), 0);
    setDraftReport({
      ...draftReport,
      poRows: rows,
      totalPengeluaran,
    });
  };

  const handleSetAllSuppliersToAlUmanaa = async () => {
    const target = 'Koperasi Al Umanaa Sejahtera Mandiri';
    if (editingTab === 'po') {
      if (!draftReport) return;
      const rows = (draftReport.poRows || []).map((r) => ({
        ...r,
        supplier: target,
      }));
      setDraftReport({
        ...draftReport,
        poRows: rows,
      });
    } else {
      const base = report || curReport;
      const rows = (base.poRows || []).map((r) => ({
        ...r,
        supplier: target,
      }));
      const updated = {
        ...base,
        poRows: rows,
      };
      try {
        setIsSaving(true);
        if (onSaveReport) {
          await onSaveReport(updated);
        }
        setSaveSuccessNotice(true);
        setTimeout(() => setSaveSuccessNotice(false), 4000);
      } catch (err) {
        console.error('Failed to set all suppliers:', err);
        alert('Gagal menyimpan nama supplier!');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSetSingleSupplierToAlUmanaa = async (idx: number) => {
    const target = 'Koperasi Al Umanaa Sejahtera Mandiri';
    if (editingTab === 'po') {
      updateSupplierCell(idx, 'supplier', target);
    } else {
      const base = report || curReport;
      const rows = JSON.parse(JSON.stringify(base.poRows || [])) as MbgPoReportRow[];
      if (rows[idx]) {
        rows[idx].supplier = target;
        const updated = {
          ...base,
          poRows: rows,
        };
        try {
          setIsSaving(true);
          if (onSaveReport) {
            await onSaveReport(updated);
          }
          setSaveSuccessNotice(true);
          setTimeout(() => setSaveSuccessNotice(false), 4000);
        } catch (err) {
          console.error('Failed to set supplier:', err);
          alert('Gagal memperbarui supplier!');
        } finally {
          setIsSaving(false);
        }
      }
    }
  };

  // ─── RENDERER: TABEL PORSI EXCEL ───────────────────────────────────────────
  const renderUnifiedExcelPortionTable = (
    portionData: MbgPortionDailyData | undefined,
    defaultTitle: string,
    portionType: 'kecil' | 'besar' | 'balita' | 'bumil'
  ) => {
    const data: MbgPortionDailyData = portionData || {
      portionType: portionType === 'bumil' ? 'bumil_busui' : portionType,
      portionTitle: defaultTitle,
      pmCount: 0,
      menuList: [],
      nutritionItems: [],
      bahanItems: [],
      bumbuItems: [],
      totalGizi: { beratBersih: 0, energi: 0, protein: 0, lemak: 0, karbohidrat: 0, serat: 0 },
      akgMetrics: {},
      akgRows: [],
      totalBelanjaBahan: 0,
      hargaBahanPerPorsi: 0,
      totalBelanjaBumbu: 0,
      hargaBumbuPerPorsi: 0,
      totalBelanjaOverall: 0,
      hargaPerPorsiOverall: 0,
    };

    const isEditing = editingTab === portionType;

    const maxRows = Math.max(
      data.nutritionItems?.length || 0,
      data.bahanItems?.length || 0,
      data.bumbuItems?.length || 0,
      1
    );

    // Filter PM data from Admin MBG input (semua kategori porsi lengkap)
    const detailedPmRows = getAllDetailedPmEntries(entries, curReport.sekolahList);
    const filteredDetailedPmRows = detailedPmRows.filter((p) =>
      p.institutionName.toLowerCase().includes(pmSearchQuery.toLowerCase()) ||
      p.petugasName.toLowerCase().includes(pmSearchQuery.toLowerCase()) ||
      p.categoryLabel.toLowerCase().includes(pmSearchQuery.toLowerCase()) ||
      (p.rincian && p.rincian.toLowerCase().includes(pmSearchQuery.toLowerCase()))
    );

    // Tab-specific portion count for top metric bar fallback if data.pmCount is 0
    const currentTabPortionCount = detailedPmRows.reduce((s, p) => {
      if (p.isLibur) return s;
      if (portionType === 'kecil') return s + p.porsiKecil;
      if (portionType === 'besar') return s + p.porsiBesar;
      if (portionType === 'balita') return s + p.porsiBalita;
      if (portionType === 'bumil') return s + p.porsiBumilBusui;
      return s + p.totalJumlah;
    }, 0);

    const sumPorsiKecil = detailedPmRows.reduce((s, p) => s + (p.isLibur ? 0 : p.porsiKecil), 0);
    const sumPorsiBesar = detailedPmRows.reduce((s, p) => s + (p.isLibur ? 0 : p.porsiBesar), 0);
    const sumPorsiBalita = detailedPmRows.reduce((s, p) => s + (p.isLibur ? 0 : p.porsiBalita), 0);
    const sumPorsiBumil = detailedPmRows.reduce((s, p) => s + (p.isLibur ? 0 : p.porsiBumilBusui), 0);
    const grandTotalAllPorsi = detailedPmRows.reduce((s, p) => s + (p.isLibur ? 0 : p.totalJumlah), 0);

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* TOP COMPACT METRIC BAR & ACTION BUTTONS */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 font-['Hanken_Grotesk']">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-slate-900 text-amber-300">
              {data.portionTitle || defaultTitle}
            </span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
              🎯 Sasaran: {data.pmCount || currentTabPortionCount || 0} Porsi
            </span>

            {/* EDIT STATUS NOTICE */}
            {isEditing && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-500 text-white animate-pulse">
                <Pencil className="h-3.5 w-3.5" />
                <span>Mode Edit Aktif</span>
              </span>
            )}
            {saveSuccessNotice && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-600 text-white">
                <Check className="h-3.5 w-3.5" />
                <span>Tersimpan!</span>
              </span>
            )}
          </div>

          {/* EDIT TOOLBAR / METRICS */}
          <div className="flex items-center gap-3 self-end lg:self-auto flex-wrap">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-amber-50/80 rounded-xl px-2.5 py-1.5 border border-amber-200/80">
                <span className="text-[10px] font-extrabold text-amber-900 uppercase block">Total Energi</span>
                <span className="text-xs font-black text-amber-700">
                  {formatNum(data.totalGizi?.energi, 1)} kkal
                </span>
              </div>
              <div className="bg-sky-50/80 rounded-xl px-2.5 py-1.5 border border-sky-200/80">
                <span className="text-[10px] font-extrabold text-sky-900 uppercase block">Belanja Bahan</span>
                <span className="text-xs font-black text-slate-800">
                  {formatRp(data.totalBelanjaBahan)}
                </span>
              </div>
              <div className="bg-amber-50/80 rounded-xl px-2.5 py-1.5 border border-amber-200/80">
                <span className="text-[10px] font-extrabold text-amber-900 uppercase block">Belanja Bumbu</span>
                <span className="text-xs font-black text-slate-800">
                  {formatRp(data.totalBelanjaBumbu)}
                </span>
              </div>
              <div className="bg-emerald-50/80 rounded-xl px-2.5 py-1.5 border border-emerald-200/80">
                <span className="text-[10px] font-extrabold text-emerald-900 uppercase block">Biaya / Porsi</span>
                <span className="text-xs font-black text-emerald-900">
                  {formatRp(data.hargaPerPorsiOverall || (data.pmCount ? data.totalBelanjaOverall / data.pmCount : 0))}
                </span>
              </div>
            </div>

            {/* BUTTONS: EDIT / SIMPAN / BATAL */}
            {!isEditing ? (
              <button
                type="button"
                onClick={() => handleStartEdit(portionType)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer"
                title="Edit data menu, gizi, bahan makanan, dan bumbu langsung di tabel ini"
              >
                <Pencil className="h-3.5 w-3.5 text-amber-600" />
                <span>Edit Tabel</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddPortionRow(portionType)}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer"
                  title="Tambah baris komponen menu & bahan baru"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Baris</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Batal</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── TABEL UTAMA: FORMAT PERSIS EXCEL IMPORT ─── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 bg-[#0F172A] text-white text-xs font-black uppercase tracking-wider flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <span>Tabel {data.portionTitle || defaultTitle} — Sesuai Format File Excel</span>
              {isEditing && (
                <span className="text-[10px] font-bold text-amber-300 normal-case bg-amber-400/20 px-2 py-0.5 rounded-md">
                  (Klik pada sel tabel untuk mengubah nilai)
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
              {maxRows} Baris Komponen
            </span>
          </div>

          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full text-left border-collapse min-w-[1350px]">
              <thead className="sticky top-0 z-20 shadow-xs">
                {/* Header Kategori 3 Bagian */}
                <tr className="text-[11px] font-black uppercase tracking-wider border-b border-slate-300">
                  <th
                    colSpan={9}
                    className="bg-[#FFE4E6] text-[#881337] py-2 px-3 text-center border-r-2 border-slate-300 font-extrabold"
                  >
                    🌸 1. Kandungan Gizi Menu
                  </th>
                  <th
                    colSpan={9}
                    className="bg-[#E0F2FE] text-[#0369A1] py-2 px-3 text-center border-r-2 border-slate-300 font-extrabold"
                  >
                    🥣 2. Pesanan Bahan Makanan Pokok
                  </th>
                  <th
                    colSpan={isEditing ? 7 : 6}
                    className="bg-[#FEF3C7] text-[#92400E] py-2 px-3 text-center font-extrabold"
                  >
                    🧂 3. Pesanan Bumbu Masak
                  </th>
                </tr>

                {/* Sub-Header Nama Kolom (Persis Foto Excel) */}
                <tr className="text-[10px] font-black border-b border-slate-300">
                  {/* Kolom Gizi (Pinkish) */}
                  <th className="px-2 py-1.5 bg-[#FFF1F2] text-[#9F1239] border-r border-rose-200 whitespace-nowrap">Jenis Menu</th>
                  <th className="px-2 py-1.5 bg-[#FFF1F2] text-[#9F1239] border-r border-rose-200 whitespace-nowrap">Menu</th>
                  <th className="px-2 py-1.5 bg-[#FFF1F2] text-[#9F1239] border-r border-rose-200 whitespace-nowrap">Rincian Bahan</th>
                  <th className="px-1.5 py-1.5 bg-[#FFF1F2] text-[#9F1239] text-center border-r border-rose-200 whitespace-nowrap">Berat Bersih</th>
                  <th className="px-1.5 py-1.5 bg-[#FFF1F2] text-amber-800 text-center border-r border-rose-200 whitespace-nowrap font-black">Energi (kkal)</th>
                  <th className="px-1.5 py-1.5 bg-[#FFF1F2] text-[#9F1239] text-center border-r border-rose-200 whitespace-nowrap">Protein (g)</th>
                  <th className="px-1.5 py-1.5 bg-[#FFF1F2] text-[#9F1239] text-center border-r border-rose-200 whitespace-nowrap">Lemak (g)</th>
                  <th className="px-1.5 py-1.5 bg-[#FFF1F2] text-[#9F1239] text-center border-r border-rose-200 whitespace-nowrap">Karbohidrat (g)</th>
                  <th className="px-1.5 py-1.5 bg-[#FFF1F2] text-[#9F1239] text-center border-r-2 border-slate-300 whitespace-nowrap">Serat (g)</th>

                  {/* Kolom Bahan (Sky/Blue) */}
                  <th className="px-2 py-1.5 bg-[#F0F9FF] text-[#0C4A6E] border-r border-sky-200 whitespace-nowrap">Rincian Bahan</th>
                  <th className="px-2 py-1.5 bg-[#F0F9FF] text-[#0C4A6E] text-right border-r border-sky-200 whitespace-nowrap">Harga Baku</th>
                  <th className="px-1.5 py-1.5 bg-[#F0F9FF] text-[#0C4A6E] text-center border-r border-sky-200 whitespace-nowrap">%BDD</th>
                  <th className="px-1.5 py-1.5 bg-[#F0F9FF] text-[#0C4A6E] text-center border-r border-sky-200 whitespace-nowrap">Berat Kotor</th>
                  <th className="px-1.5 py-1.5 bg-[#F0F9FF] text-[#0C4A6E] text-center border-r border-sky-200 whitespace-nowrap">Total (g/ml)</th>
                  <th className="px-1.5 py-1.5 bg-[#F0F9FF] text-[#0C4A6E] text-center border-r border-sky-200 whitespace-nowrap">Spare %</th>
                  <th className="px-1.5 py-1.5 bg-[#F0F9FF] text-[#0C4A6E] text-center border-r border-sky-200 whitespace-nowrap font-bold">Kebutuhan</th>
                  <th className="px-1.5 py-1.5 bg-[#F0F9FF] text-[#0C4A6E] text-center border-r border-sky-200 whitespace-nowrap">Satuan</th>
                  <th className="px-2 py-1.5 bg-[#F0F9FF] text-[#0C4A6E] text-right border-r-2 border-slate-300 whitespace-nowrap font-bold">Harga</th>

                  {/* Kolom Bumbu (Amber/Yellow) */}
                  <th className="px-2 py-1.5 bg-[#FFFBEB] text-[#78350F] border-r border-amber-200 whitespace-nowrap">Nama Menu</th>
                  <th className="px-2 py-1.5 bg-[#FFFBEB] text-[#78350F] border-r border-amber-200 whitespace-nowrap">Nama Bumbu</th>
                  <th className="px-2 py-1.5 bg-[#FFFBEB] text-[#78350F] text-right border-r border-amber-200 whitespace-nowrap">Harga Bumbu</th>
                  <th className="px-1.5 py-1.5 bg-[#FFFBEB] text-[#78350F] text-center border-r border-amber-200 whitespace-nowrap font-bold">Kebutuhan</th>
                  <th className="px-1.5 py-1.5 bg-[#FFFBEB] text-[#78350F] text-center border-r border-amber-200 whitespace-nowrap">Satuan</th>
                  <th className="px-2 py-1.5 bg-[#FFFBEB] text-[#78350F] text-right border-r border-amber-200 whitespace-nowrap font-bold">Harga</th>
                  {isEditing && (
                    <th className="px-2 py-1.5 bg-red-100 text-red-900 text-center w-8 whitespace-nowrap">Aksi</th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 font-['Hanken_Grotesk'] text-[11px]">
                {Array.from({ length: maxRows }).map((_, idx) => {
                  const nut = data.nutritionItems?.[idx];
                  const bah = data.bahanItems?.[idx];
                  const bum = data.bumbuItems?.[idx];

                  if (!isEditing) {
                    // Normal Read-Only View
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        {/* Gizi Cells */}
                        <td className="px-2 py-1.5 font-bold text-slate-700 border-r border-rose-100/60 whitespace-nowrap bg-rose-50/20">
                          {nut?.jenisMenu || (idx === 0 ? (data.portionTitle || defaultTitle) : '')}
                        </td>
                        <td className="px-2 py-1.5 font-bold text-slate-900 border-r border-rose-100/60 whitespace-nowrap">
                          {nut?.menuName || ''}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600 border-r border-rose-100/60 whitespace-nowrap">
                          {nut?.rincianBahan || ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center font-medium border-r border-rose-100/60">
                          {nut ? formatNum(nut.beratBersih, 1) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center font-black text-amber-700 border-r border-rose-100/60 bg-amber-50/30">
                          {nut ? formatNum(nut.energi, 1) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border-r border-rose-100/60">
                          {nut ? formatNum(nut.protein, 1) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border-r border-rose-100/60">
                          {nut ? formatNum(nut.lemak, 1) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border-r border-rose-100/60">
                          {nut ? formatNum(nut.karbohidrat, 1) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border-r-2 border-slate-300">
                          {nut ? formatNum(nut.serat, 1) : ''}
                        </td>

                        {/* Bahan Pokok Cells */}
                        <td className="px-2 py-1.5 font-bold text-slate-900 border-r border-sky-100/60 whitespace-nowrap">
                          {bah?.rincianBahan || ''}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600 border-r border-sky-100/60 whitespace-nowrap">
                          {bah?.hargaBahan ? formatRp(bah.hargaBahan) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center text-slate-500 border-r border-sky-100/60">
                          {bah?.bddPercent != null ? `${formatNum(bah.bddPercent, 0)}%` : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center text-slate-600 border-r border-sky-100/60">
                          {bah ? formatNum(bah.beratKotor, 0) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center text-slate-600 border-r border-sky-100/60">
                          {bah ? formatNum(bah.totalGml, 0) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center text-slate-400 border-r border-sky-100/60">
                          {bah?.sparePercent ? `${bah.sparePercent}%` : '-'}
                        </td>
                        <td className="px-1.5 py-1.5 text-center font-black text-slate-900 bg-sky-50/30 border-r border-sky-100/60">
                          {bah ? formatNum(bah.kebutuhan, 1) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center font-bold text-slate-600 border-r border-sky-100/60">
                          {bah?.satuan || ''}
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-emerald-800 border-r-2 border-slate-300 whitespace-nowrap">
                          {bah?.harga ? formatRp(bah.harga) : ''}
                        </td>

                        {/* Bumbu Masak Cells */}
                        <td className="px-2 py-1.5 text-slate-600 border-r border-amber-100/60 whitespace-nowrap">
                          {bum?.namaMenu || ''}
                        </td>
                        <td className="px-2 py-1.5 font-bold text-slate-900 border-r border-amber-100/60 whitespace-nowrap">
                          {bum?.namaBumbu || ''}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600 border-r border-amber-100/60 whitespace-nowrap">
                          {bum?.hargaBumbu ? formatRp(bum.hargaBumbu) : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center font-black text-slate-900 bg-amber-50/30 border-r border-amber-100/60">
                          {bum ? (bum.kebutuhan !== undefined && bum.kebutuhan !== null ? (bum.kebutuhan > 0 ? formatNum(bum.kebutuhan, 2) : '0') : '-') : ''}
                        </td>
                        <td className="px-1.5 py-1.5 text-center font-bold text-slate-600 border-r border-amber-100/60">
                          {bum?.satuan || ''}
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-amber-900 whitespace-nowrap">
                          {bum?.harga ? formatRp(bum.harga) : ''}
                        </td>
                      </tr>
                    );
                  }

                  // ─── INTERACTIVE EDIT MODE (EDITABLE INPUTS) ───
                  return (
                    <tr key={idx} className="bg-amber-50/20">
                      {/* Gizi Inputs */}
                      <td className="px-1 py-1 border-r border-rose-200">
                        <span className="text-[10px] text-slate-400 font-bold block">{idx + 1}</span>
                      </td>
                      <td className="px-1 py-1 border-r border-rose-200">
                        <input
                          type="text"
                          value={nut?.menuName || ''}
                          onChange={(e) => updatePortionCell(portionType, 'nutrition', idx, 'menuName', e.target.value)}
                          placeholder="Menu"
                          className="w-24 px-1.5 py-1 bg-white border border-rose-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-rose-400 font-bold text-slate-900"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-rose-200">
                        <input
                          type="text"
                          value={nut?.rincianBahan || ''}
                          onChange={(e) => updatePortionCell(portionType, 'nutrition', idx, 'rincianBahan', e.target.value)}
                          placeholder="Bahan"
                          className="w-28 px-1.5 py-1 bg-white border border-rose-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-rose-400 text-slate-800"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-rose-200">
                        <input
                          type="number"
                          value={nut?.beratBersih || ''}
                          onChange={(e) => updatePortionCell(portionType, 'nutrition', idx, 'beratBersih', e.target.value)}
                          className="w-14 px-1 py-1 text-center bg-white border border-rose-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-rose-400"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-rose-200">
                        <input
                          type="number"
                          value={nut?.energi || ''}
                          onChange={(e) => updatePortionCell(portionType, 'nutrition', idx, 'energi', e.target.value)}
                          className="w-14 px-1 py-1 text-center bg-amber-50 border border-amber-300 rounded text-[11px] font-black text-amber-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-rose-200">
                        <input
                          type="number"
                          value={nut?.protein || ''}
                          onChange={(e) => updatePortionCell(portionType, 'nutrition', idx, 'protein', e.target.value)}
                          className="w-12 px-1 py-1 text-center bg-white border border-rose-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-rose-200">
                        <input
                          type="number"
                          value={nut?.lemak || ''}
                          onChange={(e) => updatePortionCell(portionType, 'nutrition', idx, 'lemak', e.target.value)}
                          className="w-12 px-1 py-1 text-center bg-white border border-rose-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-rose-200">
                        <input
                          type="number"
                          value={nut?.karbohidrat || ''}
                          onChange={(e) => updatePortionCell(portionType, 'nutrition', idx, 'karbohidrat', e.target.value)}
                          className="w-12 px-1 py-1 text-center bg-white border border-rose-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r-2 border-slate-300">
                        <input
                          type="number"
                          value={nut?.serat || ''}
                          onChange={(e) => updatePortionCell(portionType, 'nutrition', idx, 'serat', e.target.value)}
                          className="w-12 px-1 py-1 text-center bg-white border border-rose-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>

                      {/* Bahan Inputs */}
                      <td className="px-1 py-1 border-r border-sky-200">
                        <input
                          type="text"
                          value={bah?.rincianBahan || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bahan', idx, 'rincianBahan', e.target.value)}
                          placeholder="Bahan Pokok"
                          className="w-28 px-1.5 py-1 bg-white border border-sky-200 rounded text-[11px] font-bold text-slate-900 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-sky-200">
                        <input
                          type="number"
                          value={bah?.hargaBahan || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bahan', idx, 'hargaBahan', e.target.value)}
                          placeholder="Harga"
                          className="w-20 px-1 py-1 text-right bg-white border border-sky-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-sky-200">
                        <input
                          type="number"
                          value={bah?.bddPercent ?? 100}
                          onChange={(e) => updatePortionCell(portionType, 'bahan', idx, 'bddPercent', e.target.value)}
                          className="w-12 px-1 py-1 text-center bg-white border border-sky-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-sky-200">
                        <input
                          type="number"
                          value={bah?.beratKotor || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bahan', idx, 'beratKotor', e.target.value)}
                          className="w-14 px-1 py-1 text-center bg-white border border-sky-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-sky-200">
                        <input
                          type="number"
                          value={bah?.totalGml || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bahan', idx, 'totalGml', e.target.value)}
                          className="w-14 px-1 py-1 text-center bg-white border border-sky-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-sky-200">
                        <input
                          type="number"
                          value={bah?.sparePercent || 0}
                          onChange={(e) => updatePortionCell(portionType, 'bahan', idx, 'sparePercent', e.target.value)}
                          className="w-10 px-1 py-1 text-center bg-white border border-sky-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-sky-200">
                        <input
                          type="number"
                          value={bah?.kebutuhan || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bahan', idx, 'kebutuhan', e.target.value)}
                          className="w-14 px-1 py-1 text-center bg-sky-50 border border-sky-300 rounded text-[11px] font-black text-sky-950 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-sky-200">
                        <input
                          type="text"
                          value={bah?.satuan || 'kg'}
                          onChange={(e) => updatePortionCell(portionType, 'bahan', idx, 'satuan', e.target.value)}
                          className="w-12 px-1 py-1 text-center bg-white border border-sky-200 rounded text-[11px] focus:outline-none font-bold"
                        />
                      </td>
                      <td className="px-1 py-1 border-r-2 border-slate-300">
                        <input
                          type="number"
                          value={bah?.harga || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bahan', idx, 'harga', e.target.value)}
                          className="w-24 px-1.5 py-1 text-right bg-emerald-50 border border-emerald-300 rounded text-[11px] font-black text-emerald-900 focus:outline-none"
                        />
                      </td>

                      {/* Bumbu Inputs */}
                      <td className="px-1 py-1 border-r border-amber-200">
                        <input
                          type="text"
                          value={bum?.namaMenu || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bumbu', idx, 'namaMenu', e.target.value)}
                          placeholder="Menu"
                          className="w-20 px-1.5 py-1 bg-white border border-amber-200 rounded text-[11px] text-slate-600 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-amber-200">
                        <input
                          type="text"
                          value={bum?.namaBumbu || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bumbu', idx, 'namaBumbu', e.target.value)}
                          placeholder="Bumbu"
                          className="w-28 px-1.5 py-1 bg-white border border-amber-200 rounded text-[11px] font-bold text-slate-900 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-amber-200">
                        <input
                          type="number"
                          value={bum?.hargaBumbu || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bumbu', idx, 'hargaBumbu', e.target.value)}
                          placeholder="Harga"
                          className="w-20 px-1 py-1 text-right bg-white border border-amber-200 rounded text-[11px] focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-amber-200">
                        <input
                          type="number"
                          step="0.01"
                          value={bum?.kebutuhan || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bumbu', idx, 'kebutuhan', e.target.value)}
                          className="w-14 px-1 py-1 text-center bg-amber-50 border border-amber-300 rounded text-[11px] font-black text-amber-950 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-amber-200">
                        <input
                          type="text"
                          value={bum?.satuan || 'kg'}
                          onChange={(e) => updatePortionCell(portionType, 'bumbu', idx, 'satuan', e.target.value)}
                          className="w-12 px-1 py-1 text-center bg-white border border-amber-200 rounded text-[11px] focus:outline-none font-bold"
                        />
                      </td>
                      <td className="px-1 py-1 border-r border-amber-200">
                        <input
                          type="number"
                          value={bum?.harga || ''}
                          onChange={(e) => updatePortionCell(portionType, 'bumbu', idx, 'harga', e.target.value)}
                          className="w-22 px-1.5 py-1 text-right bg-amber-50 border border-amber-300 rounded text-[11px] font-black text-amber-900 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeletePortionRow(portionType, idx)}
                          className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors cursor-pointer"
                          title="Hapus baris ini"
                        >
                          <Trash2 className="h-3.5 w-3.5 mx-auto" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* FOOTER TOTAL & % AKG */}
              <tfoot className="border-t-2 border-slate-400 font-['Hanken_Grotesk'] text-[11px] font-black">
                <tr className="bg-[#FFE4E6]/50 text-slate-900 border-b border-slate-300">
                  <td colSpan={3} className="px-3 py-2 text-left uppercase font-black text-rose-950 border-r border-rose-200">
                    Total
                  </td>
                  <td className="px-1.5 py-2 text-center border-r border-rose-200 font-bold">
                    {formatNum(data.totalGizi?.beratBersih, 1)}
                  </td>
                  <td className="px-1.5 py-2 text-center text-amber-900 bg-amber-200/60 font-black border-r border-rose-200">
                    {formatNum(data.totalGizi?.energi, 1)}
                  </td>
                  <td className="px-1.5 py-2 text-center border-r border-rose-200">
                    {formatNum(data.totalGizi?.protein, 1)}
                  </td>
                  <td className="px-1.5 py-2 text-center border-r border-rose-200">
                    {formatNum(data.totalGizi?.lemak, 1)}
                  </td>
                  <td className="px-1.5 py-2 text-center border-r border-rose-200">
                    {formatNum(data.totalGizi?.karbohidrat, 1)}
                  </td>
                  <td className="px-1.5 py-2 text-center border-r-2 border-slate-300">
                    {formatNum(data.totalGizi?.serat, 1)}
                  </td>

                  {/* Total Belanja Bahan */}
                  <td colSpan={8} className="px-3 py-2 text-right uppercase tracking-wider text-sky-950 border-r border-sky-200">
                    Total Bahan:
                  </td>
                  <td className="px-2 py-2 text-right font-black text-emerald-900 border-r-2 border-slate-300 whitespace-nowrap bg-emerald-50">
                    {formatRp(data.totalBelanjaBahan)}
                  </td>

                  {/* Total Belanja Bumbu */}
                  <td colSpan={5} className="px-3 py-2 text-right uppercase tracking-wider text-amber-950 border-r border-amber-200">
                    Total Bumbu:
                  </td>
                  <td className="px-2 py-2 text-right font-black text-amber-900 whitespace-nowrap bg-amber-50">
                    {formatRp(data.totalBelanjaBumbu)}
                  </td>
                  {isEditing && <td></td>}
                </tr>

                {/* Biaya per Porsi */}
                <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                  <td colSpan={9} className="px-3 py-1.5 text-right font-bold text-slate-500 border-r-2 border-slate-300">
                    Biaya Bahan Pokok per Porsi:
                  </td>
                  <td colSpan={9} className="px-3 py-1.5 text-right font-black text-sky-900 border-r-2 border-slate-300">
                    {formatRp(data.hargaBahanPerPorsi || (data.pmCount ? data.totalBelanjaBahan / data.pmCount : 0))} / porsi
                  </td>
                  <td colSpan={isEditing ? 7 : 6} className="px-3 py-1.5 text-right font-black text-amber-900">
                    {formatRp(data.hargaBumbuPerPorsi || (data.pmCount ? data.totalBelanjaBumbu / data.pmCount : 0))} / porsi
                  </td>
                </tr>

                {/* AKG Rows (EPLKS: Energi, Protein, Lemak, Karbohidrat, Serat) */}
                {data.akgRows && data.akgRows.length > 0 ? (
                  data.akgRows.map((akgRow, akgIdx) => (
                    <tr key={akgIdx} className="bg-[#FEF3C7]/40 text-amber-950 border-b border-amber-200/80">
                      <td colSpan={3} className="px-3 py-1.5 text-left font-bold text-[10px] text-amber-900 border-r border-amber-200">
                        {akgRow.label}
                      </td>
                      <td className="px-1.5 py-1.5 text-center text-[10px] border-r border-amber-200 text-slate-400">-</td>
                      <td className="px-1.5 py-1.5 text-center font-black text-amber-900 border-r border-amber-200 bg-amber-100/50">
                        {formatNum(akgRow.energi, 1)}%
                      </td>
                      <td className="px-1.5 py-1.5 text-center font-bold text-amber-900 border-r border-amber-200">
                        {formatNum(akgRow.protein, 1)}%
                      </td>
                      <td className="px-1.5 py-1.5 text-center font-bold text-amber-900 border-r border-amber-200">
                        {formatNum(akgRow.lemak, 1)}%
                      </td>
                      <td className="px-1.5 py-1.5 text-center font-bold text-amber-900 border-r border-amber-200">
                        {formatNum(akgRow.karbohidrat, 1)}%
                      </td>
                      <td className="px-1.5 py-1.5 text-center font-bold text-amber-900 border-r-2 border-slate-300">
                        {formatNum(akgRow.serat, 1)}%
                      </td>
                      <td colSpan={isEditing ? 16 : 15} className="px-3 py-1.5 text-xs text-slate-500 font-medium italic">
                        Capaian Angka Kecukupan Gizi (AKG) — {akgRow.label.replace(/^%?\s*pemenuhan\s*/i, '')}
                      </td>
                    </tr>
                  ))
                ) : data.akgMetrics && Object.keys(data.akgMetrics).length > 0 ? (
                  Object.entries(data.akgMetrics).map(([akgKey, metric], akgIdx) => {
                    const cleanKey = akgKey.replace(/_/g, ' ').toUpperCase();
                    return (
                      <tr key={akgIdx} className="bg-[#FEF3C7]/40 text-amber-950 border-b border-amber-200/80">
                        <td colSpan={3} className="px-3 py-1.5 text-left font-bold text-[10px] text-amber-900 border-r border-amber-200">
                          % Pemenuhan Makan Siang ({cleanKey})
                        </td>
                        <td className="px-1.5 py-1.5 text-center text-[10px] border-r border-amber-200">-</td>
                        <td className="px-1.5 py-1.5 text-center font-black text-amber-800 border-r border-amber-200 bg-amber-100/50">
                          {formatNum(metric.percentMakanSiang, 1)}%
                        </td>
                        <td colSpan={4} className="px-2 py-1.5 text-center text-[10px] border-r border-amber-200 text-amber-800">
                          {metric.percentHarian > 0 ? `Harian: ${formatNum(metric.percentHarian, 1)}%` : 'Standar Kemkes'}
                        </td>
                        <td className="border-r-2 border-slate-300"></td>
                        <td colSpan={isEditing ? 16 : 15} className="px-3 py-1.5 text-xs text-slate-500 font-medium italic">
                          Capaian Angka Kecukupan Gizi (AKG) Makan Siang Sasaran {cleanKey}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr className="bg-amber-50/40 text-amber-950">
                    <td colSpan={3} className="px-3 py-1.5 text-left font-bold text-[10px] text-amber-900 border-r border-amber-200">
                      % Pemenuhan Makan Siang ({portionType.toUpperCase()})
                    </td>
                    <td className="px-1.5 py-1.5 text-center text-[10px] border-r border-amber-200">-</td>
                    <td className="px-1.5 py-1.5 text-center font-black text-amber-800 border-r border-amber-200 bg-amber-100/50">
                      100%
                    </td>
                    <td colSpan={4} className="px-2 py-1.5 text-center text-[10px] border-r border-amber-200 text-amber-800">
                      Sesuai Standar Gizi
                    </td>
                    <td className="border-r-2 border-slate-300"></td>
                    <td colSpan={isEditing ? 16 : 15} className="px-3 py-1.5 text-xs text-slate-500 font-medium italic">
                      Menu Bergizi Gratis Standar Koperasi Al Umanaa
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </div>

        {/* ─── DATA INPUT ADMIN MBG (TABEL PENERIMA MANFAAT LENGKAP: PORSI KECIL, BESAR, BALITA, BUMIL/BUSUI) ─── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden font-['Hanken_Grotesk']">
          <div className="px-4 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Building2 className="h-4 w-4 text-amber-400" />
                <h4 className="text-xs font-black uppercase tracking-wider">
                  Data Penerima Manfaat (Input Admin MBG)
                </h4>
                {(batchTanggal || curReport.tanggal) && (
                  <span className="px-2.5 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded-full text-[11px] font-black">
                    Batch: {batchTanggal || curReport.tanggal}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => navigate('/mbg/admin')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                title="Buka menu Administrasi MBG untuk mengedit data sekolah/posyandu"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Kelola di Admin MBG</span>
              </button>
              <span className="px-3 py-1 bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-xs">
                Total Alokasi: {grandTotalAllPorsi.toLocaleString('id-ID')} Porsi
              </span>
              <span className="px-2.5 py-1 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold">
                {detailedPmRows.length} Lembaga
              </span>
            </div>
          </div>

          {/* Search bar inside */}
          <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="relative max-w-sm w-full">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={pmSearchQuery}
                onChange={(e) => setPmSearchQuery(e.target.value)}
                placeholder="Cari nama sekolah / posyandu / kurir..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-400 font-medium"
              />
            </div>
            <span className="text-[11px] text-slate-500 font-bold hidden sm:inline">
              Menampilkan {filteredDetailedPmRows.length} dari {detailedPmRows.length} sasaran
            </span>
          </div>

          {/* Table Data Admin MBG */}
          {filteredDetailedPmRows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <School className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">
                Belum ada data input Admin MBG.
              </p>
              <p className="text-[11px] text-slate-400">
                Pastikan Admin MBG telah menginput data sekolah/posyandu di menu Admin MBG atau mengimport data penerima manfaat.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <th className="px-3 py-2.5 w-10 text-center">No</th>
                    <th className="px-4 py-2.5 min-w-[190px]">Nama Institusi / Lembaga</th>
                    <th className="px-3 py-2.5 min-w-[95px]">Kategori / Jenjang</th>
                    <th className={`px-3 py-2.5 text-center font-black transition-colors ${
                      portionType === 'kecil'
                        ? 'bg-amber-100/90 text-amber-950 border-b-2 border-amber-500'
                        : 'text-slate-800 bg-slate-50/80'
                    }`}>
                      Porsi Kecil
                    </th>
                    <th className={`px-3 py-2.5 text-center font-black transition-colors ${
                      portionType === 'besar'
                        ? 'bg-amber-100/90 text-amber-950 border-b-2 border-amber-500'
                        : 'text-slate-800 bg-slate-50/80'
                    }`}>
                      Porsi Besar
                    </th>
                    <th className={`px-3 py-2.5 text-center font-black transition-colors ${
                      portionType === 'balita'
                        ? 'bg-amber-100/90 text-amber-950 border-b-2 border-amber-500'
                        : 'text-slate-800 bg-slate-50/80'
                    }`}>
                      Porsi Balita
                    </th>
                    <th className={`px-3 py-2.5 text-center font-black transition-colors ${
                      portionType === 'bumil'
                        ? 'bg-amber-100/90 text-amber-950 border-b-2 border-amber-500'
                        : 'text-slate-800 bg-slate-50/80'
                    }`}>
                      Porsi Bumil / Busui
                    </th>
                    <th className="px-3 py-2.5 text-center font-black text-amber-950 bg-amber-50/80">
                      Total Porsi
                    </th>
                    <th className="px-3 py-2.5 text-center min-w-[140px]">Rincian / Catatan</th>
                    <th className="px-3 py-2.5 min-w-[120px]">Petugas Kurir</th>
                    <th className="px-3 py-2.5 text-center min-w-[110px]">Jadwal Pengantaran</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredDetailedPmRows.map((row, idx) => (
                    <tr
                      key={row.id || idx}
                      className={`hover:bg-amber-50/30 transition-colors ${
                        row.isLibur ? 'bg-red-50/50 opacity-60 line-through' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                      <td className="px-4 py-2 font-bold text-slate-900">
                        {row.institutionName}
                        {row.address && (
                          <span className="block text-[10px] text-slate-400 font-normal truncate max-w-xs">
                            {row.address}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 whitespace-nowrap">
                          {row.categoryLabel}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-center font-bold ${
                        portionType === 'kecil' ? 'bg-amber-50/80 font-black text-amber-900' : 'text-slate-700'
                      }`}>
                        {row.porsiKecil > 0 ? row.porsiKecil.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className={`px-3 py-2 text-center font-bold ${
                        portionType === 'besar' ? 'bg-amber-50/80 font-black text-amber-900' : 'text-slate-700'
                      }`}>
                        {row.porsiBesar > 0 ? row.porsiBesar.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className={`px-3 py-2 text-center font-bold ${
                        portionType === 'balita' ? 'bg-amber-50/80 font-black text-amber-900' : 'text-slate-700'
                      }`}>
                        {row.porsiBalita > 0 ? row.porsiBalita.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className={`px-3 py-2 text-center font-bold ${
                        portionType === 'bumil' ? 'bg-amber-50/80 font-black text-amber-900' : 'text-slate-700'
                      }`}>
                        {row.porsiBumilBusui > 0 ? row.porsiBumilBusui.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="px-3 py-2 text-center font-black text-amber-900 bg-amber-50/60 text-sm">
                        {row.totalJumlah.toLocaleString('id-ID')}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-500 text-[11px] whitespace-nowrap">
                        {row.rincian || '-'}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.petugasName && row.petugasName !== '-' && row.petugasName !== 'Belum Ditugaskan' ? (
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>{row.petugasName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600 font-bold whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>{row.jadwal}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        {row.isLibur ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700">
                            Libur
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                            Aktif
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-900">
                    <td colSpan={3} className="px-4 py-2.5 text-right uppercase tracking-wider">
                      Total ({filteredDetailedPmRows.length} Lembaga):
                    </td>
                    <td className={`px-3 py-2.5 text-center font-black ${
                      portionType === 'kecil' ? 'text-amber-300 bg-slate-800 text-sm' : 'text-slate-300 bg-slate-850'
                    }`}>
                      {sumPorsiKecil.toLocaleString('id-ID')}
                    </td>
                    <td className={`px-3 py-2.5 text-center font-black ${
                      portionType === 'besar' ? 'text-amber-300 bg-slate-800 text-sm' : 'text-slate-300 bg-slate-850'
                    }`}>
                      {sumPorsiBesar.toLocaleString('id-ID')}
                    </td>
                    <td className={`px-3 py-2.5 text-center font-black ${
                      portionType === 'balita' ? 'text-amber-300 bg-slate-800 text-sm' : 'text-slate-300 bg-slate-850'
                    }`}>
                      {sumPorsiBalita.toLocaleString('id-ID')}
                    </td>
                    <td className={`px-3 py-2.5 text-center font-black ${
                      portionType === 'bumil' ? 'text-amber-300 bg-slate-800 text-sm' : 'text-slate-300 bg-slate-850'
                    }`}>
                      {sumPorsiBumil.toLocaleString('id-ID')}
                    </td>
                    <td className="px-3 py-2.5 text-center text-amber-400 font-black text-sm bg-slate-950">
                      {grandTotalAllPorsi.toLocaleString('id-ID')}
                    </td>
                    <td colSpan={4} className="px-3 py-2.5 text-slate-400 font-medium italic">
                      Data otomatis terhubung dengan inputan Administrasi PM MBG.
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

  // ─── RENDERER: TABEL 5 — TABEL SUPPLIER ──────────────────────────────────────
  const renderSupplierSection = () => {
    const isEditing = editingTab === 'po';
    const poList = curReport.poRows || [];
    const grandTotal =
      poList.reduce((s, p) => s + (p.totalHarga || (p.jumlah > 0 && p.hargaSatuan ? p.jumlah * p.hargaSatuan : 0)), 0) ||
      curReport.totalPengeluaran ||
      0;

    // Grouping by supplier for recap cards underneath
    const supplierGroups = poList.reduce((acc, row) => {
      const sup = row.supplier || 'Koperasi Al Umanaa Sejahtera Mandiri';
      if (!acc[sup]) {
        acc[sup] = {
          items: [],
          totalSpend: 0,
        };
      }
      const itemTotal = row.totalHarga || (row.jumlah > 0 && row.hargaSatuan ? row.jumlah * row.hargaSatuan : 0);
      acc[sup].items.push(row);
      acc[sup].totalSpend += itemTotal;
      return acc;
    }, {} as Record<string, { items: typeof poList; totalSpend: number }>);

    return (
      <div className="space-y-6 animate-in fade-in duration-200 font-['Hanken_Grotesk']">
        {/* Banner Overview & Action Buttons */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-amber-500" />
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                Daftar Pesanan Bahan — Pesanan Bahan Makanan & Bumbu
              </h4>
              {isEditing && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-black bg-amber-500 text-white animate-pulse">
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Mode Edit Aktif</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Format persis sesuai form excel yang di-import: Supplier, List Pesanan Bahan, Jumlah, Item/Satuan, Total Harga.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-black">
              {poList.length} Item Bahan Dipesan
            </span>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-black">
              Total Belanja: {formatRp(grandTotal)}
            </span>

            {/* BUTTON 1-CLICK: SET ALL SUPPLIER TO KOPERASI AL UMANAA SEJAHTERA MANDIRI */}
            <button
              type="button"
              onClick={handleSetAllSuppliersToAlUmanaa}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-black shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
              title="Ubah semua supplier menjadi 'Koperasi Al Umanaa Sejahtera Mandiri'"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              <span>Set Semua: Koperasi Al Umanaa Sejahtera Mandiri</span>
            </button>

            {/* BUTTONS: EDIT SUPPLIER / SIMPAN / BATAL */}
            {!isEditing ? (
              <button
                type="button"
                onClick={() => handleStartEdit('po')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer"
                title="Edit data pesanan supplier langsung di tabel ini"
              >
                <Pencil className="h-3.5 w-3.5 text-amber-600" />
                <span>Edit Daftar Pesanan Bahan</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddSupplierRow}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer"
                  title="Tambah baris pesanan supplier baru"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Item</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Batal</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── TABEL SUPPLIER (SESUAI SCREENSHOT 5) ─── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-950"></span>
              <span>Daftar Pesanan Bahan ke Mitra Supplier (Hasil Excel Import)</span>
              {isEditing && (
                <span className="text-[10px] font-bold text-slate-900 normal-case bg-white/60 px-2 py-0.5 rounded-md">
                  (Klik pada sel tabel untuk mengubah nilai)
                </span>
              )}
            </div>
            <span className="text-[11px] font-black bg-slate-950 text-amber-300 px-2.5 py-0.5 rounded-full shadow-xs">
              {Object.keys(supplierGroups).length} Supplier Mitra
            </span>
          </div>

          {poList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 italic bg-slate-50">
              Tidak ada data pesanan supplier pada file Excel ini.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[950px]">
                <thead className="sticky top-0 z-10 shadow-xs">
                  <tr className="bg-[#FEF08A] text-[#713F12] font-black text-[11px] border-b-2 border-amber-300">
                    <th className="px-3 py-2 w-10 text-center">No</th>
                    <th className="px-4 py-2 border-r border-amber-300">Supplier</th>
                    <th className="px-4 py-2 border-r border-amber-300">List Pesanan Bahan</th>
                    <th className="px-3 py-2 text-center border-r border-amber-300 whitespace-nowrap">Jumlah</th>
                    <th className="px-3 py-2 text-center border-r border-amber-300 whitespace-nowrap">Item (Satuan)</th>
                    <th className="px-4 py-2 text-right whitespace-nowrap font-black">Total Harga</th>
                    {isEditing && (
                      <th className="px-2 py-2 text-center w-8 bg-red-100 text-red-900 whitespace-nowrap">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[11px]">
                  {poList.map((po, idx) => {
                    const rowTotal = po.totalHarga || (po.jumlah > 0 && po.hargaSatuan ? po.jumlah * po.hargaSatuan : 0);

                    if (!isEditing) {
                      return (
                        <tr key={idx} className="hover:bg-amber-50/40 transition-colors font-medium text-slate-800">
                          <td className="px-3 py-2 text-center text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-2 font-black text-slate-900 border-r border-slate-100">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 font-extrabold text-[11px] inline-flex items-center gap-1 shadow-2xs">
                                {po.supplier || 'Koperasi Al Umanaa Sejahtera Mandiri'}
                              </span>
                              {po.supplier !== 'Koperasi Al Umanaa Sejahtera Mandiri' && (
                                <button
                                  type="button"
                                  onClick={() => handleSetSingleSupplierToAlUmanaa(idx)}
                                  className="text-[9px] font-extrabold text-amber-700 hover:text-amber-950 bg-amber-100/90 hover:bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 cursor-pointer transition-colors shadow-2xs"
                                  title="Ubah supplier baris ini menjadi 'Koperasi Al Umanaa Sejahtera Mandiri'"
                                >
                                  ⚡ Set Al Umanaa
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleStartEdit('po')}
                                className="text-slate-400 hover:text-amber-600 p-0.5 rounded hover:bg-amber-50 transition-colors"
                                title="Edit baris supplier ini"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2 font-bold text-slate-900 border-r border-slate-100">
                            {po.item}
                          </td>
                          <td className="px-3 py-2 text-center font-black text-slate-900 bg-amber-50/30 border-r border-slate-100">
                            {po.jumlah > 0 ? Math.round(po.jumlah).toLocaleString('id-ID') : '-'}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-600 border-r border-slate-100">
                            {po.satuan || 'kg'}
                          </td>
                          <td className="px-4 py-2 text-right font-black text-emerald-900 whitespace-nowrap bg-emerald-50/20">
                            {rowTotal > 0 ? formatRp(rowTotal) : '-'}
                          </td>
                        </tr>
                      );
                    }

                    // Interactive Editable Supplier Row
                    return (
                      <tr key={idx} className="bg-amber-50/30 font-medium">
                        <td className="px-2 py-1.5 text-center text-slate-400">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={po.supplier || ''}
                              onChange={(e) => updateSupplierCell(idx, 'supplier', e.target.value)}
                              placeholder="Koperasi Al Umanaa Sejahtera Mandiri"
                              className="w-44 px-2 py-1 bg-white border border-amber-300 rounded text-[11px] font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            {po.supplier !== 'Koperasi Al Umanaa Sejahtera Mandiri' && (
                              <button
                                type="button"
                                onClick={() => updateSupplierCell(idx, 'supplier', 'Koperasi Al Umanaa Sejahtera Mandiri')}
                                className="block text-[9px] font-extrabold text-amber-700 hover:text-amber-950 bg-amber-100/90 hover:bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 cursor-pointer transition-colors"
                                title="Set jadi 'Koperasi Al Umanaa Sejahtera Mandiri'"
                              >
                                ⚡ Set Al Umanaa Sejahtera
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={po.item || ''}
                            onChange={(e) => updateSupplierCell(idx, 'item', e.target.value)}
                            placeholder="Nama Bahan"
                            className="w-48 px-1.5 py-1 bg-white border border-amber-300 rounded text-[11px] font-bold text-slate-900 focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            step="1"
                            value={po.jumlah ? Math.round(po.jumlah) : ''}
                            onChange={(e) => updateSupplierCell(idx, 'jumlah', Math.round(Number(e.target.value)))}
                            className="w-16 px-1 py-1 text-center bg-white border border-amber-300 rounded text-[11px] font-black focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="text"
                            value={po.satuan || 'kg'}
                            onChange={(e) => updateSupplierCell(idx, 'satuan', e.target.value)}
                            className="w-16 px-1 py-1 text-center bg-white border border-amber-300 rounded text-[11px] font-bold focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            value={rowTotal || ''}
                            onChange={(e) => updateSupplierCell(idx, 'totalHarga', Number(e.target.value))}
                            className="w-28 px-1.5 py-1 text-right bg-emerald-50 border border-emerald-300 rounded text-[11px] font-black text-emerald-900 focus:outline-none"
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteSupplierRow(idx)}
                            className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors cursor-pointer"
                            title="Hapus baris pesanan ini"
                          >
                            <Trash2 className="h-3.5 w-3.5 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-900">
                    <td colSpan={5} className="px-4 py-3 uppercase tracking-wider text-right">
                      Grand Total Belanja Supplier:
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-sm text-amber-300 bg-slate-800 whitespace-nowrap">
                      {formatRp(grandTotal)}
                    </td>
                    {isEditing && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ─── REKAP PEMBELANJAAN PER SUPPLIER (DI BAWAH TABEL) ─── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-amber-400" />
              <h4 className="text-xs font-black uppercase tracking-wider">
                Rekapitulasi Pembelanjaan per Supplier Mitra
              </h4>
            </div>
            <span className="text-slate-300 text-xs font-bold">
              {Object.keys(supplierGroups).length} Rekanan
            </span>
          </div>

          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(supplierGroups).map(([supName, group]) => (
              <div
                key={supName}
                className="bg-slate-50 hover:bg-amber-50/40 border border-slate-200 hover:border-amber-300 rounded-xl p-3.5 transition-all shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h5 className="text-xs font-black text-slate-900 truncate">
                    🏢 {supName}
                  </h5>
                  <span className="text-[10px] font-extrabold bg-white border border-slate-200 px-2 py-0.5 rounded-md text-slate-700 shrink-0">
                    {group.items.length} Bahan
                  </span>
                </div>

                <div className="text-sm font-black text-emerald-800 mb-2">
                  {formatRp(group.totalSpend)}
                </div>

                <div className="space-y-1 border-t border-slate-200/60 pt-2 text-[11px] text-slate-600 max-h-28 overflow-y-auto pr-1">
                  {group.items.slice(0, 5).map((it, itIdx) => (
                    <div key={itIdx} className="flex items-center justify-between text-[10px]">
                      <span className="truncate pr-2 font-medium">• {it.item}</span>
                      <span className="font-bold text-slate-800 shrink-0">
                        {it.jumlah > 0 ? `${formatNum(it.jumlah, 1)} ${it.satuan}` : ''}
                      </span>
                    </div>
                  ))}
                  {group.items.length > 5 && (
                    <span className="text-[9px] text-slate-400 italic block">
                      +{group.items.length - 5} item bahan lainnya...
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 font-['Hanken_Grotesk']">
      {/* Production Notes / Catatan Dapur Banner jika ada */}
      {curReport.productionNotes && curReport.productionNotes.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                  Catatan / Evaluasi Produksi Dapur (Dari Excel)
                </span>
              </div>
              <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4 font-medium">
                {curReport.productionNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ─── 5 NAVBAR TABS UTAMA (SESUAI REQUEST USER) ─── */}
      <div className="bg-slate-900 p-1.5 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {CORE_5_TABS.map((t) => {
            const Icon = t.icon;
            const isActive = currentTab === t.key;

            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer select-none ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 shadow-md font-black scale-[1.01]'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                    isActive ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {t.number}
                </span>
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-amber-400/80'}`} />
                <span>{t.label}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${
                    isActive ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {t.countBadge}
                </span>
              </button>
            );
          })}

          {/* Toggle auxiliary tabs jika dibutuhkan */}
          <button
            type="button"
            onClick={() => setShowAuxTabs(!showAuxTabs)}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Lihat modul pendukung lainnya (QC, Limbah, dll)"
          >
            <span>Lainnya</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAuxTabs ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Auxiliary Tabs Dropdown Bar */}
        {showAuxTabs && (
          <div className="flex items-center gap-1.5 pt-2 mt-2 border-t border-slate-800 overflow-x-auto scrollbar-none">
            {AUX_TABS.map((a) => {
              const Icon = a.icon;
              const isActive = currentTab === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setTab(a.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isActive ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-400 hover:text-white bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{a.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── KONTEN TIAP TAB ─── */}
      <div className="transition-all">
        {/* TAB 1: PORSI KECIL */}
        {currentTab === 'kecil' &&
          renderUnifiedExcelPortionTable(
            curReport.porsiKecil,
            'PORSI KECIL (PAUD / TK & SD 1-3)',
            'kecil'
          )}

        {/* TAB 2: PORSI BESAR */}
        {currentTab === 'besar' &&
          renderUnifiedExcelPortionTable(
            curReport.porsiBesar,
            'PORSI BESAR (SD KELAS 4-6, SMP, SMA)',
            'besar'
          )}

        {/* TAB 3: PORSI BALITA */}
        {currentTab === 'balita' &&
          renderUnifiedExcelPortionTable(
            curReport.porsiBalita,
            'PORSI BALITA (USIA 6-59 BULAN)',
            'balita'
          )}

        {/* TAB 4: PORSI BUMIL / BUSUI */}
        {currentTab === 'bumil' &&
          renderUnifiedExcelPortionTable(
            curReport.porsiBumilBusui,
            'PORSI IBU HAMIL & IBU MENYUSUI (BUMIL / BUSUI)',
            'bumil'
          )}

        {/* TAB 5: TABEL SUPPLIER */}
        {currentTab === 'po' && renderSupplierSection()}

        {/* AUX TAB: PAKET SEHAT 3B */}
        {currentTab === 'paket3b' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 font-['Hanken_Grotesk'] space-y-4">
            <h4 className="text-sm font-black text-slate-900">Paket Sehat 3B (Keringan Balita & Bumil)</h4>
            <p className="text-xs text-slate-500">Daftar item kudapan / suplemen makanan kering khusus sasaran 3B.</p>
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
                  {(curReport.paketSehat3b?.keringanItems || []).map((k, idx) => (
                    <tr key={idx} className="hover:bg-purple-50/40 transition-colors font-medium">
                      <td className="px-3 py-2 text-center text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{k.item}</td>
                      <td className="px-2 py-2 text-center">{formatNum(k.qtyPcs, 0)}</td>
                      <td className="px-2 py-2 text-center font-bold">{formatNum(k.qty, 1)}</td>
                      <td className="px-2 py-2 text-center">{k.satuan || 'pcs'}</td>
                      <td className="px-3 py-2 text-right">{k.hargaSatuan ? formatRp(k.hargaSatuan) : '-'}</td>
                      <td className="px-3 py-2 text-right font-bold text-purple-900">{k.totalHarga ? formatRp(k.totalHarga) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AUX TAB: QC */}
        {currentTab === 'qc' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 font-['Hanken_Grotesk'] space-y-4">
            <h4 className="text-sm font-black text-slate-900">Formulir Pemeriksaan Mutu Bahan Baku (QC Inspection)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <th className="px-3 py-2 w-10 text-center">No</th>
                    <th className="px-3 py-2">Jenis Bahan</th>
                    <th className="px-2 py-2 text-center">Banyaknya</th>
                    <th className="px-2 py-2 text-center">Satuan</th>
                    <th className="px-2 py-2 text-center">Kesesuaian</th>
                    <th className="px-2 py-2 text-center">Kondisi Fisik</th>
                    <th className="px-3 py-2">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(curReport.inspectionForm?.rows || []).map((qc, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-center text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{qc.jenisBahan}</td>
                      <td className="px-2 py-2 text-center">{formatNum(qc.banyaknya, 1)}</td>
                      <td className="px-2 py-2 text-center">{qc.satuan}</td>
                      <td className="px-2 py-2 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {qc.isSesuai ? 'Sesuai' : 'Tidak Sesuai'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {qc.isBaik ? 'Baik / Segar' : 'Rusak'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{qc.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AUX TAB: REKAP LIMBAH */}
        {currentTab === 'waste' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 font-['Hanken_Grotesk'] space-y-4">
            <h4 className="text-sm font-black text-slate-900">Rekapitulasi Pemantauan Limbah Sisa Makanan (Food Waste)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <th className="px-3 py-2 w-10 text-center">No</th>
                    <th className="px-3 py-2">Nama Menu / Makanan</th>
                    <th className="px-2 py-2 text-center">Kuantitas Limbah</th>
                    <th className="px-2 py-2 text-center">Satuan</th>
                    <th className="px-3 py-2">Dokumentasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(curReport.wasteLogs || []).map((w, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-center text-slate-400">{w.no || idx + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{w.namaMakanan}</td>
                      <td className="px-2 py-2 text-center font-bold">{formatNum(w.kuantitas, 2)}</td>
                      <td className="px-2 py-2 text-center">{w.satuan || 'kg'}</td>
                      <td className="px-3 py-2 text-slate-500">{w.dokumentasi || 'Habis Terkonsumsi'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AUX TAB: DISTRIBUSI SEKOLAH */}
        {currentTab === 'sekolah' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 font-['Hanken_Grotesk'] space-y-4">
            <h4 className="text-sm font-black text-slate-900">Daftar Distribusi Sekolah & Sasaran Penerima Manfaat</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <th className="px-3 py-2 w-10 text-center">No</th>
                    <th className="px-4 py-2">Nama Sekolah / Sasaran</th>
                    <th className="px-3 py-2 text-center">Porsi Murid / Balita</th>
                    <th className="px-3 py-2 text-center">Porsi Guru / Petugas</th>
                    <th className="px-3 py-2 text-right font-black">Total Porsi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(curReport.sekolahList || []).map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-center text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-2 font-bold text-slate-900">{s.nama}</td>
                      <td className="px-3 py-2 text-center font-bold text-emerald-800">{s.murid ? s.murid.toLocaleString('id-ID') : '-'}</td>
                      <td className="px-3 py-2 text-center">{s.guru ? s.guru.toLocaleString('id-ID') : '-'}</td>
                      <td className="px-3 py-2 text-right font-black text-slate-900">{(s.murid + s.guru).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
