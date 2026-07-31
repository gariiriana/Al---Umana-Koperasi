// ============================================================================
// MBG Sub Purchasing Page — Sub Purchasing MBG: Execute Shopping Tasks
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import {
  ShoppingBag,
  Loader2,
  Camera,
  Clock,
  Save,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgSubPurchasingTask, MbgSubPurchasingItem } from '@/types/mbg';
import { subscribeBatches } from '@/services/mbgAdminService';
import {
  subscribeSubPurchasingTasks,
  updateSubPurchasingTask,
} from '@/services/mbgSubPurchasingService';
import { LiveCamera } from '@/components/LiveCamera';
import { compressBase64Image } from '@/utils/imageCompressor';
import { SearchableBatchSelector } from '@/components/mbg/SearchableBatchSelector';

export function MbgSubPurchasingPage() {
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<MbgSubPurchasingTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Task for item editing
  const [activeTask, setActiveTask] = useState<MbgSubPurchasingTask | null>(null);

  // Camera state for per-item photo
  const [showCamera, setShowCamera] = useState(false);
  const [cameraItemIndex, setCameraItemIndex] = useState<number | null>(null);

  // Subscribe active batches
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

  // Subscribe sub purchasing tasks for selected batch
  useEffect(() => {
    if (!selectedBatchId) return;
    const unsub = subscribeSubPurchasingTasks(selectedBatchId, (list) => {
      setTasks(list);
    });
    return unsub;
  }, [selectedBatchId]);

  // Filter tasks: if role is sub_purchasing_mbg, show tasks assigned to me or all batch tasks
  const myTasks = useMemo(() => {
    if (!selectedBatchId) return [];
    return tasks;
  }, [tasks, selectedBatchId]);

  // Sync active task when tasks change
  useEffect(() => {
    if (activeTask) {
      const updated = tasks.find((t) => t.id === activeTask.id);
      if (updated) setActiveTask(updated);
    }
  }, [tasks, activeTask]);

  // Handle local item edits before saving
  const handleItemChange = (idx: number, field: keyof MbgSubPurchasingItem, value: string | number) => {
    if (!activeTask) return;
    const newItems = [...activeTask.items];
    const item = { ...newItems[idx], [field]: value };

    if (field === 'jumlah' || field === 'hargaSatuan') {
      const qty = field === 'jumlah' ? Number(value) : item.jumlah;
      const price = field === 'hargaSatuan' ? Number(value) : item.hargaSatuan;
      item.totalHarga = qty * price;
    }

    newItems[idx] = item;
    const totalPengeluaran = newItems.reduce((sum, i) => sum + (i.totalHarga || 0), 0);

    setActiveTask({
      ...activeTask,
      items: newItems,
      totalPengeluaran,
    });
  };

  // Toggle item status (belum_beli / sudah_beli)
  const handleToggleItemStatus = (idx: number) => {
    if (!activeTask) return;
    const newItems = [...activeTask.items];
    const curr = newItems[idx].status;
    newItems[idx] = {
      ...newItems[idx],
      status: curr === 'sudah_beli' ? 'belum_beli' : 'sudah_beli',
    };

    setActiveTask({
      ...activeTask,
      items: newItems,
    });
  };

  // Save changes to Firestore task
  const handleSaveTask = async () => {
    if (!activeTask) return;
    try {
      const allDone = activeTask.items.every((i) => i.status === 'sudah_beli');
      const newStatus = allDone ? 'completed' : 'in_progress';

      await updateSubPurchasingTask(activeTask.id, {
        items: activeTask.items,
        totalPengeluaran: activeTask.totalPengeluaran,
        status: newStatus,
        completedAt: allDone ? new Date().toISOString() : undefined,
      });

      showToast({ message: 'Tugas belanja berhasil disimpan!', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal menyimpan tugas belanja', variant: 'error' });
    }
  };

  // Open camera for item
  const handleStartPhoto = (idx: number) => {
    setCameraItemIndex(idx);
    setShowCamera(true);
  };

  // Process photo capture
  const handlePhotoCaptured = async (file: File) => {
    if (!activeTask || cameraItemIndex === null) return;
    setShowCamera(false);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const rawBase64 = reader.result as string;
        const compressed = await compressBase64Image(rawBase64, 800, 800, 0.75);

        const newItems = [...activeTask.items];
        newItems[cameraItemIndex] = {
          ...newItems[cameraItemIndex],
          photoUrl: compressed,
          status: 'sudah_beli',
        };

        const totalPengeluaran = newItems.reduce((sum, i) => sum + (i.totalHarga || 0), 0);

        const updatedTask = {
          ...activeTask,
          items: newItems,
          totalPengeluaran,
        };

        setActiveTask(updatedTask);

        // Auto save photo to Firestore
        await updateSubPurchasingTask(activeTask.id, {
          items: newItems,
          totalPengeluaran,
        });

        showToast({ message: `Foto ${newItems[cameraItemIndex].bahanName} disimpan`, variant: 'success' });
      };
      reader.readAsDataURL(file);
    } catch {
      showToast({ message: 'Gagal memproses foto bahan', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Sub Purchasing MBG</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Belanja bahan yang ditugaskan oleh tim Purchasing, input harga & foto bukti per bahan
          </p>
        </div>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Task List (Left Side) */}
              <div className="lg:col-span-1 space-y-3">
                <h2 className="text-sm font-extrabold text-[#111827] flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-amber-500" />
                  Daftar Tugas Belanja ({myTasks.length})
                </h2>

                {myTasks.length === 0 ? (
                  <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 text-center">
                    <Clock className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-xs font-bold text-gray-500">Belum ada tugas belanja untuk batch ini</p>
                  </div>
                ) : (
                  myTasks.map((t) => {
                    const isSelected = activeTask?.id === t.id;
                    const boughtCount = t.items.filter((i) => i.status === 'sudah_beli').length;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setActiveTask(t)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#111827] text-white border-[#111827] shadow-md'
                            : 'bg-white text-gray-800 border-[#E5E7EB] hover:border-amber-400'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            isSelected
                              ? 'bg-amber-400 text-gray-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}>
                            {t.supplierName}
                          </span>
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                            t.status === 'completed'
                              ? 'bg-emerald-500 text-white'
                              : t.status === 'in_progress'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-400 text-white'
                          }`}>
                            {t.status === 'completed' ? 'SELESAI' : t.status === 'in_progress' ? 'DIPROSES' : 'PENDING'}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-xs mb-1">
                          Petugas: {t.assignedToName || 'Unassigned'}
                        </h4>
                        <div className="flex justify-between items-center text-[10px] opacity-80 mt-2">
                          <span>{t.items.length} Bahan • {boughtCount}/{t.items.length} Dibeli</span>
                          <span className="font-extrabold text-amber-400">
                            Rp {(t.totalPengeluaran || 0).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Task Detail & Per-Item Shopping Form (Right Side) */}
              <div className="lg:col-span-2">
                {activeTask ? (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="px-6 py-4 bg-[#111827] text-white flex justify-between items-center">
                      <div>
                        <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider block">
                          Detail Tugas Belanja
                        </span>
                        <h3 className="text-base font-extrabold">{activeTask.supplierName}</h3>
                        <p className="text-xs opacity-75">
                          Assigned to: {activeTask.assignedToName}
                        </p>
                      </div>
                      <button
                        onClick={handleSaveTask}
                        className="flex items-center gap-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer shadow-md active:scale-95 transition-all"
                      >
                        <Save className="h-4 w-4" />
                        Simpan Belanjaan
                      </button>
                    </div>

                    {/* Table of items */}
                    <div className="p-6 space-y-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left min-w-[650px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[9px] tracking-wider">
                              <th className="py-3 px-3">Bahan</th>
                              <th className="py-3 px-3 text-center">Jumlah</th>
                              <th className="py-3 px-3 text-center">Satuan</th>
                              <th className="py-3 px-3 text-right">Harga Satuan (Rp)</th>
                              <th className="py-3 px-3 text-right">Total (Rp)</th>
                              <th className="py-3 px-3 text-center">Foto Bukti</th>
                              <th className="py-3 px-3 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {activeTask.items.map((item, idx) => (
                              <tr key={idx} className={`hover:bg-gray-50/50 ${item.status === 'sudah_beli' ? 'bg-emerald-50/30' : ''}`}>
                                <td className="py-3 px-3 font-bold text-gray-900">
                                  {item.bahanName}
                                  {item.keterangan && (
                                    <div className="text-[9px] font-normal text-gray-400">{item.keterangan}</div>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    title={`Jumlah ${item.bahanName}`}
                                    value={item.jumlah}
                                    onChange={(e) => handleItemChange(idx, 'jumlah', parseFloat(e.target.value) || 0)}
                                    className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-center font-bold text-xs focus:ring-1 focus:ring-amber-400"
                                  />
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-gray-600">{item.satuan}</td>
                                <td className="py-3 px-3 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    title={`Harga Satuan ${item.bahanName}`}
                                    value={item.hargaSatuan}
                                    onChange={(e) => handleItemChange(idx, 'hargaSatuan', parseFloat(e.target.value) || 0)}
                                    className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-right font-bold text-xs focus:ring-1 focus:ring-amber-400"
                                  />
                                </td>
                                <td className="py-3 px-3 text-right font-extrabold text-amber-700">
                                  Rp {(item.totalHarga || 0).toLocaleString('id-ID')}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {item.photoUrl ? (
                                    <div className="relative group inline-block">
                                      <img
                                        src={item.photoUrl}
                                        alt={item.bahanName}
                                        className="h-9 w-9 rounded-lg object-cover border border-gray-200 cursor-pointer"
                                        onClick={() => handleStartPhoto(idx)}
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleStartPhoto(idx)}
                                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-amber-100 text-gray-600 hover:text-amber-900 cursor-pointer transition-colors"
                                      title="Ambil Foto Bahan"
                                    >
                                      <Camera className="h-4 w-4" />
                                    </button>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <button
                                    onClick={() => handleToggleItemStatus(idx)}
                                    className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold cursor-pointer transition-all ${
                                      item.status === 'sudah_beli'
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-gray-100 text-gray-500 border border-gray-200'
                                    }`}
                                  >
                                    {item.status === 'sudah_beli' ? '✓ DIBELI' : 'BELUM'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                        <div className="text-xs text-gray-500 font-medium">
                          Status Belanja: <strong className="text-gray-900 uppercase">{activeTask.status}</strong>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-gray-500 block">Total Realisasi Belanja:</span>
                          <span className="text-lg font-extrabold text-amber-600">
                            Rp {(activeTask.totalPengeluaran || 0).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
                    <ShoppingBag className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <h3 className="text-base font-bold text-[#111827]">Pilih Tugas Belanja</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Klik salah satu tugas belanja di sebelah kiri untuk menginput rincian harga dan foto bukti.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Camera modal */}
      {showCamera && (
        <LiveCamera
          isOpen={showCamera}
          onClose={() => setShowCamera(false)}
          onCapture={handlePhotoCaptured}
          activityType="PRODUKSI"
          orderId={selectedBatchId || 'sub-purchasing'}
        />
      )}
    </div>
  );
}
