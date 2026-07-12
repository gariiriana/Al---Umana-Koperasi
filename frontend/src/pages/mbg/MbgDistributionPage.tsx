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
} from 'lucide-react';
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

  // Edit kurir assignment modal state
  const [editingEntry, setEditingEntry] = useState<MbgPmEntry | null>(null);
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

  // Group PO items by supplier for receiving tab
  const receivingData = useMemo(() => {
    return orders.map((order) => ({
      supplierName: order.supplierName,
      status: order.status,
      groupLabel: order.groupLabel,
      items: order.items,
    }));
  }, [orders]);
  
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

  // Assign kurir
  const handleOpenAssign = (entry: MbgPmEntry) => {
    setEditingEntry(entry);
    setNewPetugasName(entry.assignedPetugasName || '');
  };

  const handleSaveAssignment = async () => {
    if (!editingEntry) return;
    try {
      await updateEntry(editingEntry.id, {
        assignedPetugasName: newPetugasName,
        assignedPetugasId: newPetugasName.toLowerCase().replace(/\s+/g, '-'), // Dummy UID generation
      });
      showToast({ message: 'Petugas berhasil ditugaskan', variant: 'success' });
      setEditingEntry(null);
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

        {selectedBatchId && activeTab === 'assignment' && (
          <button
            onClick={handleSyncDeliveryTasks}
            className="flex items-center gap-2 bg-[#111827] text-white hover:bg-black font-extrabold text-xs px-4 py-3 rounded-xl cursor-pointer shadow-md active:scale-95 transition-all"
          >
            <UserCheck className="h-4 w-4 text-[#FBBF24]" />
            Sinkron Tugas Kurir
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
                  {orders.map((order) => {
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
                        <div className="px-6 py-4 bg-[#111827] text-white flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4.5 w-4.5 text-[#FBBF24]" />
                            <span className="text-sm font-extrabold uppercase tracking-wider">
                              PETUGAS: {petugasName}
                            </span>
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
                          <table className="w-full text-xs text-left min-w-[800px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[9px] tracking-wider">
                                <th className="py-3 px-6">Institusi</th>
                                <th className="py-3 px-6 text-center">QT Siswa/Balita</th>
                                <th className="py-3 px-6 text-center">QT Bumil/Busui</th>
                                <th className="py-3 px-6 text-center">QT Guru/Kader</th>
                                <th className="py-3 px-6 text-center">Pobia Nasi</th>
                                <th className="py-3 px-6 text-center">Jumlah</th>
                                <th className="py-3 px-6">Jadwal Pengantaran</th>
                                <th className="py-3 px-6 text-center">Aksi</th>
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
                                  <td className="py-3 px-6 text-center">
                                    <button
                                      onClick={() => handleOpenAssign(entry)}
                                      className="py-1 px-3 border border-gray-300 rounded-lg hover:border-gray-400 font-extrabold text-[10px] text-gray-700 bg-white cursor-pointer transition-all active:scale-95"
                                    >
                                      Ubah Kurir
                                    </button>
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
                                <td className="py-3 px-6" colSpan={2}></td>
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
              <div className="p-6 border-t border-[#E5E7EB] bg-gray-50 flex justify-end gap-3">
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reassign Kurir Modal */}
      <AnimatePresence>
        {editingEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 font-['Hanken_Grotesk',system-ui,sans-serif]"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-extrabold text-[#111827]">Tugaskan Kurir</h3>
                <button
                  onClick={() => setEditingEntry(null)}
                  title="Tutup Modal Tugas Kurir"
                  aria-label="Tutup Modal Tugas Kurir"
                  className="p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase">Institusi</span>
                  <span className="block font-extrabold text-sm text-[#111827] mt-0.5">
                    {editingEntry.institutionName}
                  </span>
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
                    placeholder="Contoh: Rahmat Dede, Erik Yusep"
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all font-bold"
                  />
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingEntry(null)}
                    className="flex-1 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 text-xs font-bold text-gray-700 cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveAssignment}
                    className="flex-1 py-2.5 bg-[#111827] text-white hover:bg-black rounded-xl cursor-pointer text-xs font-bold"
                  >
                    Simpan Penugasan
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
