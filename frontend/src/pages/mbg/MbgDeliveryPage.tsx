// ============================================================================
// MBG Delivery Page — Kurir MBG: Handover, Delivery, and Proof
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  Calendar,
  CheckCircle2,
  Camera,
  Loader2,
  FileDown,
  User,
  ClipboardList,
  Building,
  Navigation,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgDeliveryTask, MbgPmEntry } from '@/types/mbg';
import { subscribeBatches, subscribeEntries } from '@/services/mbgAdminService';
import { startTracker } from '@/services/gpsService';
import {
  subscribeKurirTasks,
  updateTaskStatus,
  setHandoverPhoto,
  addDeliveryPhoto,
} from '@/services/mbgDeliveryService';
import { LiveCamera } from '@/components/LiveCamera';
import { MBG_DELIVERY_STATUS_CONFIG } from '@/constants/mbgConstants';

export function MbgDeliveryPage() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<MbgDeliveryTask[]>([]);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Fallback selector for testing when user profile is admin or doesn't match a specific kurir
  const [selectedPetugasName, setSelectedPetugasName] = useState<string>('');
  const [detectedPetugasId, setDetectedPetugasId] = useState<string>('');

  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'handover' | 'delivery'>('handover');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedEntryForDeliveryPhoto, setSelectedEntryForDeliveryPhoto] = useState<MbgPmEntry | null>(null);

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

  // Determine petugasId/name based on logged in user profile
  useEffect(() => {
    if (profile) {
      if (profile.role === 'kurir_mbg') {
        setDetectedPetugasId(user?.uid || '');
        setSelectedPetugasName(profile.displayName || '');
      } else {
        // Fallback for admin or other roles testing
        setDetectedPetugasId('');
      }
    }
  }, [profile, user]);

  // Subscribe to tasks for the selected petugas
  useEffect(() => {
    const pName = selectedPetugasName || profile?.displayName || '';
    const pId = detectedPetugasId || pName.toLowerCase().replace(/\s+/g, '-');
    if (!selectedBatchId || !pId) return;

    const unsubTasks = subscribeKurirTasks(pId, (data) => {
      setTasks(data.filter((t) => t.batchId === selectedBatchId));
    });

    const unsubEntries = subscribeEntries(selectedBatchId, setEntries);

    return () => {
      unsubTasks();
      unsubEntries();
    };
  }, [selectedBatchId, selectedPetugasName, detectedPetugasId, profile?.displayName]);

  const uniqueKurirNames = useMemo(() => {
    return Array.from(new Set(entries.map((e) => e.assignedPetugasName).filter(Boolean)));
  }, [entries]);

  // Current active task
  const activeTask = useMemo(() => {
    return tasks[0] || null;
  }, [tasks]);

  // Get full entries detail for the current task
  const taskEntries = useMemo(() => {
    if (!activeTask) return [];
    return entries.filter((e) => e.assignedPetugasName === activeTask.petugasName);
  }, [activeTask, entries]);

  // Real-time GPS tracking when activeTask is in 'delivering' status
  useEffect(() => {
    if (!activeTask || activeTask.status !== 'delivering' || !user) return;

    console.log('Starting GPS tracking for task:', activeTask.id);
    const tracker = startTracker({
      orderId: activeTask.batchId, // Using batchId as the orderId group for MBG
      courierId: activeTask.petugasId,
      intervalSeconds: 30,
      onWrite: (lat, lng) => {
        console.log('GPS written:', lat, lng);
      },
      onError: (err) => {
        console.error('GPS tracking error:', err);
      },
    });

    return () => {
      console.log('Stopping GPS tracking for task:', activeTask.id);
      tracker.stop();
    };
  }, [activeTask, user]);

  const handleStartHandover = () => {
    if (!activeTask) return;
    setCameraMode('handover');
    setActiveTaskId(activeTask.id);
    setShowCamera(true);
  };

  const handleStartDelivery = async () => {
    if (!activeTask) return;
    try {
      await updateTaskStatus(activeTask.id, 'delivering');
      showToast({ message: 'Status diperbarui: Sedang Mengirim!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal update status pengiriman', variant: 'error' });
    }
  };

  const handleStartDeliveryPhoto = (entry: MbgPmEntry) => {
    if (!activeTask) return;
    setCameraMode('delivery');
    setActiveTaskId(activeTask.id);
    setSelectedEntryForDeliveryPhoto(entry);
    setShowCamera(true);
  };

  const handlePhotoCapture = async (_file: File) => {
    if (!activeTaskId) return;
    setShowCamera(false);
    console.log('Captured photo details:', _file.name, _file.size);

    const fakeFileId = `photo_${Date.now()}`;

    try {
      if (cameraMode === 'handover') {
        await setHandoverPhoto(activeTaskId, fakeFileId);
        showToast({ message: 'Foto serah terima berhasil diunggah', variant: 'success' });
      } else if (cameraMode === 'delivery' && selectedEntryForDeliveryPhoto) {
        await addDeliveryPhoto(activeTaskId, activeTask?.deliveryPhotos || [], {
          fileId: fakeFileId,
          description: `Bukti pengantaran sampai di ${selectedEntryForDeliveryPhoto.institutionName}`,
          institutionName: selectedEntryForDeliveryPhoto.institutionName,
        });

        // Check if all active stops have proof
        const deliveredStops = [...(activeTask?.deliveryPhotos || []), { institutionName: selectedEntryForDeliveryPhoto.institutionName }];
        const activeStops = taskEntries.filter((e) => !e.isSekolahLibur);
        const allDone = activeStops.every((stop) =>
          deliveredStops.some((photo) => photo.institutionName === stop.institutionName)
        );

        if (allDone) {
          await updateTaskStatus(activeTaskId, 'delivered');
          showToast({ message: 'Semua pesanan selesai terkirim!', variant: 'success' });
        } else {
          showToast({
            message: `Foto bukti pengantaran untuk ${selectedEntryForDeliveryPhoto.institutionName} berhasil disimpan`,
            variant: 'success',
          });
        }
      }
    } catch {
      showToast({ message: 'Gagal memproses foto', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Kurir MBG</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Lihat daftar pengantaran hari ini, catat serah terima dan foto bukti sampai
          </p>
        </div>

        {/* Fallback selector for testing */}
        {profile?.role !== 'kurir_mbg' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">Pilih Petugas (Simulasi):</span>
            <select
              title="Pilih Petugas"
              value={selectedPetugasName}
              onChange={(e) => setSelectedPetugasName(e.target.value)}
              className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all cursor-pointer"
            >
              <option value="">-- Pilih Petugas --</option>
              {uniqueKurirNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
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
          <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBatchId(b.id)}
                className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  selectedBatchId === b.id
                    ? 'bg-[#111827] text-white shadow-lg'
                    : 'bg-white text-[#374151] border border-[#E5E7EB] hover:border-[#FBBF24]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{b.tanggal}</span>
                </div>
              </button>
            ))}
          </div>

          {selectedBatchId && activeTask ? (
            <div className="space-y-6">
              {/* Task Summary Card */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <User className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">
                      Kurir Penanggung Jawab
                    </span>
                    <h3 className="text-base font-extrabold text-[#111827]">
                      {activeTask.petugasName}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Status Tugas: {MBG_DELIVERY_STATUS_CONFIG[activeTask.status]?.label}
                    </p>
                  </div>
                </div>

                {/* Progress actions based on status */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                  {activeTask.status === 'waiting' && (
                    <button
                      onClick={handleStartHandover}
                      className="flex-1 md:flex-initial flex items-center justify-center gap-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] font-extrabold text-xs px-5 py-3 rounded-xl cursor-pointer transition-all shadow-sm active:scale-95"
                    >
                      🤝 Konfirmasi Serah Terima
                    </button>
                  )}

                  {activeTask.status === 'handover_done' && (
                    <button
                      onClick={handleStartDelivery}
                      className="flex-1 md:flex-initial flex items-center justify-center gap-2 bg-[#111827] text-white hover:bg-black font-extrabold text-xs px-5 py-3 rounded-xl cursor-pointer transition-all shadow-sm active:scale-95"
                    >
                      <Navigation className="h-4 w-4 text-[#FBBF24]" />
                      Mulai Pengantaran
                    </button>
                  )}

                  {activeTask.status === 'delivering' && (
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl">
                      🚚 Silakan ambil foto bukti di setiap tujuan sekolah/posyandu
                    </span>
                  )}

                  {activeTask.status === 'delivered' && (
                    <div className="flex gap-2">
                      <span className="text-xs font-extrabold text-green-700 bg-green-50 border border-green-200 px-4 py-2.5 rounded-xl flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" /> Pengiriman Selesai!
                      </span>
                      <button className="flex items-center gap-2 bg-[#111827] text-white hover:bg-black font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer shadow-sm">
                        <FileDown className="h-4 w-4 text-[#FBBF24]" /> Export PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Task Details - Table Format per reference image */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-[#F9FAFB] border-b border-[#E5E7EB] flex items-center justify-between">
                  <span className="text-xs font-extrabold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    <ClipboardList className="h-4.5 w-4.5 text-gray-400" />
                    Daftar Institusi Pengantaran
                  </span>
                </div>

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
                        <th className="py-3 px-6 text-center">Aksi / Bukti</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {taskEntries.map((entry) => {
                        const hasPhoto = activeTask.deliveryPhotos.some(
                          (p) => p.institutionName === entry.institutionName
                        );
                        return (
                          <tr
                            key={entry.id}
                            className={`hover:bg-gray-50/50 ${
                              entry.isSekolahLibur ? 'bg-red-50/40 text-red-500' : ''
                            }`}
                          >
                            <td className="py-3 px-6 font-bold flex items-center gap-2">
                              <Building className="h-4 w-4 text-gray-400" />
                              <div>
                                <div>{entry.institutionName}</div>
                                {entry.isSekolahLibur && (
                                  <span className="text-[9px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-extrabold uppercase">
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
                              {entry.isSekolahLibur ? (
                                <span className="text-gray-400 text-[10px]">Skip (Libur)</span>
                              ) : activeTask.status === 'delivering' ? (
                                hasPhoto ? (
                                  <span className="text-[10px] font-extrabold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">
                                    ✓ Terkirim
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleStartDeliveryPhoto(entry)}
                                    className="flex items-center gap-1 mx-auto py-1 px-3 bg-[#111827] text-white hover:bg-black font-extrabold text-[10px] rounded-lg cursor-pointer transition-all active:scale-95"
                                  >
                                    <Camera className="h-3 w-3" /> Ambil Foto
                                  </button>
                                )
                              ) : activeTask.status === 'delivered' ? (
                                <span className="text-[10px] font-extrabold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">
                                  ✓ Selesai
                                </span>
                              ) : (
                                <span className="text-gray-400 text-[10px]">Menunggu Handover</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Total Summary Row below table */}
                {(() => {
                  const activeEntries = taskEntries.filter((e) => !e.isSekolahLibur);
                  const tSiswa = activeEntries.reduce((s, e) => s + (e.qtSiswaBalita || 0), 0);
                  const tBumil = activeEntries.reduce((s, e) => s + (e.qtBumilBusui || 0), 0);
                  const tGuru = activeEntries.reduce((s, e) => s + (e.qtGuruKader || 0), 0);
                  const tPobia = activeEntries.reduce((s, e) => s + (e.qtPobiaNasi || 0), 0);
                  const tJumlah = activeEntries.reduce((s, e) => s + (e.jumlah || 0), 0);
                  return (
                    <div className="px-6 py-4 bg-[#111827] text-white flex flex-wrap items-center gap-x-6 gap-y-2 rounded-b-2xl">
                      <span className="text-xs font-extrabold uppercase tracking-wider">Total</span>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold">
                        <span>Siswa/Balita: <strong className="text-[#FBBF24]">{tSiswa}</strong></span>
                        <span>Bumil/Busui: <strong className="text-[#FBBF24]">{tBumil}</strong></span>
                        <span>Guru/Kader: <strong className="text-[#FBBF24]">{tGuru}</strong></span>
                        <span>Pobia Nasi: <strong className="text-[#FBBF24]">{tPobia}</strong></span>
                        <span className="bg-[#FBBF24] text-[#111827] px-2.5 py-0.5 rounded-full font-extrabold">
                          Jumlah: {tJumlah}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
              <ClipboardList className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-lg font-bold text-[#111827]">Tidak ada tugas pengiriman</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                Silakan pilih batch pengiriman lain di atas, atau pastikan petugas Anda ditugaskan pada batch terpilih.
              </p>
            </div>
          )}
        </>
      )}

      {/* Live Camera Dialog */}
      <AnimatePresence>
        {showCamera && (
          <LiveCamera
            isOpen={showCamera}
            onClose={() => setShowCamera(false)}
            onCapture={handlePhotoCapture}
            activityType={cameraMode === 'handover' ? 'HANDOVER' : 'PENGIRIMAN'}
            orderId={activeTaskId || ''}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
