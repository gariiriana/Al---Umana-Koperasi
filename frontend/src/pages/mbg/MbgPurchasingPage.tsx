// ============================================================================
// MBG Purchasing Page — Purchasing MBG: Purchase Orders
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Trash2,
  Calendar,
  Loader2,
  X,
  Save,
  DollarSign,
  AlertTriangle,
  Clock,
  Briefcase,
  Grid,
  List,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgPurchaseOrder, MbgPurchaseItem, MbgPurchaseStatus, MbgPmEntry, MbgNutritionEntry } from '@/types/mbg';
import { subscribeBatches, updateBatchStatus, subscribeEntries } from '@/services/mbgAdminService';
import {
  subscribePurchaseOrders,
  addPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
} from '@/services/mbgPurchasingService';
import { subscribeCustomRecipes, subscribeRecipeAdjustments, subscribeNutrition } from '@/services/mbgProductionService';
import { SearchableBatchSelector } from '@/components/mbg/SearchableBatchSelector';
import {
  MBG_SATUAN_OPTIONS,
  MBG_PURCHASE_STATUS_CONFIG,
} from '@/constants/mbgConstants';
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

export function MbgPurchasingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [orders, setOrders] = useState<MbgPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [infoTab, setInfoTab] = useState<'closed' | 'pm' | 'nutrition' | 'ingredients'>('closed');
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  } | null>(null);

  // Form State for new PO
  const [isNewPoOpen, setIsNewPoOpen] = useState(false);
  const [newPoData, setNewPoData] = useState({
    supplierName: '',
    type: 'harian' as 'harian' | 'supplier',
    groupLabel: 'Pesanan A',
    targetDate: new Date().toISOString().split('T')[0],
  });

  // States for calculating requirements (for Auto-Load from Production)
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [customRecipes, setCustomRecipes] = useState<StandarResep[]>([]);
  const [recipeAdjustments, setRecipeAdjustments] = useState<RecipeAdjustment[]>([]);
  const [nutritionData, setNutritionData] = useState<MbgNutritionEntry[]>([]);

  // Subscribe batches
  useEffect(() => {
    const unsub = subscribeBatches((data) => {
      // Filter out draft batches because purchasing works on submitted batches
      const activeBatches = data.filter((b) => b.status !== 'DRAFT');
      setBatches(activeBatches);
      if (activeBatches.length > 0) {
        setSelectedBatchId((current) => current || activeBatches[0].id);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Subscribe PO and calculation data when batch changes
  useEffect(() => {
    if (!selectedBatchId) return;
    const unsub1 = subscribePurchaseOrders(selectedBatchId, setOrders, () => {
      showToast({ message: 'Gagal memuat purchase orders', variant: 'error' });
    });
    const unsub3 = subscribeEntries(selectedBatchId, setEntries);
    const unsub4 = subscribeCustomRecipes((list) => {
      setCustomRecipes(list as unknown as StandarResep[]);
    });
    const unsub5 = subscribeRecipeAdjustments(selectedBatchId, (list) => {
      setRecipeAdjustments(list as unknown as RecipeAdjustment[]);
    });
    const unsub6 = subscribeNutrition(selectedBatchId, setNutritionData);
    return () => {
      unsub1();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
    };
  }, [selectedBatchId, showToast]);

  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId);
  }, [batches, selectedBatchId]);

  // 1. Combined Recipes and Combined Porsi (static + custom)
  const combinedRecipes = useMemo(() => {
    return [...standarResep, ...customRecipes];
  }, [customRecipes]);

  const combinedPorsi = useMemo(() => {
    const customPorsi = customRecipes.map((cr) => ({
      kode: 999,
      jenisMenu: cr.jenisMenu,
      namaMenu: cr.namaMenu,
      bahanUtama: cr.mainBahan,
      porsiKecil: cr.porsiKecil || 50,
      porsiBesar: cr.porsiBesar || 60,
    }));
    return [...standarPorsi, ...customPorsi];
  }, [customRecipes]);

  // 2. Base Requirements
  const recipeRequirements = useMemo(() => {
    const rawIngredients: Record<
      string,
      { name: string; amount: number; satuan: string; sourceMenus: string[] }
    > = {};

    const menuMainTotals: Record<string, { totalQty: number; countKecil: number; countBesar: number }> = {};

    entries.forEach((entry) => {
      if (entry.isSekolahLibur) return;
      const qtyKecil = entry.qtSiswaBalita || 0;
      const qtyBesar = (entry.qtBumilBusui || 0) + (entry.qtGuruKader || 0);

      const items = [...(entry.menuItems || []), ...(entry.menuKeringanItems || [])];

      items.forEach((menuName) => {
        const porsiCfg = combinedPorsi.find(
          (p) => p.namaMenu.toLowerCase().trim() === menuName.toLowerCase().trim()
        );
        const portionSize = porsiCfg ? (qtyKecil * porsiCfg.porsiKecil + qtyBesar * porsiCfg.porsiBesar) : 0;
        const weight = portionSize;

        const normName = menuName.trim();
        if (!menuMainTotals[normName]) {
          menuMainTotals[normName] = { totalQty: 0, countKecil: 0, countBesar: 0 };
        }
        menuMainTotals[normName].totalQty += weight;
        menuMainTotals[normName].countKecil += qtyKecil;
        menuMainTotals[normName].countBesar += qtyBesar;
      });
    });

    Object.entries(menuMainTotals).forEach(([menuName, totals]) => {
      const recipe = combinedRecipes.find(
        (r) => r.namaMenu.toLowerCase().trim() === menuName.toLowerCase().trim()
      );

      if (recipe && recipe.baseQty > 0) {
        const ratio = totals.totalQty / recipe.baseQty;
        recipe.ingredients.forEach((ing) => {
          const key = ing.bahan.toLowerCase().trim();
          if (!rawIngredients[key]) {
            rawIngredients[key] = { name: ing.bahan, amount: 0, satuan: ing.satuan, sourceMenus: [] };
          }
          rawIngredients[key].amount += ing.kebutuhan * ratio;
          if (!rawIngredients[key].sourceMenus.includes(menuName)) {
            rawIngredients[key].sourceMenus.push(menuName);
          }
        });
      } else {
        const porsiCfg = combinedPorsi.find(
          (p) => p.namaMenu.toLowerCase().trim() === menuName.toLowerCase().trim()
        );
        const name = porsiCfg ? porsiCfg.bahanUtama : menuName;
        const key = name.toLowerCase().trim();
        const totalPortions = totals.countKecil + totals.countBesar;

        if (!rawIngredients[key]) {
          const isUnitItem = porsiCfg && porsiCfg.porsiKecil === 1;
          rawIngredients[key] = {
            name,
            amount: 0,
            satuan: isUnitItem ? 'pcs' : 'g',
            sourceMenus: [],
          };
        }
        rawIngredients[key].amount += totals.totalQty || totalPortions;
        if (!rawIngredients[key].sourceMenus.includes(menuName)) {
          rawIngredients[key].sourceMenus.push(menuName);
        }
      }
    });

    return Object.values(rawIngredients).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, combinedPorsi, combinedRecipes]);

  // 3. Adjusted Requirements
  const adjustedRecipeRequirements = useMemo(() => {
    const result = recipeRequirements.map((r) => ({
      ...r,
      adjustmentId: null as string | null,
      isCustom: false,
      originalAmount: r.amount,
    }));

    recipeAdjustments.forEach((adj) => {
      if (adj.isCustom) {
        result.push({
          name: adj.name,
          amount: adj.amount,
          satuan: adj.satuan,
          sourceMenus: ['Ditambahkan Manual'],
          adjustmentId: adj.id ?? null,
          isCustom: true,
          originalAmount: 0,
        });
      } else {
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

  // 4. Handler for Auto loading ingredients into PO
  const handleAutoLoadIngredients = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    if (adjustedRecipeRequirements.length === 0) {
      showToast({ message: 'Tidak ada estimasi bahan baku untuk batch ini.', variant: 'error' });
      return;
    }

    const proceedAutoLoad = async () => {
      const loadedItems: MbgPurchaseItem[] = adjustedRecipeRequirements.map((r) => {
        let qty = r.amount;
        let unit = 'Kg';

        const sLower = r.satuan.toLowerCase();
        if (sLower === 'g') {
          if (r.amount >= 1000) {
            qty = r.amount / 1000;
            unit = 'Kg';
          } else {
            qty = r.amount;
            unit = 'g';
          }
        } else if (sLower === 'ml') {
          if (r.amount >= 1000) {
            qty = r.amount / 1000;
            unit = 'Liter';
          } else {
            qty = r.amount;
            unit = 'ml';
          }
        } else if (sLower === 'pcs') {
          unit = 'Pcs';
        } else if (sLower === 'ikat') {
          unit = 'Ikat';
        } else if (sLower === 'siung' || sLower === 'lembar') {
          unit = 'Pcs';
        } else {
          const matched = MBG_SATUAN_OPTIONS.find((opt) => opt.toLowerCase() === sLower);
          unit = matched || 'Kg';
        }

        qty = Math.round(qty * 100) / 100;

        let remark = '';
        if (r.isCustom) {
          remark = 'Tambahan Manual Produksi';
        } else if (r.adjustmentId) {
          remark = 'Koreksi Kuantitas Produksi';
        } else {
          remark = `Resep: ${r.sourceMenus.slice(0, 2).join(', ')}`;
        }

        return {
          bahanName: r.name,
          jamKedatangan: '08:00',
          jumlah: qty,
          satuan: unit,
          hargaSatuan: 0,
          totalHarga: 0,
          keterangan: remark,
        };
      });

      // Merge logic
      const newItems = [...order.items];
      loadedItems.forEach((loaded) => {
        const existingIdx = newItems.findIndex((ex) => ex.bahanName.toLowerCase().trim() === loaded.bahanName.toLowerCase().trim());
        if (existingIdx >= 0) {
          newItems[existingIdx].jumlah = loaded.jumlah;
          newItems[existingIdx].satuan = loaded.satuan;
          newItems[existingIdx].keterangan = loaded.keterangan;
          newItems[existingIdx].totalHarga = newItems[existingIdx].jumlah * newItems[existingIdx].hargaSatuan;
        } else {
          newItems.push(loaded);
        }
      });

      const totalPengeluaran = newItems.reduce((sum, item) => sum + (item.totalHarga || 0), 0);

      try {
        await updatePurchaseOrder(orderId, {
          items: newItems,
          totalPengeluaran,
        });
        showToast({ message: `Berhasil memuat ${loadedItems.length} bahan baku dari tim produksi!`, variant: 'success' });
      } catch (err) {
        console.error(err);
        showToast({ message: 'Gagal memuat bahan baku produksi', variant: 'error' });
      }
    };

    if (order.items.length > 0) {
      setConfirmState({
        title: 'Muat Otomatis Bahan Baku',
        message: 'Muat otomatis akan menimpa/memperbarui daftar belanja yang sudah ada. Apakah Anda yakin?',
        onConfirm: () => {
          proceedAutoLoad();
          setConfirmState(null);
        }
      });
    } else {
      proceedAutoLoad();
    }
  };

  const handleSaveToRecap = async (orderId: string) => {
    try {
      await updatePurchaseOrder(orderId, {
        submittedToRecap: true,
        submittedAt: new Date().toISOString()
      });
      showToast({ message: 'Data belanja PO berhasil disimpan ke Laporan Rekap!', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal menyimpan data belanja', variant: 'error' });
    }
  };

  const handleUnlockPo = async (orderId: string) => {
    try {
      await updatePurchaseOrder(orderId, {
        submittedToRecap: false
      });
      showToast({ message: 'Kunci PO dibuka, Anda dapat mengedit kembali.', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal membuka kunci PO', variant: 'error' });
    }
  };

  // Total expenditure of the current batch
  const grandTotal = useMemo(() => {
    return orders.reduce((sum, order) => sum + (order.totalPengeluaran || 0), 0);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders;
  }, [orders]);

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId || !user) return;
    const sName = newPoData.supplierName.trim();
    if (!sName) {
      showToast({ message: 'Tulis nama supplier terlebih dahulu', variant: 'error' });
      return;
    }

    try {
      await addPurchaseOrder({
        batchId: selectedBatchId,
        supplierId: sName.toLowerCase().replace(/\s+/g, '_'),
        supplierName: sName,
        type: newPoData.type,
        targetDate: newPoData.targetDate,
        groupLabel: newPoData.groupLabel,
        items: [],
        totalPengeluaran: 0,
        status: 'pending',
        orderedBy: user.uid,
        orderedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      showToast({ message: 'Purchase Order berhasil dibuat', variant: 'success' });
      setIsNewPoOpen(false);
      setNewPoData((prev) => ({ ...prev, supplierName: '' }));
    } catch {
      showToast({ message: 'Gagal membuat purchase order', variant: 'error' });
    }
  };

  const handleAddItemRow = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const newItem: MbgPurchaseItem = {
      bahanName: '',
      jamKedatangan: '08:00',
      jumlah: 0,
      satuan: 'Kg',
      hargaSatuan: 0,
      totalHarga: 0,
      keterangan: '',
    };

    const updatedItems = [...order.items, newItem];
    const totalPengeluaran = updatedItems.reduce((sum, item) => sum + item.totalHarga, 0);

    try {
      await updatePurchaseOrder(orderId, {
        items: updatedItems,
        totalPengeluaran,
      });
    } catch {
      showToast({ message: 'Gagal menambahkan item', variant: 'error' });
    }
  };

  const handleUpdateItem = async (
    orderId: string,
    index: number,
    field: keyof MbgPurchaseItem,
    value: string | number
  ) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const updatedItems = order.items.map((item, idx) => {
      if (idx !== index) return item;
      const updated = { ...item, [field]: value };
      
      // Auto calc totalHarga
      if (field === 'jumlah' || field === 'hargaSatuan') {
        const qty = field === 'jumlah' ? Number(value) : item.jumlah;
        const price = field === 'hargaSatuan' ? Number(value) : item.hargaSatuan;
        updated.totalHarga = qty * price;
      }
      return updated;
    });

    const totalPengeluaran = updatedItems.reduce((sum, item) => sum + item.totalHarga, 0);

    try {
      await updatePurchaseOrder(orderId, {
        items: updatedItems,
        totalPengeluaran,
      });
    } catch {
      showToast({ message: 'Gagal memperbarui item', variant: 'error' });
    }
  };

  const handleDeleteItem = async (orderId: string, index: number) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const updatedItems = order.items.filter((_, idx) => idx !== index);
    const totalPengeluaran = updatedItems.reduce((sum, item) => sum + item.totalHarga, 0);

    try {
      await updatePurchaseOrder(orderId, {
        items: updatedItems,
        totalPengeluaran,
      });
    } catch {
      showToast({ message: 'Gagal menghapus item', variant: 'error' });
    }
  };

  const handleUpdateStatus = async (orderId: string, status: MbgPurchaseStatus) => {
    const statusLabel = MBG_PURCHASE_STATUS_CONFIG[status].label;
    setConfirmState({
      title: 'Ubah Status Purchase Order',
      message: `Apakah Anda yakin ingin mengubah status Purchase Order ini menjadi "${statusLabel}"?`,
      onConfirm: async () => {
        try {
          await updatePurchaseOrder(orderId, { status });
          showToast({ message: `Status PO diperbarui ke: ${MBG_PURCHASE_STATUS_CONFIG[status].label}`, variant: 'success' });
          
          // If all POs are received, we can automatically update the batch status
          const updatedOrders = orders.map((o) => (o.id === orderId ? { ...o, status } : o));
          const allReceived = updatedOrders.every((o) => o.status === 'received');
          if (allReceived && selectedBatchId) {
            await updateBatchStatus(selectedBatchId, 'PURCHASED');
          } else if (selectedBatchId && selectedBatch?.status === 'PM_SUBMITTED') {
            // Mark batch as purchasing if any PO is updated
            await updateBatchStatus(selectedBatchId, 'PURCHASING');
          }
        } catch {
          showToast({ message: 'Gagal memperbarui status', variant: 'error' });
        } finally {
          setConfirmState(null);
        }
      }
    });
  };

  const handleDeleteOrder = async (orderId: string) => {
    setConfirmState({
      title: 'Hapus Purchase Order',
      message: 'Apakah Anda yakin ingin menghapus PO ini beserta semua itemnya?',
      onConfirm: async () => {
        try {
          await deletePurchaseOrder(orderId);
          showToast({ message: 'Purchase Order berhasil dihapus', variant: 'success' });
        } catch {
          showToast({ message: 'Gagal menghapus Purchase Order', variant: 'error' });
        } finally {
          setConfirmState(null);
        }
      }
    });
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Purchasing MBG</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Kelola pembelanjaan bahan baku per batch pengantaran makanan
          </p>
        </div>

        {selectedBatchId && (
          <button
            onClick={() => {
              setNewPoData((prev) => ({
                ...prev,
                targetDate: selectedBatch?.tanggal || new Date().toISOString().split('T')[0],
              }));
              setIsNewPoOpen(true);
            }}
            className="flex items-center gap-2 bg-[#111827] text-white hover:bg-black font-extrabold text-xs px-4 py-3 rounded-xl cursor-pointer shadow-md active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4 text-[#FBBF24]" />
            Tambah PO Baru
          </button>
        )}
      </div>

      {/* Batch Selection */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
        </div>
      ) : (
        <>
          <div className="mb-6">
            <SearchableBatchSelector
              batches={batches}
              selectedBatchId={selectedBatchId}
              onSelectBatch={setSelectedBatchId}
            />
          </div>

          {selectedBatchId ? (
            <>
              {/* Batch Metadata / Summary Info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">
                      Total PO
                    </span>
                    <span className="text-lg font-extrabold text-gray-800">
                      {orders.length} supplier
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">
                      Grand Total Pengeluaran
                    </span>
                    <span className="text-lg font-extrabold text-gray-800">
                      Rp {grandTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">
                      Status PO Selesai
                    </span>
                    <span className="text-lg font-extrabold text-gray-800">
                      {orders.filter((o) => o.status === 'received').length} / {orders.length}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">
                      Tanggal Target PO
                    </span>
                    <span className="text-sm font-extrabold text-gray-800">
                      {selectedBatch?.tanggal}
                    </span>
                  </div>
                </div>
              </div>

              {/* Batch Summary & Info Panel (PM, Gizi, & Resep Standar) */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 mb-6 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4 mb-4">
                  <div>
                    <h3 className="font-extrabold text-sm text-[#111827] flex items-center gap-2">
                      Detail Kebutuhan & Informasi Gizi Batch
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Lihat rincian penerima manfaat (PM), kandungan gizi porsi makanan, dan kalkulasi resep standar
                    </p>
                  </div>

                  {/* Tab Selector Buttons */}
                  <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setInfoTab(infoTab === 'pm' ? 'closed' : 'pm')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        infoTab === 'pm'
                          ? 'bg-[#111827] text-white shadow-xs'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Penerima Manfaat
                    </button>
                    <button
                      type="button"
                      onClick={() => setInfoTab(infoTab === 'nutrition' ? 'closed' : 'nutrition')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        infoTab === 'nutrition'
                          ? 'bg-[#111827] text-white shadow-xs'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Kadar Gizi Menu
                    </button>
                    <button
                      type="button"
                      onClick={() => setInfoTab(infoTab === 'ingredients' ? 'closed' : 'ingredients')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        infoTab === 'ingredients'
                          ? 'bg-[#111827] text-white shadow-xs'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Bahan Baku Standar
                    </button>
                  </div>
                </div>

                {/* Tab Contents */}
                {infoTab === 'closed' && (
                  <div className="py-2 text-center text-xs text-gray-500 font-bold bg-amber-50/50 rounded-xl border border-amber-100/50 p-3">
                    Klik salah satu opsi di atas untuk memuat rincian PM, Kadar Gizi, atau Resep Standar.
                  </div>
                )}

                {infoTab === 'pm' && (
                  <div className="animate-in fade-in duration-200">
                    {entries.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center font-bold">Belum ada data penerima manfaat (PM) untuk batch ini.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100">
                              <th className="py-2.5 px-4">Nama Sekolah / Institusi</th>
                              <th className="py-2.5 px-4 text-center">Porsi Kecil (SD)</th>
                              <th className="py-2.5 px-4 text-center">Porsi Besar (SMP/SMA)</th>
                              <th className="py-2.5 px-4 text-center">Total Porsi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {entries.map((ent) => (
                              <tr key={ent.id} className="hover:bg-gray-50/50">
                                <td className="py-2 px-4 font-bold text-[#111827]">{ent.institutionName}</td>
                                <td className="py-2 px-4 text-center font-semibold">{ent.qtPorsiKecil || 0}</td>
                                <td className="py-2 px-4 text-center font-semibold">{ent.qtPorsiBesar || 0}</td>
                                <td className="py-2 px-4 text-center font-bold text-gray-800">
                                  {(ent.qtPorsiKecil || 0) + (ent.qtPorsiBesar || 0)}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50/70 font-extrabold text-[#111827] border-t border-gray-200">
                              <td className="py-3 px-4">TOTAL KESELURUHAN</td>
                              <td className="py-3 px-4 text-center text-amber-700">
                                {entries.reduce((sum, e) => sum + (e.qtPorsiKecil || 0), 0)} porsi
                              </td>
                              <td className="py-3 px-4 text-center text-amber-700">
                                {entries.reduce((sum, e) => sum + (e.qtPorsiBesar || 0), 0)} porsi
                              </td>
                              <td className="py-3 px-4 text-center text-emerald-700">
                                {entries.reduce((sum, e) => sum + (e.qtPorsiKecil || 0) + (e.qtPorsiBesar || 0), 0)} porsi
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {infoTab === 'nutrition' && (
                  <div className="animate-in fade-in duration-200">
                    {nutritionData.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center font-bold">
                        Belum ada perhitungan kadar gizi yang disimpan oleh tim produksi untuk batch ini.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {nutritionData.map((nut) => (
                          <div key={nut.id} className="bg-gray-50/50 border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-all shadow-xs">
                            <h4 className="font-extrabold text-xs text-[#111827] uppercase tracking-wider mb-2 border-b pb-1.5 border-gray-200/60">
                              Menu: {nut.menuItemName}
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
                              <div className="flex justify-between text-gray-600 bg-white/60 p-1.5 rounded-lg">
                                <span>Energi:</span>
                                <span className="text-[#111827]">{nut.kalori || 0} kkal</span>
                              </div>
                              <div className="flex justify-between text-gray-600 bg-white/60 p-1.5 rounded-lg">
                                <span>Protein:</span>
                                <span className="text-[#111827]">{nut.protein || 0} g</span>
                              </div>
                              <div className="flex justify-between text-gray-600 bg-white/60 p-1.5 rounded-lg">
                                <span>Lemak:</span>
                                <span className="text-[#111827]">{nut.lemak || 0} g</span>
                              </div>
                              <div className="flex justify-between text-gray-600 bg-white/60 p-1.5 rounded-lg">
                                <span>Karbohidrat:</span>
                                <span className="text-[#111827]">{nut.karbohidrat || 0} g</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {infoTab === 'ingredients' && (
                  <div className="animate-in fade-in duration-200">
                    {recipeRequirements.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center font-bold">Belum ada menu standar yang dikalkulasi untuk batch ini.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-gray-100 max-h-80 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 sticky top-0 z-10">
                              <th className="py-2.5 px-4">Nama Bahan Baku</th>
                              <th className="py-2.5 px-4 text-center">Volume Total (Resep Standar)</th>
                              <th className="py-2.5 px-4">Satuan</th>
                              <th className="py-2.5 px-4">Sumber Menu Hidangan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {recipeRequirements.map((r, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="py-2 px-4 font-bold text-[#111827]">{r.name}</td>
                                <td className="py-2 px-4 text-center font-extrabold text-amber-700">
                                  {Math.round(r.amount * 100) / 100}
                                </td>
                                <td className="py-2 px-4 font-semibold text-gray-600">{r.satuan}</td>
                                <td className="py-2 px-4 text-gray-500 font-medium">{r.sourceMenus.join(', ')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* View Controller */}
              <div className="flex justify-end items-center gap-3 mb-6">

                {/* View Toggles */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      viewMode === 'table'
                        ? 'bg-[#111827] text-white border-[#111827]'
                        : 'bg-white text-gray-600 border-[#E5E7EB]'
                    }`}
                  >
                    <List className="h-4 w-4" />
                    Tabel View
                  </button>
                  <button
                    onClick={() => setViewMode('kanban')}
                    className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      viewMode === 'kanban'
                        ? 'bg-[#111827] text-white border-[#111827]'
                        : 'bg-white text-gray-600 border-[#E5E7EB]'
                    }`}
                  >
                    <Grid className="h-4 w-4" />
                    Kanban Board
                  </button>
                </div>
              </div>

              {/* View Modes Rendering */}
              {filteredOrders.length === 0 ? (
                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
                  <AlertTriangle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                  <h3 className="text-lg font-bold text-[#111827]">Belum ada Purchase Order</h3>
                  <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                    Silakan klik tombol "Tambah PO Baru" di kanan atas untuk mulai membuat pesanan belanja harian.
                  </p>
                </div>
              ) : viewMode === 'table' ? (
                /* Grouped Supplier Sections - Table Format like reference image */
                <div className="space-y-6">
                  {filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm hover:shadow-md transition-all"
                    >
                      {/* Supplier PO Header */}
                      <div className="px-6 py-4 bg-[#F9FAFB] border-b border-[#E5E7EB] flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-extrabold text-[#111827]">
                            SUPPLIER: {order.supplierName}
                          </span>
                          <span className="text-xs text-gray-500 font-bold bg-[#E5E7EB] px-2.5 py-0.5 rounded-lg">
                            {order.groupLabel}
                          </span>
                          <span className="text-xs text-gray-500 font-bold bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-lg">
                            Target: {order.targetDate}
                          </span>
                          <span className="text-xs text-gray-500 font-bold uppercase px-2.5 py-0.5 rounded-lg bg-gray-100 text-gray-800">
                            {order.type === 'harian' ? 'Harian' : 'Supplier'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Status buttons */}
                          <div className="flex bg-gray-200/50 p-1 rounded-lg">
                            {(['pending', 'ordered', 'shipped', 'received'] as const).map((st) => {
                              const active = order.status === st;
                              const cfg = MBG_PURCHASE_STATUS_CONFIG[st];
                              return (
                                <button
                                  key={st}
                                  onClick={() => handleUpdateStatus(order.id, st)}
                                  title={`Ubah status ke ${cfg.label}`}
                                  className={`text-[10px] font-extrabold px-2.5 py-1 rounded transition-all cursor-pointer ${
                                    active
                                      ? `shadow-sm text-white ${cfg.bgActiveClass}`
                                      : 'text-gray-500 hover:text-gray-900'
                                  }`}
                                >
                                  {cfg.label}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            title="Hapus Purchase Order"
                            aria-label="Hapus Purchase Order"
                            className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-all"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </div>

                      {/* Items Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[900px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-left font-bold text-gray-500 uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4 w-1/3">List Pesanan Bahan</th>
                              <th className="py-3 px-4">Jam Kedatangan</th>
                              <th className="py-3 px-4">Jumlah</th>
                              <th className="py-3 px-4">Satuan</th>
                              <th className="py-3 px-4">Harga Satuan (Rp)</th>
                              <th className="py-3 px-4">Total (Rp)</th>
                              <th className="py-3 px-4">Keterangan</th>
                              <th className="py-3 px-4 text-center">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {order.items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="py-2.5 px-4">
                                  <input
                                    type="text"
                                    value={item.bahanName}
                                    title="Nama Bahan"
                                    disabled={order.submittedToRecap === true}
                                    onChange={(e) =>
                                      handleUpdateItem(order.id, idx, 'bahanName', e.target.value)
                                    }
                                    placeholder="Contoh: Beras Ramos, Telur Ayam"
                                    className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#FBBF24] focus:outline-none py-1 font-bold text-[#111827] disabled:opacity-60"
                                  />
                                </td>
                                <td className="py-2.5 px-4">
                                  <input
                                    type="time"
                                    value={item.jamKedatangan}
                                    title="Jam Kedatangan"
                                    placeholder="00:00"
                                    disabled={order.submittedToRecap === true}
                                    onChange={(e) =>
                                      handleUpdateItem(order.id, idx, 'jamKedatangan', e.target.value)
                                    }
                                    className="bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#FBBF24] focus:outline-none py-1 disabled:opacity-60"
                                  />
                                </td>
                                <td className="py-2.5 px-4">
                                  <input
                                    type="number"
                                    value={item.jumlah || ''}
                                    title="Jumlah"
                                    disabled={order.submittedToRecap === true}
                                    onChange={(e) =>
                                      handleUpdateItem(order.id, idx, 'jumlah', Number(e.target.value))
                                    }
                                    placeholder="0"
                                    className="w-20 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#FBBF24] focus:outline-none py-1 font-bold disabled:opacity-60"
                                  />
                                </td>
                                <td className="py-2.5 px-4">
                                  <select
                                    value={item.satuan}
                                    title="Satuan"
                                    disabled={order.submittedToRecap === true}
                                    onChange={(e) =>
                                      handleUpdateItem(order.id, idx, 'satuan', e.target.value)
                                    }
                                    className="bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#FBBF24] focus:outline-none py-1 cursor-pointer font-bold text-gray-700 disabled:opacity-60"
                                  >
                                    {MBG_SATUAN_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2.5 px-4">
                                  <input
                                    type="number"
                                    value={item.hargaSatuan || ''}
                                    title="Harga Satuan"
                                    disabled={order.submittedToRecap === true}
                                    onChange={(e) =>
                                      handleUpdateItem(order.id, idx, 'hargaSatuan', Number(e.target.value))
                                    }
                                    placeholder="0"
                                    className="w-28 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#FBBF24] focus:outline-none py-1 disabled:opacity-60"
                                  />
                                </td>
                                <td className="py-2.5 px-4 font-bold text-[#111827] disabled:opacity-60">
                                  Rp {(item.totalHarga || 0).toLocaleString('id-ID')}
                                </td>
                                <td className="py-2.5 px-4">
                                  <input
                                    type="text"
                                    value={item.keterangan}
                                    title="Keterangan"
                                    disabled={order.submittedToRecap === true}
                                    onChange={(e) =>
                                      handleUpdateItem(order.id, idx, 'keterangan', e.target.value)
                                    }
                                    placeholder="Catatan..."
                                    className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#FBBF24] focus:outline-none py-1 disabled:opacity-60"
                                  />
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  {!(order.submittedToRecap === true) ? (
                                    <button
                                      onClick={() => handleDeleteItem(order.id, idx)}
                                      title="Hapus Item"
                                      aria-label="Hapus Item"
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-gray-400 font-extrabold">TERKUNCI</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
 
                      {/* Footer Section / Action Row */}
                      <div className="px-6 py-3 bg-gray-50 border-t border-[#E5E7EB] flex justify-between items-center">
                        <div className="flex gap-2">
                          {!(order.submittedToRecap === true) && (
                            <>
                              <button
                                onClick={() => handleAddItemRow(order.id)}
                                className="flex items-center gap-1.5 font-extrabold text-xs text-[#111827] hover:text-black py-1 px-3 border border-gray-300 bg-white rounded-lg hover:border-gray-400 cursor-pointer transition-all active:scale-95 shadow-sm"
                              >
                                <Plus className="h-3.5 w-3.5 text-[#FBBF24]" />
                                Tambah Baris Bahan
                              </button>
                               <button
                                type="button"
                                onClick={() => handleAutoLoadIngredients(order.id)}
                                className="flex items-center gap-1.5 font-extrabold text-xs text-emerald-800 hover:text-emerald-950 py-1 px-3 border border-emerald-300 bg-emerald-50 rounded-lg hover:bg-emerald-100 cursor-pointer transition-all active:scale-95 shadow-sm"
                              >
                                <span>Muat dari Produksi</span>
                              </button>
                            </>
                          )}
                        </div>
 
                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs font-bold text-gray-700">
                            Total Belanja Supplier:{' '}
                            <span className="text-sm font-extrabold text-[#111827] ml-1.5 mr-3">
                              Rp {(order.totalPengeluaran || 0).toLocaleString('id-ID')}
                            </span>
                          </div>
                          
                          {order.submittedToRecap ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold rounded-lg shadow-sm">
                                ✓ Sudah Disimpan
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUnlockPo(order.id)}
                                className="px-2 py-1.5 border border-gray-300 hover:bg-gray-100 text-gray-600 text-[9px] font-bold rounded-lg transition-colors cursor-pointer"
                                title="Buka kunci untuk mengedit kembali"
                              >
                                Ubah
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSaveToRecap(order.id)}
                              className="flex items-center gap-1.5 px-3 py-2 bg-[#059669] hover:bg-[#047857] text-white font-extrabold text-[10px] rounded-lg shadow-sm cursor-pointer transition-all active:scale-95 animate-in fade-in duration-200"
                            >
                              <Save className="h-3.5 w-3.5 text-[#FBBF24]" />
                              <span>Simpan PO</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Kanban View (Grouped by PO Status) */
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                  {(['pending', 'ordered', 'shipped', 'received'] as const).map((statusKey) => {
                    const cfg = MBG_PURCHASE_STATUS_CONFIG[statusKey];
                    const ordersByStatus = filteredOrders.filter((o) => o.status === statusKey);
                    return (
                      <div
                        key={statusKey}
                        className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-4 flex flex-col gap-3 min-h-[450px]"
                      >
                        {/* Kanban Column Title */}
                        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2.5 h-2.5 rounded-full ${cfg.bgActiveClass}`}
                            />
                            <span className="font-extrabold text-xs text-[#111827]">
                              {cfg.label}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-200/50 px-2 py-0.5 rounded-full">
                            {ordersByStatus.length}
                          </span>
                        </div>

                        {/* Kanban Cards */}
                        <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                          {ordersByStatus.map((order) => (
                            <div
                              key={order.id}
                              className="bg-white border border-[#E5E7EB] hover:border-gray-300 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-3"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-extrabold text-xs text-[#111827] leading-tight">
                                    {order.supplierName}
                                  </h4>
                                  <span className="text-[9px] text-gray-500 font-bold bg-[#F3F4F6] px-1.5 py-0.5 rounded-md mt-1 inline-block">
                                    {order.groupLabel}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleDeleteOrder(order.id)}
                                  title="Hapus Purchase Order"
                                  aria-label="Hapus Purchase Order"
                                  className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer shrink-0"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              <div className="text-[10px] text-gray-600">
                                <div>Bahan: {order.items.length} item</div>
                                <div>Target: {order.targetDate}</div>
                                <div className="font-extrabold text-[#111827] mt-1">
                                  Rp {(order.totalPengeluaran || 0).toLocaleString('id-ID')}
                                </div>
                              </div>

                              {/* Status Transition buttons for cards */}
                              <div className="border-t border-gray-100 pt-2 flex justify-between gap-1 mt-1">
                                {statusKey !== 'pending' && (
                                  <button
                                    onClick={() => {
                                      const steps: MbgPurchaseStatus[] = ['pending', 'ordered', 'shipped', 'received'];
                                      const currentIdx = steps.indexOf(statusKey);
                                      if (currentIdx > 0) {
                                        handleUpdateStatus(order.id, steps[currentIdx - 1]);
                                      }
                                    }}
                                    className="text-[9px] font-bold text-gray-600 bg-gray-100 border border-gray-200 px-2 py-1 rounded cursor-pointer"
                                  >
                                    ← Back
                                  </button>
                                )}
                                {statusKey !== 'received' && (
                                  <button
                                    onClick={() => {
                                      const steps: MbgPurchaseStatus[] = ['pending', 'ordered', 'shipped', 'received'];
                                      const currentIdx = steps.indexOf(statusKey);
                                      if (currentIdx < steps.length - 1) {
                                        handleUpdateStatus(order.id, steps[currentIdx + 1]);
                                      }
                                    }}
                                    className={`text-[9px] font-bold text-white px-2 py-1 rounded cursor-pointer ml-auto ${cfg.bgActiveClass}`}
                                  >
                                    Move →
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-lg font-bold text-[#111827]">Pilih batch pengiriman</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                Silakan pilih batch pengiriman di atas untuk melihat atau mengelola Purchase Orders.
              </p>
            </div>
          )}
        </>
      )}

      {/* Add New PO Modal */}
      <AnimatePresence>
        {isNewPoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 font-['Hanken_Grotesk',system-ui,sans-serif]"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-extrabold text-[#111827]">Purchase Order Baru</h3>
                <button
                  onClick={() => setIsNewPoOpen(false)}
                  title="Tutup Modal PO"
                  aria-label="Tutup Modal PO"
                  className="p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleCreatePo} className="space-y-4">
                <div>
                  <label htmlFor="new-po-supplier" className="block text-xs font-bold text-gray-700 mb-1.5">Supplier *</label>
                  <input
                    id="new-po-supplier"
                    type="text"
                    required
                    title="Supplier"
                    placeholder="Masukkan nama supplier (contoh: Toko Sembako Jaya, Pak Ahmad)"
                    value={newPoData.supplierName}
                    onChange={(e) => setNewPoData({ ...newPoData, supplierName: e.target.value })}
                    className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="new-po-type" className="block text-xs font-bold text-gray-700 mb-1.5">Tipe PO</label>
                    <select
                      id="new-po-type"
                      title="Tipe PO"
                      value={newPoData.type}
                      onChange={(e) =>
                        setNewPoData({ ...newPoData, type: e.target.value as 'harian' | 'supplier' })
                      }
                      className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all cursor-pointer font-bold text-gray-700"
                    >
                      <option value="harian">Harian</option>
                      <option value="supplier">Supplier</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="new-po-group-label" className="block text-xs font-bold text-gray-700 mb-1.5">Group Label</label>
                    <input
                      id="new-po-group-label"
                      type="text"
                      required
                      title="Group Label"
                      value={newPoData.groupLabel}
                      onChange={(e) => setNewPoData({ ...newPoData, groupLabel: e.target.value })}
                      placeholder="e.g., Pesanan A"
                      className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="new-po-target-date" className="block text-xs font-bold text-gray-700 mb-1.5">Tanggal Target</label>
                  <input
                    id="new-po-target-date"
                    type="date"
                    required
                    title="Tanggal Target"
                    placeholder="Pilih Tanggal Target"
                    value={newPoData.targetDate}
                    onChange={(e) => setNewPoData({ ...newPoData, targetDate: e.target.value })}
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                  />
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsNewPoOpen(false)}
                    className="flex-1 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 text-xs font-bold text-gray-700 cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-[#111827] text-white hover:bg-black rounded-xl cursor-pointer text-xs font-bold flex items-center justify-center gap-2 shadow-md"
                  >
                    <Save className="h-4 w-4 text-[#FBBF24]" />
                    Simpan PO
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {confirmState && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in scale-in duration-200 font-['Hanken_Grotesk']">
            <h3 className="text-base font-extrabold text-gray-900 mb-2">
              {confirmState.title}
            </h3>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
              {confirmState.message}
            </p>
            <div className="flex justify-end gap-3 font-bold text-xs">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmState.onConfirm();
                }}
                className={`px-4 py-2.5 rounded-xl text-white cursor-pointer shadow-md transition-all active:scale-95 bg-[#111827] hover:bg-black`}
              >
                Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
