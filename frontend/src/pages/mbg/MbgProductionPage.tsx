// ============================================================================
// MBG Production Page — Kadar Gizi + Export PDF #1
// ============================================================================

import { useEffect, useMemo, useState, Fragment } from 'react';
import {
  Plus, Trash2, FileDown, Calendar, Loader2, CheckCircle2, Search, X, Folder, Send,
  ClipboardList, FileText, FolderOpen, FileUp, Save, Sparkles, FileSpreadsheet, ChevronDown, ChevronUp,
  AlertTriangle, Truck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import * as XLSX from 'xlsx';
import type { MbgPmBatch, MbgPmEntry, MbgNutritionEntry, MbgDayMenu, MbgProductionDailyReport } from '@/types/mbg';
import { WeeklyScheduleModal } from '@/components/mbg/WeeklyScheduleModal';
import { DailyReportExcelSections, type MbgDailyReportSubTab } from '@/components/mbg/DailyReportExcelSections';
import {
  subscribeBatches, subscribeEntries, subscribeAllEntries, subscribeWeeklySchedule,
  saveWeeklySchedule, getMenuForDate, deleteBatch, createBatch,
  addMultipleEntries, recalculateBatchTotals, clearBatchEntries,
  type MbgPortionClassification
} from '@/services/mbgAdminService';
import {
  subscribeNutrition, addNutritionEntry, updateNutritionEntry, deleteNutritionEntry,
  subscribeCustomTkpiEntries, addCustomTkpiEntry, updateCustomTkpiEntry, deleteCustomTkpiEntry,
  subscribeCustomRecipes, addCustomRecipe, updateCustomRecipe, deleteCustomRecipe,
  subscribeRecipeAdjustments, saveRecipeAdjustment, deleteRecipeAdjustment,
  subscribeDailyReport, saveDailyReport, deleteDailyReport, subscribeAllDailyReports,
} from '@/services/mbgProductionService';
import { export8PageDailyReportPdf } from '@/utils/dailyReportPdfExporter';
import { exportProductionDocx } from '@/utils/mbgProductionDocxGenerator';
import { parseProductionSheetRows, parsePenerimaManfaatSheet } from '@/utils/productionSheetParser';
import { updateBatchStatus, updateBatch } from '@/services/mbgAdminService';
import {
  MBG_BATCH_STATUS_CONFIG,
  NUTRIENTS_LIST,
  NUTRITIONAL_MAP,
  MBG_INFORMASI_BAHAN_PANGAN,
  MBG_KATEGORI_BAHAN_PANGAN,
  getBahanPanganInfo,
  MBG_AKG_REFERENCE,
  DEFAULT_WEEKLY_SCHEDULE,
} from '@/constants/mbgConstants';

export interface TkpiDatabaseItem {
  nama: string;
  kode?: string;
  sumber?: string;
  berat?: number;
  air?: number;
  energi?: number;
  protein?: number;
  lemak?: number;
  kh?: number;
  serat?: number;
  abu?: number;
  kalsium?: number;
  fosfor?: number;
  besi?: number;
  natrium?: number;
  kalium?: number;
  tembaga?: number;
  seng?: number;
  retinol?: number;
  bkar?: number;
  kartotal?: number;
  thiamin?: number;
  riboflavin?: number;
  niasin?: number;
  vit_c?: number;
  id?: string;
  [key: string]: unknown;
}

interface StandarPorsi {
  kode: number;
  jenisMenu: string;
  namaMenu: string;
  bahanUtama: string;
  porsiKecil: number;
  porsiBesar: number;
}

interface StandarResep {
  namaMenu: string;
  jenisMenu: string;
  mainBahan: string;
  baseQty: number;
  satuanMainBahan: string;
  porsiKecil?: number;
  porsiBesar?: number;
  ingredients: {
    bahan: string;
    kebutuhan: number;
    satuan: string;
    resepPer: string | number;
  }[];
}

interface RecipeAdjustment {
  id?: string;
  batchId: string;
  name: string;
  amount: number;
  satuan: string;
  isCustom: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning' | 'success';
  icon?: 'send' | 'delete' | 'warning' | 'check';
  onConfirm: () => Promise<void> | void;
}

const standarPorsi: StandarPorsi[] = [];
const standarResep: StandarResep[] = [];




export function MbgProductionPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('batchId') || null;
  });

  const handleSelectBatch = (batchId: string | null) => {
    setSelectedBatchId(batchId);
    try {
      const url = new URL(window.location.href);
      if (batchId) {
        url.searchParams.set('batchId', batchId);
      } else {
        url.searchParams.delete('batchId');
      }
      window.history.replaceState(null, '', url.toString());
    } catch {
      // ignore
    }
  };
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [nutritionData, setNutritionData] = useState<MbgNutritionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pm-data' | 'nutrition' | 'archive'>('pm-data');
  const [dailyReportSubTab, setDailyReportSubTab] = useState<MbgDailyReportSubTab>('kecil');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [confirmModalLoading, setConfirmModalLoading] = useState(false);

  // Google Sheets & Excel Import States
  const [showSheetsImportModal, setShowSheetsImportModal] = useState(false);
  const [sheetsUrlInput, setSheetsUrlInput] = useState('https://docs.google.com/spreadsheets/d/1uvsEHj7p11l0tZZqWB_t9khlzUpNZM5okGyVswH4_8U/edit?usp=sharing');
  const [importingSheets, setImportingSheets] = useState(false);
  const [availableSheetNames, setAvailableSheetNames] = useState<string[]>([]);
  const [sheetWorkbook, setSheetWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [importTargetOption, setImportTargetOption] = useState<'current_batch' | 'sheet_date'>('current_batch');
  const [dailyReport, setDailyReport] = useState<MbgProductionDailyReport | null>(null);
  const [allDailyReports, setAllDailyReports] = useState<MbgProductionDailyReport[]>([]);
  const [batchExcelFilter, setBatchExcelFilter] = useState<'all' | 'unimported' | 'imported'>('all');
  const [showImportedDetails, setShowImportedDetails] = useState(true);
  const [showPmSummaryInGizi, setShowPmSummaryInGizi] = useState(true);
  const [isBatchDropdownOpen, setIsBatchDropdownOpen] = useState(false);
  const [batchSearchQuery, setBatchSearchQuery] = useState('');
  const [showRecipeSummary, setShowRecipeSummary] = useState(true);
  const [showAkgMatrix, setShowAkgMatrix] = useState(true);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
  const [showRecipeBook, setShowRecipeBook] = useState(false);
  const [recipeBookQuery, setRecipeBookQuery] = useState('');
  const [recipeModalTab, setRecipeModalTab] = useState<'resep' | 'bahanPangan'>('resep');
  const [bahanPanganQuery, setBahanPanganQuery] = useState('');
  const [selectedBahanCategory, setSelectedBahanCategory] = useState<'all' | 'utama' | 'pelengkap' | 'dasar'>('all');
  const [expandedBahan, setExpandedBahan] = useState<string | null>(null);
  const [selectedRecipeItem, setSelectedRecipeItem] = useState<StandarResep | null>(null);
  const [customRecipes, setCustomRecipes] = useState<StandarResep[]>([]);
  const [isAddingRecipe, setIsAddingRecipe] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeCategory, setNewRecipeCategory] = useState('Lauk Hewani (Ayam)');
  const [newRecipeMainBahan, setNewRecipeMainBahan] = useState('');
  const [newRecipeBaseQty, setNewRecipeBaseQty] = useState<number>(1000);
  const [newRecipeSatuanMainBahan, setNewRecipeSatuanMainBahan] = useState('g');
  const [newRecipePorsiKecil, setNewRecipePorsiKecil] = useState<number>(50);
  const [newRecipePorsiBesar, setNewRecipePorsiBesar] = useState<number>(60);
  const [newRecipeIngredients, setNewRecipeIngredients] = useState<{ bahan: string; kebutuhan: number; satuan: string; resepPer: string }[]>([]);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  // Recipe requirements adjustments
  const [recipeAdjustments, setRecipeAdjustments] = useState<RecipeAdjustment[]>([]);
  const [editingIngredientName, setEditingIngredientName] = useState<string | null>(null);
  const [editingIngredientAmount, setEditingIngredientAmount] = useState<string>('');
  const [editingIngredientSatuan, setEditingIngredientSatuan] = useState<string>('g');
  const [isAddingCustomIngredient, setIsAddingCustomIngredient] = useState(false);
  const [newCustomIngredientName, setNewCustomIngredientName] = useState('');
  const [newCustomIngredientAmount, setNewCustomIngredientAmount] = useState<number>(0);
  const [newCustomIngredientSatuan, setNewCustomIngredientSatuan] = useState('g');
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);

  // Archive states
  const [allEntries, setAllEntries] = useState<MbgPmEntry[]>([]);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [archiveSearchDate, setArchiveSearchDate] = useState('');
  const [loadingArchive, setLoadingArchive] = useState(true);

  // Autocomplete states
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [showDbLookup, setShowDbLookup] = useState(false);
  const [dbSearchQuery, setDbSearchQuery] = useState('');
  const [selectedDbItem, setSelectedDbItem] = useState<TkpiDatabaseItem | null>(null);
  const [dbPage, setDbPage] = useState(1);

  const [customTkpiEntries, setCustomTkpiEntries] = useState<TkpiDatabaseItem[]>([]);
  const [isAddingDbItem, setIsAddingDbItem] = useState(false);
  const [newDbItem, setNewDbItem] = useState({
    nama: '',
    kode: '',
    sumber: 'Input Manual',
    berat: 100,
    air: 0,
    energi: 0,
    protein: 0,
    lemak: 0,
    kh: 0,
    serat: 0,
    abu: 0,
    kalsium: 0,
    fosfor: 0,
    besi: 0,
    natrium: 0,
    kalium: 0,
    tembaga: 0,
    seng: 0,
    retinol: 0,
    bkar: 0,
    kartotal: 0,
    thiamin: 0,
    riboflavin: 0,
    niasin: 0,
    vit_c: 0,
  });
  const [isSavingDbItem, setIsSavingDbItem] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingDbItemId, setEditingDbItemId] = useState<string | null>(null);
  const [weeklySchedule, setWeeklySchedule] = useState<MbgDayMenu[]>(DEFAULT_WEEKLY_SCHEDULE);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const [selectedPortionClassification, setSelectedPortionClassification] = useState<MbgPortionClassification>('porsi_besar');

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeWeeklySchedule(setWeeklySchedule, selectedPortionClassification);
    return unsub;
  }, [user, selectedPortionClassification]);

  const handleSaveWeeklySchedule = async (updatedDays: MbgDayMenu[], portion?: MbgPortionClassification) => {
    if (!user) return;
    const targetPortion = portion || selectedPortionClassification;
    try {
      await saveWeeklySchedule(updatedDays, user.uid, targetPortion);
      setWeeklySchedule(updatedDays);
      showToast({ message: `Master Jadwal Menu Mingguan (${targetPortion}) berhasil disimpan!`, variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal menyimpan jadwal menu mingguan', variant: 'error' });
    }
  };

  // Subscribe custom TKPI entries
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeCustomTkpiEntries(
      (entries) => {
        setCustomTkpiEntries(entries as unknown as TkpiDatabaseItem[]);
      },
      (err) => {
        console.warn('Error loading custom TKPI entries:', err);
      }
    );
    return unsub;
  }, [user]);

  // Subscribe custom recipes
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeCustomRecipes(
      (recipes) => {
        setCustomRecipes(recipes as unknown as StandarResep[]);
      },
      (err) => {
        console.warn('Error loading custom recipes:', err);
      }
    );
    return unsub;
  }, [user]);

  const combinedTkpiDatabase = useMemo(() => {
    return customTkpiEntries;
  }, [customTkpiEntries]);

  // Subscribe batches (Real batches from Firestore, strictly NO auto-created dummy batches)
  useEffect(() => {
    if (!user) return;

    // Safety fallback: maximum 2.5s loading state so the spinner never spins forever
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    const unsub = subscribeBatches(
      (data) => {
        clearTimeout(timer);
        // Hanya batch yang sudah difinalisasi (status !== 'DRAFT') yang masuk ke Produksi MBG
        const finalizedBatches = data.filter((b) => b.status !== 'DRAFT');
        setBatches(finalizedBatches);

        if (finalizedBatches.length > 0) {
          setSelectedBatchId((curr) => {
            if (curr && finalizedBatches.some((b) => b.id === curr)) return curr;
            const todayStr = new Date().toISOString().split('T')[0];
            const todayBatch = finalizedBatches.find((b) => b.tanggal === todayStr);
            return todayBatch ? todayBatch.id : finalizedBatches[0].id;
          });
        } else {
          setSelectedBatchId(null);
        }
        setLoading(false);
      },
      (err) => {
        clearTimeout(timer);
        console.error('Error subscribing to batches:', err);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [user]);

  // Subscribe to all entries globally ONLY when archive tab is active
  useEffect(() => {
    if (!user || activeTab !== 'archive') {
      setLoadingArchive(false);
      return;
    }
    setLoadingArchive(true);
    const timer = setTimeout(() => {
      setLoadingArchive(false);
    }, 3000);

    const unsub = subscribeAllEntries(
      (e) => {
        clearTimeout(timer);
        setAllEntries(e);
        setLoadingArchive(false);
      },
      (err) => {
        clearTimeout(timer);
        console.error('Error loading all entries:', err);
        setLoadingArchive(false);
      }
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [user, activeTab]);

  // Subscribe entries + nutrition + recipe adjustments + daily report for selected batch
  useEffect(() => {
    if (!selectedBatchId || !user) return;
    const unsub1 = subscribeEntries(selectedBatchId, setEntries);
    const unsub2 = subscribeNutrition(selectedBatchId, setNutritionData);
    const unsub3 = subscribeRecipeAdjustments(selectedBatchId, (list) => {
      setRecipeAdjustments(list as unknown as RecipeAdjustment[]);
    }, (err) => {
      console.error('Error loading recipe adjustments:', err);
    });
    const unsub4 = subscribeDailyReport(selectedBatchId, (report) => {
      setDailyReport(report);
    }, (err) => {
      console.error('Error loading daily report:', err);
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [selectedBatchId, user]);

  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId);
  }, [batches, selectedBatchId]);

  const archivedBatches = useMemo(() => {
    return batches.filter((b) => b.status !== 'PM_SUBMITTED');
  }, [batches]);

  const visibleBatchesInBar = useMemo(() => {
    // Show all batches so user can switch to any batch
    return batches;
  }, [batches]);

  // Auto-select batch if none selected: check query param first, then today, then latest
  useEffect(() => {
    if (batches.length === 0) {
      setSelectedBatchId(null);
      return;
    }

    // If current selectedBatchId is already valid, do not change it
    if (selectedBatchId && batches.some((b) => b.id === selectedBatchId)) {
      return;
    }

    // Check URL query param
    const urlParams = new URLSearchParams(window.location.search);
    const urlBatchId = urlParams.get('batchId');
    const urlDate = urlParams.get('date');

    if (urlBatchId && batches.some((b) => b.id === urlBatchId)) {
      handleSelectBatch(urlBatchId);
      return;
    }

    if (urlDate) {
      const matched = batches.find((b) => b.tanggal === urlDate);
      if (matched) {
        handleSelectBatch(matched.id);
        return;
      }
    }

    // Fallback: pick today's batch or latest batch
    const todayStr = new Date().toISOString().split('T')[0];
    const todayBatch = batches.find((b) => b.tanggal === todayStr);
    handleSelectBatch(todayBatch ? todayBatch.id : batches[0].id);
  }, [batches, selectedBatchId]);

  // Subscribe all daily reports to track which batches have saved reports
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeAllDailyReports((list) => {
      setAllDailyReports(list);
    }, (err) => {
      console.error('Error loading all daily reports:', err);
    });
    return unsub;
  }, [user]);

  const savedReportBatchIds = useMemo(() => {
    const set = new Set<string>();
    allDailyReports.forEach((r) => {
      if (r.batchId) set.add(r.batchId);
    });
    return set;
  }, [allDailyReports]);

  const batchCounts = useMemo(() => {
    const total = batches.length;
    const imported = batches.filter((b) => savedReportBatchIds.has(b.id)).length;
    const unimported = total - imported;
    return { total, imported, unimported };
  }, [batches, savedReportBatchIds]);

  const filteredBatchesForSelect = useMemo(() => {
    const query = batchSearchQuery.toLowerCase().trim();
    let list = visibleBatchesInBar;

    if (batchExcelFilter === 'imported') {
      list = list.filter((b) => savedReportBatchIds.has(b.id));
    } else if (batchExcelFilter === 'unimported') {
      list = list.filter((b) => !savedReportBatchIds.has(b.id));
    }

    if (!query) return list;
    return list.filter((b) => {
      const cfg = MBG_BATCH_STATUS_CONFIG[b.status] || MBG_BATCH_STATUS_CONFIG.DRAFT;
      const isImported = savedReportBatchIds.has(b.id);
      const importLabel = isImported ? 'sudah import' : 'belum import';
      return (
        b.tanggal.toLowerCase().includes(query) ||
        cfg.label.toLowerCase().includes(query) ||
        importLabel.includes(query)
      );
    });
  }, [batchSearchQuery, visibleBatchesInBar, batchExcelFilter, savedReportBatchIds]);

  const filteredArchivedBatches = useMemo(() => {
    return archivedBatches.filter((b) => {
      // Date filter
      if (archiveSearchDate && b.tanggal !== archiveSearchDate) return false;

      // School/Posyandu name filter
      if (archiveSearchQuery) {
        const q = archiveSearchQuery.toLowerCase();
        const batchEntries = allEntries.filter((e) => e.batchId === b.id);
        const hasMatchingEntry = batchEntries.some(
          (e) =>
            e.institutionName.toLowerCase().includes(q) ||
            (e.assignedPetugasName || '').toLowerCase().includes(q)
        );
        if (!hasMatchingEntry) return false;
      }

      return true;
    });
  }, [archivedBatches, allEntries, archiveSearchQuery, archiveSearchDate]);



  // Group PM entries by petugas (with deduplication by institutionName)
  const groupedEntries = useMemo(() => {
    const groups: Record<string, MbgPmEntry[]> = {};
    const seenNames = new Set<string>();

    entries.forEach((e) => {
      const normName = (e.institutionName || '').toLowerCase().trim();
      if (normName) {
        if (seenNames.has(normName)) return;
        seenNames.add(normName);
      }
      const key = e.assignedPetugasName?.trim() || '';
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return groups;
  }, [entries]);

  const akgDemographicSummary = useMemo(() => {
    const counts: Record<string, number> = {
      'SISWA TK/PAUD': 0,
      'SISWA SD/MI KELAS 1-3': 0,
      'SISWA SD/MI KELAS 4-6': 0,
      'SISWA SMP/MTS': 0,
      'SISWA SMA/MA/SMK': 0,
      'IBU HAMIL': 0,
      'IBU MENYUSUI': 0,
      'BALITA': 0,
    };

    entries.forEach((e) => {
      if (e.isSekolahLibur) return;

      if (e.institutionType === 'sekolah') {
        if (e.classesBreakdown && e.classesBreakdown.length > 0) {
          e.classesBreakdown.forEach((c) => {
            const qty = c.jumlah || 0;
            if (qty <= 0) return;

            const nameLower = (c.className + ' ' + (e.institutionName || '')).toLowerCase();
            const schoolLevel = e.schoolLevel as string | undefined;

            if (
              schoolLevel === 'sma' ||
              nameLower.includes('sma') ||
              nameLower.includes('smk') ||
              nameLower.includes('ma ') ||
              nameLower.includes(' ma') ||
              /\b(10|11|12)\b/.test(c.className)
            ) {
              counts['SISWA SMA/MA/SMK'] += qty;
            } else if (
              schoolLevel === 'smp' ||
              nameLower.includes('smp') ||
              nameLower.includes('mts') ||
              /\b(7|8|9)\b/.test(c.className)
            ) {
              counts['SISWA SMP/MTS'] += qty;
            } else if (
              schoolLevel === 'tk_paud' ||
              nameLower.includes('tk') ||
              nameLower.includes('paud') ||
              nameLower.includes('sps')
            ) {
              counts['SISWA TK/PAUD'] += qty;
            } else if (
              schoolLevel === 'sd' ||
              nameLower.includes('sd') ||
              nameLower.includes('mi')
            ) {
              if (c.portionType === 'kecil' || /\b(1|2|3)\b/.test(c.className)) {
                counts['SISWA SD/MI KELAS 1-3'] += qty;
              } else {
                counts['SISWA SD/MI KELAS 4-6'] += qty;
              }
            } else {
              // General Fallback based on portionType
              if (c.portionType === 'kecil') {
                counts['SISWA SD/MI KELAS 1-3'] += qty;
              } else {
                counts['SISWA SMA/MA/SMK'] += qty;
              }
            }
          });
        } else {
          const qty = e.jumlah || 0;
          if (qty <= 0) return;

          if (e.schoolLevel === 'tk_paud') {
            counts['SISWA TK/PAUD'] += qty;
          } else if (e.schoolLevel === 'sd') {
            counts['SISWA SD/MI KELAS 1-3'] += e.qtPorsiKecil || Math.ceil(qty / 2);
            counts['SISWA SD/MI KELAS 4-6'] += e.qtPorsiBesar || Math.floor(qty / 2);
          } else {
            counts['SISWA SMA/MA/SMK'] += qty;
          }
        }
      } else {
        counts['BALITA'] += e.qtPorsiBalita || e.qtSiswaBalita || 0;
        counts['IBU HAMIL'] += e.qtBumil || 0;
        counts['IBU MENYUSUI'] += e.qtBusui || 0;
        if (!e.qtBumil && !e.qtBusui && e.qtBumilBusui) {
          counts['IBU HAMIL'] += Math.ceil(e.qtBumilBusui / 2);
          counts['IBU MENYUSUI'] += Math.floor(e.qtBumilBusui / 2);
        }
      }
    });

    return counts;
  }, [entries]);

  const combinedRecipes = useMemo(() => {
    const map = new Map<string, StandarResep>();
    standarResep.forEach((item) => {
      map.set(item.namaMenu.toLowerCase().trim(), item);
    });
    customRecipes.forEach((item) => {
      map.set(item.namaMenu.toLowerCase().trim(), item);
    });
    return Array.from(map.values());
  }, [customRecipes]);

  const combinedPorsi = useMemo(() => {
    const list = [...standarPorsi];
    customRecipes.forEach((cr) => {
      if (!list.some((p) => p.namaMenu.toLowerCase().trim() === cr.namaMenu.toLowerCase().trim())) {
        list.push({
          kode: Math.floor(Math.random() * 9000) + 1000,
          jenisMenu: cr.jenisMenu,
          namaMenu: cr.namaMenu,
          bahanUtama: cr.mainBahan,
          porsiKecil: cr.porsiKecil || 0,
          porsiBesar: cr.porsiBesar || 0,
        });
      }
    });
    return list;
  }, [customRecipes]);

  const recipeRequirements = useMemo(() => {
    // 1. Calculate main ingredient weight totals for each active menu item in the batch
    const menuMainTotals: Record<string, { totalQty: number; countKecil: number; countBesar: number }> = {};

    const fallbackBatchMenu = selectedBatch?.tanggal
      ? getMenuForDate(selectedBatch.tanggal, weeklySchedule).menuItems
      : [];

    entries.forEach((e) => {
      if (e.isSekolahLibur) return;

      const menuList = (e.menuItems && e.menuItems.length > 0) ? e.menuItems : fallbackBatchMenu;
      const qtyKecil = e.qtSiswaBalita || 0;
      const qtyBesar = (e.qtBumilBusui || 0) + (e.qtGuruKader || 0);
      const entryPorsiTotal = e.jumlah || (qtyKecil + qtyBesar) || 1;

      menuList.forEach((menuName) => {
        // Flexible porsi matching
        const normName = menuName.trim();
        const normLower = normName.toLowerCase();
        let porsiCfg = combinedPorsi.find(
          (p) => p.namaMenu.toLowerCase().trim() === normLower
        );
        if (!porsiCfg) {
          porsiCfg = combinedPorsi.find((p) => {
            const pName = p.namaMenu.toLowerCase().trim();
            return pName.includes(normLower) || normLower.includes(pName);
          });
        }
        if (!porsiCfg) {
          const words = normLower.split(/\s+/).filter((w) => w.length > 2);
          if (words.length > 0) {
            porsiCfg = combinedPorsi.find((p) => {
              const pName = p.namaMenu.toLowerCase().trim();
              return words.some((w) => pName.includes(w));
            });
          }
        }

        const smallWeight = (porsiCfg && porsiCfg.porsiKecil > 0) ? porsiCfg.porsiKecil : 100;
        const largeWeight = (porsiCfg && porsiCfg.porsiBesar > 0) ? porsiCfg.porsiBesar : 150;
        let weight = (qtyKecil * smallWeight) + (qtyBesar * largeWeight);
        if (weight === 0) {
          weight = entryPorsiTotal * 100; // fallback 100g per portion
        }

        if (!menuMainTotals[normName]) {
          menuMainTotals[normName] = { totalQty: 0, countKecil: 0, countBesar: 0 };
        }
        menuMainTotals[normName].totalQty += weight;
        menuMainTotals[normName].countKecil += qtyKecil || entryPorsiTotal;
        menuMainTotals[normName].countBesar += qtyBesar;
      });
    });

    // 2. Scale ingredients for each menu based on standard recipes
    const rawIngredients: Record<
      string,
      {
        name: string;
        amount: number;
        satuan: string;
        sourceMenus: string[];
        menuBreakdown: { menuName: string; amount: number; satuan: string }[];
      }
    > = {};

    Object.entries(menuMainTotals).forEach(([menuName, totals]) => {
      // Find standard recipe with smart flexible matching
      const normMenu = menuName.toLowerCase().trim();
      let recipe = combinedRecipes.find(
        (r) => r.namaMenu.toLowerCase().trim() === normMenu
      );
      if (!recipe) {
        recipe = combinedRecipes.find((r) => {
          const rName = r.namaMenu.toLowerCase().trim();
          return rName.includes(normMenu) || normMenu.includes(rName);
        });
      }
      if (!recipe) {
        const words = normMenu.split(/\s+/).filter((w) => w.length > 2);
        if (words.length > 0) {
          recipe = combinedRecipes.find((r) => {
            const rName = r.namaMenu.toLowerCase().trim();
            return words.some((w) => rName.includes(w));
          });
        }
      }

      if (recipe && recipe.baseQty > 0) {
        // Scaling ratio: required main ingredient weight / base weight in recipe
        const ratio = totals.totalQty / recipe.baseQty;

        recipe.ingredients.forEach((ing) => {
          const key = ing.bahan.toLowerCase().trim();
          if (!rawIngredients[key]) {
            rawIngredients[key] = {
              name: ing.bahan,
              amount: 0,
              satuan: ing.satuan || 'g',
              sourceMenus: [],
              menuBreakdown: [],
            };
          }
          const baseKebutuhan = ing.kebutuhan > 0 ? ing.kebutuhan : (recipe.baseQty / 100);
          const ingAmount = baseKebutuhan * ratio;
          rawIngredients[key].amount += ingAmount;
          if (!rawIngredients[key].sourceMenus.includes(menuName)) {
            rawIngredients[key].sourceMenus.push(menuName);
          }

          // Track breakdown
          const existingBreakdown = rawIngredients[key].menuBreakdown.find((b) => b.menuName === menuName);
          if (existingBreakdown) {
            existingBreakdown.amount += ingAmount;
          } else {
            rawIngredients[key].menuBreakdown.push({
              menuName,
              amount: ingAmount,
              satuan: ing.satuan || 'g',
            });
          }
        });
      } else {
        // Fallback for items with no recipe (e.g. Buah, Susu, or custom items)
        const porsiCfg = combinedPorsi.find(
          (p) => p.namaMenu.toLowerCase().trim() === menuName.toLowerCase().trim()
        );
        const name = porsiCfg ? porsiCfg.bahanUtama : menuName;
        const key = name.toLowerCase().trim();
        const totalPortions = totals.countKecil + totals.countBesar || 1;
        const fallbackSatuan = porsiCfg && porsiCfg.porsiKecil === 1 ? 'pcs' : 'g';

        if (!rawIngredients[key]) {
          rawIngredients[key] = {
            name,
            amount: 0,
            satuan: fallbackSatuan,
            sourceMenus: [],
            menuBreakdown: [],
          };
        }
        const fallbackAmount = totals.totalQty > 0 ? totals.totalQty : (totalPortions * 100);
        rawIngredients[key].amount += fallbackAmount;
        if (!rawIngredients[key].sourceMenus.includes(menuName)) {
          rawIngredients[key].sourceMenus.push(menuName);
        }

        // Track breakdown
        const existingBreakdown = rawIngredients[key].menuBreakdown.find((b) => b.menuName === menuName);
        if (existingBreakdown) {
          existingBreakdown.amount += fallbackAmount;
        } else {
          rawIngredients[key].menuBreakdown.push({
            menuName,
            amount: fallbackAmount,
            satuan: fallbackSatuan,
          });
        }
      }
    });

    return Object.values(rawIngredients).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, combinedPorsi, combinedRecipes, selectedBatch?.tanggal, weeklySchedule]);

  const adjustedRecipeRequirements = useMemo(() => {
    // 1. Start with copy of recipeRequirements
    const result = recipeRequirements.map((r) => ({
      ...r,
      adjustmentId: null as string | null,
      isCustom: false,
      originalAmount: r.amount
    }));

    // 2. Apply adjustments
    recipeAdjustments.forEach((adj) => {
      if (adj.isCustom) {
        // Add custom manual item
        result.push({
          name: adj.name,
          amount: adj.amount,
          satuan: adj.satuan,
          sourceMenus: ['Ditambahkan Manual'],
          menuBreakdown: [{ menuName: 'Ditambahkan Manual', amount: adj.amount, satuan: adj.satuan }],
          adjustmentId: adj.id ?? null,
          isCustom: true,
          originalAmount: 0
        });
      } else {
        // Override existing item
        const existing = result.find((item) => item.name.toLowerCase().trim() === adj.name.toLowerCase().trim());
        if (existing) {
          existing.amount = adj.amount;
          existing.satuan = adj.satuan;
          existing.adjustmentId = adj.id ?? null;
        }
      }
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [recipeRequirements, recipeAdjustments]);

  const filteredRecipeRequirements = useMemo(() => {
    const query = recipeSearchQuery.toLowerCase().trim();
    if (!query) return adjustedRecipeRequirements;
    return adjustedRecipeRequirements.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.sourceMenus.some((m) => m.toLowerCase().includes(query))
    );
  }, [adjustedRecipeRequirements, recipeSearchQuery]);

  const handleSaveIngredientAdjustment = async (name: string, amount: number, satuan: string, adjustmentId: string | null) => {
    if (!selectedBatchId) return;
    setIsSavingAdjustment(true);
    try {
      await saveRecipeAdjustment(adjustmentId, {
        batchId: selectedBatchId,
        name,
        amount,
        satuan,
        isCustom: false
      });
      showToast({ message: `Estimasi kebutuhan ${name} berhasil disesuaikan!`, variant: 'success' });
      setEditingIngredientName(null);
    } catch (err) {
      console.error('Error saving adjustment:', err);
      showToast({ message: 'Gagal menyesuaikan estimasi bahan', variant: 'error' });
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  const effectiveDailyReport = useMemo(() => {
    return dailyReport;
  }, [dailyReport]);

  const handleResetDailyReport = (report: MbgProductionDailyReport) => {
    if (!report.id) return;
    setConfirmModal({
      isOpen: true,
      title: 'Reset / Hapus Data Import Excel',
      message: `Apakah Anda yakin ingin menghapus data laporan harian Excel (${report.sheetDayName || report.tanggal || 'Ter-import'}) dari batch ini? Tampilan data PM akan kembali otomatis menampilkan data asli yang diinput oleh Admin MBG (${entries.length} institusi, ${selectedBatch?.totalJumlah || 0} porsi).`,
      confirmLabel: 'Ya, Hapus Data Import',
      cancelLabel: 'Batal',
      variant: 'danger',
      icon: 'delete',
      onConfirm: async () => {
        try {
          await deleteDailyReport(report.id!);
          setDailyReport(null);
          showToast({ message: 'Data import Excel berhasil dihapus! Menampilkan data PM asli Admin MBG.', variant: 'success' });
        } catch (err) {
          console.error('Error deleting daily report:', err);
          showToast({ message: 'Gagal menghapus data laporan Excel', variant: 'error' });
        }
      },
    });
  };

  const handleDeleteBatch = (batchId: string, tanggal: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Batch Operasional',
      message: `Apakah Anda yakin ingin menghapus arsip data batch tanggal ${tanggal}? Tindakan ini akan menghapus seluruh data penerima manfaat dan laporan di dalamnya, serta tidak dapat dibatalkan.`,
      confirmLabel: 'Ya, Hapus Permanen',
      cancelLabel: 'Batal',
      variant: 'danger',
      icon: 'delete',
      onConfirm: async () => {
        // Optimistic update: immediately remove from UI
        setBatches((prev) => prev.filter((b) => b.id !== batchId));
        if (selectedBatchId === batchId) {
          setSelectedBatchId(null);
        }
        try {
          await deleteBatch(batchId);
          showToast({ message: `Data batch ${tanggal} berhasil dihapus!`, variant: 'success' });
        } catch (err) {
          console.error('Error deleting batch:', err);
          showToast({ message: 'Gagal menghapus batch', variant: 'error' });
        }
      },
    });
  };

  const handleResetIngredientAdjustment = async (name: string, adjustmentId: string | null) => {
    if (!adjustmentId) return;
    try {
      await deleteRecipeAdjustment(adjustmentId);
      showToast({ message: `Estimasi ${name} dikembalikan ke hitungan standar.`, variant: 'success' });
    } catch (err) {
      console.error('Error resetting adjustment:', err);
      showToast({ message: 'Gagal mereset estimasi bahan', variant: 'error' });
    }
  };

  const handleAddCustomIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId) return;
    if (!newCustomIngredientName.trim() || newCustomIngredientAmount <= 0) {
      showToast({ message: 'Nama bahan dan jumlah harus valid!', variant: 'error' });
      return;
    }
    setIsSavingAdjustment(true);
    try {
      await saveRecipeAdjustment(null, {
        batchId: selectedBatchId,
        name: newCustomIngredientName.trim(),
        amount: newCustomIngredientAmount,
        satuan: newCustomIngredientSatuan,
        isCustom: true
      });
      showToast({ message: `Bahan baku ${newCustomIngredientName} berhasil ditambahkan ke batch!`, variant: 'success' });
      setNewCustomIngredientName('');
      setNewCustomIngredientAmount(0);
      setIsAddingCustomIngredient(false);
    } catch (err) {
      console.error('Error adding custom ingredient:', err);
      showToast({ message: 'Gagal menambahkan bahan baku baru', variant: 'error' });
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  const handleOpenRecipeDetail = (menuName: string) => {
    const recipe = combinedRecipes.find(
      (r) => r.namaMenu.toLowerCase().trim() === menuName.toLowerCase().trim()
    );
    if (recipe) {
      setSelectedRecipeItem(recipe);
      setRecipeBookQuery('');
      setShowRecipeBook(true);
    } else {
      showToast({
        message: `Resep "${menuName}" tidak ditemukan di Buku Resep. Silakan buat resep kustom di Buku Resep.`,
        variant: 'info'
      });
    }
  };

  const handleAddNutrition = async () => {
    if (!selectedBatchId || !user) return;
    try {
      const totalBatchPorsi = entries.reduce((s, e) => s + (e.jumlah || 0), 0);
      await addNutritionEntry({
        batchId: selectedBatchId,
        menuItemName: '',
        berat: 0,
        baseBerat: 100,
        air: 0,
        kalori: 0,
        protein: 0,
        lemak: 0,
        karbohidrat: 0,
        serat: 0,
        abu: 0,
        kalsium: 0,
        fosfor: 0,
        zatBesi: 0,
        natrium: 0,
        kalium: 0,
        tembaga: 0,
        seng: 0,
        vitaminA: 0,
        bkar: 0,
        kartotal: 0,
        thiamin: 0,
        riboflavin: 0,
        niasin: 0,
        vitaminC: 0,
        quantity: totalBatchPorsi || 1,
        totalKalori: 0,
        totalProtein: 0,
        totalLemak: 0,
        totalKarbohidrat: 0,
        totalSerat: 0,
        calculatedBy: user.uid,
        calculatedAt: new Date().toISOString(),
      });
    } catch {
      showToast({ message: 'Gagal menambah data gizi', variant: 'error' });
    }
  };


  const handleUpdateNutrition = async (id: string, updates: Partial<MbgNutritionEntry>) => {
    try {
      const existing = nutritionData.find((n) => n.id === id);
      if (!existing) return;

      const oldQty = existing.quantity || 1;
      const merged = { ...existing, ...updates };
      const newQty = merged.quantity || 1;

      const name = merged.menuItemName || '';
      const match = combinedTkpiDatabase.find(
        (item) => item.nama.toLowerCase() === name.toLowerCase()
      );

      // Check if this update is modifying an individual nutrient value manually
      const isNutrientUpdate = Object.keys(updates).some((key) => key in NUTRITIONAL_MAP);

      if (match) {
        const baseBerat = match.berat || 100;
        merged.baseBerat = baseBerat;

        if (!isNutrientUpdate) {
          // If name changes, quantity changes, or weight is not set, scale weight based on quantity
          if ('menuItemName' in updates || ('quantity' in updates && !('berat' in updates)) || !existing.berat) {
            merged.berat = newQty * baseBerat;
          }

          const targetBerat = merged.berat ?? (newQty * baseBerat);
          merged.berat = targetBerat;

          // TKPI database values are per 100g BDD, so divide target weight by 100
          const ratio = targetBerat / 100;

          const mergedObj = merged as unknown as Record<string, number>;
          const matchObj = match as unknown as Record<string, number>;
          for (const [key, tkpiKey] of Object.entries(NUTRITIONAL_MAP)) {
            mergedObj[key] = ratio * Number(matchObj[tkpiKey] || 0);
          }
        }
      } else {
        // Custom ingredient (no database match)
        if ('berat' in updates) {
          // If weight is directly updated by user, scale current nutrients proportionally
          const oldBerat = existing.berat || 1;
          const newBerat = merged.berat || 0;
          const scale = oldBerat > 0 ? newBerat / oldBerat : 0;
          const mergedObj = merged as unknown as Record<string, number>;
          const existingObj = existing as unknown as Record<string, number>;
          for (const key of Object.keys(NUTRITIONAL_MAP)) {
            mergedObj[key] = (Number(existingObj[key]) || 0) * scale;
          }
        } else if ('quantity' in updates && oldQty !== newQty) {
          const scale = newQty / oldQty;
          merged.berat = (existing.berat || 0) * scale;
          const mergedObj = merged as unknown as Record<string, number>;
          const existingObj = existing as unknown as Record<string, number>;
          for (const key of Object.keys(NUTRITIONAL_MAP)) {
            mergedObj[key] = (Number(existingObj[key]) || 0) * scale;
          }
        }
      }

      // Keep total fields in sync with main fields
      merged.totalKalori = merged.kalori;
      merged.totalProtein = merged.protein;
      merged.totalLemak = merged.lemak;
      merged.totalKarbohidrat = merged.karbohidrat;
      merged.totalSerat = merged.serat;

      const finalUpdates: Partial<MbgNutritionEntry> = {
        menuItemName: merged.menuItemName,
        berat: merged.berat ?? 0,
        baseBerat: merged.baseBerat ?? 100,
        quantity: merged.quantity,
        totalKalori: merged.totalKalori,
        totalProtein: merged.totalProtein,
        totalLemak: merged.totalLemak,
        totalKarbohidrat: merged.totalKarbohidrat,
        totalSerat: merged.totalSerat,
      };

      const finalUpdatesObj = finalUpdates as unknown as Record<string, number>;
      const mergedObj = merged as unknown as Record<string, number>;
      for (const key of Object.keys(NUTRITIONAL_MAP)) {
        finalUpdatesObj[key] = mergedObj[key] ?? 0;
      }

      await updateNutritionEntry(id, finalUpdates);
    } catch {
      showToast({ message: 'Gagal update data gizi', variant: 'error' });
    }
  };

  const handleSaveNewDbItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbItem.nama.trim()) {
      showToast({ message: 'Nama bahan makanan harus diisi!', variant: 'error' });
      return;
    }

    // Check duplicate only if adding new
    if (!editingDbItemId) {
      const lowercaseName = newDbItem.nama.trim().toLowerCase();
      const isDuplicate = combinedTkpiDatabase.some((item) => item.nama.toLowerCase() === lowercaseName);
      if (isDuplicate) {
        showToast({ message: `Bahan makanan dengan nama "${newDbItem.nama}" sudah ada di database!`, variant: 'error' });
        return;
      }
    }

    setIsSavingDbItem(true);
    try {
      const generatedKode = newDbItem.kode.trim() || `CUST-${Math.floor(1000 + Math.random() * 9000)}`;
      const itemToSave = {
        ...newDbItem,
        nama: newDbItem.nama.trim(),
        kode: generatedKode,
      };

      if (editingDbItemId) {
        await updateCustomTkpiEntry(editingDbItemId, itemToSave);
        showToast({ message: `Bahan "${newDbItem.nama}" berhasil diperbarui!`, variant: 'success' });
      } else {
        await addCustomTkpiEntry(itemToSave);
        showToast({ message: `Bahan "${newDbItem.nama}" berhasil ditambahkan ke database!`, variant: 'success' });
      }

      // Reset form and close form view
      setNewDbItem({
        nama: '',
        kode: '',
        sumber: 'Input Manual',
        berat: 100,
        air: 0,
        energi: 0,
        protein: 0,
        lemak: 0,
        kh: 0,
        serat: 0,
        abu: 0,
        kalsium: 0,
        fosfor: 0,
        besi: 0,
        natrium: 0,
        kalium: 0,
        tembaga: 0,
        seng: 0,
        retinol: 0,
        bkar: 0,
        kartotal: 0,
        thiamin: 0,
        riboflavin: 0,
        niasin: 0,
        vit_c: 0,
      });
      setIsAddingDbItem(false);
      setEditingDbItemId(null);
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal menyimpan bahan ke database', variant: 'error' });
    } finally {
      setIsSavingDbItem(false);
    }
  };

  const handleCopyName = (name: string) => {
    navigator.clipboard.writeText(name);
    showToast({ message: `Nama "${name}" berhasil disalin ke papan klip!`, variant: 'success' });
  };

  const handleMarkNutritionDone = async () => {
    if (!selectedBatchId) return;
    try {
      await updateBatchStatus(selectedBatchId, 'NUTRITION_DONE');
      showToast({ message: 'Kadar gizi berhasil disimpan!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal update status', variant: 'error' });
    }
  };

  const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("Error loading logo for PDF:", err);
      return null;
    }
  };

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [savingReport, setSavingReport] = useState(false);

  const handleExportDocxAction = async (targetBatch?: MbgPmBatch, targetEntries?: MbgPmEntry[]) => {
    const batchToUse = targetBatch || selectedBatch;
    const entriesToUse = targetEntries || entries;
    if (!batchToUse) {
      showToast({ message: 'Pilih batch terlebih dahulu!', variant: 'info' });
      return;
    }

    const reportToUse =
      (targetBatch && targetBatch.id !== selectedBatchId
        ? allDailyReports.find((r) => r.batchId === targetBatch.id)
        : dailyReport) ||
      allDailyReports.find((r) => r.batchId === batchToUse.id) ||
      effectiveDailyReport;

    if (!reportToUse) {
      showToast({
        message: `Batch tanggal ${batchToUse.tanggal} belum memiliki data import Excel Laporan Harian! Silakan import Google Sheets / Excel terlebih dahulu.`,
        variant: 'info',
      });
      return;
    }

    try {
      setExportingDocx(true);
      const logoBase64 = await getBase64ImageFromUrl('/logo_badan_gizi.png');

      await exportProductionDocx({
        batch: batchToUse,
        entries: entriesToUse,
        dailyReport: reportToUse,
        logoBase64,
      }, `Laporan_Produksi_MBG_${batchToUse.tanggal}.docx`);

      if (batchToUse.id) {
        if (batchToUse.status === 'PM_SUBMITTED') {
          await updateBatchStatus(batchToUse.id, 'NUTRITION_DONE');
        }
      }

      showToast({ message: 'Laporan DOCX resmi berhasil di-export!', variant: 'success' });
    } catch (err) {
      console.error('Export DOCX error:', err);
      showToast({ message: err instanceof Error ? err.message : 'Gagal export DOCX', variant: 'error' });
    } finally {
      setExportingDocx(false);
    }
  };

  const handleExportPdf = async (targetBatch?: MbgPmBatch, targetEntries?: MbgPmEntry[]) => {
    const batchToUse = targetBatch || selectedBatch;
    const entriesToUse = targetEntries || entries;
    if (!batchToUse) {
      showToast({ message: 'Pilih batch terlebih dahulu!', variant: 'info' });
      return;
    }

    const reportToUse =
      (targetBatch && targetBatch.id !== selectedBatchId
        ? allDailyReports.find((r) => r.batchId === targetBatch.id)
        : dailyReport) ||
      allDailyReports.find((r) => r.batchId === batchToUse.id) ||
      effectiveDailyReport;

    if (!reportToUse) {
      showToast({
        message: `Batch tanggal ${batchToUse.tanggal} belum memiliki data import Excel Laporan Harian! Silakan import Google Sheets / Excel terlebih dahulu.`,
        variant: 'info',
      });
      return;
    }

    try {
      setExportingPdf(true);
      await export8PageDailyReportPdf(reportToUse, batchToUse, entriesToUse);

      if (batchToUse.id && batchToUse.status === 'PM_SUBMITTED') {
        await updateBatchStatus(batchToUse.id, 'PDF_EXPORTED');
      }

      showToast({ message: 'Laporan PDF resmi berhasil di-export!', variant: 'success' });
    } catch (err) {
      console.error('Export PDF error:', err);
      showToast({ message: err instanceof Error ? err.message : 'Gagal export PDF', variant: 'error' });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSaveReportAction = async () => {
    if (!selectedBatchId || !selectedBatch) {
      showToast({ message: 'Pilih batch terlebih dahulu!', variant: 'info' });
      return;
    }

    try {
      setSavingReport(true);
      if (selectedBatch.status === 'PM_SUBMITTED') {
        await updateBatchStatus(selectedBatchId, 'NUTRITION_DONE');
      }

      if (dailyReport && user) {
        await saveDailyReport(dailyReport.id || null, {
          ...dailyReport,
          batchId: selectedBatch.id,
          tanggal: selectedBatch.tanggal,
          updatedAt: new Date().toISOString(),
          createdBy: user.uid,
        });
      }

      showToast({ message: `Laporan batch ${selectedBatch.tanggal} berhasil disimpan ke Arsip Gizi!`, variant: 'success' });
    } catch (err) {
      console.error('Error saving report to archive:', err);
      showToast({ message: 'Gagal menyimpan laporan ke Arsip Gizi', variant: 'error' });
    } finally {
      setSavingReport(false);
    }
  };

  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || !focusedRowId) return [];
    const query = searchQuery.toLowerCase();
    return combinedTkpiDatabase
      .filter((item) => item.nama.toLowerCase().includes(query))
      .slice(0, 10);
  }, [searchQuery, focusedRowId, combinedTkpiDatabase]);

  const filteredDbItems = useMemo(() => {
    if (!dbSearchQuery.trim()) {
      return combinedTkpiDatabase;
    }
    const query = dbSearchQuery.toLowerCase();
    return combinedTkpiDatabase.filter(
      (item) =>
        item.nama.toLowerCase().includes(query) ||
        (item.kode && item.kode.toLowerCase().includes(query))
    );
  }, [dbSearchQuery, combinedTkpiDatabase]);

  const totalDbPages = Math.max(1, Math.ceil(filteredDbItems.length / 50));

  const dbSearchResults = useMemo(() => {
    const start = (dbPage - 1) * 50;
    return filteredDbItems.slice(start, start + 50);
  }, [filteredDbItems, dbPage]);

  useEffect(() => {
    setDbPage(1);
  }, [dbSearchQuery]);

  const nutritionTotals = useMemo(() => {
    return nutritionData.reduce(
      (acc, n) => ({
        kalori: acc.kalori + (n.totalKalori || 0),
        protein: acc.protein + (n.totalProtein || 0),
        lemak: acc.lemak + (n.totalLemak || 0),
        karbohidrat: acc.karbohidrat + (n.totalKarbohidrat || 0),
        serat: acc.serat + (n.totalSerat || 0),
      }),
      { kalori: 0, protein: 0, lemak: 0, karbohidrat: 0, serat: 0 }
    );
  }, [nutritionData]);

  const handleSubmitToDistribution = () => {
    if (!selectedBatchId) return;
    setConfirmModal({
      isOpen: true,
      title: 'Kirim Data ke Distribusi MBG',
      message: 'Kirim/Submit data porsi dan alokasi penerima manfaat batch ini ke bagian Distribusi MBG untuk persiapan pengantaran kurir?',
      confirmLabel: 'Ya, Kirim ke Distribusi',
      cancelLabel: 'Batal',
      variant: 'success',
      icon: 'send',
      onConfirm: async () => {
        try {
          await updateBatchStatus(selectedBatchId, 'DELIVERING');
          showToast({ message: 'Data berhasil disubmit ke Distribusi MBG!', variant: 'success' });
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal menyubmit data ke Distribusi', variant: 'error' });
        }
      },
    });
  };

  const [creatingBatch, setCreatingBatch] = useState(false);

  const handleCreateTodayBatch = async () => {
    try {
      setCreatingBatch(true);
      const todayStr = new Date().toISOString().split('T')[0];
      const existing = batches.find((b) => b.tanggal === todayStr);
      if (existing) {
        setSelectedBatchId(existing.id);
        showToast({ message: `Batch hari ini (${todayStr}) sudah ada dan telah dibuka!`, variant: 'info' });
        return;
      }

      const newBatchId = await createBatch(todayStr, user?.uid || 'user', false, weeklySchedule);
      await updateBatch(newBatchId, { status: 'PM_SUBMITTED' });
      setSelectedBatchId(newBatchId);
      showToast({ message: `Batch baru untuk hari ini (${todayStr}) berhasil dibuat!`, variant: 'success' });
    } catch (err) {
      console.error('Error creating batch:', err);
      showToast({ message: 'Gagal membuat batch baru', variant: 'error' });
    } finally {
      setCreatingBatch(false);
    }
  };

  // Helper: Filter only visible & non-empty sheet tabs from Google Sheets/Excel
  function getVisibleSheetNames(wb: XLSX.WorkBook): string[] {
    const sheetsMeta = wb.Workbook?.Sheets || [];

    const filtered = wb.SheetNames.filter((name, idx) => {
      const nameLower = name.toLowerCase().trim();
      if (nameLower.includes('siklus') || nameLower.includes('akg')) {
        return false;
      }

      // Check if sheet tab is marked hidden in Google Sheets / Excel
      const meta = sheetsMeta[idx];
      if (meta && (meta.Hidden === 1 || meta.Hidden === 2)) {
        return false;
      }

      // Check if sheet contains content
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) {
        return false;
      }

      // Verify row count is non-empty
      const range = XLSX.utils.decode_range(ws['!ref']);
      if (range.e.r - range.s.r < 2) {
        return false;
      }

      return true;
    });

    return filtered.length > 0 ? filtered : wb.SheetNames.filter((n) => !n.toLowerCase().includes('siklus') && !n.toLowerCase().includes('akg'));
  }

  const handleFetchGoogleSheets = async () => {
    if (!sheetsUrlInput.trim()) {
      showToast({ message: 'Masukkan URL Google Sheets terlebih dahulu!', variant: 'info' });
      return;
    }

    try {
      setImportingSheets(true);
      let fetchUrl = sheetsUrlInput.trim();

      // Check if Google Sheets URL
      const match = fetchUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        const spreadsheetId = match[1];
        fetchUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
      }

      const res = await fetch(fetchUrl);
      if (!res.ok) {
        throw new Error(`Gagal mengunduh Google Sheets. Status: ${res.status}. Pastikan link spreadsheet dapat diakses publik (Anyone with link).`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      setSheetWorkbook(wb);

      const sheetNames = getVisibleSheetNames(wb);
      setAvailableSheetNames(sheetNames);

      showToast({ message: `Spreadsheet berhasil dibaca! Ditemukan ${sheetNames.length} sheet/tab aktif. Silakan pilih sheet hari yang ingin di-import.`, variant: 'success' });
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Gagal membaca link Google Sheets';
      showToast({ message: errMsg, variant: 'error' });
    } finally {
      setImportingSheets(false);
    }
  };

  const handleFileUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportingSheets(true);
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      setSheetWorkbook(wb);

      const sheetNames = getVisibleSheetNames(wb);
      setAvailableSheetNames(sheetNames);

      showToast({ message: `File Excel berhasil dibaca! Ditemukan ${sheetNames.length} sheet/tab aktif. Silakan pilih sheet hari.`, variant: 'success' });
    } catch (err: unknown) {
      console.error(err);
      showToast({ message: 'Gagal membaca file Excel', variant: 'error' });
    } finally {
      setImportingSheets(false);
    }
  };

  const parseSheetNameToDate = (sheetName: string): string | null => {
    if (!sheetName) return null;
    const clean = sheetName.trim();

    // Pattern 1: DDMMYYYY (8 digits, e.g. 04092026 or 11092026)
    const ddmmyyyy = clean.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (ddmmyyyy) {
      const [, d, m, y] = ddmmyyyy;
      return `${y}-${m}-${d}`;
    }

    // Pattern 2: YYYY-MM-DD
    const yyyymmdd = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmdd) {
      return clean;
    }

    // Pattern 3: DD-MM-YYYY or DD/MM/YYYY
    const ddmmyyyySep = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ddmmyyyySep) {
      const [, d, m, y] = ddmmyyyySep;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Pattern 4: DDMMYY (6 digits, e.g. 040926)
    const ddmmyy = clean.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (ddmmyy) {
      const [, d, m, y] = ddmmyy;
      return `20${y}-${m}-${d}`;
    }

    return null;
  };

  const handleImportPenerimaManfaatSheet = async (sheetName = 'Penerima Manfaat') => {
    if (!sheetWorkbook) return;

    try {
      setImportingSheets(true);
      const ws = sheetWorkbook.Sheets[sheetName];
      if (!ws) {
        showToast({ message: `Sheet '${sheetName}' tidak ditemukan!`, variant: 'error' });
        return;
      }

      // Determine target batch
      let targetBatchId = selectedBatchId;
      const targetBatchTanggal = selectedBatch?.tanggal || new Date().toISOString().split('T')[0];

      if (!targetBatchId) {
        const existingBatch = batches.find((b) => b.tanggal === targetBatchTanggal);
        if (existingBatch) {
          targetBatchId = existingBatch.id;
        } else {
          targetBatchId = await createBatch(targetBatchTanggal, user?.uid || 'user', false, weeklySchedule);
        }
      }

      const pmEntries = parsePenerimaManfaatSheet(ws, targetBatchId);
      if (pmEntries.length === 0) {
        showToast({ message: 'Tidak ada data penerima manfaat yang dapat dibaca dari sheet ini.', variant: 'error' });
        return;
      }

      await clearBatchEntries(targetBatchId);
      await addMultipleEntries(pmEntries);
      await recalculateBatchTotals(targetBatchId);

      setSelectedBatchId(targetBatchId);
      setShowSheetsImportModal(false);
      setActiveTab('pm-data');

      const totalPorsi = pmEntries.reduce((s, e) => s + e.jumlah, 0);
      showToast({
        message: `Berhasil meng-import ${pmEntries.length} data sekolah & penerima manfaat (Total: ${totalPorsi.toLocaleString()} porsi) ke Batch ${targetBatchTanggal}!`,
        variant: 'success',
      });
    } catch (err) {
      console.error('Import Penerima Manfaat error:', err);
      showToast({ message: 'Gagal meng-import sheet Penerima Manfaat', variant: 'error' });
    } finally {
      setImportingSheets(false);
    }
  };

  const handleSelectSheetDay = async (sheetName: string) => {
    if (!sheetWorkbook) return;

    // If user clicked Penerima Manfaat directly, route to dedicated PM importer
    if (sheetName.toLowerCase().includes('penerima manfaat')) {
      await handleImportPenerimaManfaatSheet(sheetName);
      return;
    }

    try {
      setImportingSheets(true);
      const ws = sheetWorkbook.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const parsedDateFromSheet = parseSheetNameToDate(sheetName);

      // Determine target batch based on user choice
      let targetBatchTanggal: string;
      if (importTargetOption === 'current_batch' && selectedBatch?.tanggal) {
        targetBatchTanggal = selectedBatch.tanggal;
      } else {
        targetBatchTanggal = parsedDateFromSheet || selectedBatch?.tanggal || new Date().toISOString().split('T')[0];
      }

      let targetBatchId = '';
      const existingBatch = batches.find((b) => b.tanggal === targetBatchTanggal);

      if (existingBatch) {
        targetBatchId = existingBatch.id;
      } else {
        targetBatchId = await createBatch(targetBatchTanggal, user?.uid || 'user', false, weeklySchedule);
      }

      const parsedReport = parseProductionSheetRows(rows, targetBatchId, targetBatchTanggal, sheetName, sheetWorkbook);

      const totalPorsiFromReport =
        (parsedReport.porsiKecil?.pmCount || 0) +
        (parsedReport.porsiBesar?.pmCount || 0) +
        (parsedReport.porsiBalita?.pmCount || 0) +
        (parsedReport.porsiBumilBusui?.pmCount || 0);

      if (totalPorsiFromReport > 0) {
        await updateBatch(targetBatchId, {
          totalJumlah: totalPorsiFromReport,
          totalSiswaBalita: (parsedReport.porsiKecil?.pmCount || 0) + (parsedReport.porsiBesar?.pmCount || 0) + (parsedReport.porsiBalita?.pmCount || 0),
          totalBumilBusui: (parsedReport.porsiBumilBusui?.pmCount || 0),
          status: 'PM_SUBMITTED',
        });
      }

      const existingReportId = dailyReport?.batchId === targetBatchId ? dailyReport.id : null;
      const savedReportId = await saveDailyReport(existingReportId, {
        ...parsedReport,
        batchId: targetBatchId,
        tanggal: targetBatchTanggal,
        createdBy: user?.uid || '',
      });

      setDailyReport({
        id: savedReportId,
        ...parsedReport,
        batchId: targetBatchId,
        tanggal: targetBatchTanggal,
        createdBy: user?.uid || '',
      });

      // ALSO import schools from 'Penerima Manfaat' OR parsedReport.sekolahList into mbg_pm_entries
      let importedPmEntries: Omit<MbgPmEntry, 'id'>[] = [];
      const pmSheetName = Object.keys(sheetWorkbook.Sheets).find((name) =>
        name.toLowerCase().includes('penerima manfaat')
      );
      if (pmSheetName) {
        const pmWs = sheetWorkbook.Sheets[pmSheetName];
        importedPmEntries = parsePenerimaManfaatSheet(pmWs, targetBatchId);
      }

      // If no 'Penerima Manfaat' sheet or 0 entries, fallback to parsedReport.sekolahList (from cols BI-BK or daily sheet)
      if (importedPmEntries.length === 0 && parsedReport.sekolahList && parsedReport.sekolahList.length > 0) {
        importedPmEntries = parsedReport.sekolahList.map((s, idx) => {
          const nameLower = s.nama.toLowerCase();
          const isPosyandu = nameLower.includes('balita') || nameLower.includes('bumil') || nameLower.includes('busui') || nameLower.includes('posyandu') || nameLower.includes('3b');
          const schoolLevel = nameLower.includes('tk') || nameLower.includes('paud') ? 'tk_paud' : (nameLower.includes('smp') || nameLower.includes('sma') ? 'sma' : 'sd');
          const total = (s.murid || 0) + (s.guru || 0);
          return {
            batchId: targetBatchId,
            institutionName: s.nama,
            institutionType: isPosyandu ? 'posyandu' : 'sekolah',
            schoolLevel: isPosyandu ? undefined : schoolLevel,
            qtSiswaBalita: s.murid || 0,
            qtBumil: 0,
            qtBusui: 0,
            qtBumilBusui: 0,
            qtGuruKader: s.guru || 0,
            qtPobiaNasi: 0,
            qtPorsiBalita: isPosyandu && nameLower.includes('balita') ? s.murid : 0,
            qtPorsiBumilBusui: isPosyandu && (nameLower.includes('bumil') || nameLower.includes('busui')) ? s.murid : 0,
            jumlah: total,
            jadwalPengantaran: '06.30-08.30',
            assignedPetugasId: '',
            assignedPetugasName: '',
            menuItems: [],
            menuKeringanItems: [],
            isSekolahLibur: total === 0,
            notes: '',
            sortOrder: idx + 1,
            createdBy: user?.uid || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });
      }

      // Only populate PM entries into mbg_pm_entries if the target batch is currently empty
      // to avoid accidentally overwriting entries already inputted by Admin MBG
      if (importedPmEntries.length > 0) {
        const hasExistingEntries = targetBatchId === selectedBatchId && entries.length > 0;
        if (!hasExistingEntries) {
          await clearBatchEntries(targetBatchId);
          await addMultipleEntries(importedPmEntries);
          await recalculateBatchTotals(targetBatchId);
          await updateBatchStatus(targetBatchId, 'PM_SUBMITTED');
        }
      }

      setSelectedBatchId(targetBatchId);
      setShowImportedDetails(true);
      setShowSheetsImportModal(false);
      setActiveTab('pm-data');

      showToast({ message: `Berhasil meng-import Laporan Harian (${sheetName}) ke Batch ${targetBatchTanggal}!`, variant: 'success' });
    } catch (err: unknown) {
      console.error('Parse Sheet error:', err);
      showToast({ message: 'Gagal memproses sheet ter-pilih', variant: 'error' });
    } finally {
      setImportingSheets(false);
    }
  };

  const handleSaveDailyReportFromTable = async (updated: MbgProductionDailyReport) => {
    try {
      const reportId = updated.id || dailyReport?.id || null;
      const targetBatchId = updated.batchId || selectedBatchId || '';
      const targetTanggal = updated.tanggal || selectedBatch?.tanggal || new Date().toISOString().split('T')[0];

      const savedId = await saveDailyReport(reportId, {
        ...updated,
        batchId: targetBatchId,
        tanggal: targetTanggal,
        createdBy: user?.uid || '',
      });

      setDailyReport({
        ...updated,
        id: savedId,
      });

      showToast({ message: 'Perubahan tabel berhasil disimpan ke database!', variant: 'success' });
    } catch (err) {
      console.error('Save daily report error:', err);
      showToast({ message: 'Gagal menyimpan perubahan tabel', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Produksi MBG</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Kelola kadar gizi menu dan pantau data PM
        </p>
      </div>

      {/* Tab Navigation & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="inline-flex items-center gap-1.5 bg-[#F1F5F9] p-1.5 rounded-2xl border border-slate-200/80 shadow-inner overflow-x-auto max-w-full">
          {[
            { id: 'pm-data', label: 'Data PM & Operasional', icon: ClipboardList },
            { id: 'archive', label: 'Arsip Gizi', icon: FolderOpen },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer select-none ${isActive
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSheetsImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#10B981] hover:bg-[#059669] text-white text-xs font-extrabold rounded-xl shadow transition-colors cursor-pointer whitespace-nowrap"
            title="Import data Laporan Harian via Google Sheets Link / File Excel"
          >
            <FileUp className="h-4 w-4 text-white" />
            <span>Import Google Sheets / Excel</span>
          </button>
          {activeTab === 'nutrition' && selectedBatchId && (
            <>
              <button
                onClick={handleSubmitToDistribution}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-extrabold rounded-xl shadow transition-colors cursor-pointer"
                title="Kirim data batch dan alokasi penerima manfaat ke Distribusi MBG"
              >
                <Truck className="h-4 w-4 text-white" />
                <span>Kirim ke Distribusi</span>
              </button>
              <button
                onClick={() => {
                  setRecipeBookQuery('');
                  setSelectedRecipeItem(null);
                  setShowRecipeBook(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-extrabold rounded-xl shadow transition-colors cursor-pointer"
              >
                <span>📖 Buku Resep</span>
              </button>
              <button
                onClick={() => {
                  setDbSearchQuery('');
                  setSelectedDbItem(null);
                  setIsAddingDbItem(false);
                  setShowDbLookup(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-white text-xs font-extrabold rounded-xl shadow transition-colors cursor-pointer"
              >
                <span>Gizi (TKPI)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
        </div>
      ) : activeTab === 'archive' ? (
        /* Archive View (Folder Grid Layout) */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-sm">
            <div>
              <h3 className="text-sm font-extrabold text-[#111827]">Arsip Dokumen Gizi</h3>
              <p className="text-xs text-gray-400 mt-0.5">Daftar batch PM yang sudah dihitung kadar gizinya.</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search input */}
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={archiveSearchQuery}
                  onChange={(e) => setArchiveSearchQuery(e.target.value)}
                  placeholder="Cari sekolah atau posyandu..."
                  className="w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-4 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>
              {/* Date picker */}
              <div className="relative max-w-xs">
                <input
                  type="date"
                  title="Filter Tanggal"
                  value={archiveSearchDate}
                  onChange={(e) => setArchiveSearchDate(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>
              {/* Reset button */}
              {(archiveSearchQuery || archiveSearchDate) && (
                <button
                  onClick={() => {
                    setArchiveSearchQuery('');
                    setArchiveSearchDate('');
                  }}
                  className="px-3 py-2 text-xs font-bold text-gray-500 hover:text-red-500 transition-colors border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {loadingArchive ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
              <span className="text-xs font-semibold">Memuat data arsip...</span>
            </div>
          ) : filteredArchivedBatches.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm">
              <Folder className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-600">Arsip tidak ditemukan</p>
              <p className="text-xs text-gray-400 mt-1">Coba sesuaikan tanggal filter atau kata kunci pencarian Anda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 font-['Hanken_Grotesk']">
              {filteredArchivedBatches.map((b) => {
                const batchEntries = allEntries.filter((e) => e.batchId === b.id);
                const matchingQuery = archiveSearchQuery.toLowerCase();
                const matchedSchools = archiveSearchQuery
                  ? batchEntries.filter(
                    (e) =>
                      e.institutionName.toLowerCase().includes(matchingQuery) ||
                      (e.assignedPetugasName || '').toLowerCase().includes(matchingQuery)
                  )
                  : [];

                const cfg = MBG_BATCH_STATUS_CONFIG[b.status] || MBG_BATCH_STATUS_CONFIG.DRAFT;

                return (
                  <div
                    key={b.id}
                    onClick={() => {
                      handleSelectBatch(b.id);
                      setActiveTab('pm-data');
                    }}
                    className="bg-white rounded-2xl border border-[#E5E7EB] hover:border-amber-300 p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden group hover:-translate-y-0.5"
                  >
                    {/* Visual tab of a folder */}
                    <div className="absolute top-0 left-0 w-24 h-1 bg-amber-400 group-hover:bg-[#F59E0B] transition-colors" />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="p-2.5 bg-amber-50 rounded-xl text-amber-500 group-hover:bg-amber-100 transition-colors">
                          <Folder className="h-5 w-5 fill-amber-100" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${cfg.bgClass} ${cfg.textClass}`}>
                            {cfg.label}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBatch(b.id, b.tanggal);
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title={`Hapus Batch ${b.tanggal}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-extrabold text-gray-800 break-all">
                          {b.tanggal}
                        </h4>
                        <span className="text-[10px] text-gray-400 font-medium">
                          Status: {cfg.label}
                        </span>
                      </div>

                      {/* Matched Schools Preview if searching */}
                      {archiveSearchQuery && matchedSchools.length > 0 && (
                        <div className="bg-emerald-50 rounded-xl p-2 border border-emerald-100 space-y-1">
                          <span className="text-[9px] text-emerald-700 font-bold block uppercase tracking-wider">Hasil Cocok:</span>
                          <div className="max-h-[60px] overflow-y-auto space-y-1">
                            {matchedSchools.map((ms) => (
                              <span key={ms.id} className="text-[10px] font-semibold text-gray-700 block truncate">
                                • {ms.institutionName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 text-[10px]">
                        <div>
                          <span className="text-gray-400 block font-medium">Total Porsi</span>
                          <span className="font-extrabold text-gray-800 text-xs">
                            {b.totalJumlah || batchEntries.reduce((sum, e) => sum + (e.isSekolahLibur ? 0 : e.jumlah), 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block font-medium">Sekolah/PM</span>
                          <span className="font-extrabold text-gray-800 text-xs">
                            {batchEntries.length}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportDocxAction(b, batchEntries);
                          }}
                          className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                          title={`Download Laporan DOCX (Word) Batch ${b.tanggal}`}
                        >
                          <FileText className="h-3 w-3 text-blue-600" />
                          <span>DOCX</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportPdf(b, batchEntries);
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                          title={`Download Laporan PDF Resmi Batch ${b.tanggal}`}
                        >
                          <FileDown className="h-3 w-3 text-rose-600" />
                          <span>PDF</span>
                        </button>
                      </div>
                      <span className="font-bold text-amber-600 group-hover:text-amber-700 flex items-center gap-0.5">
                        Buka Arsip →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Normal Editor Flow */
        <>
          {/* Batch Selector Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 font-['Hanken_Grotesk']">
            <div className="relative max-w-xl w-full">
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Pilih Tanggal Batch / Operasional:
                </label>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-gray-400 font-medium">
                    {batches.length} Batch
                  </span>
                  <span className="text-gray-300">•</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
                    {batchCounts.imported} Sudah Import
                  </span>
                  <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
                    {batchCounts.unimported} Belum Import
                  </span>
                </div>
              </div>

              {/* Dropdown Button */}
              <button
                type="button"
                onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
                className="w-full flex items-center justify-between bg-white border border-[#E5E7EB] rounded-xl px-4 py-3 text-xs font-extrabold text-[#111827] hover:border-[#FBBF24] focus:outline-none transition-all shadow-sm cursor-pointer"
              >
                {selectedBatch ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="h-4 w-4 text-[#FBBF24]" />
                    <span className="text-sm font-black">{selectedBatch.tanggal}</span>
                    <span className={`text-[9px] font-extrabold rounded-full px-2 py-0.5 ${(MBG_BATCH_STATUS_CONFIG[selectedBatch.status] || MBG_BATCH_STATUS_CONFIG.DRAFT).textClass
                      } ${(MBG_BATCH_STATUS_CONFIG[selectedBatch.status] || MBG_BATCH_STATUS_CONFIG.DRAFT).bgClass
                      }`}>
                      {(MBG_BATCH_STATUS_CONFIG[selectedBatch.status] || MBG_BATCH_STATUS_CONFIG.DRAFT).label}
                    </span>
                    {savedReportBatchIds.has(selectedBatch.id) ? (
                      <span className="text-[9px] font-black rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Excel Tersimpan
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-0.5">
                        ⏳ Belum Import Excel
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[#9CA3AF] font-bold">
                    {batches.length > 0 ? 'Pilih Tanggal Batch...' : 'Belum Ada Batch'}
                  </span>
                )}
                <span className="text-gray-400 text-[10px] font-bold">
                  {isBatchDropdownOpen ? '▲' : '▼'}
                </span>
              </button>

              {/* Dropdown Popover */}
              {isBatchDropdownOpen && (
                <>
                  {/* Backdrop to close */}
                  <div
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => {
                      setIsBatchDropdownOpen(false);
                      setBatchSearchQuery('');
                    }}
                  />

                  <div className="absolute left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Search Input */}
                    <div className="p-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-1.5">
                      <Search className="h-3.5 w-3.5 text-gray-400 shrink-0 ml-1.5" />
                      <input
                        type="text"
                        value={batchSearchQuery}
                        onChange={(e) => setBatchSearchQuery(e.target.value)}
                        placeholder="Cari tanggal, status, atau 'sudah import'..."
                        className="w-full bg-transparent border-0 focus:ring-0 focus:outline-none text-xs font-bold text-gray-800 placeholder-gray-400 p-1"
                      />
                      {batchSearchQuery && (
                        <button
                          onClick={() => setBatchSearchQuery('')}
                          className="p-1 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Filter Segmented Pills (Semua / Belum Import / Sudah Import) */}
                    <div className="p-2 border-b border-slate-100 bg-white flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBatchExcelFilter('all')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer text-center ${
                          batchExcelFilter === 'all'
                            ? 'bg-[#111827] text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        Semua ({batchCounts.total})
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchExcelFilter('unimported')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer text-center ${
                          batchExcelFilter === 'unimported'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        ⏳ Belum Import ({batchCounts.unimported})
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchExcelFilter('imported')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer text-center ${
                          batchExcelFilter === 'imported'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        ✓ Sudah Import ({batchCounts.imported})
                      </button>
                    </div>

                    {/* Scrollable list */}
                    <div className="max-h-64 overflow-y-auto py-1 divide-y divide-slate-100">
                      {filteredBatchesForSelect.length === 0 ? (
                        <div className="text-center py-6 text-xs text-gray-400 font-bold">
                          {batchExcelFilter === 'unimported'
                            ? 'Semua batch sudah di-import data Excel! 🎉'
                            : batchExcelFilter === 'imported'
                            ? 'Belum ada batch yang di-import data Excel'
                            : 'Tidak ada batch ditemukan'}
                        </div>
                      ) : (
                        filteredBatchesForSelect.map((b) => {
                          const cfg = MBG_BATCH_STATUS_CONFIG[b.status] || MBG_BATCH_STATUS_CONFIG.DRAFT;
                          const isSaved = savedReportBatchIds.has(b.id);
                          return (
                            <button
                              key={b.id}
                              onClick={() => {
                                handleSelectBatch(b.id);
                                setIsBatchDropdownOpen(false);
                                setBatchSearchQuery('');
                              }}
                              className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                                selectedBatchId === b.id ? 'bg-[#FBBF24]/15 text-[#92400E]' : 'text-gray-700'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                <span className="font-extrabold">{b.tanggal}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] font-extrabold rounded-full px-2 py-0.5 ${cfg.textClass} ${cfg.bgClass}`}>
                                  {cfg.label}
                                </span>
                                {isSaved ? (
                                  <span className="text-[9px] font-black rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-0.5">
                                    ✓ Excel Ada
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold rounded-full px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200">
                                    ⏳ Belum Import
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 self-start sm:self-end">
              <button
                type="button"
                onClick={handleCreateTodayBatch}
                disabled={creatingBatch}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-black rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                title="Buat batch produksi baru untuk hari ini"
              >
                {creatingBatch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span>+ Buat Batch Hari Ini</span>
              </button>
            </div>
          </div>

          {!selectedBatchId ? (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-10 text-center shadow-sm font-['Hanken_Grotesk'] space-y-4">
              <Calendar className="h-12 w-12 text-amber-400 mx-auto" />
              <div>
                <h3 className="text-base font-black text-slate-800">
                  {batches.length === 0 ? 'Belum Ada Batch Produksi MBG' : 'Silakan Pilih Tanggal Batch'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {batches.length === 0
                    ? 'Belum ada data batch produksi di database. Anda dapat membuat batch baru untuk hari ini atau meng-import file Excel / Google Sheets untuk memulai.'
                    : 'Pilih salah satu batch yang tersedia di bawah ini untuk melihat data PM:'}
                </p>
              </div>

              {batches.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2 text-left">
                  {batches.slice(0, 6).map((b) => {
                    const cfg = MBG_BATCH_STATUS_CONFIG[b.status] || MBG_BATCH_STATUS_CONFIG.DRAFT;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => handleSelectBatch(b.id)}
                        className="p-3.5 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-xl transition-all text-left cursor-pointer group shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black text-slate-800 group-hover:text-amber-700">{b.tanggal}</span>
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${cfg.textClass} ${cfg.bgClass}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          {b.totalJumlah || 0} Porsi
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCreateTodayBatch}
                    disabled={creatingBatch}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {creatingBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    <span>Buat Batch Hari Ini</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSheetsImportModal(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                  >
                    <FileUp className="h-4 w-4" />
                    <span>Import Excel / Sheets</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {activeTab === 'pm-data' ? (
                /* PM Data View (Read-Only) */
                <div className="space-y-4 font-['Hanken_Grotesk']">
                  {(dailyReport || effectiveDailyReport) ? (() => {
                    const curReport = dailyReport || effectiveDailyReport;
                    if (!curReport) return null;
                    const totalPorsiReport =
                      (curReport.porsiKecil?.pmCount || 0) +
                      (curReport.porsiBesar?.pmCount || 0) +
                      (curReport.porsiBalita?.pmCount || 0) +
                      (curReport.porsiBumilBusui?.pmCount || 0) ||
                      selectedBatch?.totalJumlah || 0;
                    const menuItemsList =
                      (curReport.porsiBesar?.menuList && curReport.porsiBesar.menuList.length > 0)
                        ? curReport.porsiBesar.menuList
                        : (curReport.porsiKecil?.menuList && curReport.porsiKecil.menuList.length > 0)
                          ? curReport.porsiKecil.menuList
                          : [];

                    return (
                      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-amber-50 border border-emerald-200/90 rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200/60">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
                              <FileSpreadsheet className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-black text-emerald-950">
                                  Data Laporan Harian Ter-import {curReport.sheetDayName ? `(${curReport.sheetDayName})` : `(${curReport.tanggal})`}
                                </h3>
                                <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-2.5 py-0.5 rounded-full shadow-xs">
                                  Excel / Sheets Aktif
                                </span>
                              </div>
                              <p className="text-xs text-emerald-700/80 mt-0.5">
                                Data realisasi menu, kadar gizi, dan kebutuhan bahan baku berhasil disinkronkan ke batch ini.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleResetDailyReport(curReport)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 hover:border-rose-400 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                              title="Hapus data import Excel dan kembalikan ke data PM asli Admin MBG"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                              <span>Reset Import Excel</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowImportedDetails(!showImportedDetails)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                            >
                              {showImportedDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              <span>{showImportedDetails ? 'Sembunyikan Rincian' : 'Lihat Rincian Gizi & Bahan'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Metric Overview Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs font-['Hanken_Grotesk']">
                          <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 shadow-xs">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Porsi</span>
                            <span className="text-sm font-black text-slate-900">
                              {totalPorsiReport} Porsi
                            </span>
                          </div>
                          <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 shadow-xs">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Porsi Kecil / Besar</span>
                            <span className="text-xs font-black text-slate-900">
                              {curReport.porsiKecil?.pmCount || 0} / {curReport.porsiBesar?.pmCount || 0}
                            </span>
                          </div>
                          <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 shadow-xs">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Balita & Bumil</span>
                            <span className="text-xs font-black text-slate-900">
                              {curReport.porsiBalita?.pmCount || 0} / {curReport.porsiBumilBusui?.pmCount || 0}
                            </span>
                          </div>
                          <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 shadow-xs">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Energi (Kkal)</span>
                            <span className="text-xs font-black text-amber-700">
                              {curReport.porsiBesar?.totalGizi?.energi || curReport.porsiKecil?.totalGizi?.energi || 0} kkal
                            </span>
                          </div>
                          <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 shadow-xs">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Protein / Lemak</span>
                            <span className="text-xs font-black text-emerald-800">
                              {curReport.porsiBesar?.totalGizi?.protein || curReport.porsiKecil?.totalGizi?.protein || 0}g / {curReport.porsiBesar?.totalGizi?.lemak || curReport.porsiKecil?.totalGizi?.lemak || 0}g
                            </span>
                          </div>
                          <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100 shadow-xs">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Belanja</span>
                            <span className="text-xs font-black text-blue-700">
                              Rp {(curReport.totalPengeluaran || 0).toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>

                        {/* Menu List Badges */}
                        {menuItemsList.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
                            <span className="text-[11px] font-bold text-emerald-900">Menu Ter-import:</span>
                            {menuItemsList.map((m, idx) => (
                              <span key={idx} className="bg-white border border-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold shadow-2xs">
                                🍴 {m}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Expandable Details: Separated Tables by Excel Tabs */}
                        {showImportedDetails && (
                          <div className="pt-3 border-t border-emerald-200/60 animate-in fade-in duration-150">
                            <DailyReportExcelSections
                              report={curReport}
                              activeSubTab={dailyReportSubTab}
                              onSubTabChange={setDailyReportSubTab}
                              entries={entries}
                              onSaveReport={handleSaveDailyReportFromTable}
                              batchTanggal={selectedBatch?.tanggal}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="space-y-4">
                      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-xs font-['Hanken_Grotesk']">
                        <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl w-fit mx-auto shadow-xs border border-emerald-100">
                          <FileSpreadsheet className="h-8 w-8" />
                        </div>
                        <h3 className="text-sm font-black text-slate-900">
                          Data Laporan Harian Belum Di-import
                        </h3>
                        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                          Batch tanggal <strong>{selectedBatch?.tanggal}</strong> belum memiliki data import Excel / Google Sheets Laporan Harian. Anda dapat meng-import file Excel/Sheets untuk analisis gizi, atau memantau data penerima manfaat di bawah.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowSheetsImportModal(true)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm cursor-pointer"
                        >
                          <FileUp className="h-4 w-4 text-white" />
                          <span>Import Google Sheets / Excel Sekarang</span>
                        </button>
                      </div>

                      {/* Display PM data table directly if entries exist */}
                      {entries.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden font-['Hanken_Grotesk']">
                          <div className="px-4 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-black uppercase tracking-wider">
                                Data Penerima Manfaat (Input Admin MBG)
                              </h4>
                              <span className="px-2.5 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded-full text-[11px] font-black">
                                Batch: {selectedBatch?.tanggal}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-3 py-1 bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-xs">
                                Total Alokasi: {entries.reduce((s, e) => s + (e.jumlah || 0), 0).toLocaleString('id-ID')} Porsi
                              </span>
                              <span className="px-2.5 py-1 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold">
                                {entries.length} Lembaga
                              </span>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead>
                                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                                  <th className="px-3 py-2.5 w-10 text-center">No</th>
                                  <th className="px-4 py-2.5 min-w-[190px]">Nama Institusi / Lembaga</th>
                                  <th className="px-3 py-2.5 text-center">Siswa / Balita</th>
                                  <th className="px-3 py-2.5 text-center">Bumil / Busui</th>
                                  <th className="px-3 py-2.5 text-center">Guru / Kader</th>
                                  <th className="px-3 py-2.5 text-center font-black">Total Porsi</th>
                                  <th className="px-3 py-2.5">Petugas Kurir</th>
                                  <th className="px-3 py-2.5">Jadwal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {entries.map((e, idx) => (
                                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-3 py-2.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                                    <td className="px-4 py-2.5 font-bold text-slate-900">{e.institutionName}</td>
                                    <td className="px-3 py-2.5 text-center text-slate-700">{e.qtSiswaBalita || '-'}</td>
                                    <td className="px-3 py-2.5 text-center text-slate-700">{e.qtBumilBusui || '-'}</td>
                                    <td className="px-3 py-2.5 text-center text-slate-700">{e.qtGuruKader || '-'}</td>
                                    <td className="px-3 py-2.5 text-center font-black text-amber-700">{e.jumlah || 0}</td>
                                    <td className="px-3 py-2.5 text-slate-600">{e.assignedPetugasName || '-'}</td>
                                    <td className="px-3 py-2.5 text-slate-500 text-[11px]">{e.jadwalPengantaran || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Toolbar: Export DOCX, Export PDF, Simpan Laporan */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm mt-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-amber-500" />
                          <span>Dokumentasi & Arsip Laporan Produksi MBG</span>
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Export laporan dalam format Word / PDF resmi, atau simpan langsung ke sistem Arsip Gizi.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('archive')}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>Buka Arsip Gizi →</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Button 1: Export DOCX */}
                      <button
                        type="button"
                        onClick={() => handleExportDocxAction()}
                        disabled={exportingDocx}
                        className="flex items-center justify-center gap-2.5 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 active:scale-[0.99] text-white text-xs font-extrabold rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
                        title="Download Laporan MBG dalam format Microsoft Word (.docx)"
                      >
                        {exportingDocx ? (
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                        ) : (
                          <FileText className="h-4 w-4 text-blue-100" />
                        )}
                        <div className="text-left">
                          <span className="block leading-tight">Export DOCX</span>
                          <span className="text-[10px] font-normal text-blue-200">Format Word (.docx)</span>
                        </div>
                      </button>

                      {/* Button 2: Export PDF */}
                      <button
                        type="button"
                        onClick={() => handleExportPdf()}
                        disabled={exportingPdf}
                        className="flex items-center justify-center gap-2.5 px-4 py-3 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 active:scale-[0.99] text-white text-xs font-extrabold rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
                        title="Download Laporan MBG dalam format PDF Resmi"
                      >
                        {exportingPdf ? (
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                        ) : (
                          <FileDown className="h-4 w-4 text-rose-100" />
                        )}
                        <div className="text-left">
                          <span className="block leading-tight">Export PDF</span>
                          <span className="text-[10px] font-normal text-rose-200">Laporan Resmi (Landscape)</span>
                        </div>
                      </button>

                      {/* Button 3: Simpan Laporan */}
                      <button
                        type="button"
                        onClick={handleSaveReportAction}
                        disabled={savingReport}
                        className="flex items-center justify-center gap-2.5 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-[0.99] text-white text-xs font-extrabold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                        title="Simpan perhitungan laporan batch ini langsung ke Arsip Gizi"
                      >
                        {savingReport ? (
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                        ) : (
                          <Save className="h-4 w-4 text-emerald-100" />
                        )}
                        <div className="text-left">
                          <span className="block leading-tight">Simpan Laporan</span>
                          <span className="text-[10px] font-normal text-emerald-200">Masuk ke Arsip Gizi</span>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/60">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Semua laporan yang di-export (DOCX / PDF) maupun disimpan akan otomatis terdaftar dan tersimpan di tab <strong>Arsip Gizi</strong>.</span>
                    </div>
                  </div>

                  {/* Submit to Distribution CTA */}
                  {selectedBatch && ['NUTRITION_DONE', 'PDF_EXPORTED', 'DRAFT', 'PM_SUBMITTED'].includes(selectedBatch.status) && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                      <div className="space-y-1">
                        <h4 className="text-sm font-extrabold text-emerald-800">Kadar Gizi Selesai Dihitung</h4>
                        <p className="text-xs text-emerald-600">
                          Data gizi dan alokasi penerima manfaat untuk batch ini sudah siap. Silakan kirim data ini ke Distribusi MBG untuk persiapan proses pengantaran kurir.
                        </p>
                      </div>
                      <button
                        onClick={handleSubmitToDistribution}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-emerald-600/20 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 shrink-0"
                      >
                        <Truck className="h-4 w-4" />
                        <span>Kirim ke Distribusi</span>
                      </button>
                    </div>
                  )}

                  {selectedBatch && ['DELIVERING', 'DELIVERED', 'COOKING', 'PURCHASING'].includes(selectedBatch.status) && (
                    <div className="bg-emerald-100/70 border border-emerald-300 rounded-2xl p-4 text-center text-xs font-bold text-emerald-800 mt-6 flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Data batch ini sudah terkirim & siap didistribusikan di Distribusi MBG.</span>
                    </div>
                  )}
                </div>
              ) : (
                /* Nutrition Editor */
                <div>
                  {/* Collapsible PM Data Section */}
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] mb-6 overflow-hidden shadow-sm">
                    <button
                      onClick={() => setShowPmSummaryInGizi(!showPmSummaryInGizi)}
                      className="w-full px-5 py-4 bg-gray-50 flex items-center justify-between font-bold text-gray-800 text-xs hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-[#FBBF24]" />
                        <span>Data Penerima Manfaat (PM) — {selectedBatch?.tanggal}</span>
                        <span className="text-[10px] font-normal text-gray-400">
                          ({entries.length} Institusi, {entries.reduce((s, e) => s + (e.jumlah || 0), 0)} Porsi)
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-600 font-extrabold">
                        {showPmSummaryInGizi ? 'Sembunyikan ↑' : 'Tampilkan Detail ↓'}
                      </span>
                    </button>

                    {showPmSummaryInGizi && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-4 bg-gray-50/50">
                        {Object.entries(groupedEntries).map(([petugasName, petugasEntries]) => {
                          const isUnassigned = !petugasName || petugasName === 'Belum Ditugaskan';
                          const hasMultipleGroups = Object.keys(groupedEntries).length > 1;
                          const groupTitle = isUnassigned
                            ? (hasMultipleGroups ? 'PENERIMA MANFAAT (UMUM)' : 'DAFTAR PENERIMA MANFAAT')
                            : `PETUGAS: ${petugasName}`;

                          return (
                            <div key={petugasName || 'unassigned'} className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-white">
                              <div className="px-3 py-2 bg-[#111827] flex items-center gap-2">
                                <span className="text-[11px] font-extrabold text-white uppercase">
                                  {groupTitle}
                                </span>
                                <span className="text-[9px] font-bold text-[#FBBF24] bg-[#FBBF24]/10 rounded-full px-2.5 py-0.5 ml-auto">
                                  {petugasEntries.reduce((s, e) => s + (e.jumlah || 0), 0)} porsi
                                </span>
                              </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-[11px] min-w-[750px]">
                                <thead>
                                  <tr className="bg-[#FEF3C7] text-[9px] font-extrabold text-[#92400E] uppercase border-b border-[#E5E7EB]">
                                    <th className="px-2 py-1.5 text-left">Institusi</th>
                                    <th className="px-1 py-1.5 text-center">Siswa/Balita</th>
                                    <th className="px-1 py-1.5 text-center">Bumil/Busui</th>
                                    <th className="px-1 py-1.5 text-center">Guru/Kader</th>
                                    <th className="px-1 py-1.5 text-center">Pobia Nasi</th>
                                    <th className="px-1 py-1.5 text-center">Jumlah</th>
                                    <th className="px-2 py-1.5 text-center">Jadwal</th>
                                    <th className="px-2 py-1.5 text-left">Menu Utama</th>
                                    <th className="px-2 py-1.5 text-left">Menu Keringan</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {petugasEntries.map((e) => (
                                    <Fragment key={e.id}>
                                      <tr className="border-t border-[#E5E7EB] hover:bg-gray-50/50">
                                        <td className="px-2 py-1.5 font-bold text-gray-800">
                                          {e.institutionName}
                                          {e.isSekolahLibur && <span className="ml-1 text-[8px] text-red-500 font-extrabold">LIBUR</span>}
                                          {e.classesBreakdown && e.classesBreakdown.length > 0 && (
                                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                              {e.classesBreakdown.length} Kelas
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-1 py-1.5 text-center font-bold text-gray-700">{e.qtSiswaBalita || '-'}</td>
                                        <td className="px-1 py-1.5 text-center font-bold text-gray-700">{e.qtBumilBusui || '-'}</td>
                                        <td className="px-1 py-1.5 text-center font-bold text-gray-700">{e.qtGuruKader || '-'}</td>
                                        <td className="px-1 py-1.5 text-center font-bold text-red-600">{e.qtPobiaNasi || '-'}</td>
                                        <td className="px-1 py-1.5 text-center">
                                          <span className="font-extrabold text-[#92400E] bg-[#FBBF24]/20 rounded-full px-1.5 py-0.5">{e.jumlah}</span>
                                        </td>
                                        <td className="px-2 py-1.5 text-center font-semibold text-[#6B7280]">{e.jadwalPengantaran || '-'}</td>
                                        <td className="px-2 py-1.5 text-gray-500 font-medium">{e.menuItems?.join(', ') || '-'}</td>
                                        <td className="px-2 py-1.5 text-gray-500 font-medium">{e.menuKeringanItems?.join(', ') || '-'}</td>
                                      </tr>
                                      {/* Sub-table for class breakdown if it exists */}
                                      {e.classesBreakdown && e.classesBreakdown.length > 0 && (
                                        <tr>
                                          <td colSpan={9} className="px-3 pb-3 pt-1 bg-gray-50/70">
                                            <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white shadow-sm">
                                              <table className="w-full text-[10px] text-left">
                                                <thead>
                                                  <tr className="bg-gray-100/80 text-[8px] font-bold text-gray-500 uppercase border-b border-gray-200">
                                                    <th className="px-3 py-1.5">Nama Kelas</th>
                                                    <th className="px-2 py-1.5 text-center">Porsi Balita</th>
                                                    <th className="px-2 py-1.5 text-center">Porsi Kecil</th>
                                                    <th className="px-2 py-1.5 text-center">Porsi Besar</th>
                                                    <th className="px-2 py-1.5 text-center">Bumil/Busui</th>
                                                    <th className="px-2 py-1.5 text-center">Pobia Nasi</th>
                                                    <th className="px-2 py-1.5 text-center">Jumlah</th>
                                                    <th className="px-3 py-1.5">Menu / Makanan</th>
                                                    <th className="px-3 py-1.5">Menu Keringan</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {e.classesBreakdown.map((c) => (
                                                    <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50/30">
                                                      <td className="px-3 py-1 font-bold text-gray-700">{c.className}</td>
                                                      <td className="px-2 py-1 text-center text-gray-600 font-semibold">{c.qtPorsiBalita || '-'}</td>
                                                      <td className="px-2 py-1 text-center text-gray-600 font-semibold">{c.qtPorsiKecil || '-'}</td>
                                                      <td className="px-2 py-1 text-center text-gray-600 font-semibold">{c.qtPorsiBesar || '-'}</td>
                                                      <td className="px-2 py-1 text-center text-gray-600 font-semibold">{c.qtPorsiBumilBusui || '-'}</td>
                                                      <td className="px-2 py-1 text-center text-red-500 font-bold">{c.qtPobiaNasi || '-'}</td>
                                                      <td className="px-2 py-1 text-center font-bold text-amber-700">{c.jumlah}</td>
                                                      <td className="px-3 py-1 text-gray-500 font-medium">{c.menuItems?.join(', ') || '-'}</td>
                                                      <td className="px-3 py-1 text-gray-500 font-medium">{c.menuKeringanItems?.join(', ') || '-'}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Collapsible AKG Demographic Reference & Calculation Section */}
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] mb-6 overflow-hidden shadow-sm font-['Hanken_Grotesk']">
                    <button
                      type="button"
                      onClick={() => setShowAkgMatrix(!showAkgMatrix)}
                      className="w-full px-5 py-4 bg-gray-50 flex items-center justify-between font-bold text-gray-800 text-xs hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📊</span>
                        <span>Target AKG (Angka Kecukupan Gizi) Kelompok Penerima Manfaat</span>
                        <span className="text-[10px] font-normal text-gray-400">
                          (Standard AKG Makan Siang & Harian Berdasarkan Klasifikasi Penerima)
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-600 font-extrabold">
                        {showAkgMatrix ? 'Sembunyikan ↑' : 'Tampilkan Detail ↓'}
                      </span>
                    </button>

                    {showAkgMatrix && (
                      <div className="p-5 border-t border-[#E5E7EB] space-y-5">
                        {/* Active Batch Demographic Target Summary */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                              1. Total Target AKG Makan Siang Batch Ini (Berdasarkan Data PM Admin)
                            </h4>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              {Object.values(akgDemographicSummary).reduce((a, b) => a + b, 0)} Total Porsi Penerima
                            </span>
                          </div>

                          <div className="border border-gray-100 rounded-xl overflow-hidden shadow-xs">
                            <table className="w-full text-xs text-left">
                              <thead>
                                <tr className="bg-[#FEF3C7] text-[10px] font-extrabold text-[#92400E] uppercase border-b border-amber-200">
                                  <th className="px-3 py-2.5">Klasifikasi Penerima</th>
                                  <th className="px-2 py-2.5 text-center">Jumlah PM</th>
                                  <th className="px-3 py-2.5 text-right">Target Energi (kcal)</th>
                                  <th className="px-3 py-2.5 text-right">Target Protein (g)</th>
                                  <th className="px-3 py-2.5 text-right">Target Lemak (g)</th>
                                  <th className="px-3 py-2.5 text-right">Target KH (g)</th>
                                  <th className="px-3 py-2.5 text-right">Target Serat (g)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {MBG_AKG_REFERENCE.map((ref) => {
                                  const count = akgDemographicSummary[ref.targetGroup] || 0;
                                  const totalEnergi = count * ref.makanSiang.energi;
                                  const totalProtein = count * ref.makanSiang.protein;
                                  const totalLemak = count * ref.makanSiang.lemak;
                                  const totalKH = count * ref.makanSiang.karbohidrat;
                                  const totalSerat = count * ref.makanSiang.serat;

                                  return (
                                    <tr key={ref.targetGroup} className={`hover:bg-amber-50/20 ${count > 0 ? 'bg-emerald-50/20 font-bold' : 'opacity-60'}`}>
                                      <td className="px-3 py-2 font-bold text-gray-800 flex items-center gap-1.5">
                                        <span>{ref.targetGroup}</span>
                                        {count > 0 && (
                                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[8px] font-extrabold rounded-full">
                                            Aktif
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-2 py-2 text-center font-extrabold text-amber-900">
                                        {count > 0 ? `${count} PM` : '-'}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-700">
                                        {count > 0 ? `${totalEnergi.toLocaleString('id-ID')} kcal` : `${ref.makanSiang.energi} /pm`}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-700">
                                        {count > 0 ? `${totalProtein.toLocaleString('id-ID')} g` : `${ref.makanSiang.protein}g /pm`}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-700">
                                        {count > 0 ? `${totalLemak.toLocaleString('id-ID')} g` : `${ref.makanSiang.lemak}g /pm`}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-700">
                                        {count > 0 ? `${totalKH.toLocaleString('id-ID')} g` : `${ref.makanSiang.karbohidrat}g /pm`}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-700">
                                        {count > 0 ? `${totalSerat.toLocaleString('id-ID')} g` : `${ref.makanSiang.serat}g /pm`}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Standard AKG Matrix Table Reference */}
                        <div>
                          <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider mb-2">
                            2. Matriks Standar AKG Per Orang (Makan Siang & Harian)
                          </h4>
                          <div className="border border-gray-100 rounded-xl overflow-x-auto shadow-xs">
                            <table className="w-full text-[11px] text-left min-w-[700px]">
                              <thead>
                                <tr className="bg-[#1E293B] text-white text-[9px] font-extrabold uppercase">
                                  <th className="px-3 py-2" rowSpan={2}>Sasaran</th>
                                  <th className="px-2 py-1 text-center bg-[#0F172A]" colSpan={5}>AKG MAKAN SIANG</th>
                                  <th className="px-2 py-1 text-center bg-[#334155]" colSpan={5}>AKG HARIAN</th>
                                </tr>
                                <tr className="bg-[#0F172A] text-amber-300 text-[8px] font-extrabold uppercase border-t border-slate-700">
                                  <th className="px-2 py-1 text-center">Energi</th>
                                  <th className="px-2 py-1 text-center">Protein</th>
                                  <th className="px-2 py-1 text-center">Lemak</th>
                                  <th className="px-2 py-1 text-center">KH</th>
                                  <th className="px-2 py-1 text-center">Serat</th>
                                  <th className="px-2 py-1 text-center">Energi</th>
                                  <th className="px-2 py-1 text-center">Protein</th>
                                  <th className="px-2 py-1 text-center">Lemak</th>
                                  <th className="px-2 py-1 text-center">KH</th>
                                  <th className="px-2 py-1 text-center">Serat</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {MBG_AKG_REFERENCE.map((ref) => (
                                  <tr key={ref.targetGroup} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 font-extrabold text-gray-800">{ref.targetGroup}</td>
                                    <td className="px-2 py-2 text-center font-bold text-amber-700">{ref.makanSiang.energi} kcal</td>
                                    <td className="px-2 py-2 text-center font-bold text-gray-700">{ref.makanSiang.protein} g</td>
                                    <td className="px-2 py-2 text-center font-bold text-gray-700">{ref.makanSiang.lemak} g</td>
                                    <td className="px-2 py-2 text-center font-bold text-gray-700">{ref.makanSiang.karbohidrat} g</td>
                                    <td className="px-2 py-2 text-center font-bold text-gray-700">{ref.makanSiang.serat} g</td>
                                    <td className="px-2 py-2 text-center font-medium text-gray-500">{ref.harian.energi} kcal</td>
                                    <td className="px-2 py-2 text-center font-medium text-gray-500">{ref.harian.protein} g</td>
                                    <td className="px-2 py-2 text-center font-medium text-gray-500">{ref.harian.lemak} g</td>
                                    <td className="px-2 py-2 text-center font-medium text-gray-500">{ref.harian.karbohidrat} g</td>
                                    <td className="px-2 py-2 text-center font-medium text-gray-500">{ref.harian.serat} g</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Collapsible Recipe Standards Section */}
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] mb-6 overflow-hidden shadow-sm font-['Hanken_Grotesk']">
                    <button
                      type="button"
                      onClick={() => setShowRecipeSummary(!showRecipeSummary)}
                      className="w-full px-5 py-4 bg-gray-50 flex items-center justify-between font-bold text-gray-800 text-xs hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🍳</span>
                        <span>Estimasi Kebutuhan Bahan Baku Batch (Standar Resep)</span>
                        <span className="text-[10px] font-normal text-gray-400">
                          ({recipeRequirements.length} Bahan Baku Terkalkulasi)
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-600 font-extrabold">
                        {showRecipeSummary ? 'Sembunyikan ↑' : 'Tampilkan Detail ↓'}
                      </span>
                    </button>

                    {showRecipeSummary && (
                      <div className="p-5 border-t border-[#E5E7EB] space-y-4">
                        {/* Search and Add controls */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-gray-50 p-4 rounded-xl border border-[#E2E8F0]">
                          <div className="space-y-0.5">
                            <p className="text-xs text-gray-800 font-extrabold">
                              Total kebutuhan bahan baku otomatis dihitung dari porsi PM aktif dan standar resep.
                            </p>
                            <p className="text-[10px] text-gray-400 font-bold">
                              Tim Produksi dapat menyesuaikan takaran atau menambahkan bahan baku tambahan secara manual.
                            </p>
                          </div>

                          <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
                            <div className="relative flex-1 md:w-60">
                              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                              <input
                                type="text"
                                value={recipeSearchQuery}
                                onChange={(e) => setRecipeSearchQuery(e.target.value)}
                                placeholder="Cari bahan baku atau menu..."
                                className="w-full bg-white border border-[#E5E7EB] rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
                              />
                              {recipeSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setRecipeSearchQuery('')}
                                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => setIsAddingCustomIngredient(!isAddingCustomIngredient)}
                              className="px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-extrabold rounded-lg shadow-sm transition-colors cursor-pointer shrink-0"
                            >
                              {isAddingCustomIngredient ? 'Tutup Form' : '+ Tambah Bahan'}
                            </button>
                          </div>
                        </div>

                        {/* Add Custom Ingredient Form */}
                        {isAddingCustomIngredient && (
                          <form
                            onSubmit={handleAddCustomIngredient}
                            className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end animate-in fade-in slide-in-from-top-2 duration-150"
                          >
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Nama Bahan Baku Tambahan</label>
                              <input
                                type="text"
                                required
                                value={newCustomIngredientName}
                                onChange={(e) => setNewCustomIngredientName(e.target.value)}
                                placeholder="Contoh: Saus Tiram / Tissue Makan"
                                className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#059669]"
                              />
                            </div>
                            <div>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Kuantitas</label>
                                  <input
                                    type="number"
                                    required
                                    min="1"
                                    value={newCustomIngredientAmount || ''}
                                    onChange={(e) => setNewCustomIngredientAmount(Number(e.target.value) || 0)}
                                    placeholder="Qty"
                                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#059669] text-center"
                                  />
                                </div>
                                <div className="w-20">
                                  <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Satuan</label>
                                  <select
                                    value={newCustomIngredientSatuan}
                                    onChange={(e) => setNewCustomIngredientSatuan(e.target.value)}
                                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-2 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#059669]"
                                  >
                                    <option value="g">g</option>
                                    <option value="ml">ml</option>
                                    <option value="pcs">pcs</option>
                                    <option value="kg">kg</option>
                                    <option value="Liter">Liter</option>
                                    <option value="ikat">ikat</option>
                                    <option value="siung">siung</option>
                                    <option value="lembar">lembar</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                            <button
                              type="submit"
                              disabled={isSavingAdjustment}
                              className="w-full py-2 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold rounded-lg shadow cursor-pointer transition-colors"
                            >
                              {isSavingAdjustment ? 'Menyimpan...' : 'Tambah ke Tabel'}
                            </button>
                          </form>
                        )}

                        {/* Ingredients Table */}
                        <div className="overflow-x-auto border border-gray-100 rounded-xl">
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="bg-amber-50 text-[10px] font-extrabold text-amber-800 uppercase tracking-wider border-b border-amber-100">
                                <th className="px-4 py-2.5 w-12">No</th>
                                <th className="px-4 py-2.5">Nama Bahan Baku</th>
                                <th className="px-4 py-2.5 text-center w-60">Estimasi Kebutuhan</th>
                                <th className="px-4 py-2.5">Keterangan / Menu Terkait</th>
                                <th className="px-4 py-2.5 text-center w-36">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {filteredRecipeRequirements.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="text-center py-6 text-gray-400 font-semibold">
                                    Bahan baku tidak ditemukan
                                  </td>
                                </tr>
                              ) : (
                                filteredRecipeRequirements.map((r, idx) => {
                                  const isEditing = editingIngredientName === r.name;

                                  // Format weight nicely for display
                                  let formattedWeight = '';
                                  if (r.satuan === 'g' && r.amount >= 1000) {
                                    formattedWeight = `${(r.amount / 1000).toFixed(2)} kg`;
                                  } else if (r.satuan === 'ml' && r.amount >= 1000) {
                                    formattedWeight = `${(r.amount / 1000).toFixed(2)} Liter`;
                                  } else {
                                    formattedWeight = `${r.amount.toFixed(1)} ${r.satuan}`;
                                  }

                                  return (
                                    <tr key={r.name} className="hover:bg-gray-50/50 transition-colors">
                                      <td className="px-4 py-3 text-gray-400 font-bold">{idx + 1}</td>
                                      <td className="px-4 py-3 font-bold text-gray-800">
                                        <div className="flex flex-col">
                                          <button
                                            type="button"
                                            onClick={() => setExpandedBahan(expandedBahan === r.name ? null : r.name)}
                                            className="text-left font-bold text-gray-800 hover:text-amber-700 hover:underline flex items-center gap-1.5 cursor-pointer focus:outline-none"
                                            title="Klik untuk melihat breakdown per resep/menu"
                                          >
                                            <span>{r.name}</span>
                                            <span className="text-[9px] text-[#A1A1AA] font-normal transition-transform duration-200">
                                              {expandedBahan === r.name ? '▲' : '▼'}
                                            </span>
                                            {r.isCustom && (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                                                Manual
                                              </span>
                                            )}
                                            {r.adjustmentId && !r.isCustom && (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                                                Disesuaikan
                                              </span>
                                            )}
                                          </button>

                                          {expandedBahan === r.name && (
                                            <div className="mt-2 p-3 rounded-xl bg-amber-50/40 border border-amber-100/60 text-[10px] font-medium space-y-1.5 text-gray-500 animate-fadeIn shadow-inner max-w-sm">
                                              <div className="font-extrabold text-[#92400E] border-b border-amber-100 pb-1 mb-1.5 uppercase tracking-wider text-[8px]">
                                                Kebutuhan Per Menu
                                              </div>
                                              {(r as { menuBreakdown?: { menuName: string; amount: number; satuan: string }[] }).menuBreakdown?.map((b: { menuName: string; amount: number; satuan: string }, bIdx: number) => {
                                                let breakdownWeight = '';
                                                if (b.satuan === 'g' && b.amount >= 1000) {
                                                  breakdownWeight = `${(b.amount / 1000).toFixed(2)} kg`;
                                                } else if (b.satuan === 'ml' && b.amount >= 1000) {
                                                  breakdownWeight = `${(b.amount / 1000).toFixed(2)} Liter`;
                                                } else {
                                                  breakdownWeight = `${b.amount.toFixed(1)} ${b.satuan}`;
                                                }
                                                return (
                                                  <div key={bIdx} className="flex justify-between items-center py-0.5">
                                                    <span className="font-bold text-[#1E293B]">{b.menuName}</span>
                                                    <span className="font-extrabold text-[#B45309] bg-white px-2 py-0.5 rounded border border-amber-100/50 shadow-sm">{breakdownWeight}</span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {isEditing ? (
                                          <div className="flex items-center justify-center gap-1.5">
                                            <input
                                              type="number"
                                              step="0.1"
                                              value={editingIngredientAmount}
                                              onChange={(e) => setEditingIngredientAmount(e.target.value)}
                                              className="w-24 px-2 py-1 text-xs border border-[#E2E8F0] rounded-lg text-center font-bold focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
                                            />
                                            <select
                                              value={editingIngredientSatuan}
                                              onChange={(e) => setEditingIngredientSatuan(e.target.value)}
                                              className="w-18 px-1.5 py-1 text-xs border border-[#E2E8F0] rounded-lg font-bold focus:outline-none"
                                            >
                                              <option value="g">g</option>
                                              <option value="ml">ml</option>
                                              <option value="pcs">pcs</option>
                                              <option value="kg">kg</option>
                                              <option value="Liter">Liter</option>
                                              <option value="ikat">ikat</option>
                                              <option value="siung">siung</option>
                                              <option value="lembar">lembar</option>
                                            </select>
                                          </div>
                                        ) : (
                                          <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-extrabold ${r.adjustmentId
                                              ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-sm'
                                              : 'bg-[#FEF3C7] text-[#92400E]'
                                            }`}>
                                            {formattedWeight}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 flex flex-wrap gap-1 items-center">
                                        {r.sourceMenus.map((m) => {
                                          const hasRecipe = combinedRecipes.some(
                                            (rec) => rec.namaMenu.toLowerCase().trim() === m.toLowerCase().trim()
                                          );
                                          return (
                                            <button
                                              key={m}
                                              type="button"
                                              onClick={() => handleOpenRecipeDetail(m)}
                                              title={hasRecipe ? `Klik untuk detail resep ${m}` : `Resep kustom belum terdaftar`}
                                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${hasRecipe
                                                  ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 hover:text-amber-900 cursor-pointer shadow-sm'
                                                  : 'bg-gray-100 text-gray-500 border border-gray-200 cursor-not-allowed'
                                                }`}
                                            >
                                              {m}
                                            </button>
                                          );
                                        })}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {isEditing ? (
                                          <div className="flex items-center justify-center gap-2">
                                            <button
                                              type="button"
                                              disabled={isSavingAdjustment}
                                              onClick={() => handleSaveIngredientAdjustment(r.name, Number(editingIngredientAmount) || 0, editingIngredientSatuan, r.adjustmentId)}
                                              className="px-2 py-1 bg-[#059669] hover:bg-[#047857] text-white text-[10px] font-extrabold rounded-md shadow cursor-pointer transition-colors"
                                            >
                                              ✓ Simpan
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingIngredientName(null)}
                                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-extrabold rounded-md cursor-pointer transition-colors"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingIngredientName(r.name);
                                                setEditingIngredientAmount(r.amount.toString());
                                                setEditingIngredientSatuan(r.satuan);
                                              }}
                                              className="px-2 py-1 border border-[#E2E8F0] hover:bg-gray-50 text-gray-700 text-[10px] font-bold rounded-md cursor-pointer transition-colors"
                                            >
                                              ✏️ Edit
                                            </button>
                                            {r.isCustom ? (
                                              <button
                                                type="button"
                                                onClick={() => handleResetIngredientAdjustment(r.name, r.adjustmentId)}
                                                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-bold rounded-md border border-red-200 cursor-pointer transition-colors"
                                              >
                                                Hapus
                                              </button>
                                            ) : r.adjustmentId ? (
                                              <button
                                                type="button"
                                                onClick={() => handleResetIngredientAdjustment(r.name, r.adjustmentId)}
                                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md border border-amber-200 cursor-pointer transition-colors"
                                                title="Kembalikan ke takaran resep standar"
                                              >
                                                Reset
                                              </button>
                                            ) : null}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Nutrition Section Header */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                        3. Analisis & Kadar Gizi Per Bahan Makanan (Bahan Baku Batch)
                      </h4>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                        Rincian kandungan gizi per jenis bahan makanan untuk batch operasional yang dipilih.
                      </p>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                    {[
                      { label: 'Total Kalori', value: `${nutritionTotals.kalori.toFixed(0)} kcal`, textColor: 'text-[#DC2626]' },
                      { label: 'Protein', value: `${nutritionTotals.protein.toFixed(1)} g`, textColor: 'text-[#2563EB]' },
                      { label: 'Lemak', value: `${nutritionTotals.lemak.toFixed(1)} g`, textColor: 'text-[#D97706]' },
                      { label: 'Karbohidrat', value: `${nutritionTotals.karbohidrat.toFixed(1)} g`, textColor: 'text-[#059669]' },
                      { label: 'Serat', value: `${nutritionTotals.serat.toFixed(1)} g`, textColor: 'text-[#7C3AED]' },
                    ].map(({ label, value, textColor }) => (
                      <div key={label} className="bg-white rounded-xl border border-[#E5E7EB] p-3">
                        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">{label}</p>
                        <p className={`text-lg font-extrabold mt-0.5 ${textColor}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Nutrition Table */}
                  <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-x-auto mb-4 min-h-[380px] pb-32">
                    <div className="min-w-[2300px] overflow-visible">
                      <table className="w-full text-xs font-['Hanken_Grotesk']">
                        <thead>
                          <tr className="bg-[#F3F4F6] text-[10px] font-extrabold text-[#6B7280] uppercase tracking-wider">
                            <th className="px-3 py-2.5 text-left min-w-[200px]">Bahan Makanan</th>
                            <th className="px-2 py-2.5 text-center">Qty</th>
                            <th className="px-2 py-2.5 text-center">Berat (g)</th>
                            {NUTRIENTS_LIST.map((nut) => (
                              <th key={nut.key} className="px-2 py-2.5 text-center min-w-[90px]">
                                {nut.label}
                              </th>
                            ))}
                            <th className="px-2 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {nutritionData.map((n) => (
                            <tr key={n.id} className="border-b border-[#F3F4F6] hover:bg-[#FAFAFA]">
                              <td className="px-3 py-2 relative">
                                <input
                                  type="text"
                                  value={focusedRowId === n.id ? searchQuery : n.menuItemName}
                                  onFocus={() => {
                                    setFocusedRowId(n.id);
                                    setSearchQuery(n.menuItemName);
                                  }}
                                  onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    handleUpdateNutrition(n.id, { menuItemName: e.target.value });
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      setFocusedRowId((curr) => (curr === n.id ? null : curr));
                                    }, 200);
                                  }}
                                  placeholder="Cari bahan makanan..."
                                  className="w-full rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                                />
                                {focusedRowId === n.id && suggestions.length > 0 && (
                                  <div className="absolute left-3 right-3 mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-lg max-h-60 overflow-y-auto z-50">
                                    {suggestions.map((item) => (
                                      <button
                                        key={item.kode || item.nama}
                                        type="button"
                                        onMouseDown={() => {
                                          handleUpdateNutrition(n.id, {
                                            menuItemName: item.nama,
                                          });
                                          setFocusedRowId(null);
                                          setSearchQuery('');
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#FEF3C7] hover:text-[#92400E] font-semibold transition-colors border-b border-[#F3F4F6] last:border-b-0 cursor-pointer"
                                      >
                                        {item.nama} <span className="text-[10px] text-gray-400 font-normal">({item.berat}g)</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min={1}
                                  value={n.quantity ?? ''}
                                  title="Quantity"
                                  placeholder="1"
                                  onChange={(e) => handleUpdateNutrition(n.id, { quantity: parseInt(e.target.value) || 1 })}
                                  className="w-14 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-xs text-center font-bold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none mx-auto block"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  value={n.berat ?? ''}
                                  title="Berat"
                                  placeholder="0"
                                  onChange={(e) => handleUpdateNutrition(n.id, { berat: parseFloat(e.target.value) || 0 })}
                                  className="w-16 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-xs text-center font-bold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none mx-auto block"
                                />
                              </td>
                              {NUTRIENTS_LIST.map((nut) => (
                                <td key={nut.key} className="px-2 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={n[nut.key] !== undefined && n[nut.key] !== null ? Number(n[nut.key]).toFixed(2).replace(/\.00$/, '') : ''}
                                    title={nut.label}
                                    placeholder="0"
                                    onChange={(e) => handleUpdateNutrition(n.id, { [nut.key]: parseFloat(e.target.value) || 0 })}
                                    className="w-16 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-xs text-center font-bold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none mx-auto block"
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => deleteNutritionEntry(n.id)}
                                  title="Hapus Item Gizi"
                                  aria-label="Hapus Item Gizi"
                                  className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={handleAddNutrition}
                      className="w-full py-2.5 text-xs font-bold text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] border-t border-[#E5E7EB] flex items-center justify-center gap-1.5 cursor-pointer">
                      <Plus className="h-3.5 w-3.5" /> Tambah Bahan Makanan
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 justify-end">
                    <button onClick={handleMarkNutritionDone}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#059669] text-white text-sm font-extrabold rounded-xl hover:bg-[#047857] cursor-pointer transition-colors shadow-lg shadow-green-500/20">
                      <CheckCircle2 className="h-4 w-4" /> Simpan Kadar Gizi
                    </button>
                    <button
                      onClick={() => handleExportPdf()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#111827] text-white text-sm font-extrabold rounded-xl hover:bg-[#1F2937] cursor-pointer transition-colors"
                    >
                      <FileDown className="h-4 w-4" /> Export PDF
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Google Sheets / Excel Import Modal */}
      {showSheetsImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full flex flex-col max-h-[90vh] border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="text-base font-extrabold flex items-center gap-2">
                  <span>📥 Import Google Sheets / Excel Laporan Harian</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Paste Link Google Sheets atau upload file Excel (.xlsx) untuk men-generate Laporan Harian Produksi
                </p>
              </div>
              <button
                onClick={() => setShowSheetsImportModal(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Option 1: Google Sheets URL */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  1. Paste Link Google Sheets (Public / Anyone with Link):
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={sheetsUrlInput}
                    onChange={(e) => setSheetsUrlInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1kKXUKYZ.../edit"
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    onClick={handleFetchGoogleSheets}
                    disabled={importingSheets}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {importingSheets ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>🔍 Baca Link</span>}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Contoh: <code className="bg-slate-100 px-1 py-0.5 rounded">https://docs.google.com/spreadsheets/d/1kKXUKYZ9mSak2NCa687t3pKCuMa-3CVMCAQaISp6S68/edit</code>
                </p>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-xs font-bold text-slate-400 uppercase">atau</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {/* Option 2: File Upload */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  2. Upload File Excel (.xlsx, .xls):
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUploadExcel}
                  disabled={importingSheets}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-extrabold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
              </div>

              {/* Available Sheet Selection with Smart Categorization */}
              {availableSheetNames.length > 0 && (() => {
                const pmSheetNames = availableSheetNames.filter((name) =>
                  name.toLowerCase().includes('penerima manfaat')
                );
                const dailySheetNames = availableSheetNames.filter((name) => {
                  const lower = name.toLowerCase();
                  return (
                    !lower.includes('penerima manfaat') &&
                    !lower.includes('standar resep') &&
                    !lower.includes('standar porsi') &&
                    !lower.includes('data bantu') &&
                    !lower.includes('akg') &&
                    !lower.includes('siklus menu')
                  );
                });
                const masterSheetNames = availableSheetNames.filter((name) => {
                  const lower = name.toLowerCase();
                  return (
                    lower.includes('standar resep') ||
                    lower.includes('standar porsi') ||
                    lower.includes('data bantu') ||
                    lower.includes('akg') ||
                    lower.includes('siklus menu')
                  );
                });

                return (
                  <div className="space-y-4 pt-1">
                    {/* Target Batch Option */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                        🎯 Target Batch Tanggal:
                      </span>
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-5">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                          <input
                            type="radio"
                            name="importTargetOption"
                            checked={importTargetOption === 'current_batch'}
                            onChange={() => setImportTargetOption('current_batch')}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Batch Aktif ({selectedBatch?.tanggal || 'Hari Ini'})</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                          <input
                            type="radio"
                            name="importTargetOption"
                            checked={importTargetOption === 'sheet_date'}
                            onChange={() => setImportTargetOption('sheet_date')}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Sesuai Tanggal pada Sheet</span>
                        </label>
                      </div>
                    </div>

                    {/* Group 1: Penerima Manfaat */}
                    {pmSheetNames.length > 0 && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2.5">
                        <div className="flex items-start sm:items-center justify-between flex-wrap gap-2">
                          <div>
                            <h4 className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                              <span>👥 Data Penerima Manfaat (27 Lembaga / Sekolah)</span>
                            </h4>
                            <p className="text-[11px] text-blue-800 mt-0.5">
                              Import daftar sekolah (PAUD, SD, SMP, SMA, Balita, Bumil, Busui) beserta jumlah murid & guru ke tabel pesanan batch.
                            </p>
                          </div>
                          {pmSheetNames.map((name) => (
                            <button
                              key={name}
                              onClick={() => handleImportPenerimaManfaatSheet(name)}
                              disabled={importingSheets}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                            >
                              {importingSheets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span>📥 Import 27 Sekolah ke Batch</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Group 2: Daily Production Reports */}
                    {dailySheetNames.length > 0 && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                        <div>
                          <h4 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                            <span>📅 Laporan Harian Operasional ({dailySheetNames.length} Sheet):</span>
                          </h4>
                          <p className="text-[11px] text-emerald-800 mt-0.5">
                            Pilih sheet tanggal produksi harian untuk meng-import Kandungan Gizi, Pesanan Bahan, Bumbu, PO, & QC:
                          </p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1">
                          {dailySheetNames.map((sheetName) => {
                            const parsedDate = parseSheetNameToDate(sheetName);
                            return (
                              <button
                                key={sheetName}
                                onClick={() => handleSelectSheetDay(sheetName)}
                                disabled={importingSheets}
                                className="py-2.5 px-3 bg-white border border-emerald-300 hover:bg-emerald-600 hover:text-white text-emerald-900 text-xs font-black rounded-xl shadow-xs transition-all text-center cursor-pointer disabled:opacity-50 flex flex-col items-center justify-center gap-0.5"
                              >
                                <span>{sheetName}</span>
                                {parsedDate && (
                                  <span className="text-[10px] font-semibold opacity-75">
                                    {parsedDate}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Group 3: Master Sheets */}
                    {masterSheetNames.length > 0 && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-500 block">
                          ℹ️ Sheet Referensi Master (bukan laporan produksi harian):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {masterSheetNames.map((name) => (
                            <span
                              key={name}
                              className="px-2.5 py-1 bg-slate-200/80 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-300/60"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Database TKPI Lookup Modal */}
      {showDbLookup && (
        <div className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[85vh] border border-[#E2E8F0]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#F1F5F9] flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-[#1E293B]">
                  {selectedDbItem
                    ? `Detail Gizi: ${selectedDbItem.nama}`
                    : isAddingDbItem
                      ? 'Tambah Bahan Pangan Baru'
                      : 'Referensi Kandungan Pangan Indonesia (TKPI)'
                  }
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {selectedDbItem
                    ? `Kadar gizi per 100g berat layak makan (BDD)`
                    : isAddingDbItem
                      ? 'Masukkan data gizi bahan pangan baru per 100g'
                      : 'Cari & lihat informasi gizi dari database TKPI 2020 resmi'
                  }
                </p>
              </div>
              <button
                onClick={() => {
                  if (selectedDbItem) {
                    setSelectedDbItem(null);
                  } else if (isAddingDbItem) {
                    setIsAddingDbItem(false);
                  } else {
                    setShowDbLookup(false);
                  }
                }}
                title="Tutup"
                aria-label="Tutup"
                className="p-1.5 hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer text-[#64748B]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto font-['Hanken_Grotesk']">
              {selectedDbItem ? (
                /* Detail View */
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
                    {[
                      { label: 'Air', val: selectedDbItem.air, unit: 'g' },
                      { label: 'Energi (Kalori)', val: selectedDbItem.energi, unit: 'kcal' },
                      { label: 'Protein', val: selectedDbItem.protein, unit: 'g' },
                      { label: 'Lemak', val: selectedDbItem.lemak, unit: 'g' },
                      { label: 'Karbohidrat (KH)', val: selectedDbItem.kh, unit: 'g' },
                      { label: 'Serat', val: selectedDbItem.serat, unit: 'g' },
                      { label: 'Abu', val: selectedDbItem.abu, unit: 'g' },
                      { label: 'Kalsium', val: selectedDbItem.kalsium, unit: 'mg' },
                      { label: 'Fosfor', val: selectedDbItem.fosfor, unit: 'mg' },
                      { label: 'Besi', val: selectedDbItem.besi, unit: 'mg' },
                      { label: 'Natrium', val: selectedDbItem.natrium, unit: 'mg' },
                      { label: 'Kalium', val: selectedDbItem.kalium, unit: 'mg' },
                      { label: 'Tembaga', val: selectedDbItem.tembaga, unit: 'mg' },
                      { label: 'Seng', val: selectedDbItem.seng, unit: 'mg' },
                      { label: 'Retinol (Vit A)', val: selectedDbItem.retinol, unit: 'mcg' },
                      { label: 'Bkar', val: selectedDbItem.bkar, unit: 'mcg' },
                      { label: 'Kartotal', val: selectedDbItem.kartotal, unit: 'mcg' },
                      { label: 'Thiamin', val: selectedDbItem.thiamin, unit: 'mg' },
                      { label: 'Riboflavin', val: selectedDbItem.riboflavin, unit: 'mg' },
                      { label: 'Niasin', val: selectedDbItem.niasin, unit: 'mg' },
                      { label: 'Vit C', val: selectedDbItem.vit_c, unit: 'mg' },
                    ].map((item) => (
                      <div key={item.label} className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-3 text-center">
                        <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">{item.label}</p>
                        <p className="text-sm font-extrabold text-[#0F172A] mt-0.5">
                          {item.val !== undefined && item.val !== null ? Number(item.val).toFixed(2).replace(/\.00$/, '') : '0'} {item.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 justify-end border-t border-[#F1F5F9] pt-4 flex-wrap">
                    <button
                      onClick={() => setSelectedDbItem(null)}
                      className="px-4 py-2 border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-bold text-[#334155] rounded-xl cursor-pointer transition-colors"
                    >
                      Kembali ke Daftar
                    </button>

                    <button
                      onClick={() => {
                        const item = selectedDbItem;
                        const customItem = item as { id?: string };
                        setEditingDbItemId(customItem.id || null);
                        setNewDbItem({
                          nama: item.nama || '',
                          kode: item.kode || '',
                          sumber: item.sumber || 'Input Manual',
                          berat: Number(item.berat) || 100,
                          air: Number(item.air) || 0,
                          energi: Number(item.energi) || 0,
                          protein: Number(item.protein) || 0,
                          lemak: Number(item.lemak) || 0,
                          kh: Number(item.kh) || 0,
                          serat: Number(item.serat) || 0,
                          abu: Number(item.abu) || 0,
                          kalsium: Number(item.kalsium) || 0,
                          fosfor: Number(item.fosfor) || 0,
                          besi: Number(item.besi) || 0,
                          natrium: Number(item.natrium) || 0,
                          kalium: Number(item.kalium) || 0,
                          tembaga: Number(item.tembaga) || 0,
                          seng: Number(item.seng) || 0,
                          retinol: Number(item.retinol) || 0,
                          bkar: Number(item.bkar) || 0,
                          kartotal: Number(item.kartotal) || 0,
                          thiamin: Number(item.thiamin) || 0,
                          riboflavin: Number(item.riboflavin) || 0,
                          niasin: Number(item.niasin) || 0,
                          vit_c: Number(item.vit_c) || 0,
                        });
                        setIsAddingDbItem(true);
                        setSelectedDbItem(null);
                      }}
                      className="px-4 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                    >
                      Edit Bahan Gizi
                    </button>

                    {/* Only custom TKPI entries can be deleted */}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(selectedDbItem as any).id && (
                      <button
                        onClick={async () => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const customItem = selectedDbItem as any;
                          if (window.confirm(`Apakah Anda yakin ingin menghapus bahan gizi custom "${selectedDbItem.nama}"?`)) {
                            try {
                              await deleteCustomTkpiEntry(customItem.id);
                              showToast({ message: 'Bahan gizi custom berhasil dihapus!', variant: 'success' });
                              setSelectedDbItem(null);
                            } catch (err) {
                              console.error(err);
                              showToast({ message: 'Gagal menghapus bahan gizi', variant: 'error' });
                            }
                          }
                        }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                      >
                        Hapus
                      </button>
                    )}

                    <button
                      onClick={() => {
                        handleCopyName(selectedDbItem.nama);
                      }}
                      className="px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                    >
                      Salin Nama Bahan
                    </button>
                  </div>
                </div>
              ) : isAddingDbItem ? (
                /* Add New Database Item Form */
                <form onSubmit={handleSaveNewDbItem} className="space-y-6">
                  {/* Section: Utama */}
                  <div>
                    <h4 className="text-xs font-extrabold text-[#1E293B] uppercase tracking-wider mb-3">Informasi Utama</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Nama Bahan *</label>
                        <input
                          type="text"
                          required
                          value={newDbItem.nama}
                          onChange={(e) => setNewDbItem({ ...newDbItem, nama: e.target.value })}
                          placeholder="Contoh: Tempe Goreng Spesial"
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Kode Bahan (Opsional)</label>
                        <input
                          type="text"
                          value={newDbItem.kode}
                          onChange={(e) => setNewDbItem({ ...newDbItem, kode: e.target.value })}
                          placeholder="Contoh: CUSTOM-001"
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Berat Acuan / BDD (gram)</label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={newDbItem.berat}
                          onChange={(e) => setNewDbItem({ ...newDbItem, berat: parseFloat(e.target.value) || 100 })}
                          placeholder="100"
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section: Makro */}
                  <div>
                    <h4 className="text-xs font-extrabold text-[#1E293B] uppercase tracking-wider mb-3">Kandungan Makro (per 100g)</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
                      {[
                        { label: 'Energi (kcal)', key: 'energi' },
                        { label: 'Protein (g)', key: 'protein' },
                        { label: 'Lemak (g)', key: 'lemak' },
                        { label: 'Karbohidrat (g)', key: 'kh' },
                        { label: 'Serat (g)', key: 'serat' },
                        { label: 'Air (g)', key: 'air' },
                        { label: 'Abu (g)', key: 'abu' },
                      ].map((item) => (
                        <div key={item.key}>
                          <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">{item.label}</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            title={item.label}
                            placeholder="0"
                            value={(newDbItem as Record<string, string | number>)[item.key]}
                            onChange={(e) => setNewDbItem({ ...newDbItem, [item.key]: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none text-center"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section: Mikro & Mineral */}
                  <div>
                    <h4 className="text-xs font-extrabold text-[#1E293B] uppercase tracking-wider mb-3">Kandungan Mikro & Mineral</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
                      {[
                        { label: 'Kalsium (mg)', key: 'kalsium' },
                        { label: 'Fosfor (mg)', key: 'fosfor' },
                        { label: 'Zat Besi (mg)', key: 'besi' },
                        { label: 'Natrium (mg)', key: 'natrium' },
                        { label: 'Kalium (mg)', key: 'kalium' },
                        { label: 'Tembaga (mg)', key: 'tembaga' },
                        { label: 'Seng (mg)', key: 'seng' },
                      ].map((item) => (
                        <div key={item.key}>
                          <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">{item.label}</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            title={item.label}
                            placeholder="0"
                            value={(newDbItem as Record<string, string | number>)[item.key]}
                            onChange={(e) => setNewDbItem({ ...newDbItem, [item.key]: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none text-center"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section: Vitamin */}
                  <div>
                    <h4 className="text-xs font-extrabold text-[#1E293B] uppercase tracking-wider mb-3">Vitamin</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
                      {[
                        { label: 'Retinol (mcg)', key: 'retinol' },
                        { label: 'Bkar (mcg)', key: 'bkar' },
                        { label: 'Kartotal (mcg)', key: 'kartotal' },
                        { label: 'Thiamin (mg)', key: 'thiamin' },
                        { label: 'Riboflavin (mg)', key: 'riboflavin' },
                        { label: 'Niasin (mg)', key: 'niasin' },
                        { label: 'Vit C (mg)', key: 'vit_c' },
                      ].map((item) => (
                        <div key={item.key}>
                          <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">{item.label}</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            title={item.label}
                            placeholder="0"
                            value={(newDbItem as Record<string, string | number>)[item.key]}
                            onChange={(e) => setNewDbItem({ ...newDbItem, [item.key]: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none text-center"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 justify-end border-t border-[#F1F5F9] pt-4">
                    <button
                      type="button"
                      onClick={() => setIsAddingDbItem(false)}
                      className="px-4 py-2 border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-bold text-[#334155] rounded-xl cursor-pointer transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingDbItem}
                      className="px-4 py-2 bg-[#059669] hover:bg-[#047857] disabled:bg-gray-400 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors flex items-center gap-1.5"
                    >
                      {isSavingDbItem ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <span>Simpan Bahan Pangan</span>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* List & Search View */
                <div className="flex flex-col h-full">
                  <div className="flex gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
                      <input
                        type="text"
                        placeholder="Cari kode atau nama bahan makanan..."
                        value={dbSearchQuery}
                        onChange={(e) => setDbSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-[#E2E8F0] rounded-xl text-xs focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => setIsAddingDbItem(true)}
                      className="px-4 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-extrabold rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                      + Tambah Bahan Baru
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl max-h-[450px]">
                    <table className="w-full text-xs text-left min-w-[650px]">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                          <th className="px-4 py-2.5">Kode</th>
                          <th className="px-4 py-2.5">Nama Bahan</th>
                          <th className="px-3 py-2.5 text-center">Energi</th>
                          <th className="px-3 py-2.5 text-center">Protein</th>
                          <th className="px-3 py-2.5 text-center">Lemak</th>
                          <th className="px-3 py-2.5 text-center">KH</th>
                          <th className="px-3 py-2.5 text-center">Serat</th>
                          <th className="px-4 py-2.5 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbSearchResults.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-[#64748B]">
                              Bahan makanan tidak ditemukan.
                            </td>
                          </tr>
                        ) : (
                          dbSearchResults.map((item) => (
                            <tr key={item.kode || item.nama} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                              <td className="px-4 py-3 font-semibold text-[#64748B]">{item.kode || '-'}</td>
                              <td className="px-4 py-3 font-bold text-[#0F172A]">{item.nama}</td>
                              <td className="px-3 py-3 text-center">{item.energi} kcal</td>
                              <td className="px-3 py-3 text-center">{item.protein} g</td>
                              <td className="px-3 py-3 text-center">{item.lemak} g</td>
                              <td className="px-3 py-3 text-center">{item.kh} g</td>
                              <td className="px-3 py-3 text-center">{item.serat} g</td>
                              <td className="px-4 py-3 text-center flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => setSelectedDbItem(item)}
                                  className="px-2 py-1 text-[10px] font-bold text-[#2563EB] hover:bg-[#DBEAFE] rounded-md transition-colors cursor-pointer"
                                >
                                  Detail
                                </button>
                                <button
                                  onClick={() => {
                                    const customItem = item as { id?: string };
                                    setEditingDbItemId(customItem.id || null);
                                    setNewDbItem({
                                      nama: item.nama || '',
                                      kode: item.kode || '',
                                      sumber: item.sumber || 'Input Manual',
                                      berat: Number(item.berat) || 100,
                                      air: Number(item.air) || 0,
                                      energi: Number(item.energi) || 0,
                                      protein: Number(item.protein) || 0,
                                      lemak: Number(item.lemak) || 0,
                                      kh: Number(item.kh) || 0,
                                      serat: Number(item.serat) || 0,
                                      abu: Number(item.abu) || 0,
                                      kalsium: Number(item.kalsium) || 0,
                                      fosfor: Number(item.fosfor) || 0,
                                      besi: Number(item.besi) || 0,
                                      natrium: Number(item.natrium) || 0,
                                      kalium: Number(item.kalium) || 0,
                                      tembaga: Number(item.tembaga) || 0,
                                      seng: Number(item.seng) || 0,
                                      retinol: Number(item.retinol) || 0,
                                      bkar: Number(item.bkar) || 0,
                                      kartotal: Number(item.kartotal) || 0,
                                      thiamin: Number(item.thiamin) || 0,
                                      riboflavin: Number(item.riboflavin) || 0,
                                      niasin: Number(item.niasin) || 0,
                                      vit_c: Number(item.vit_c) || 0,
                                    });
                                    setIsAddingDbItem(true);
                                  }}
                                  className="px-2 py-1 text-[10px] font-bold text-[#F59E0B] hover:bg-amber-100 rounded-md transition-colors cursor-pointer"
                                >
                                  Edit
                                </button>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {(item as any).id && (
                                  <button
                                    onClick={async () => {
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const customItem = item as any;
                                      if (window.confirm(`Apakah Anda yakin ingin menghapus bahan gizi custom "${item.nama}"?`)) {
                                        try {
                                          await deleteCustomTkpiEntry(customItem.id);
                                          showToast({ message: 'Bahan gizi custom berhasil dihapus!', variant: 'success' });
                                        } catch (err) {
                                          console.error(err);
                                          showToast({ message: 'Gagal menghapus bahan gizi', variant: 'error' });
                                        }
                                      }
                                    }}
                                    className="px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                  >
                                    Hapus
                                  </button>
                                )}
                                <button
                                  onClick={() => handleCopyName(item.nama)}
                                  className="px-2 py-1 text-[10px] font-bold text-[#059669] hover:bg-[#D1FAE5] rounded-md transition-colors cursor-pointer"
                                >
                                  Salin
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {filteredDbItems.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-[#E2E8F0] text-xs">
                      <span className="text-[#64748B] font-medium text-center sm:text-left">
                        Menampilkan <span className="font-bold text-[#0F172A]">{(dbPage - 1) * 50 + 1}</span> - <span className="font-bold text-[#0F172A]">{Math.min(dbPage * 50, filteredDbItems.length)}</span> dari <span className="font-bold text-[#0F172A]">{filteredDbItems.length}</span> bahan pangan
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDbPage((p) => Math.max(p - 1, 1))}
                          disabled={dbPage === 1}
                          className="px-3 py-1.5 border border-[#E2E8F0] rounded-xl hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-[#64748B] cursor-pointer transition-colors"
                        >
                          Sebelumnya
                        </button>
                        <span className="px-2 font-bold text-[#0F172A]">
                          Halaman {dbPage} dari {totalDbPages}
                        </span>
                        <button
                          onClick={() => setDbPage((p) => Math.min(p + 1, totalDbPages))}
                          disabled={dbPage === totalDbPages}
                          className="px-3 py-1.5 border border-[#E2E8F0] rounded-xl hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-[#64748B] cursor-pointer transition-colors"
                        >
                          Selanjutnya
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showRecipeBook && (
        <div className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[85vh] border border-[#E2E8F0] font-['Hanken_Grotesk']">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#F1F5F9]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-[#1E293B]">
                    {selectedRecipeItem
                      ? `Detail Resep: ${selectedRecipeItem.namaMenu}`
                      : 'Pedoman Standar Resep, Porsi & Bahan Pangan MBG'
                    }
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    {selectedRecipeItem
                      ? `Bahan dan takaran standar porsi masakan`
                      : `Daftar ${combinedRecipes.length} resep masakan & ${MBG_INFORMASI_BAHAN_PANGAN.length} spesifikasi bahan pangan terintegrasi`
                    }
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedRecipeItem) {
                      setSelectedRecipeItem(null);
                    } else {
                      setShowRecipeBook(false);
                    }
                  }}
                  title="Tutup"
                  aria-label="Tutup"
                  className="p-1.5 hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer text-[#64748B]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!selectedRecipeItem && !isAddingRecipe && (
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setRecipeModalTab('resep')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${recipeModalTab === 'resep'
                        ? 'bg-[#15803D] text-white shadow-sm'
                        : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                      }`}
                  >
                    📖 Standar Resep & Porsi ({combinedRecipes.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipeModalTab('bahanPangan')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${recipeModalTab === 'bahanPangan'
                        ? 'bg-[#15803D] text-white shadow-sm'
                        : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                      }`}
                  >
                    🥗 Informasi & Kategori Bahan Pangan ({MBG_INFORMASI_BAHAN_PANGAN.length})
                  </button>
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto font-['Hanken_Grotesk']">
              {recipeModalTab === 'bahanPangan' && !selectedRecipeItem && !isAddingRecipe ? (
                /* Informasi & Kategori Bahan Pangan View */
                <div className="space-y-4">
                  {/* Search and Category Filters */}
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="relative flex-1 w-full">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
                      <input
                        type="text"
                        placeholder="Cari nama bahan pangan..."
                        value={bahanPanganQuery}
                        onChange={(e) => setBahanPanganQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-[#E2E8F0] rounded-xl text-xs focus:ring-2 focus:ring-[#15803D] focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                      <button
                        type="button"
                        onClick={() => setSelectedBahanCategory('all')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${selectedBahanCategory === 'all'
                            ? 'bg-[#1E293B] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
                        Semua ({MBG_INFORMASI_BAHAN_PANGAN.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBahanCategory('utama')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${selectedBahanCategory === 'utama'
                            ? 'bg-[#15803D] text-white'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                      >
                        Bahan Utama ({MBG_KATEGORI_BAHAN_PANGAN.bahanUtama.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBahanCategory('pelengkap')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${selectedBahanCategory === 'pelengkap'
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                      >
                        Bumbu Pelengkap ({MBG_KATEGORI_BAHAN_PANGAN.bumbuPelengkap.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBahanCategory('dasar')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${selectedBahanCategory === 'dasar'
                            ? 'bg-amber-600 text-white'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                      >
                        Bumbu Dasar ({MBG_KATEGORI_BAHAN_PANGAN.bumbuDasar.length})
                      </button>
                    </div>
                  </div>

                  {/* Bahan Pangan Table */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-[#F8FAFC] text-[10px] font-extrabold text-[#64748B] uppercase border-b border-[#E2E8F0]">
                          <th className="px-4 py-3">Nama Bahan</th>
                          <th className="px-4 py-3 text-center">Kategori</th>
                          <th className="px-4 py-3 text-center">% BDD</th>
                          <th className="px-4 py-3 text-right">Harga Estimasi</th>
                          <th className="px-4 py-3 text-center">Satuan / Unit Beli</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {MBG_INFORMASI_BAHAN_PANGAN
                          .filter((b) => {
                            const matchQuery = b.namaBahan.toLowerCase().includes(bahanPanganQuery.toLowerCase());
                            if (!matchQuery) return false;

                            if (selectedBahanCategory === 'utama') {
                              return MBG_KATEGORI_BAHAN_PANGAN.bahanUtama.includes(b.namaBahan);
                            }
                            if (selectedBahanCategory === 'pelengkap') {
                              return MBG_KATEGORI_BAHAN_PANGAN.bumbuPelengkap.includes(b.namaBahan);
                            }
                            if (selectedBahanCategory === 'dasar') {
                              return MBG_KATEGORI_BAHAN_PANGAN.bumbuDasar.includes(b.namaBahan);
                            }
                            return true;
                          })
                          .map((b) => {
                            const isUtama = MBG_KATEGORI_BAHAN_PANGAN.bahanUtama.includes(b.namaBahan);
                            const isPelengkap = MBG_KATEGORI_BAHAN_PANGAN.bumbuPelengkap.includes(b.namaBahan);
                            const isDasar = MBG_KATEGORI_BAHAN_PANGAN.bumbuDasar.includes(b.namaBahan);

                            return (
                              <tr key={b.namaBahan} className="hover:bg-amber-50/20 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-gray-800">{b.namaBahan}</td>
                                <td className="px-4 py-2.5 text-center">
                                  {isUtama && (
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[9px] font-extrabold uppercase">
                                      Bahan Utama
                                    </span>
                                  )}
                                  {isPelengkap && (
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[9px] font-extrabold uppercase">
                                      Bumbu Pelengkap
                                    </span>
                                  )}
                                  {isDasar && (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[9px] font-extrabold uppercase">
                                      Bumbu Dasar
                                    </span>
                                  )}
                                  {!isUtama && !isPelengkap && !isDasar && (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[9px] font-semibold">
                                      Lainnya
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center font-bold text-gray-700">{b.bdd}%</td>
                                <td className="px-4 py-2.5 text-right font-extrabold text-emerald-700">
                                  {b.harga > 0 ? `Rp ${b.harga.toLocaleString('id-ID')}` : '-'}
                                </td>
                                <td className="px-4 py-2.5 text-center text-gray-600 font-semibold">
                                  {b.satuan} ({b.unitBeli} unit)
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : isAddingRecipe ? (
                /* Add/Edit Recipe Form View */
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newRecipeName.trim() || !newRecipeMainBahan.trim()) {
                      showToast({ message: 'Nama Resep dan Bahan Utama wajib diisi!', variant: 'error' });
                      return;
                    }
                    setIsSavingRecipe(true);
                    try {
                      const filteredIngs = newRecipeIngredients.filter((ing) => ing.bahan.trim() !== '');
                      const finalIngredients = [
                        {
                          bahan: newRecipeMainBahan,
                          kebutuhan: newRecipeBaseQty,
                          satuan: newRecipeSatuanMainBahan,
                          resepPer: newRecipeBaseQty
                        },
                        ...filteredIngs
                      ];

                      const recipeData = {
                        namaMenu: newRecipeName.trim(),
                        jenisMenu: newRecipeCategory,
                        mainBahan: newRecipeMainBahan.trim(),
                        baseQty: newRecipeBaseQty,
                        satuanMainBahan: newRecipeSatuanMainBahan,
                        porsiKecil: newRecipePorsiKecil,
                        porsiBesar: newRecipePorsiBesar,
                        ingredients: finalIngredients
                      };

                      if (editingRecipeId) {
                        await updateCustomRecipe(editingRecipeId, recipeData);
                        showToast({ message: 'Resep berhasil di-update!', variant: 'success' });
                      } else {
                        await addCustomRecipe(recipeData);
                        showToast({ message: 'Resep baru berhasil disimpan!', variant: 'success' });
                      }

                      setIsAddingRecipe(false);
                      setEditingRecipeId(null);
                    } catch (err) {
                      console.error('Error saving custom recipe:', err);
                      showToast({ message: 'Gagal menyimpan resep', variant: 'error' });
                    } finally {
                      setIsSavingRecipe(false);
                    }
                  }}
                  className="space-y-5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nama Resep / Menu</label>
                      <input
                        type="text"
                        required
                        value={newRecipeName}
                        onChange={(e) => setNewRecipeName(e.target.value)}
                        placeholder="Contoh: Ayam Goreng Penyet"
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Kategori Menu</label>
                      <select
                        value={newRecipeCategory}
                        onChange={(e) => setNewRecipeCategory(e.target.value)}
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                      >
                        <option value="Karbohidrat (Nasi)">Karbohidrat (Nasi)</option>
                        <option value="Lauk Hewani (Ayam)">Lauk Hewani (Ayam)</option>
                        <option value="Lauk Hewani (Daging Sapi)">Lauk Hewani (Daging Sapi)</option>
                        <option value="Lauk Hewani (Telur)">Lauk Hewani (Telur)</option>
                        <option value="Lauk Hewani (Ikan)">Lauk Hewani (Ikan)</option>
                        <option value="Lauk Nabati (Tahu)">Lauk Nabati (Tahu)</option>
                        <option value="Lauk Nabati (Tempe)">Lauk Nabati (Tempe)</option>
                        <option value="Sayur">Sayur</option>
                        <option value="Buah">Buah</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1">Bahan Utama Resep</label>
                      <input
                        type="text"
                        required
                        value={newRecipeMainBahan}
                        onChange={(e) => setNewRecipeMainBahan(e.target.value)}
                        placeholder="Contoh: Ayam Potong / Daging Slice"
                        className="w-full bg-white rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1">Base Kuantitas</label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={newRecipeBaseQty}
                        onChange={(e) => setNewRecipeBaseQty(Number(e.target.value) || 0)}
                        className="w-full bg-white rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1">Satuan</label>
                      <select
                        value={newRecipeSatuanMainBahan}
                        onChange={(e) => setNewRecipeSatuanMainBahan(e.target.value)}
                        className="w-full bg-white rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                      >
                        <option value="g">g (Gram)</option>
                        <option value="ml">ml (Mililiter)</option>
                        <option value="pcs">pcs (Butir/Potong)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Porsi Kecil (Siswa/Balita) - gram/unit</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={newRecipePorsiKecil}
                        onChange={(e) => setNewRecipePorsiKecil(Number(e.target.value) || 0)}
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Porsi Besar (Guru/Bumil) - gram/unit</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={newRecipePorsiBesar}
                        onChange={(e) => setNewRecipePorsiBesar(Number(e.target.value) || 0)}
                        className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-extrabold text-[#1E293B] uppercase tracking-wider">Bahan Pendukung & Bumbu</h4>
                      <button
                        type="button"
                        onClick={() => setNewRecipeIngredients([...newRecipeIngredients, { bahan: '', kebutuhan: 0, satuan: 'g', resepPer: '' }])}
                        className="text-[10px] font-extrabold text-[#059669] hover:text-[#047857] flex items-center gap-0.5 cursor-pointer"
                      >
                        + Tambah Baris Bahan
                      </button>
                    </div>

                    <div className="border border-gray-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto space-y-2 p-2 bg-gray-50">
                      {newRecipeIngredients.length === 0 ? (
                        <p className="text-center py-4 text-xs text-gray-400 font-bold">Belum ada bahan pendukung.</p>
                      ) : (
                        newRecipeIngredients.map((ing, index) => (
                          <div key={index} className="flex gap-2 items-center bg-white p-2 rounded-lg border border-gray-100">
                            <input
                              type="text"
                              placeholder="Nama Bumbu / Bahan Pendukung..."
                              value={ing.bahan}
                              onChange={(e) => {
                                const updated = [...newRecipeIngredients];
                                updated[index].bahan = e.target.value;
                                setNewRecipeIngredients(updated);
                              }}
                              className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
                            />
                            <input
                              type="number"
                              placeholder="Qty..."
                              value={ing.kebutuhan || ''}
                              onChange={(e) => {
                                const updated = [...newRecipeIngredients];
                                updated[index].kebutuhan = Number(e.target.value) || 0;
                                setNewRecipeIngredients(updated);
                              }}
                              className="w-20 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold text-center focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
                            />
                            <select
                              value={ing.satuan}
                              onChange={(e) => {
                                const updated = [...newRecipeIngredients];
                                updated[index].satuan = e.target.value;
                                setNewRecipeIngredients(updated);
                              }}
                              className="w-24 rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
                            >
                              <option value="g">g</option>
                              <option value="ml">ml</option>
                              <option value="pcs">pcs</option>
                              <option value="ikat">ikat</option>
                              <option value="siung">siung</option>
                              <option value="ruas">ruas</option>
                              <option value="lembar">lembar</option>
                            </select>
                            <input
                              type="text"
                              placeholder="Keterangan..."
                              value={ing.resepPer}
                              onChange={(e) => {
                                const updated = [...newRecipeIngredients];
                                updated[index].resepPer = e.target.value;
                                setNewRecipeIngredients(updated);
                              }}
                              className="w-32 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setNewRecipeIngredients(newRecipeIngredients.filter((_, idx) => idx !== index))}
                              className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-lg cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end border-t border-[#F1F5F9] pt-4">
                    <button
                      type="button"
                      onClick={() => setIsAddingRecipe(false)}
                      className="px-4 py-2 border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-bold text-[#334155] rounded-xl cursor-pointer transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingRecipe}
                      className="px-4 py-2 bg-[#059669] hover:bg-[#047857] disabled:bg-gray-400 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors flex items-center gap-1.5"
                    >
                      {isSavingRecipe ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <span>Simpan Resep</span>
                      )}
                    </button>
                  </div>
                </form>
              ) : selectedRecipeItem ? (
                /* Detail Recipe View */
                <div>
                  <div className="mb-6 bg-amber-50/50 p-4 rounded-xl border border-amber-100 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Kategori Menu:</span>
                      <p className="text-sm font-extrabold text-amber-900">{selectedRecipeItem.jenisMenu}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Bahan Utama & Base Resep:</span>
                      <p className="text-sm font-extrabold text-amber-900">
                        {selectedRecipeItem.mainBahan} ({selectedRecipeItem.baseQty} {selectedRecipeItem.satuanMainBahan})
                      </p>
                    </div>
                    <div>
                      {/* Check standard portion sizes */}
                      {(() => {
                        const porsiCfg = combinedPorsi.find(
                          (p) => p.namaMenu.toLowerCase().trim() === selectedRecipeItem.namaMenu.toLowerCase().trim()
                        );
                        if (!porsiCfg) return null;
                        return (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Porsi Standard:</span>
                            <p className="text-xs font-extrabold text-amber-900">
                              Kecil: {porsiCfg.porsiKecil}g | Besar: {porsiCfg.porsiBesar}g
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider mb-3">Daftar Bahan Pendukung & Bumbu</h4>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-gray-50 text-[10px] font-extrabold text-gray-600 uppercase border-b border-gray-100">
                          <th className="px-4 py-2.5">Nama Bahan</th>
                          <th className="px-4 py-2.5 text-center">Takaran (Base Resep)</th>
                          <th className="px-4 py-2.5 text-center">Satuan</th>
                          <th className="px-4 py-2.5 text-center">% BDD</th>
                          <th className="px-4 py-2.5 text-right">Harga Est.</th>
                          <th className="px-4 py-2.5">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedRecipeItem.ingredients.map((ing) => {
                          const info = getBahanPanganInfo(ing.bahan);
                          return (
                            <tr key={ing.bahan} className="hover:bg-gray-50/50">
                              <td className="px-4 py-2.5 font-bold text-gray-800">{ing.bahan}</td>
                              <td className="px-4 py-2.5 text-center font-extrabold text-amber-700">{ing.kebutuhan}</td>
                              <td className="px-4 py-2.5 text-center font-semibold text-gray-500">{ing.satuan}</td>
                              <td className="px-4 py-2.5 text-center text-gray-600 font-semibold">{info ? `${info.bdd}%` : '-'}</td>
                              <td className="px-4 py-2.5 text-right font-extrabold text-emerald-700">
                                {info && info.harga > 0 ? `Rp ${info.harga.toLocaleString('id-ID')}` : '-'}
                              </td>
                              <td className="px-4 py-2.5 text-gray-400 font-medium">{ing.resepPer || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3 items-center justify-between border-t border-gray-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setSelectedRecipeItem(null)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 rounded-xl cursor-pointer transition-colors"
                    >
                      ← Kembali ke Daftar Resep
                    </button>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const recipe = selectedRecipeItem;
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const customRecipe = recipe as any;
                          setEditingRecipeId(customRecipe.id || null);
                          setNewRecipeName(recipe.namaMenu);
                          setNewRecipeCategory(recipe.jenisMenu);
                          setNewRecipeMainBahan(recipe.mainBahan);
                          setNewRecipeBaseQty(recipe.baseQty);
                          setNewRecipeSatuanMainBahan(recipe.satuanMainBahan);

                          // Look up portion standard
                          const porsiCfg = combinedPorsi.find(
                            (p) => p.namaMenu.toLowerCase().trim() === recipe.namaMenu.toLowerCase().trim()
                          );
                          setNewRecipePorsiKecil(porsiCfg?.porsiKecil || recipe.porsiKecil || 50);
                          setNewRecipePorsiBesar(porsiCfg?.porsiBesar || recipe.porsiBesar || 60);

                          // Support/bumbum is slice(1)
                          const supportIngs = recipe.ingredients.slice(1).map((ing) => ({
                            bahan: ing.bahan,
                            kebutuhan: ing.kebutuhan,
                            satuan: ing.satuan,
                            resepPer: String(ing.resepPer || '')
                          }));
                          setNewRecipeIngredients(supportIngs.length > 0 ? supportIngs : [{ bahan: '', kebutuhan: 0, satuan: 'g', resepPer: '' }]);

                          setIsAddingRecipe(true);
                          setSelectedRecipeItem(null);
                        }}
                        className="px-4 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                      >
                        Edit Resep
                      </button>

                      {/* Only custom recipes can be deleted */}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(selectedRecipeItem as any).id && (
                        <button
                          type="button"
                          onClick={async () => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const customRecipe = selectedRecipeItem as any;
                            if (window.confirm(`Apakah Anda yakin ingin menghapus resep custom "${selectedRecipeItem.namaMenu}"?`)) {
                              try {
                                await deleteCustomRecipe(customRecipe.id);
                                showToast({ message: 'Resep custom berhasil dihapus!', variant: 'success' });
                                setSelectedRecipeItem(null);
                              } catch (err) {
                                console.error('Error deleting recipe:', err);
                                showToast({ message: 'Gagal menghapus resep', variant: 'error' });
                              }
                            }
                          }}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                        >
                          Hapus Resep Custom
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* List & Search Recipe View */
                <div className="flex flex-col h-full">
                  <div className="flex gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
                      <input
                        type="text"
                        placeholder="Cari nama resep atau jenis menu..."
                        value={recipeBookQuery}
                        onChange={(e) => setRecipeBookQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-[#E2E8F0] rounded-xl text-xs focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNewRecipeName('');
                        setNewRecipeMainBahan('');
                        setNewRecipeBaseQty(1000);
                        setNewRecipeSatuanMainBahan('g');
                        setNewRecipePorsiKecil(50);
                        setNewRecipePorsiBesar(60);
                        setNewRecipeIngredients([{ bahan: '', kebutuhan: 0, satuan: 'g', resepPer: '' }]);
                        setIsAddingRecipe(true);
                      }}
                      className="px-4 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-extrabold rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                      + Tambah Resep
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto py-1">
                    {combinedRecipes
                      .filter((r) =>
                        r.namaMenu.toLowerCase().includes(recipeBookQuery.toLowerCase()) ||
                        r.jenisMenu.toLowerCase().includes(recipeBookQuery.toLowerCase())
                      )
                      .map((recipe) => (
                        <button
                          key={recipe.namaMenu}
                          type="button"
                          onClick={() => setSelectedRecipeItem(recipe)}
                          className="text-left p-4 rounded-xl border border-gray-200 hover:border-[#FBBF24] hover:bg-amber-50/10 cursor-pointer transition-all flex flex-col justify-between"
                        >
                          <div>
                            <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 uppercase">
                              {recipe.jenisMenu}
                            </span>
                            <h4 className="text-xs font-extrabold text-gray-800 mt-1.5 line-clamp-1">{recipe.namaMenu}</h4>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400">
                            <span>{recipe.ingredients.length} Bahan baku</span>
                            <span className="font-bold text-[#F59E0B]">Lihat Resep →</span>
                          </div>
                        </button>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Weekly Master Schedule Modal */}
      <WeeklyScheduleModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        scheduleDays={weeklySchedule}
        selectedPortion={selectedPortionClassification}
        onPortionChange={(p) => setSelectedPortionClassification(p)}
        onSave={handleSaveWeeklySchedule}
      />

      {/* In-App Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200/80 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-4">
              <div
                className={`p-3.5 rounded-2xl shrink-0 ${
                  confirmModal.variant === 'danger'
                    ? 'bg-rose-50 text-rose-600 border border-rose-200'
                    : confirmModal.variant === 'warning'
                    ? 'bg-amber-50 text-amber-600 border border-amber-200'
                    : confirmModal.variant === 'success'
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'bg-blue-50 text-blue-600 border border-blue-200'
                }`}
              >
                {confirmModal.icon === 'send' ? (
                  <Send className="h-6 w-6" />
                ) : confirmModal.icon === 'delete' ? (
                  <Trash2 className="h-6 w-6" />
                ) : confirmModal.icon === 'check' ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2.5 pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                disabled={confirmModalLoading}
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                {confirmModal.cancelLabel || 'Batal'}
              </button>
              <button
                type="button"
                disabled={confirmModalLoading}
                onClick={async () => {
                  try {
                    setConfirmModalLoading(true);
                    await confirmModal.onConfirm();
                    setConfirmModal(null);
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setConfirmModalLoading(false);
                  }
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 ${
                  confirmModal.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                    : confirmModal.variant === 'warning'
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20'
                    : confirmModal.variant === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20'
                }`}
              >
                {confirmModalLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{confirmModal.confirmLabel || 'Konfirmasi'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MbgProductionPage;
