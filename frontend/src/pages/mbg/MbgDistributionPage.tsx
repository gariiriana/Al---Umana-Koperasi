import { useEffect, useState, useMemo, Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ClipboardCheck,
  Truck,
  Calendar,
  Check,
  X,
  Loader2,
  UserCheck,
  Building2,
  ChefHat,
  FileDown,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportDistributionToDocx } from '@/utils/docxExporter';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type {
  MbgPmBatch,
  MbgPmEntry,
  MbgPurchaseOrder,
  MbgQcCheck,
  MbgQcItemCheck,
  MbgDeliveryTask,
} from '@/types/mbg';
import { subscribeBatches, subscribeEntries, updateEntry, updateBatchStatus } from '@/services/mbgAdminService';
import { subscribePurchaseOrders } from '@/services/mbgPurchasingService';
import {
  subscribeQcChecks,
  addQcCheck,
  updateQcCheck,
  subscribeDeliveryTasks,
  addDeliveryTask,
  updateDeliveryTask,
} from '@/services/mbgDistributionService';
import { SearchableBatchSelector } from '@/components/mbg/SearchableBatchSelector';
import { MBG_SATUAN_OPTIONS } from '@/constants/mbgConstants';
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
  ingredients: {
    bahan: string;
    kebutuhan: number;
    satuan: string;
  }[];
}

const standarPorsi = porsiStandardData as StandarPorsi[];
const standarResep = resepStandardData as StandarResep[];

export function MbgDistributionPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [orders, setOrders] = useState<MbgPurchaseOrder[]>([]);
  const [qcChecks, setQcChecks] = useState<MbgQcCheck[]>([]);
  const [deliveryTasks, setDeliveryTasks] = useState<MbgDeliveryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'qc' | 'receiving' | 'assignment'>('qc');

  // QC modal state
  const [selectedOrderForQc, setSelectedOrderForQc] = useState<MbgPurchaseOrder | null>(null);
  const [qcItems, setQcItems] = useState<MbgQcItemCheck[]>([]);
  const [qcNotes, setQcNotes] = useState('');
  const [qcOverallStatus, setQcOverallStatus] = useState<'passed' | 'failed'>('passed');

  // Edit kurir assignment modal state (per batch group)
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingEntriesGroup, setEditingEntriesGroup] = useState<MbgPmEntry[]>([]);
  const [newPetugasName, setNewPetugasName] = useState('');

  // Subscribe batches
  useEffect(() => {
    const unsub = subscribeBatches((data) => {
      const activeBatches = data.filter((b) => b.status !== 'DRAFT');
      setBatches(activeBatches);
      if (activeBatches.length > 0 && !selectedBatchId) {
        setSelectedBatchId(activeBatches[0].id);
      }
      setLoading(false);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe relevant batch data
  useEffect(() => {
    if (!selectedBatchId) return;
    const unsub1 = subscribeEntries(selectedBatchId, setEntries);
    const unsub2 = subscribePurchaseOrders(selectedBatchId, setOrders);
    const unsub3 = subscribeQcChecks(selectedBatchId, setQcChecks);
    const unsub4 = subscribeDeliveryTasks(selectedBatchId, setDeliveryTasks);
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [selectedBatchId]);

  // Fallback calculation for ingredients if orders collection is empty in Firestore
  const fallbackIngredients = useMemo(() => {
    if (entries.length === 0) return [];
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
        const porsiCfg = standarPorsi.find(
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
      const recipe = standarResep.find(
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
        const porsiCfg = standarPorsi.find(
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

    return Object.values(rawIngredients).map((r) => {
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

      return {
        bahanName: r.name,
        jamKedatangan: '08:00',
        jumlah: qty,
        satuan: unit,
        hargaSatuan: 0,
        totalHarga: 0,
        keterangan: `Resep: ${r.sourceMenus.slice(0, 2).join(', ')}`,
      };
    });
  }, [entries]);

  const effectiveOrders = useMemo(() => {
    if (orders.length > 0) return orders;
    if (fallbackIngredients.length === 0) return [];
    const fallbackPo: MbgPurchaseOrder = {
      id: `fallback_${selectedBatchId}`,
      batchId: selectedBatchId || '',
      supplierId: 'pasar_utama',
      supplierName: 'PASAR / SUPPLIER UTAMA',
      type: 'harian',
      targetDate: new Date().toISOString().split('T')[0],
      groupLabel: 'Pesanan A',
      items: fallbackIngredients,
      totalPengeluaran: 0,
      status: 'ordered',
      orderedBy: 'system',
      orderedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return [fallbackPo];
  }, [orders, fallbackIngredients, selectedBatchId]);

  // Group PO items by supplier for receiving tab
  const receivingData = useMemo(() => {
    return effectiveOrders.map((order) => ({
      supplierName: order.supplierName,
      status: order.status,
      groupLabel: order.groupLabel,
      items: order.items,
    }));
  }, [effectiveOrders]);
  
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

  // Check if any entry has menu keringan
  const hasMenuKeringan = useMemo(() => {
    return entries.some((e) => e.menuKeringanItems && e.menuKeringanItems.length > 0);
  }, [entries]);

  // Handle open QC modal
  const handleOpenQc = (order: MbgPurchaseOrder) => {
    const existingCheck = qcChecks.find((c) => c.purchaseOrderId === order.id);
    setSelectedOrderForQc(order);
    setQcNotes(existingCheck?.notes || '');
    setQcOverallStatus(existingCheck?.overallStatus === 'failed' ? 'failed' : 'passed');

    if (existingCheck) {
      setQcItems(existingCheck.items);
    } else {
      // Build initial checklist
      const initialItems = order.items.map((item) => ({
        bahanName: item.bahanName,
        jumlahOrdered: item.jumlah,
        jumlahReceived: item.jumlah,
        satuanOrdered: item.satuan,
        isJumlahOk: true,
        isKualitasOk: true,
        isQuantityOk: true,
        isKesesuaianOk: true,
        isFreshOk: true,
        isPackagingOk: true,
        failReason: '',
        status: 'ok' as const,
      }));
      setQcItems(initialItems);
    }
  };

  const handleToggleItemCheck = (index: number, field: keyof Omit<MbgQcItemCheck, 'bahanName' | 'satuanOrdered' | 'failReason' | 'status'>) => {
    setQcItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: !item[field] };
        
        // Auto update status based on check flags
        const isOk =
          updated.isJumlahOk &&
          updated.isKualitasOk &&
          updated.isQuantityOk &&
          updated.isKesesuaianOk &&
          updated.isFreshOk &&
          updated.isPackagingOk;
        updated.status = isOk ? 'ok' : 'rejected';
        
        return updated;
      })
    );
  };

  const handleItemReasonChange = (index: number, reason: string) => {
    setQcItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, failReason: reason } : item))
    );
  };

  const handleItemQtyReceivedChange = (index: number, val: number) => {
    setQcItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, jumlahReceived: val } : item))
    );
  };

  const handleSubmitQc = async () => {
    if (!selectedOrderForQc || !selectedBatchId || !user) return;

    try {
      const existingCheck = qcChecks.find((c) => c.purchaseOrderId === selectedOrderForQc.id);
      
      const payload = {
        batchId: selectedBatchId,
        purchaseOrderId: selectedOrderForQc.id,
        supplierName: selectedOrderForQc.supplierName,
        items: qcItems,
        overallStatus: qcOverallStatus,
        notes: qcNotes,
        photoFileIds: [],
        checkedBy: user.uid,
        checkedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (existingCheck) {
        await updateQcCheck(existingCheck.id, payload);
      } else {
        await addQcCheck({
          ...payload,
          createdAt: new Date().toISOString(),
        });
      }

      // Update PO status to received
      // If overall QC passed, set to 'received'.
      showToast({ message: 'QC check berhasil disimpan', variant: 'success' });
      setSelectedOrderForQc(null);

      // Check if all POs are now checked and passed
      // If so, update batch status to QC_PASSED
      const updatedChecks = existingCheck
        ? qcChecks.map((c) => (c.id === existingCheck.id ? { ...c, overallStatus: qcOverallStatus } : c))
        : [...qcChecks, { ...payload, id: 'temp' }];

      const allChecked = orders.every((o) => updatedChecks.some((c) => c.purchaseOrderId === o.id));
      const allPassed = updatedChecks.every((c) => c.overallStatus === 'passed');

      if (allChecked) {
        await updateBatchStatus(selectedBatchId, allPassed ? 'QC_PASSED' : 'QC_FAILED');
      }
    } catch {
      showToast({ message: 'Gagal memproses QC', variant: 'error' });
    }
  };

  const handleExportPdfForQc = (poOrder: MbgPurchaseOrder) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text('LAPORAN HASIL CHECKLIST QC BAHAN MBG', pageW / 2, 18, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Supplier: ${poOrder.supplierName} | Tanggal: ${poOrder.targetDate}`, pageW / 2, 25, { align: 'center' });

      doc.setDrawColor(226, 232, 240);
      doc.line(14, 29, pageW - 14, 29);

      const tableHeaders = ['No', 'Nama Bahan', 'Qty Dipesan', 'Qty Diterima', 'Status QC', 'Catatan'];
      const tableRows = qcItems.map((item, idx) => [
        `${idx + 1}`,
        item.bahanName,
        `${item.jumlahOrdered} ${item.satuanOrdered}`,
        `${item.jumlahReceived} ${item.satuanOrdered}`,
        item.status === 'ok' ? 'LULUS (OK)' : 'REJECTED',
        item.failReason || 'Sesuai Spesifikasi',
      ]);

      autoTable(doc, {
        startY: 34,
        head: [tableHeaders],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8, textColor: [15, 23, 42] },
      });

      doc.save(`Laporan_QC_${poOrder.supplierName.replace(/\s+/g, '_')}_${poOrder.targetDate}.pdf`);
      showToast({ message: 'Export PDF QC berhasil!', variant: 'success' });
    } catch (err) {
      console.error('Failed to export PDF QC:', err);
      showToast({ message: 'Gagal mengekspor PDF QC', variant: 'error' });
    }
  };

  const handleExportDocxForQc = async (poOrder: MbgPurchaseOrder) => {
    try {
      showToast({ message: 'Menyiapkan file Word QC (.docx)...', variant: 'info' });
      const purchasingPhotos = poOrder.items.map((i) => i.photoUrl).filter(Boolean) as string[];

      await exportDistributionToDocx(
        {
          title: `Laporan QC & Delivery ${poOrder.supplierName}`,
          deliveryDate: poOrder.targetDate,
          institutionName: poOrder.supplierName,
          institutionType: 'sekolah',
          driverName: 'Tim Transportasi MBG',
          vehicleNumber: 'B 1234 MBG',
          qtPorsiBesar: 0,
          qtPorsiKecil: 0,
          qtPorsiBalita: 0,
          qtPorsiBumilBusui: 0,
          qtGuruKader: 0,
          totalPortions: poOrder.items.length,
          qcStatus: qcOverallStatus === 'passed' ? 'PASS' : 'FAIL',
          qcNotes: qcNotes,
          photos: purchasingPhotos,
        },
        `QC_Report_${poOrder.supplierName.replace(/\s+/g, '_')}_${poOrder.targetDate}`
      );
      showToast({ message: 'Export DOCX QC berhasil!', variant: 'success' });
    } catch (err) {
      console.error('Failed to export DOCX QC:', err);
      showToast({ message: 'Gagal mengekspor DOCX QC', variant: 'error' });
    }
  };

  // Assign kurir per batch group
  const handleOpenAssignGroup = (petugasName: string, groupEntries: MbgPmEntry[]) => {
    setEditingGroupKey(petugasName);
    setEditingEntriesGroup(groupEntries);
    setNewPetugasName(petugasName === 'Belum Ditugaskan' ? '' : petugasName);
  };

  const handleSaveGroupAssignment = async () => {
    if (!editingGroupKey || editingEntriesGroup.length === 0 || !newPetugasName.trim()) return;
    const cleanName = newPetugasName.trim();
    const petugasId = cleanName.toLowerCase().replace(/\s+/g, '-');

    try {
      await Promise.all(
        editingEntriesGroup.map((entry) =>
          updateEntry(entry.id, {
            assignedPetugasName: cleanName,
            assignedPetugasId: petugasId,
          })
        )
      );

      showToast({
        message: `${editingEntriesGroup.length} institusi berhasil ditugaskan ke ${cleanName}`,
        variant: 'success',
      });
      setEditingGroupKey(null);
      setEditingEntriesGroup([]);
    } catch {
      showToast({ message: 'Gagal menugaskan petugas', variant: 'error' });
    }
  };

  // Generate / Sync Delivery Tasks
  const handleSyncDeliveryTasks = async () => {
    if (!selectedBatchId) return;
    try {
      // Find all unique kurir assigned in entries
      const kurirs = Array.from(new Set(entries.map((e) => e.assignedPetugasName).filter(Boolean)));
      if (kurirs.length === 0) {
        showToast({ message: 'Tidak ada petugas yang ditugaskan di data PM', variant: 'info' });
        return;
      }

      let created = 0;
      let updated = 0;

      for (const kName of kurirs) {
        const kEntries = entries.filter((e) => e.assignedPetugasName === kName && !e.isSekolahLibur);
        const totalPorsi = kEntries.reduce((sum, e) => sum + (e.jumlah || 0), 0);
        const entryIds = kEntries.map((e) => e.id);
        const kId = kName.toLowerCase().replace(/\s+/g, '-');

        const existingTask = deliveryTasks.find((t) => t.petugasName === kName);

        if (existingTask) {
          await updateDeliveryTask(existingTask.id, {
            entryIds,
            totalPorsi,
          });
          updated++;
        } else {
          await addDeliveryTask({
            batchId: selectedBatchId,
            petugasId: kId,
            petugasName: kName,
            entryIds,
            totalPorsi,
            handoverPhotoId: '',
            handoverAt: '',
            status: 'waiting',
            deliveryPhotos: [],
            completedAt: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          created++;
        }
      }

      showToast({
        message: `Tugas Pengiriman sinkron: ${created} baru, ${updated} diperbarui`,
        variant: 'success',
      });
    } catch {
      showToast({ message: 'Gagal melakukan sinkronisasi kurir', variant: 'error' });
    }
  };

  const handleHandoverToCooking = async () => {
    if (!selectedBatchId) return;
    try {
      await updateBatchStatus(selectedBatchId, 'COOKING');
      showToast({ message: 'Bahan makanan telah lolos QC & diserahkan ke Tim Produksi untuk dimasak!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal melakukan handover ke tim produksi', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Distribusi MBG</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Lakukan Quality Control (QC) bahan masuk dan atur penugasan kurir pengantaran
          </p>
        </div>

        {selectedBatchId && (
          <div className="flex items-center gap-2">
            {activeTab === 'qc' && (
              <button
                onClick={handleHandoverToCooking}
                className="flex items-center gap-2 bg-[#0284C7] hover:bg-[#0369A1] text-white font-extrabold text-xs px-4 py-3 rounded-xl cursor-pointer shadow-md active:scale-95 transition-all"
                title="Handover bahan yang telah di-QC ke Tim Produksi untuk proses masak"
              >
                <ChefHat className="h-4 w-4 text-[#FBBF24]" />
                <span>Handover ke Tim Produksi (Siap Masak)</span>
              </button>
            )}
            {activeTab === 'assignment' && (
              <button
                onClick={handleSyncDeliveryTasks}
                className="flex items-center gap-2 bg-[#111827] text-white hover:bg-black font-extrabold text-xs px-4 py-3 rounded-xl cursor-pointer shadow-md active:scale-95 transition-all"
              >
                <UserCheck className="h-4 w-4 text-[#FBBF24]" />
                <span>Sinkron Tugas Kurir</span>
              </button>
            )}
          </div>
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
              {/* Tab Controller */}
              <div className="flex gap-1 mb-6 bg-[#F3F4F6] rounded-xl p-1 max-w-xl">
                {(['qc', 'receiving', 'assignment'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      activeTab === tab
                        ? 'bg-white text-[#111827] shadow-sm'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    {tab === 'qc' ? '📋 QC Bahan' : tab === 'receiving' ? '📦 Penerimaan Bahan' : '🚚 Penugasan Kurir'}
                  </button>
                ))}
              </div>

              {/* QC Tab */}
              {activeTab === 'qc' ? (
                <div className="space-y-4">
                  {effectiveOrders.map((order) => {
                    const check = qcChecks.find((c) => c.purchaseOrderId === order.id);
                    return (
                      <div
                        key={order.id}
                        className="bg-white rounded-2xl border border-[#E5E7EB] p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-gray-300 transition-all shadow-sm"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-sm text-[#111827]">
                              Supplier: {order.supplierName}
                            </h3>
                            <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                              {order.groupLabel}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            Bahan: {order.items.length} item • Total Belanja: Rp{' '}
                            {order.totalPengeluaran.toLocaleString('id-ID')}
                          </p>
                          <div className="flex items-center gap-2 pt-1.5">
                            {check ? (
                              check.overallStatus === 'passed' ? (
                                <span className="text-[10px] font-extrabold text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Check className="h-3 w-3" /> QC Passed
                                </span>
                              ) : (
                                <span className="text-[10px] font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <X className="h-3 w-3" /> QC Failed
                                </span>
                              )
                            ) : (
                              <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                ⏳ Belum Di-QC
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleOpenQc(order)}
                          className="shrink-0 flex items-center gap-1.5 bg-[#111827] text-white hover:bg-black font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer shadow-sm"
                        >
                          <ClipboardCheck className="h-4 w-4 text-[#FBBF24]" />
                          {check ? 'Lihat/Edit QC' : 'Lakukan QC'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : activeTab === 'receiving' ? (
                /* Penerimaan Bahan Tab - Format matching Foto 1 (green table) */
                <div className="space-y-5">
                  {receivingData.length === 0 ? (
                    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
                      <ClipboardCheck className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                      <h3 className="text-lg font-bold text-[#111827]">Belum Ada Data Bahan</h3>
                      <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                        Data pesanan bahan akan muncul setelah tim Purchasing menginput Purchase Order.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                      <div className="px-6 py-4 bg-[#065F46] text-white flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <ClipboardCheck className="h-4.5 w-4.5 text-[#6EE7B7]" />
                          <span className="text-sm font-extrabold uppercase tracking-wider">
                            List Pesanan Bahan
                          </span>
                        </div>
                        <span className="text-xs font-bold bg-white/15 px-3 py-1.5 rounded-full">
                          {receivingData.reduce((sum, s) => sum + s.items.length, 0)} Item dari {receivingData.length} Supplier
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left min-w-[700px]">
                          <thead>
                            <tr className="bg-[#ECFDF5] text-[#065F46] text-[9px] font-extrabold uppercase tracking-wider border-b border-[#A7F3D0]">
                              <th className="py-3 px-6">List Pesanan Bahan</th>
                              <th className="py-3 px-6 text-center">Jam Kedatangan</th>
                              <th className="py-3 px-6 text-center">Jumlah</th>
                              <th className="py-3 px-6 text-center">Item</th>
                              <th className="py-3 px-6">Keterangan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receivingData.map((supplier) => (
                              <Fragment key={supplier.supplierName}>
                                {/* Supplier Header Row */}
                                <tr key={`header-${supplier.supplierName}`} className="bg-[#F0FDF4] border-t-2 border-[#BBF7D0]">
                                  <td colSpan={5} className="py-2.5 px-6">
                                    <div className="flex items-center justify-between">
                                      <span className="font-extrabold text-[#065F46] text-xs uppercase tracking-wider">
                                        {supplier.supplierName}
                                      </span>
                                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                                        supplier.status === 'received'
                                          ? 'text-green-700 bg-green-100'
                                          : supplier.status === 'shipped'
                                          ? 'text-blue-700 bg-blue-100'
                                          : supplier.status === 'ordered'
                                          ? 'text-amber-700 bg-amber-100'
                                          : 'text-gray-500 bg-gray-100'
                                      }`}>
                                        {supplier.status === 'received' ? '✅ Sudah Diterima'
                                          : supplier.status === 'shipped' ? '🚛 Dalam Perjalanan'
                                          : supplier.status === 'ordered' ? '📝 Sudah Dipesan'
                                          : '⏳ Pending'}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                                {/* Items */}
                                {supplier.items.map((item, idx) => (
                                  <tr key={`${supplier.supplierName}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                                    <td className="py-2.5 px-6 font-semibold text-[#111827]">{item.bahanName}</td>
                                    <td className="py-2.5 px-6 text-center font-bold text-gray-600">{item.jamKedatangan || '-'}</td>
                                    <td className="py-2.5 px-6 text-center font-bold text-[#111827]">{item.jumlah}</td>
                                    <td className="py-2.5 px-6 text-center font-semibold text-gray-600">{item.satuan}</td>
                                    <td className="py-2.5 px-6 text-gray-500">{item.keterangan || '-'}</td>
                                  </tr>
                                ))}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Kurir Assignment Tab - Petugas format matching Foto 2 */
                <div className="space-y-6">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs font-bold text-amber-900 flex items-center gap-2 shadow-xs">
                    <Truck className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>💡 Penugasan Kurir dapat dilakukan langsung setelah Data PM disubmit oleh Admin MBG, tanpa perlu menunggu proses masak selesai.</span>
                  </div>

                  {/* GANTI MENU KERINGAN label */}
                  {hasMenuKeringan && (
                    <div className="flex items-center gap-2 text-xs font-extrabold text-red-700 bg-red-50 px-4 py-3 rounded-xl border border-red-200">
                      🍚 GANTI MENU KERINGAN
                    </div>
                  )}

                  {Object.entries(groupedEntries).map(([petugasName, entriesList]) => {
                    const activeEntries = entriesList.filter((e) => !e.isSekolahLibur);
                    const totalSiswa = activeEntries.reduce((sum, e) => sum + (e.qtSiswaBalita || 0), 0);
                    const totalBumil = activeEntries.reduce((sum, e) => sum + (e.qtBumilBusui || 0), 0);
                    const totalGuru = activeEntries.reduce((sum, e) => sum + (e.qtGuruKader || 0), 0);
                    const totalPobia = activeEntries.reduce((sum, e) => sum + (e.qtPobiaNasi || 0), 0);
                    const totalPorsi = activeEntries.reduce((sum, e) => sum + (e.jumlah || 0), 0);
                    return (
                      <div
                        key={petugasName}
                        className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm"
                      >
                        {/* Header */}
                        <div className="px-6 py-4 bg-[#111827] text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div className="flex items-center gap-3">
                            <Truck className="h-5 w-5 text-[#FBBF24]" />
                            <span className="text-sm font-extrabold uppercase tracking-wider">
                              PETUGAS: {petugasName}
                            </span>
                            <button
                              onClick={() => handleOpenAssignGroup(petugasName, entriesList)}
                              className="px-3.5 py-1.5 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] font-extrabold text-xs rounded-xl cursor-pointer transition-all shadow-xs flex items-center gap-1.5 active:scale-95 ml-2"
                            >
                              <UserCheck className="h-4 w-4 text-[#111827]" />
                              {petugasName === 'Belum Ditugaskan' ? 'Tugaskan Kurir Batch' : 'Ubah Kurir Batch'}
                            </button>
                          </div>
                          <div className="flex gap-3 text-xs font-bold text-white bg-white/10 px-3.5 py-1.5 rounded-full">
                            <span>{entriesList.length} Institusi</span>
                            <span>•</span>
                            <span>{totalPorsi} Porsi</span>
                          </div>
                        </div>

                        {/* Libur note */}
                        {entriesList.some((e) => e.isSekolahLibur) && (
                          <div className="px-6 py-2 bg-red-50 text-red-700 text-[10px] font-extrabold border-b border-red-100 uppercase tracking-wide">
                            🔴 SEKOLAH LIBUR (ditandai merah)
                          </div>
                        )}

                        {/* Table of deliveries for this petugas */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left min-w-[700px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[9px] tracking-wider">
                                <th className="py-3 px-6">Institusi</th>
                                <th className="py-3 px-6 text-center">QT Siswa/Balita</th>
                                <th className="py-3 px-6 text-center">QT Bumil/Busui</th>
                                <th className="py-3 px-6 text-center">QT Guru/Kader</th>
                                <th className="py-3 px-6 text-center">Pobia Nasi</th>
                                <th className="py-3 px-6 text-center">Jumlah</th>
                                <th className="py-3 px-6">Jadwal Pengantaran</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {entriesList.map((entry) => (
                                <tr
                                  key={entry.id}
                                  className={`hover:bg-gray-50/50 ${
                                    entry.isSekolahLibur ? 'bg-red-50/40 text-red-500 line-through' : ''
                                  }`}
                                >
                                  <td className="py-3 px-6 font-bold flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-gray-400" />
                                    <div>
                                      <div className="no-underline">{entry.institutionName}</div>
                                      {entry.isSekolahLibur && (
                                        <span className="text-[9px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-extrabold uppercase no-underline">
                                          Libur
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-6 text-center font-bold">
                                    {entry.qtSiswaBalita}
                                  </td>
                                  <td className="py-3 px-6 text-center font-bold">
                                    {entry.qtBumilBusui}
                                  </td>
                                  <td className="py-3 px-6 text-center font-bold">
                                    {entry.qtGuruKader}
                                  </td>
                                  <td className="py-3 px-6 text-center font-bold text-amber-600">
                                    {entry.qtPobiaNasi}
                                  </td>
                                  <td className="py-3 px-6 text-center">
                                    <span className="px-2 py-0.5 bg-[#FBBF24]/20 text-[#92400E] rounded-full font-extrabold text-[10px]">
                                      {entry.jumlah}
                                    </span>
                                  </td>
                                  <td className="py-3 px-6 font-bold text-gray-700">
                                    {entry.jadwalPengantaran || '-'}
                                  </td>
                                </tr>
                              ))}
                              {/* Total Row */}
                              <tr className="bg-[#111827] text-white font-extrabold text-xs">
                                <td className="py-3 px-6" colSpan={1}>TOTAL</td>
                                <td className="py-3 px-6 text-center">{totalSiswa}</td>
                                <td className="py-3 px-6 text-center">{totalBumil}</td>
                                <td className="py-3 px-6 text-center">{totalGuru}</td>
                                <td className="py-3 px-6 text-center">{totalPobia}</td>
                                <td className="py-3 px-6 text-center">
                                  <span className="px-2.5 py-0.5 bg-[#FBBF24] text-[#111827] rounded-full font-extrabold">
                                    {totalPorsi}
                                  </span>
                                </td>
                                <td className="py-3 px-6" colSpan={1}></td>
                              </tr>
                            </tbody>
                          </table>
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
                Silakan pilih batch pengiriman di atas untuk melihat data QC dan Penugasan Kurir.
              </p>
            </div>
          )}
        </>
      )}

      {/* QC Dialog */}
      <AnimatePresence>
        {selectedOrderForQc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col justify-between font-['Hanken_Grotesk',system-ui,sans-serif]"
            >
              {/* Header */}
              <div className="p-6 border-b border-[#E5E7EB] flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-extrabold text-[#111827]">
                    QC Checklist: {selectedOrderForQc.supplierName}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Lakukan pemeriksaan 6 poin kualitas pada masing-masing barang yang datang
                  </p>
                </div>
                <button
                  onClick={() => setSelectedOrderForQc(null)}
                  title="Tutup Modal QC"
                  aria-label="Tutup Modal QC"
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 uppercase text-[9px] tracking-wider">
                        <th className="py-2.5 px-3 w-1/4">Nama Bahan</th>
                        <th className="py-2.5 px-3 text-center">Dipesan</th>
                        <th className="py-2.5 px-3 text-center">Diterima</th>
                        <th className="py-2.5 px-3 text-center">Jumlah Ok</th>
                        <th className="py-2.5 px-3 text-center">Kualitas Ok</th>
                        <th className="py-2.5 px-3 text-center">Qty Ok</th>
                        <th className="py-2.5 px-3 text-center">Kesesuaian Ok</th>
                        <th className="py-2.5 px-3 text-center">Kesegaran Ok</th>
                        <th className="py-2.5 px-3 text-center">Kemasan Ok</th>
                        <th className="py-2.5 px-3">Alasan Reject</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {qcItems.map((item, idx) => (
                        <tr key={idx} className={item.status === 'rejected' ? 'bg-red-50/20' : ''}>
                          <td className="py-3 px-3 font-bold text-[#111827]">{item.bahanName}</td>
                          <td className="py-3 px-3 text-center font-semibold text-gray-600">
                            {item.jumlahOrdered} {item.satuanOrdered}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <input
                              type="number"
                              title="Jumlah Diterima"
                              placeholder="Qty"
                              value={item.jumlahReceived}
                              onChange={(e) =>
                                handleItemQtyReceivedChange(idx, Number(e.target.value))
                              }
                              className="w-16 border rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
                            />
                          </td>
                          {(
                            [
                              'isJumlahOk',
                              'isKualitasOk',
                              'isQuantityOk',
                              'isKesesuaianOk',
                              'isFreshOk',
                              'isPackagingOk',
                            ] as const
                          ).map((f) => (
                            <td key={f} className="py-3 px-3 text-center">
                              <button
                                onClick={() => handleToggleItemCheck(idx, f)}
                                className={`w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-all ${
                                  item[f]
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {item[f] ? '✓' : '✗'}
                              </button>
                            </td>
                          ))}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={item.failReason}
                              onChange={(e) => handleItemReasonChange(idx, e.target.value)}
                              placeholder="Alasan reject..."
                              disabled={item.status === 'ok'}
                              className={`w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FBBF24] ${
                                item.status === 'ok'
                                  ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                                  : 'border-red-300 focus:ring-red-400'
                              }`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Purchasing Photos Preview Section */}
                {selectedOrderForQc.items.some((i) => i.photoUrl) && (
                  <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200">
                    <p className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-amber-600" />
                      Foto Bukti Belanjaan dari Tim Purchasing ({selectedOrderForQc.items.filter((i) => i.photoUrl).length} Foto)
                    </p>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {selectedOrderForQc.items
                        .filter((i) => i.photoUrl)
                        .map((it, idx) => (
                          <div key={idx} className="shrink-0 bg-white p-2 rounded-lg border border-amber-200 text-center shadow-xs">
                            <img src={it.photoUrl} alt={it.bahanName} className="h-16 w-20 object-cover rounded-md mb-1" />
                            <p className="text-[10px] font-bold text-slate-800 truncate max-w-[80px]">{it.bahanName}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Overall status & Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-700">Status QC Hasil Akhir</label>
                    <div className="flex bg-[#F3F4F6] rounded-xl p-1 max-w-xs">
                      <button
                        type="button"
                        onClick={() => setQcOverallStatus('passed')}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          qcOverallStatus === 'passed'
                            ? 'bg-[#059669] text-white shadow'
                            : 'text-[#6B7280]'
                        }`}
                      >
                        ✓ PASS
                      </button>
                      <button
                        type="button"
                        onClick={() => setQcOverallStatus('failed')}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          qcOverallStatus === 'failed'
                            ? 'bg-red-600 text-white shadow'
                            : 'text-[#6B7280]'
                        }`}
                      >
                        ✗ FAIL
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Catatan Distribusi</label>
                    <textarea
                      rows={2}
                      value={qcNotes}
                      onChange={(e) => setQcNotes(e.target.value)}
                      placeholder="Catatan tambahan mengenai kedatangan barang..."
                      className="w-full text-xs border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-[#E5E7EB] bg-gray-50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportPdfForQc(selectedOrderForQc)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1E293B] hover:bg-[#0F172A] text-white text-xs font-extrabold rounded-xl shadow-xs cursor-pointer transition-colors"
                  >
                    <FileDown className="h-4 w-4" /> Export PDF QC
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportDocxForQc(selectedOrderForQc)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-extrabold rounded-xl shadow-xs cursor-pointer transition-colors"
                  >
                    <FileText className="h-4 w-4" /> Export DOCX QC
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedOrderForQc(null)}
                    className="px-5 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 text-xs font-bold text-gray-700 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSubmitQc}
                    className="px-5 py-2.5 bg-[#111827] text-white hover:bg-black rounded-xl cursor-pointer text-xs font-bold"
                  >
                    Simpan Hasil QC
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reassign Kurir Batch Modal */}
      <AnimatePresence>
        {editingGroupKey && editingEntriesGroup.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 font-['Hanken_Grotesk',system-ui,sans-serif]"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
                    Penugasan Kurir Batch
                  </span>
                  <h3 className="text-lg font-extrabold text-[#111827]">
                    {editingGroupKey === 'Belum Ditugaskan' ? 'Tugaskan Kurir Baru' : `Ubah Kurir (${editingGroupKey})`}
                  </h3>
                </div>
                <button
                  onClick={() => setEditingGroupKey(null)}
                  title="Tutup Modal"
                  className="p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Batch Stats */}
                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex justify-between items-center text-xs font-bold text-amber-900">
                  <span>Target Penugasan:</span>
                  <div className="flex gap-2">
                    <span className="bg-white px-2 py-0.5 rounded border border-amber-300">
                      {editingEntriesGroup.length} Institusi
                    </span>
                    <span className="bg-amber-600 text-white px-2 py-0.5 rounded">
                      {editingEntriesGroup.reduce((s, e) => s + (e.jumlah || 0), 0)} Porsi
                    </span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Pilih Petugas / Preset</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Rahmat Dede', 'Erik Yusep', 'Yendi Firdi', 'Hilman'].map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setNewPetugasName(name)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          newPetugasName === name
                            ? 'bg-[#111827] text-white border-[#111827]'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="kurir-name" className="block text-xs font-bold text-gray-700 mb-1.5">Nama Petugas / Kurir</label>
                  <input
                    id="kurir-name"
                    type="text"
                    required
                    title="Nama Petugas / Kurir"
                    value={newPetugasName}
                    onChange={(e) => setNewPetugasName(e.target.value)}
                    placeholder="Ketik atau pilih nama petugas..."
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all font-bold text-gray-900"
                  />
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingGroupKey(null)}
                    className="flex-1 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 text-xs font-bold text-gray-700 cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveGroupAssignment}
                    disabled={!newPetugasName.trim()}
                    className="flex-1 py-2.5 bg-[#111827] text-white hover:bg-black rounded-xl cursor-pointer text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Simpan Penugasan Batch
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
