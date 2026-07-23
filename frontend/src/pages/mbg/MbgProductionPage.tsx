// ============================================================================
// MBG Production Page — Kadar Gizi + Export PDF #1
// ============================================================================

import { useEffect, useMemo, useState, Fragment } from 'react';
import {
  Plus, Trash2, FileDown, Calendar, Loader2, CheckCircle2, Search, X, Folder,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgPmEntry, MbgNutritionEntry } from '@/types/mbg';
import { subscribeBatches, subscribeEntries, subscribeAllEntries } from '@/services/mbgAdminService';
import {
  subscribeNutrition, addNutritionEntry, updateNutritionEntry, deleteNutritionEntry,
  subscribeCustomTkpiEntries, addCustomTkpiEntry, updateCustomTkpiEntry, deleteCustomTkpiEntry,
  subscribeCustomRecipes, addCustomRecipe, updateCustomRecipe, deleteCustomRecipe,
  subscribeRecipeAdjustments, saveRecipeAdjustment, deleteRecipeAdjustment,
} from '@/services/mbgProductionService';
import { updateBatchStatus } from '@/services/mbgAdminService';
import {
  MBG_BATCH_STATUS_CONFIG,
  NUTRIENTS_LIST,
  NUTRITIONAL_MAP,
  MBG_INFORMASI_BAHAN_PANGAN,
  MBG_KATEGORI_BAHAN_PANGAN,
  getBahanPanganInfo,
  MBG_AKG_REFERENCE,
} from '@/constants/mbgConstants';
import tkpiDatabase from '@/constants/tkpiDatabase.json';
import porsiStandardData from '@/constants/standarPorsi.json';
import resepStandardData from '@/constants/standarResep.json';

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

const standarPorsi = porsiStandardData as StandarPorsi[];
const standarResep = resepStandardData as StandarResep[];


function findBestTkpiMatch(name: string, database: typeof tkpiDatabase) {
  const cleanName = name.toLowerCase().trim();
  if (!cleanName) return null;

  // 1. Exact match
  let match = database.find(item => item.nama.toLowerCase() === cleanName);
  if (match) return match;

  // 2. Specialized manual mappings for common MBG inputs
  const manualMappings: Record<string, string> = {
    'nasi putih': 'nasi',
    'nasi': 'nasi',
    'buah pisang': 'pisang ambon, segar',
    'pisang': 'pisang ambon, segar',
    'susu uht': 'susu sapi, segar',
    'susu': 'susu sapi, segar',
    'ayam goreng': 'ayam goreng kentucky, paha',
    'ayam goreng tepung': 'ayam goreng kentucky, paha',
    'empal daging': 'daging sapi, segar',
    'daging sapi': 'daging sapi, segar',
    'tumis buncis': 'buncis, segar',
    'buncis': 'buncis, segar',
    'kentang goreng': 'kentang, segar',
    'kentang rebus': 'kentang, segar',
    'kentang': 'kentang, segar',
    'sup sayur': 'wortel, segar',
    'sop wortel kentang': 'wortel, segar',
  };

  const mappedName = manualMappings[cleanName];
  if (mappedName) {
    match = database.find(item => item.nama.toLowerCase() === mappedName);
    if (match) return match;
  }

  // 3. Word overlap matching (fuzzy keyword match)
  const words = cleanName.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 0) {
    let bestItem: typeof database[number] | null = null;
    let bestScore = 0;

    for (const item of database) {
      const itemNamaLower = item.nama.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (itemNamaLower.includes(word)) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    if (bestScore > 0) {
      return bestItem;
    }
  }

  // 4. Fallback: contains any part of the name
  return database.find(item => item.nama.toLowerCase().includes(cleanName)) || null;
}

export function MbgProductionPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [nutritionData, setNutritionData] = useState<MbgNutritionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pm-data' | 'nutrition' | 'archive'>('pm-data');
  const [isInitializing, setIsInitializing] = useState(false);
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
  const [selectedDbItem, setSelectedDbItem] = useState<typeof tkpiDatabase[number] | null>(null);
  const [dbPage, setDbPage] = useState(1);

  const [customTkpiEntries, setCustomTkpiEntries] = useState<(typeof tkpiDatabase[number])[]>([]);
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

  // Subscribe custom TKPI entries
  useEffect(() => {
    const unsub = subscribeCustomTkpiEntries((entries) => {
      setCustomTkpiEntries(entries as unknown as (typeof tkpiDatabase[number])[]);
    });
    return unsub;
  }, []);

  // Subscribe custom recipes
  useEffect(() => {
    const unsub = subscribeCustomRecipes((recipes) => {
      setCustomRecipes(recipes as unknown as StandarResep[]);
    }, (err) => {
      console.error('Error loading custom recipes:', err);
    });
    return unsub;
  }, []);

  const combinedTkpiDatabase = useMemo(() => {
    const map = new Map<string, typeof tkpiDatabase[number]>();
    tkpiDatabase.forEach((item) => {
      map.set(item.nama.toLowerCase().trim(), item);
    });
    customTkpiEntries.forEach((item) => {
      map.set(item.nama.toLowerCase().trim(), item);
    });
    return Array.from(map.values());
  }, [customTkpiEntries]);

  // Subscribe batches
  useEffect(() => {
    const unsub = subscribeBatches((data) => {
      setBatches(data.filter((batch) => batch.status !== 'DRAFT'));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Subscribe to all entries globally for cross-batch archive filtering
  useEffect(() => {
    setLoadingArchive(true);
    const unsub = subscribeAllEntries((e) => {
      setAllEntries(e);
      setLoadingArchive(false);
    }, (err) => {
      console.error('Error loading all entries:', err);
      setLoadingArchive(false);
    });
    return unsub;
  }, []);

  // Subscribe entries + nutrition + recipe adjustments for selected batch
  useEffect(() => {
    if (!selectedBatchId) return;
    const unsub1 = subscribeEntries(selectedBatchId, setEntries);
    const unsub2 = subscribeNutrition(selectedBatchId, setNutritionData);
    const unsub3 = subscribeRecipeAdjustments(selectedBatchId, (list) => {
      console.log('[MBG] Recipe adjustments received:', list.length, 'items', list);
      setRecipeAdjustments(list as unknown as RecipeAdjustment[]);
    }, (err) => {
      console.error('Error loading recipe adjustments:', err);
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [selectedBatchId]);

  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId);
  }, [batches, selectedBatchId]);

  const archivedBatches = useMemo(() => {
    return batches.filter((b) => b.status !== 'PM_SUBMITTED');
  }, [batches]);

  const visibleBatchesInBar = useMemo(() => {
    // Show all PM_SUBMITTED batches, plus the selected batch if it is an archive
    return batches.filter(
      (b) => b.status === 'PM_SUBMITTED' || b.id === selectedBatchId
    );
  }, [batches, selectedBatchId]);

  const filteredBatchesForSelect = useMemo(() => {
    const query = batchSearchQuery.toLowerCase().trim();
    if (!query) return visibleBatchesInBar;
    return visibleBatchesInBar.filter((b) => {
      const cfg = MBG_BATCH_STATUS_CONFIG[b.status] || MBG_BATCH_STATUS_CONFIG.DRAFT;
      return (
        b.tanggal.toLowerCase().includes(query) ||
        cfg.label.toLowerCase().includes(query)
      );
    });
  }, [batchSearchQuery, visibleBatchesInBar]);

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

  // Auto-populate unique menu items from entries to nutrition data
  useEffect(() => {
    if (!selectedBatchId || loading || isInitializing || !user) return;
    
    // Auto populate only if entries exist, nutritionData is empty, and batch status is PM_SUBMITTED
    if (entries.length > 0 && nutritionData.length === 0 && selectedBatch?.status === 'PM_SUBMITTED') {
      const runInit = async () => {
        setIsInitializing(true);
        try {
          const menuQuantities: Record<string, number> = {};
          entries.forEach((e) => {
            if (e.isSekolahLibur) return;
            // Reguler menu items
            const regularQty = e.jumlah - (e.qtPobiaNasi || 0);
            if (regularQty > 0 && e.menuItems) {
              e.menuItems.forEach((m) => {
                const trimmed = m.trim();
                if (!trimmed) return;
                menuQuantities[trimmed] = (menuQuantities[trimmed] || 0) + regularQty;
              });
            }
            // Keringan menu items
            const keringanQty = e.qtPobiaNasi || 0;
            if (keringanQty > 0 && e.menuKeringanItems) {
              e.menuKeringanItems.forEach((m) => {
                const trimmed = m.trim();
                if (!trimmed) return;
                menuQuantities[trimmed] = (menuQuantities[trimmed] || 0) + keringanQty;
              });
            }
          });

          // Add to Firestore
          for (const [itemName, qty] of Object.entries(menuQuantities)) {
            const match = findBestTkpiMatch(itemName, combinedTkpiDatabase);
            
            let baseBerat = 100;
            let berat = qty * 100;
            const nutrients: Record<string, number> = {};
            
            if (match) {
              baseBerat = match.berat || 100;
              berat = qty * baseBerat;
              const ratio = berat / 100;
              const matchObj = match as unknown as Record<string, number>;
              for (const [key, tkpiKey] of Object.entries(NUTRITIONAL_MAP)) {
                nutrients[key] = ratio * Number(matchObj[tkpiKey] || 0);
              }
            } else {
              for (const key of Object.keys(NUTRITIONAL_MAP)) {
                nutrients[key] = 0;
              }
            }

            await addNutritionEntry({
              batchId: selectedBatchId,
              menuItemName: itemName,
              berat,
              baseBerat,
              air: nutrients.air || 0,
              kalori: nutrients.kalori || 0,
              protein: nutrients.protein || 0,
              lemak: nutrients.lemak || 0,
              karbohidrat: nutrients.karbohidrat || 0,
              serat: nutrients.serat || 0,
              abu: nutrients.abu || 0,
              kalsium: nutrients.kalsium || 0,
              fosfor: nutrients.fosfor || 0,
              zatBesi: nutrients.zatBesi || 0,
              natrium: nutrients.natrium || 0,
              kalium: nutrients.kalium || 0,
              tembaga: nutrients.tembaga || 0,
              seng: nutrients.seng || 0,
              vitaminA: nutrients.vitaminA || 0,
              bkar: nutrients.bkar || 0,
              kartotal: nutrients.kartotal || 0,
              thiamin: nutrients.thiamin || 0,
              riboflavin: nutrients.riboflavin || 0,
              niasin: nutrients.niasin || 0,
              vitaminC: nutrients.vitaminC || 0,
              quantity: qty,
              totalKalori: nutrients.kalori || 0,
              totalProtein: nutrients.protein || 0,
              totalLemak: nutrients.lemak || 0,
              totalKarbohidrat: nutrients.karbohidrat || 0,
              totalSerat: nutrients.serat || 0,
              calculatedBy: user.uid,
              calculatedAt: new Date().toISOString(),
            });
          }
          showToast({ message: 'Menu makanan otomatis diimpor & dikalkulasi dari data PM!', variant: 'success' });
        } catch (err) {
          console.error('Error auto prepopulating nutrition:', err);
          showToast({ message: 'Gagal mengimpor menu otomatis', variant: 'error' });
        } finally {
          setIsInitializing(false);
        }
      };
      runInit();
    }
  }, [entries, nutritionData, selectedBatchId, loading, selectedBatch, isInitializing, user, combinedTkpiDatabase, showToast]);

  // Group PM entries by petugas
  const groupedEntries = useMemo(() => {
    const groups: Record<string, MbgPmEntry[]> = {};
    entries.forEach((e) => {
      const key = e.assignedPetugasName || 'Belum Ditugaskan';
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
            const nameLower = c.className.toLowerCase();
            if (nameLower.includes('tk') || nameLower.includes('paud')) {
              counts['SISWA TK/PAUD'] += c.jumlah || 0;
            } else if (nameLower.includes('1') || nameLower.includes('2') || nameLower.includes('3')) {
              counts['SISWA SD/MI KELAS 1-3'] += c.jumlah || 0;
            } else if (nameLower.includes('4') || nameLower.includes('5') || nameLower.includes('6')) {
              counts['SISWA SD/MI KELAS 4-6'] += c.jumlah || 0;
            } else if (nameLower.includes('smp') || nameLower.includes('mts')) {
              counts['SISWA SMP/MTS'] += c.jumlah || 0;
            } else {
              counts['SISWA SMA/MA/SMK'] += c.jumlah || 0;
            }
          });
        } else {
          if (e.schoolLevel === 'tk_paud') {
            counts['SISWA TK/PAUD'] += e.jumlah || 0;
          } else if (e.schoolLevel === 'sd') {
            counts['SISWA SD/MI KELAS 1-3'] += e.qtPorsiKecil || Math.ceil((e.jumlah || 0) / 2);
            counts['SISWA SD/MI KELAS 4-6'] += e.qtPorsiBesar || Math.floor((e.jumlah || 0) / 2);
          } else {
            counts['SISWA SMA/MA/SMK'] += e.jumlah || 0;
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
    
    entries.forEach((e) => {
      if (e.isSekolahLibur) return;
      
      const menuList = e.menuItems || [];
      const qtyKecil = e.qtSiswaBalita || 0;
      const qtyBesar = (e.qtBumilBusui || 0) + (e.qtGuruKader || 0);
      
      menuList.forEach((menuName) => {
        // Find standard portion config
        const porsiCfg = combinedPorsi.find(
          (p) => p.namaMenu.toLowerCase().trim() === menuName.toLowerCase().trim()
        );
        
        const smallWeight = porsiCfg ? porsiCfg.porsiKecil : 0;
        const largeWeight = porsiCfg ? porsiCfg.porsiBesar : 0;
        const weight = (qtyKecil * smallWeight) + (qtyBesar * largeWeight);
        
        const normName = menuName.trim();
        if (!menuMainTotals[normName]) {
          menuMainTotals[normName] = { totalQty: 0, countKecil: 0, countBesar: 0 };
        }
        menuMainTotals[normName].totalQty += weight;
        menuMainTotals[normName].countKecil += qtyKecil;
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
      // Find standard recipe
      const recipe = combinedRecipes.find(
        (r) => r.namaMenu.toLowerCase().trim() === menuName.toLowerCase().trim()
      );

      if (recipe && recipe.baseQty > 0) {
        // Scaling ratio: required main ingredient weight / base weight in recipe
        const ratio = totals.totalQty / recipe.baseQty;
        
        recipe.ingredients.forEach((ing) => {
          const key = ing.bahan.toLowerCase().trim();
          if (!rawIngredients[key]) {
            rawIngredients[key] = {
              name: ing.bahan,
              amount: 0,
              satuan: ing.satuan,
              sourceMenus: [],
              menuBreakdown: [],
            };
          }
          const ingAmount = ing.kebutuhan * ratio;
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
              satuan: ing.satuan,
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
        const totalPortions = totals.countKecil + totals.countBesar;
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
        const fallbackAmount = totals.totalQty || totalPortions;
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
  }, [entries, combinedPorsi, combinedRecipes]);

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

  const handleFillDummyNutritionData = async () => {
    if (!selectedBatchId || !user) {
      showToast({ message: 'Silakan pilih tanggal batch terlebih dahulu!', variant: 'error' });
      return;
    }

    try {
      setIsInitializing(true);
      // 1. Clear existing empty nutrition entries if any
      for (const entry of nutritionData) {
        if (!entry.menuItemName || entry.kalori === 0) {
          await deleteNutritionEntry(entry.id);
        }
      }

      // 2. Sample realistic MBG menu items with complete nutrition from TKPI
      const dummyMenus = [
        {
          menuItemName: 'Nasi Putih (Beras Premium)',
          berat: 150,
          baseBerat: 100,
          air: 67.5,
          kalori: 180,
          protein: 3.3,
          lemak: 0.3,
          karbohidrat: 39.8,
          serat: 0.6,
          abu: 0.2,
          kalsium: 15,
          fosfor: 40,
          zatBesi: 0.5,
          natrium: 1,
          kalium: 35,
          tembaga: 0.1,
          seng: 0.6,
          vitaminA: 0,
          bkar: 0,
          kartotal: 0,
          thiamin: 0.05,
          riboflavin: 0.02,
          niasin: 0.8,
          vitaminC: 0,
        },
        {
          menuItemName: 'Ayam Goreng Kentucky (Paha)',
          berat: 60,
          baseBerat: 100,
          air: 32.1,
          kalori: 178,
          protein: 12.8,
          lemak: 10.2,
          karbohidrat: 8.5,
          serat: 0.3,
          abu: 1.2,
          kalsium: 18,
          fosfor: 110,
          zatBesi: 0.9,
          natrium: 220,
          kalium: 145,
          tembaga: 0.1,
          seng: 1.1,
          vitaminA: 45,
          bkar: 0,
          kartotal: 0,
          thiamin: 0.06,
          riboflavin: 0.12,
          niasin: 2.8,
          vitaminC: 0,
        },
        {
          menuItemName: 'Tumis Buncis Wortel',
          berat: 50,
          baseBerat: 100,
          air: 42.5,
          kalori: 45,
          protein: 1.8,
          lemak: 1.5,
          karbohidrat: 6.2,
          serat: 2.1,
          abu: 0.8,
          kalsium: 35,
          fosfor: 28,
          zatBesi: 0.6,
          natrium: 85,
          kalium: 120,
          tembaga: 0.05,
          seng: 0.3,
          vitaminA: 320,
          bkar: 1800,
          kartotal: 1800,
          thiamin: 0.04,
          riboflavin: 0.05,
          niasin: 0.6,
          vitaminC: 12,
        },
        {
          menuItemName: 'Pisang Ambon Segar',
          berat: 100,
          baseBerat: 100,
          air: 72.0,
          kalori: 92,
          protein: 1.0,
          lemak: 0.2,
          karbohidrat: 23.4,
          serat: 2.6,
          abu: 0.6,
          kalsium: 12,
          fosfor: 28,
          zatBesi: 0.5,
          natrium: 2,
          kalium: 358,
          tembaga: 0.1,
          seng: 0.2,
          vitaminA: 45,
          bkar: 120,
          kartotal: 120,
          thiamin: 0.05,
          riboflavin: 0.06,
          niasin: 0.7,
          vitaminC: 9,
        },
        {
          menuItemName: 'Susu UHT Ultra Full Cream 125 ml',
          berat: 125,
          baseBerat: 100,
          air: 108.0,
          kalori: 80,
          protein: 4.0,
          lemak: 4.5,
          karbohidrat: 6.0,
          serat: 0.0,
          abu: 1.0,
          kalsium: 140,
          fosfor: 110,
          zatBesi: 0.1,
          natrium: 65,
          kalium: 160,
          tembaga: 0.01,
          seng: 0.5,
          vitaminA: 60,
          bkar: 0,
          kartotal: 0,
          thiamin: 0.04,
          riboflavin: 0.18,
          niasin: 0.2,
          vitaminC: 1,
        },
      ];

      const totalBatchPorsi = entries.reduce((s, e) => s + (e.jumlah || 0), 0) || 1;

      for (const menu of dummyMenus) {
        await addNutritionEntry({
          batchId: selectedBatchId,
          menuItemName: menu.menuItemName,
          berat: menu.berat,
          baseBerat: menu.baseBerat,
          air: menu.air,
          kalori: menu.kalori,
          protein: menu.protein,
          lemak: menu.lemak,
          karbohidrat: menu.karbohidrat,
          serat: menu.serat,
          abu: menu.abu,
          kalsium: menu.kalsium,
          fosfor: menu.fosfor,
          zatBesi: menu.zatBesi,
          natrium: menu.natrium,
          kalium: menu.kalium,
          tembaga: menu.tembaga,
          seng: menu.seng,
          vitaminA: menu.vitaminA,
          bkar: menu.bkar,
          kartotal: menu.kartotal,
          thiamin: menu.thiamin,
          riboflavin: menu.riboflavin,
          niasin: menu.niasin,
          vitaminC: menu.vitaminC,
          quantity: totalBatchPorsi,
          totalKalori: menu.kalori,
          totalProtein: menu.protein,
          totalLemak: menu.lemak,
          totalKarbohidrat: menu.karbohidrat,
          totalSerat: menu.serat,
          calculatedBy: user.uid,
          calculatedAt: new Date().toISOString(),
        });
      }

      showToast({ message: 'Data Dummy Gizi berhasil diisi & dikalkulasi!', variant: 'success' });
    } catch (err) {
      console.error('Error filling dummy nutrition data:', err);
      showToast({ message: 'Gagal mengisi data dummy gizi', variant: 'error' });
    } finally {
      setIsInitializing(false);
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

  const handleSubmitToPurchasing = async () => {
    if (!selectedBatchId) return;
    try {
      await updateBatchStatus(selectedBatchId, 'PURCHASING');
      showToast({ message: 'Data gizi berhasil disubmit ke Purchasing!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal men-submit data ke Purchasing', variant: 'error' });
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

  const handleExportPdf = async () => {
    if (!selectedBatchId || !selectedBatch) return;
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      
      const brandAmberDark: [number, number, number] = [180, 83, 9];    // #B45309
      const brandGold: [number, number, number] = [217, 119, 6];       // #D97706
      const slateDark: [number, number, number] = [30, 41, 59];        // #1E293B
      const slateLight: [number, number, number] = [107, 114, 128];     // #6B7280

      // Draw PDF Header (Centered Layout)
      const logoBase64 = await getBase64ImageFromUrl("/logo_badan_gizi.png");
      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", (pageW / 2) - 9, 8, 18, 18);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...brandAmberDark);
      doc.text("KOPERASI AL-UMANAA", pageW / 2, 31, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...slateDark);
      doc.text("LAPORAN DATA PM & KADAR GIZI MBG", pageW / 2, 36.5, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      doc.text(`Tanggal Batch: ${selectedBatch.tanggal} | SIMOL MBG`, pageW / 2, 41, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...brandGold);
      doc.text(`Status: ${selectedBatch.status}`, pageW - 14, 16, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      doc.text(`Total Porsi: ${selectedBatch.totalJumlah} Porsi`, pageW - 14, 20.5, { align: "right" });

      doc.setDrawColor(229, 231, 235);
      doc.line(14, 45, pageW - 14, 45);

      // Section 1: Data PM
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text("1. DATA PM (PENANGGUNG JAWAB MAKANAN) INSTITUSI", 14, 51);

      const pmRows: (string | number)[][] = [];
      entries.forEach((e) => {
        pmRows.push([
          e.institutionName + (e.isSekolahLibur ? ' (Libur)' : ''),
          e.institutionType === 'posyandu' ? 'Posyandu' : 'Sekolah',
          e.assignedPetugasName || '-',
          e.qtSiswaBalita || 0,
          e.qtBumilBusui || 0,
          e.qtGuruKader || 0,
          e.qtPobiaNasi || 0,
          e.jumlah,
          e.jadwalPengantaran || '-',
          e.isSekolahLibur ? 'Libur' : 'Aktif',
        ]);

        if (e.classesBreakdown && e.classesBreakdown.length > 0) {
          e.classesBreakdown.forEach((c) => {
            const totalSiswaPortions = (c.qtPorsiBalita || 0) + (c.qtPorsiKecil || 0) + (c.qtPorsiBesar || 0);
            pmRows.push([
              `  ↳ ${c.className}`,
              '-',
              '-',
              totalSiswaPortions || '-',
              c.qtPorsiBumilBusui || '-',
              '-',
              c.qtPobiaNasi || '-',
              c.jumlah,
              c.jadwalPengantaran || '-',
              '-',
            ]);
          });
        }
      });

      autoTable(doc, {
        startY: 54,
        head: [['Institusi', 'Tipe', 'Petugas', 'Siswa/Balita', 'Bumil/Busui', 'Guru/Kader', 'Pobia Nasi', 'Jumlah', 'Jadwal', 'Status']],
        body: pmRows,
        theme: 'striped',
        headStyles: { fillColor: [251, 191, 36], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        margin: { left: 14, right: 14 },
      });

      let nextY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

      // Section 2: Kadar Gizi
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text("2. DATA KADAR GIZI MENU MAKANAN & MINUMAN", 14, nextY);

      const giziHeaders = [
        'Menu Item',
        'Qty',
        'Berat',
        ...NUTRIENTS_LIST.map((nut) => nut.label.split(' ')[0]),
      ];

      const giziRows = nutritionData.map((n) => [
        n.menuItemName,
        n.quantity,
        `${n.berat} g`,
        ...NUTRIENTS_LIST.map((nut) => {
          const val = n[nut.key as keyof MbgNutritionEntry];
          return val !== undefined && val !== null ? Number(val).toFixed(1) : '0.0';
        }),
      ]);

      autoTable(doc, {
        startY: nextY + 3,
        head: [giziHeaders],
        body: giziRows,
        theme: 'striped',
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6 },
        bodyStyles: { fontSize: 6 },
        margin: { left: 14, right: 14 },
      });

      nextY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

      // Section 3: Ringkasan Total Gizi
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text("3. RINGKASAN TOTAL KADAR GIZI BATCH", 14, nextY);

      const totalRows = [
        ['Total Kalori', `${nutritionTotals.kalori.toFixed(1)} kcal`],
        ['Total Protein', `${nutritionTotals.protein.toFixed(1)} g`],
        ['Total Lemak', `${nutritionTotals.lemak.toFixed(1)} g`],
        ['Total Karbohidrat', `${nutritionTotals.karbohidrat.toFixed(1)} g`],
        ['Total Serat', `${nutritionTotals.serat.toFixed(1)} g`],
      ];

      autoTable(doc, {
        startY: nextY + 3,
        head: [['Kadar Gizi', 'Total Nilai']],
        body: totalRows,
        theme: 'plain',
        headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });

      nextY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

      // Section 4: Estimasi Kebutuhan Bahan Baku (Standar Resep)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text("4. ESTIMASI KEBUTUHAN BAHAN BAKU BATCH (STANDAR RESEP)", 14, nextY);

      const recipeHeaders = ['No', 'Nama Bahan Baku', 'Kebutuhan', 'Menu Terkait'];
      const recipeRows = adjustedRecipeRequirements.map((r, index) => {
        let formattedWeight = '';
        if (r.satuan === 'g' && r.amount >= 1000) {
          formattedWeight = `${(r.amount / 1000).toFixed(2)} kg`;
        } else if (r.satuan === 'ml' && r.amount >= 1000) {
          formattedWeight = `${(r.amount / 1000).toFixed(2)} L`;
        } else {
          formattedWeight = `${r.amount.toFixed(1)} ${r.satuan}`;
        }
        
        let displayName = r.name;
        if (r.isCustom) {
          displayName += ' (Manual)';
        } else if (r.adjustmentId) {
          displayName += ' (Disesuaikan)';
        }

        return [
          index + 1,
          displayName,
          formattedWeight,
          r.sourceMenus.join(', ')
        ];
      });

      autoTable(doc, {
        startY: nextY + 3,
        head: [recipeHeaders],
        body: recipeRows,
        theme: 'striped',
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        margin: { left: 14, right: 14 },
      });

      // Draw page decorations/variations (header/footer accent lines) and page numbers (e.g. Page X of Y)
      const totalPages = doc.getNumberOfPages();
      const pageH = doc.internal.pageSize.getHeight();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        // Header accent: Solid Amber Gold header band (3mm height) with a dark accent line
        doc.setFillColor(251, 191, 36); // #FBBF24 (Gold)
        doc.rect(0, 0, pageW, 3, 'F');
        doc.setFillColor(180, 83, 9); // #B45309 (Amber Dark)
        doc.rect(0, 3, pageW, 0.8, 'F');

        // Footer accent line
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(14, pageH - 12, pageW - 14, pageH - 12);

        // Footer left: branding & report details
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(107, 114, 128);
        doc.text("Sistem Informasi Makanan Bergizi - SIMOL MBG", 14, pageH - 7);

        // Footer right: page numbers
        doc.text(`Halaman ${i} dari ${totalPages}`, pageW - 14, pageH - 7, { align: "right" });
      }

      doc.save(`Laporan_Produksi_Gizi_${selectedBatch.tanggal}.pdf`);
      showToast({ message: 'Laporan PDF berhasil di-export!', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal export PDF', variant: 'error' });
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

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Produksi MBG</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Kelola kadar gizi menu dan pantau data PM
        </p>
      </div>

      {/* Tab Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex gap-1 bg-[#F3F4F6] rounded-xl p-1 w-full max-w-md">
          {(['pm-data', 'nutrition', 'archive'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                activeTab === tab
                  ? 'bg-white text-[#111827] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              {tab === 'pm-data' ? '📋 Data PM' : tab === 'nutrition' ? '🧪 Kadar Gizi' : '📁 Arsip Gizi'}
            </button>
          ))}
        </div>
        {activeTab === 'nutrition' && selectedBatchId && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#111827] text-white text-xs font-extrabold rounded-xl shadow hover:bg-[#1F2937] transition-colors cursor-pointer"
            >
              <FileDown className="h-4 w-4" />
              <span>Export PDF</span>
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
            <button
              onClick={handleFillDummyNutritionData}
              title="Klik untuk mengisi data dummy gizi otomatis agar bisa mencoba kalkulasinya"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#15803D] hover:bg-[#166534] text-white text-xs font-extrabold rounded-xl shadow transition-colors cursor-pointer"
            >
              <span>⚡ Isi Dummy Gizi</span>
            </button>
          </div>
        )}
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
                      setSelectedBatchId(b.id);
                      setActiveTab('nutrition');
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${cfg.bgClass} ${cfg.textClass}`}>
                          {cfg.label}
                        </span>
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
                      <span className="text-gray-400 font-medium truncate max-w-[90px]">
                        {b.petugasList && b.petugasList.length > 0 
                          ? `${b.petugasList.length} Kurir`
                          : 'Belum ada kurir'
                        }
                      </span>
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
          {visibleBatchesInBar.length > 0 && (
            <div className="relative mb-6 font-['Hanken_Grotesk'] max-w-md">
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                Pilih Tanggal Batch / Operasional:
              </label>
              
              {/* Dropdown Button */}
              <button
                type="button"
                onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
                className="w-full flex items-center justify-between bg-white border border-[#E5E7EB] rounded-xl px-4 py-3 text-xs font-extrabold text-[#111827] hover:border-[#FBBF24] focus:outline-none transition-all shadow-sm cursor-pointer"
              >
                {selectedBatch ? (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-[#FBBF24]" />
                    <span>{selectedBatch.tanggal}</span>
                    <span className={`text-[9px] font-extrabold rounded-full px-2 py-0.5 ${
                      (MBG_BATCH_STATUS_CONFIG[selectedBatch.status] || MBG_BATCH_STATUS_CONFIG.DRAFT).textClass
                    } ${
                      (MBG_BATCH_STATUS_CONFIG[selectedBatch.status] || MBG_BATCH_STATUS_CONFIG.DRAFT).bgClass
                    }`}>
                      {(MBG_BATCH_STATUS_CONFIG[selectedBatch.status] || MBG_BATCH_STATUS_CONFIG.DRAFT).label}
                    </span>
                  </div>
                ) : (
                  <span className="text-[#9CA3AF] font-bold">Pilih Tanggal Batch...</span>
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
                  
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Search Input */}
                    <div className="p-2 border-b border-gray-100 bg-gray-50 flex items-center gap-1.5">
                      <Search className="h-3.5 w-3.5 text-gray-400 shrink-0 ml-1.5" />
                      <input
                        type="text"
                        value={batchSearchQuery}
                        onChange={(e) => setBatchSearchQuery(e.target.value)}
                        placeholder="Cari tanggal atau status..."
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

                    {/* Scrollable list */}
                    <div className="max-h-60 overflow-y-auto py-1">
                      {filteredBatchesForSelect.length === 0 ? (
                        <div className="text-center py-4 text-xs text-gray-400 font-bold">
                          Tidak ada batch ditemukan
                        </div>
                      ) : (
                        filteredBatchesForSelect.map((b) => {
                          const cfg = MBG_BATCH_STATUS_CONFIG[b.status] || MBG_BATCH_STATUS_CONFIG.DRAFT;
                          return (
                            <button
                              key={b.id}
                              onClick={() => {
                                setSelectedBatchId(b.id);
                                setIsBatchDropdownOpen(false);
                                setBatchSearchQuery('');
                              }}
                              className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                                selectedBatchId === b.id ? 'bg-[#FBBF24]/10 text-[#92400E]' : 'text-gray-700'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                <span>{b.tanggal}</span>
                              </div>
                              <span className={`text-[9px] font-extrabold rounded-full px-2 py-0.5 ${cfg.textClass} ${cfg.bgClass}`}>
                                {cfg.label}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {!selectedBatchId ? (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center shadow-sm font-['Hanken_Grotesk']">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-[#6B7280]">Silakan pilih tanggal batch di atas atau buka Arsip Gizi</p>
              <p className="text-xs text-[#9CA3AF] mt-1">Anda juga dapat membuka tab Arsip Gizi untuk melihat daftar dokumen arsip.</p>
            </div>
          ) : (
            <>
              {activeTab === 'pm-data' ? (
                /* PM Data View (Read-Only) */
                <div className="space-y-4 font-['Hanken_Grotesk']">
                  {Object.entries(groupedEntries).map(([petugasName, petugasEntries]) => (
                    <div key={petugasName} className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
                      <div className="px-4 py-3 bg-[#111827] flex items-center gap-2">
                        <span className="text-sm font-extrabold text-white uppercase">
                          PETUGAS: {petugasName}
                        </span>
                        <span className="text-[10px] font-bold text-[#FBBF24] bg-[#FBBF24]/10 rounded-full px-2.5 py-0.5 ml-auto">
                          {petugasEntries.reduce((s, e) => s + (e.jumlah || 0), 0)} porsi
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[650px]">
                          <thead>
                            <tr className="bg-[#FEF3C7] text-[10px] font-extrabold text-[#92400E] uppercase">
                              <th className="px-3 py-2 text-left">Institusi</th>
                              <th className="px-2 py-2 text-center">Siswa/Balita</th>
                              <th className="px-2 py-2 text-center">Bumil/Busui</th>
                              <th className="px-2 py-2 text-center">Guru/Kader</th>
                              <th className="px-2 py-2 text-center">Pobia Nasi</th>
                              <th className="px-2 py-2 text-center">Jumlah</th>
                              <th className="px-2 py-2 text-center">Jadwal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {petugasEntries.map((e) => (
                              <tr key={e.id} className={`border-b border-[#F3F4F6] ${e.isSekolahLibur ? 'bg-red-50 opacity-50 line-through' : ''}`}>
                                <td className="px-3 py-2 font-bold text-[#111827]">
                                  {e.institutionName}
                                  {e.isSekolahLibur && <span className="ml-1 text-[9px] text-red-500 font-extrabold">LIBUR</span>}
                                </td>
                                <td className="px-2 py-2 text-center font-bold">{e.qtSiswaBalita || '-'}</td>
                                <td className="px-2 py-2 text-center font-bold">{e.qtBumilBusui || '-'}</td>
                                <td className="px-2 py-2 text-center font-bold">{e.qtGuruKader || '-'}</td>
                                <td className="px-2 py-2 text-center font-bold text-red-600">{e.qtPobiaNasi || '-'}</td>
                                <td className="px-2 py-2 text-center">
                                  <span className="font-extrabold text-[#92400E] bg-[#FBBF24]/20 rounded-full px-2 py-0.5">{e.jumlah}</span>
                                </td>
                                <td className="px-2 py-2 text-center font-semibold text-[#6B7280]">{e.jadwalPengantaran}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {/* Submit to Purchasing CTA */}
                  {selectedBatch && ['NUTRITION_DONE', 'PDF_EXPORTED'].includes(selectedBatch.status) && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                      <div className="space-y-1">
                        <h4 className="text-sm font-extrabold text-emerald-800">Kadar Gizi Selesai Dihitung</h4>
                        <p className="text-xs text-emerald-600">
                          Data gizi untuk batch ini sudah dihitung dan disimpan. Silakan submit data ini ke bagian Purchasing untuk memulai pembelian bahan baku.
                        </p>
                      </div>
                      <button
                        onClick={handleSubmitToPurchasing}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-emerald-600/20 cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0"
                      >
                        Submit Data
                      </button>
                    </div>
                  )}

                  {selectedBatch && selectedBatch.status === 'PURCHASING' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center text-xs font-bold text-blue-700 mt-6">
                      ✓ Data gizi batch ini telah berhasil disubmit ke Purchasing untuk proses pembelian bahan baku.
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
                        {Object.entries(groupedEntries).map(([petugasName, petugasEntries]) => (
                          <div key={petugasName} className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-white">
                            <div className="px-3 py-2 bg-[#111827] flex items-center gap-2">
                              <span className="text-[11px] font-extrabold text-white uppercase">
                                PETUGAS: {petugasName}
                              </span>
                              <span className="text-[9px] font-bold text-[#FBBF24] bg-[#FBBF24]/10 rounded-full px-2 py-0.5 ml-auto">
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
                        ))}
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
                                          <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-extrabold ${
                                            r.adjustmentId 
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
                                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                                hasRecipe 
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
                            <th className="px-3 py-2.5 text-left min-w-[200px]">Menu Item</th>
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
                      <Plus className="h-3.5 w-3.5" /> Tambah Menu Item
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 justify-end">
                    <button onClick={handleMarkNutritionDone}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#059669] text-white text-sm font-extrabold rounded-xl hover:bg-[#047857] cursor-pointer transition-colors shadow-lg shadow-green-500/20">
                      <CheckCircle2 className="h-4 w-4" /> Simpan Kadar Gizi
                    </button>
                    <button
                      onClick={handleExportPdf}
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
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      recipeModalTab === 'resep'
                        ? 'bg-[#15803D] text-white shadow-sm'
                        : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    📖 Standar Resep & Porsi ({combinedRecipes.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipeModalTab('bahanPangan')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      recipeModalTab === 'bahanPangan'
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
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                          selectedBahanCategory === 'all'
                            ? 'bg-[#1E293B] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Semua ({MBG_INFORMASI_BAHAN_PANGAN.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBahanCategory('utama')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                          selectedBahanCategory === 'utama'
                            ? 'bg-[#15803D] text-white'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        Bahan Utama ({MBG_KATEGORI_BAHAN_PANGAN.bahanUtama.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBahanCategory('pelengkap')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                          selectedBahanCategory === 'pelengkap'
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        Bumbu Pelengkap ({MBG_KATEGORI_BAHAN_PANGAN.bumbuPelengkap.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBahanCategory('dasar')}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                          selectedBahanCategory === 'dasar'
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
    </div>
  );
}

export default MbgProductionPage;
