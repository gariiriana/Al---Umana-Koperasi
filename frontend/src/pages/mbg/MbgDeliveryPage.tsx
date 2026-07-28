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
  updateSchoolDeliveryProof,
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

  // 3-Proof Modal state
  const [proofModalEntry, setProofModalEntry] = useState<MbgPmEntry | null>(null);
  const [targetProofType, setTargetProofType] = useState<'menu' | 'serah_terima' | 'surat_jalan'>('serah_terima');

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

  const handleStartProofCapture = (entry: MbgPmEntry, type: 'menu' | 'serah_terima' | 'surat_jalan') => {
    if (!activeTask) return;
    setCameraMode('delivery');
    setTargetProofType(type);
    setActiveTaskId(activeTask.id);
    setSelectedEntryForDeliveryPhoto(entry);
    setShowCamera(true);
  };

  const handleFileUploadForProof = async (
    entry: MbgPmEntry,
    type: 'menu' | 'serah_terima' | 'surat_jalan',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const timestampStr = new Date().toLocaleString('id-ID');
        await updateSchoolDeliveryProof(
          entry.id,
          entry.institutionName,
          type,
          dataUrl,
          activeTask?.id,
          { timestamp: timestampStr }
        );
        showToast({ message: `Foto ${type.replace('_', ' ')} berhasil disimpan!`, variant: 'success' });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal mengunggah foto', variant: 'error' });
    }
  };

  const handlePhotoCapture = async (_file: File) => {
    if (!activeTaskId) return;
    setShowCamera(false);

    const fakeFileId = `photo_${Date.now()}`;

    try {
      if (cameraMode === 'handover') {
        await setHandoverPhoto(activeTaskId, fakeFileId);
        showToast({ message: 'Foto serah terima berhasil diunggah', variant: 'success' });
      } else if (cameraMode === 'delivery' && selectedEntryForDeliveryPhoto) {
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const timestampStr = new Date().toLocaleString('id-ID');
          await updateSchoolDeliveryProof(
            selectedEntryForDeliveryPhoto.id,
            selectedEntryForDeliveryPhoto.institutionName,
            targetProofType,
            dataUrl,
            activeTaskId,
            { timestamp: timestampStr, location: 'SPPG Sukabumi' }
          );

          await addDeliveryPhoto(activeTaskId, activeTask?.deliveryPhotos || [], {
            fileId: fakeFileId,
            description: `Bukti ${targetProofType} untuk ${selectedEntryForDeliveryPhoto.institutionName}`,
            institutionName: selectedEntryForDeliveryPhoto.institutionName,
          });

          showToast({
            message: `Foto ${targetProofType.replace('_', ' ')} untuk ${selectedEntryForDeliveryPhoto.institutionName} berhasil disimpan`,
            variant: 'success',
          });
        };
        reader.readAsDataURL(_file);
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
                  <table className="w-full text-xs text-left min-w-[900px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[9px] tracking-wider">
                        <th className="py-3 px-6">Institusi</th>
                        <th className="py-3 px-4 text-center">Porsi</th>
                        <th className="py-3 px-4 text-center">🍱 Foto Menu</th>
                        <th className="py-3 px-4 text-center">🤝 Foto Serah Terima</th>
                        <th className="py-3 px-4 text-center">📄 Foto Surat Jalan</th>
                        <th className="py-3 px-6 text-center">Kelola Bukti</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {taskEntries.map((entry) => {
                        const hasMenu = !!entry.photoMenuUrl;
                        const hasSerahTerima = !!entry.photoSerahTerimaUrl;
                        const hasSuratJalan = !!entry.photoSuratJalanUrl;
                        const proofCount = (hasMenu ? 1 : 0) + (hasSerahTerima ? 1 : 0) + (hasSuratJalan ? 1 : 0);

                        return (
                          <tr
                            key={entry.id}
                            className={`hover:bg-gray-50/50 ${
                              entry.isSekolahLibur ? 'bg-red-50/40 text-red-500' : ''
                            }`}
                          >
                            <td className="py-3 px-6 font-bold">
                              <div className="flex items-center gap-2">
                                <Building className="h-4 w-4 text-gray-400 shrink-0" />
                                <div>
                                  <div className="text-gray-900">{entry.institutionName}</div>
                                  <div className="text-[10px] text-gray-400 font-normal">
                                    Jadwal: {entry.jadwalPengantaran || '-'}
                                  </div>
                                  {entry.isSekolahLibur && (
                                    <span className="text-[9px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-extrabold uppercase mt-1 inline-block">
                                      Libur
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span className="px-2 py-0.5 bg-[#FBBF24]/20 text-[#92400E] rounded-full font-extrabold text-[10px]">
                                {entry.jumlah} porsi
                              </span>
                            </td>

                            {/* Foto Menu */}
                            <td className="py-3 px-4 text-center">
                              {hasMenu ? (
                                <img
                                  src={entry.photoMenuUrl}
                                  alt="Menu"
                                  className="w-12 h-12 object-cover rounded-lg border border-green-300 mx-auto shadow-xs"
                                />
                              ) : (
                                <button
                                  onClick={() => handleStartProofCapture(entry, 'menu')}
                                  className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg cursor-pointer"
                                >
                                  + Upload
                                </button>
                              )}
                            </td>

                            {/* Foto Serah Terima */}
                            <td className="py-3 px-4 text-center">
                              {hasSerahTerima ? (
                                <img
                                  src={entry.photoSerahTerimaUrl}
                                  alt="Serah Terima"
                                  className="w-12 h-12 object-cover rounded-lg border border-green-300 mx-auto shadow-xs"
                                />
                              ) : (
                                <button
                                  onClick={() => handleStartProofCapture(entry, 'serah_terima')}
                                  className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg cursor-pointer flex items-center gap-1 mx-auto"
                                >
                                  <Camera className="h-3 w-3" /> Geotag
                                </button>
                              )}
                            </td>

                            {/* Foto Surat Jalan */}
                            <td className="py-3 px-4 text-center">
                              {hasSuratJalan ? (
                                <img
                                  src={entry.photoSuratJalanUrl}
                                  alt="Surat Jalan"
                                  className="w-12 h-12 object-cover rounded-lg border border-green-300 mx-auto shadow-xs"
                                />
                              ) : (
                                <button
                                  onClick={() => handleStartProofCapture(entry, 'surat_jalan')}
                                  className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg cursor-pointer"
                                >
                                  + Upload
                                </button>
                              )}
                            </td>

                            {/* Kelola Bukti Button */}
                            <td className="py-3 px-6 text-center">
                              {entry.isSekolahLibur ? (
                                <span className="text-gray-400 text-[10px]">Skip (Libur)</span>
                              ) : (
                                <button
                                  onClick={() => setProofModalEntry(entry)}
                                  className={`py-1.5 px-3 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer shadow-xs ${
                                    proofCount === 3
                                      ? 'bg-green-600 text-white hover:bg-green-700'
                                      : 'bg-[#111827] text-white hover:bg-black'
                                  }`}
                                >
                                  {proofCount === 3 ? '✓ Complete (3/3)' : `Kelola (${proofCount}/3)`}
                                </button>
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

      {/* 3-Proof Management Modal */}
      {proofModalEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  Kelola Bukti Pengiriman
                </span>
                <h3 className="text-lg font-extrabold text-gray-900">
                  {proofModalEntry.institutionName}
                </h3>
              </div>
              <button
                onClick={() => setProofModalEntry(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Slot 1: Foto Menu Makanan */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {proofModalEntry.photoMenuUrl ? (
                    <img
                      src={proofModalEntry.photoMenuUrl}
                      alt="Menu"
                      className="w-14 h-14 object-cover rounded-xl border border-green-400"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center text-xl font-bold">
                      🍱
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">1. Foto Menu / Box Porsi</h4>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {proofModalEntry.photoMenuUrl ? '✓ Foto tersimpan' : 'Wadah / box porsi makanan'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleStartProofCapture(proofModalEntry, 'menu')}
                    className="px-3 py-1.5 bg-[#111827] text-white hover:bg-black text-[10px] font-bold rounded-xl cursor-pointer"
                  >
                    Kamera
                  </button>
                  <label className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-[10px] font-bold rounded-xl cursor-pointer text-center">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUploadForProof(proofModalEntry, 'menu', e)}
                    />
                  </label>
                </div>
              </div>

              {/* Slot 2: Foto Serah Terima */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {proofModalEntry.photoSerahTerimaUrl ? (
                    <img
                      src={proofModalEntry.photoSerahTerimaUrl}
                      alt="Serah Terima"
                      className="w-14 h-14 object-cover rounded-xl border border-green-400"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center text-xl font-bold">
                      🤝
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">2. Foto Serah Terima (Geotag)</h4>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {proofModalEntry.photoSerahTerimaUrl ? '✓ Foto serah terima tersimpan' : 'Penyerahan dengan pihak sekolah'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleStartProofCapture(proofModalEntry, 'serah_terima')}
                    className="px-3 py-1.5 bg-[#FBBF24] text-[#111827] hover:bg-[#F59E0B] text-[10px] font-extrabold rounded-xl cursor-pointer flex items-center gap-1"
                  >
                    <Camera className="h-3 w-3" /> Geotag
                  </button>
                  <label className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-[10px] font-bold rounded-xl cursor-pointer text-center">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUploadForProof(proofModalEntry, 'serah_terima', e)}
                    />
                  </label>
                </div>
              </div>

              {/* Slot 3: Foto Surat Jalan */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {proofModalEntry.photoSuratJalanUrl ? (
                    <img
                      src={proofModalEntry.photoSuratJalanUrl}
                      alt="Surat Jalan"
                      className="w-14 h-14 object-cover rounded-xl border border-green-400"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center text-xl font-bold">
                      📄
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">3. Foto Surat Jalan / BAST</h4>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {proofModalEntry.photoSuratJalanUrl ? '✓ Berita acara tersimpan' : 'Sudah TTD & stempel sekolah'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleStartProofCapture(proofModalEntry, 'surat_jalan')}
                    className="px-3 py-1.5 bg-[#111827] text-white hover:bg-black text-[10px] font-bold rounded-xl cursor-pointer"
                  >
                    Kamera
                  </button>
                  <label className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-[10px] font-bold rounded-xl cursor-pointer text-center">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUploadForProof(proofModalEntry, 'surat_jalan', e)}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setProofModalEntry(null)}
                className="px-5 py-2.5 bg-[#111827] text-white font-extrabold text-xs rounded-xl hover:bg-black cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
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
