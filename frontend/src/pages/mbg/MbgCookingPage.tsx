// ============================================================================
// MBG Cooking Page — Proses Masak + Multi-foto + Export PDF #2
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Camera, FileDown, Loader2, CheckCircle2,
  ChefHat, Clock, Image as ImageIcon, Upload, Trash2, Eye, X
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgCookingSession, MbgPmEntry, MbgNutritionEntry, MbgPurchaseOrder, MbgCookingPhoto } from '@/types/mbg';
import { subscribeBatches, subscribeEntries } from '@/services/mbgAdminService';
import {
  subscribeCookingSessions, createCookingSession, updateCookingSession, addCookingPhoto, addCookingPhotos, deleteCookingPhoto, subscribeNutrition
} from '@/services/mbgProductionService';
import { subscribePurchaseOrders } from '@/services/mbgPurchasingService';
import { updateBatchStatus } from '@/services/mbgAdminService';
import { MBG_COOKING_PHOTO_TEMPLATES, MBG_COOKING_STATUS_CONFIG, NUTRIENTS_LIST } from '@/constants/mbgConstants';
import { LiveCamera } from '@/components/LiveCamera';
import { compressBase64Image } from '@/utils/imageCompressor';

export function MbgCookingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<MbgCookingSession[]>([]);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [nutritionData, setNutritionData] = useState<MbgNutritionEntry[]>([]);
  const [orders, setOrders] = useState<MbgPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState<string>(MBG_COOKING_PHOTO_TEMPLATES[0]);
  const [activeSession, setActiveSession] = useState<MbgCookingSession | null>(null);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId);
  }, [batches, selectedBatchId]);

  useEffect(() => {
    const unsub = subscribeBatches((b) => {
      setBatches(b.filter((batch) => batch.status !== 'DRAFT'));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (batches.length > 0 && !selectedBatchId) {
      setSelectedBatchId(batches[0].id);
    }
  }, [batches, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) return;
    setLoading(true);
    const unsubS = subscribeCookingSessions(selectedBatchId, (sList) => {
      setSessions(sList);
      const active = sList.find((s) => s.status !== 'done') || sList[0] || null;
      setActiveSession(active);
      setLoading(false);
    });
    const unsubE = subscribeEntries(selectedBatchId, (eList) => setEntries(eList));
    const unsubN = subscribeNutrition(selectedBatchId, (nList) => setNutritionData(nList));
    const unsubPO = subscribePurchaseOrders(selectedBatchId, (poList) => setOrders(poList));

    return () => {
      unsubS();
      unsubE();
      unsubN();
      unsubPO();
    };
  }, [selectedBatchId]);

  const handleStartCooking = async () => {
    if (!selectedBatchId || !user) return;
    try {
      await createCookingSession(selectedBatchId, user.uid);
      await updateBatchStatus(selectedBatchId, 'COOKING');
      showToast({ message: 'Sesi masak dimulai!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal memulai sesi', variant: 'error' });
    }
  };

  const handlePhotoCapture = async (file?: File) => {
    if (!activeSession) return;
    setShowCamera(false);
    let photoUrl = '';
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        showToast({ message: 'Ukuran foto melebihi limit 10MB!', variant: 'error' });
        return;
      }
      const rawUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
      photoUrl = await compressBase64Image(rawUrl, 600, 600, 0.6);
    }
    const fakeFileId = `photo_${Date.now()}`;
    try {
      await addCookingPhoto(activeSession.id, activeSession.photos, {
        fileId: fakeFileId,
        description: selectedDescription,
        capturedAt: new Date().toISOString(),
        url: photoUrl || undefined,
      });
      showToast({ message: 'Foto berhasil disimpan ke Firestore!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal menyimpan foto', variant: 'error' });
    }
  };

  const handleFinishCooking = async () => {
    if (!activeSession || !selectedBatchId) return;
    try {
      await updateCookingSession(activeSession.id, {
        status: 'done',
        completedAt: new Date().toISOString(),
      });
      await updateBatchStatus(selectedBatchId, 'COOKED');
      showToast({ message: 'Masak selesai!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal update status', variant: 'error' });
    }
  };

  const totalExpenditure = useMemo(() => {
    return orders.reduce((sum, order) => sum + (order.totalPengeluaran || 0), 0);
  }, [orders]);

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
      doc.text("LAPORAN FINAL & DOKUMENTASI MASAK MBG", pageW / 2, 36.5, { align: "center" });

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
      doc.text(`Total Belanja: Rp ${totalExpenditure.toLocaleString('id-ID')}`, pageW - 14, 20.5, { align: "right" });

      doc.setDrawColor(229, 231, 235);
      doc.line(14, 45, pageW - 14, 45);

      // Section 1: Data PM & Menu
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text("1. DATA PM, PORSI & MENU INSTITUSI", 14, 51);

      const pmRows = entries.map((e) => [
        e.institutionName,
        e.qtSiswaBalita || 0,
        (e.qtGuruKader || 0) + (e.qtBumilBusui || 0),
        e.qtPobiaNasi || 0,
        e.menuItems?.join(', ') || '-',
        e.menuKeringanItems?.join(', ') || '-',
        e.jadwalPengantaran || '-',
      ]);

      autoTable(doc, {
        startY: 54,
        head: [['Institusi', 'Porsi Kecil', 'Porsi Besar', 'Pobia Nasi', 'Menu Reguler', 'Menu Keringan', 'Jadwal']],
        body: pmRows,
        theme: 'grid',
        headStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        styles: { lineWidth: 0.2, lineColor: [203, 213, 225] },
        margin: { left: 14, right: 14 },
      });

      let nextY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

      // Section 2: Kadar Gizi
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text("2. DATA KADAR GIZI BATCH", 14, nextY);

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
        theme: 'grid',
        headStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 6 },
        bodyStyles: { fontSize: 6 },
        styles: { lineWidth: 0.2, lineColor: [203, 213, 225] },
        margin: { left: 14, right: 14 },
      });

      nextY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

      // Section 3: Dokumentasi Memasak (Foto Embedded)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text("3. DOKUMENTASI PROSES MEMASAK (FOTO ATTACHED)", 14, nextY);

      const photos = activeSession?.photos || [];
      if (photos.length > 0) {
        let photoY = nextY + 6;
        let photoX = 14;
        const photoWidth = 55;
        const photoHeight = 40;
        const pageH = doc.internal.pageSize.getHeight();

        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          const imgBase64 = p.url ? await getBase64ImageFromUrl(p.url) : null;
          if (imgBase64) {
            if (photoY + photoHeight + 15 > pageH - 20) {
              doc.addPage();
              photoY = 20;
              photoX = 14;
            }

            doc.addImage(imgBase64, "JPEG", photoX, photoY, photoWidth, photoHeight);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(...slateDark);
            doc.text(`${i + 1}. ${p.description}`, photoX, photoY + photoHeight + 4);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.5);
            doc.setTextColor(...slateLight);
            doc.text(
              `${new Date(p.capturedAt).toLocaleTimeString('id-ID')} WIB`,
              photoX,
              photoY + photoHeight + 7.5
            );

            photoX += photoWidth + 8;
            if (photoX + photoWidth > pageW - 14) {
              photoX = 14;
              photoY += photoHeight + 14;
            }
          }
        }
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...slateLight);
        doc.text("Belum ada foto dokumentasi proses memasak.", 14, nextY + 6);
      }

      // Draw page decorations and page numbers
      const totalPages = doc.getNumberOfPages();
      const pageH = doc.internal.pageSize.getHeight();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        // Footer accent line
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(14, pageH - 12, pageW - 14, pageH - 12);

        // Footer left: branding & report details
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(107, 114, 128); // slateLight
        doc.text("Sistem Informasi Makanan Bergizi - SIMOL MBG", 14, pageH - 7);

        // Footer right: page numbers
        doc.text(`Halaman ${i} dari ${totalPages}`, pageW - 14, pageH - 7, { align: "right" });
      }

      doc.save(`Laporan_Final_Masak_${selectedBatch.tanggal}.pdf`);
      showToast({ message: 'Laporan Final PDF berhasil di-export!', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal export PDF', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Masak MBG</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Dokumentasi proses masak dengan foto dan deskripsi
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
        </div>
      ) : batches.length === 0 ? (
        <div className="text-center py-16">
          <ChefHat className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-[#6B7280]">Belum ada batch yang siap dimasak</p>
          <p className="text-xs text-[#9CA3AF] mt-1">Batch akan muncul setelah QC lolos</p>
        </div>
      ) : (
        <>
          {/* Batch Selector */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-6">
            {batches.map((b) => {
              return (
                <button key={b.id} onClick={() => setSelectedBatchId(b.id)}
                  className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    selectedBatchId === b.id ? 'bg-[#111827] text-white shadow-lg' : 'bg-white border border-[#E5E7EB] hover:border-[#FBBF24]'
                  }`}>
                  {b.tanggal} · {b.totalJumlah} porsi
                </button>
              );
            })}
          </div>

          {selectedBatchId && (
            <div className="space-y-6">
              {/* Start/Resume Cooking */}
              {sessions.length === 0 ? (
                <button onClick={handleStartCooking}
                  className="w-full py-4 bg-gradient-to-r from-[#EA580C] to-[#DC2626] text-white rounded-xl font-extrabold text-sm cursor-pointer hover:shadow-lg transition-all flex items-center justify-center gap-2">
                  <ChefHat className="h-5 w-5" /> Mulai Sesi Masak
                </button>
              ) : (
                <>
                  {/* Cooking Status */}
                  {activeSession && (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-[#EA580C]" />
                          <span className="text-xs font-bold text-[#6B7280]">Dimulai: {new Date(activeSession.startedAt).toLocaleTimeString('id-ID')}</span>
                        </div>
                         <span className={`text-[10px] font-extrabold rounded-full px-2.5 py-0.5 ${MBG_COOKING_STATUS_CONFIG[activeSession.status]?.textClass} ${MBG_COOKING_STATUS_CONFIG[activeSession.status]?.bgClass}`}>
                           {MBG_COOKING_STATUS_CONFIG[activeSession.status]?.label}
                         </span>
                       </div>

                        {/* Photo Description Selector + Capture & Upload */}
                        <div className="flex flex-col sm:flex-row gap-3 mb-4">
                          <select value={selectedDescription} onChange={(e) => setSelectedDescription(e.target.value)}
                            title="Keterangan Foto"
                            className="flex-1 rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none">
                            {MBG_COOKING_PHOTO_TEMPLATES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setShowCamera(true)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FBBF24] text-[#111827] rounded-xl text-xs font-extrabold cursor-pointer hover:bg-[#F59E0B] transition-colors">
                              <Camera className="h-4 w-4" /> Live Camera
                            </button>
                            <label className={`inline-flex items-center gap-2 px-4 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${isUploadingPhotos ? 'opacity-50 pointer-events-none' : ''}`}>
                              {isUploadingPhotos ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                              {isUploadingPhotos ? 'Mengunggah...' : 'Upload Device'}
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                disabled={isUploadingPhotos}
                                onChange={async (e) => {
                                  const rawFiles = Array.from(e.target.files || []);
                                  if (rawFiles.length === 0 || !activeSession) return;

                                  // Validate 10MB limit per file
                                  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
                                  const validFiles: File[] = [];
                                  for (const file of rawFiles) {
                                    if (file.size > MAX_SIZE) {
                                      showToast({
                                        message: `Foto "${file.name}" melebihi limit 10MB!`,
                                        variant: 'error',
                                      });
                                    } else {
                                      validFiles.push(file);
                                    }
                                  }

                                  if (validFiles.length === 0) {
                                    e.target.value = '';
                                    return;
                                  }

                                  setIsUploadingPhotos(true);
                                  setUploadProgress({ current: 0, total: validFiles.length });

                                  try {
                                    const compressedPhotos: MbgCookingPhoto[] = [];
                                    for (let i = 0; i < validFiles.length; i++) {
                                      const file = validFiles[i];
                                      setUploadProgress({ current: i + 1, total: validFiles.length });

                                      // Allow UI to repaint
                                      await new Promise((r) => setTimeout(r, 20));

                                      const rawUrl = await new Promise<string>((resolve) => {
                                        const reader = new FileReader();
                                        reader.onload = () => resolve((reader.result as string) || '');
                                        reader.onerror = () => resolve('');
                                        reader.readAsDataURL(file);
                                      });

                                      if (rawUrl) {
                                        // Compress to clear 600px / 0.6 quality (~30-50KB per image)
                                        const url = await compressBase64Image(rawUrl, 600, 600, 0.6);
                                        compressedPhotos.push({
                                          fileId: `photo_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
                                          description: selectedDescription,
                                          capturedAt: new Date().toISOString(),
                                          url: url || undefined,
                                        });
                                      }
                                    }

                                    if (compressedPhotos.length > 0) {
                                      await addCookingPhotos(activeSession.id, activeSession.photos, compressedPhotos);
                                      showToast({
                                        message: `${compressedPhotos.length} foto berhasil disimpan ke Firestore Database!`,
                                        variant: 'success',
                                      });
                                    }
                                  } catch (err) {
                                    console.error('Error uploading photos to Firestore:', err);
                                    showToast({ message: 'Gagal mengunggah foto ke Firestore', variant: 'error' });
                                  } finally {
                                    setIsUploadingPhotos(false);
                                    setUploadProgress(null);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>

                      {/* Photo Gallery */}
                      {activeSession.photos.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-[#6B7280]">Dokumentasi Foto ({activeSession.photos.length})</p>
                            <span className="text-[10px] text-gray-400 font-medium">Klik foto untuk perbesar</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {activeSession.photos.map((photo, i) => (
                              <div key={photo.fileId || i} className="bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] p-2.5 text-center relative group">
                                <div
                                  onClick={() => photo.url && setPreviewPhotoUrl(photo.url)}
                                  className="w-full h-24 bg-gray-200 rounded-lg flex items-center justify-center mb-2 overflow-hidden relative cursor-pointer group-hover:brightness-95 transition-all"
                                >
                                  {photo.url ? (
                                    <img src={photo.url} alt={photo.description} className="w-full h-full object-cover rounded-lg" />
                                  ) : (
                                    <ImageIcon className="h-8 w-8 text-gray-400" />
                                  )}
                                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    {photo.url && <Eye className="h-5 w-5 text-white drop-shadow" />}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-1">
                                  <div className="text-left overflow-hidden flex-1">
                                    <p className="text-[10px] font-bold text-[#111827] truncate" title={photo.description}>{photo.description}</p>
                                    <p className="text-[9px] text-[#9CA3AF]">
                                      {new Date(photo.capturedAt).toLocaleTimeString('id-ID')}
                                    </p>
                                  </div>
                                  {activeSession.status !== 'done' && (
                                    <button
                                      type="button"
                                      title="Hapus foto"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (confirm("Hapus foto ini?")) {
                                          try {
                                            await deleteCookingPhoto(activeSession.id, activeSession.photos, photo.fileId);
                                            showToast({ message: "Foto berhasil dihapus", variant: "info" });
                                          } catch {
                                            showToast({ message: "Gagal menghapus foto", variant: "error" });
                                          }
                                        }
                                      }}
                                      className="p-1 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Finish + Export */}
                  <div className="flex gap-3 justify-end">
                    {activeSession?.status !== 'done' && (
                      <button onClick={handleFinishCooking}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#059669] text-white text-sm font-extrabold rounded-xl cursor-pointer hover:bg-[#047857] transition-colors shadow-lg shadow-green-500/20">
                        <CheckCircle2 className="h-4 w-4" /> Selesai Masak
                      </button>
                    )}
                    <button
                      onClick={handleExportPdf}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#111827] text-white text-sm font-extrabold rounded-xl cursor-pointer hover:bg-[#1F2937] transition-colors"
                    >
                      <FileDown className="h-4 w-4" /> Export PDF Final
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Live Camera */}
      <LiveCamera
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handlePhotoCapture}
        activityType="PRODUKSI"
        orderId={selectedBatchId || ''}
      />

      {/* Preview Image Modal */}
      {previewPhotoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewPhotoUrl(null)}>
          <div className="relative max-w-3xl max-h-[90vh] bg-neutral-900 rounded-2xl overflow-hidden p-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/50 hover:bg-black/80 rounded-full z-10 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            <img src={previewPhotoUrl} alt="Preview Foto Dokumentasi" className="w-full h-auto max-h-[85vh] object-contain rounded-xl" />
          </div>
        </div>
      )}

      {/* Upload Progress Modal */}
      {uploadProgress && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm flex flex-col items-center gap-5">
            {/* Animated spinner */}
            <div className="relative flex items-center justify-center w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-[#FDE68A]" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#F59E0B] animate-spin" />
              <Upload className="h-6 w-6 text-[#F59E0B]" />
            </div>

            <div className="text-center space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#0284C7]">
                🔥 Firestore Database
              </p>
              <p className="text-sm font-bold text-[#111827]">
                Memproses & Menyimpan Foto
              </p>
              <p className="text-2xl font-extrabold text-[#EA580C]">
                {uploadProgress.current} / {uploadProgress.total}
              </p>
              <p className="text-xs text-[#6B7280]">
                {uploadProgress.current < uploadProgress.total
                  ? `Memproses foto ${uploadProgress.current} dari ${uploadProgress.total}...`
                  : 'Menyimpan ke Firestore...'}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-[#F3F4F6] rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-[#FBBF24] to-[#EA580C]"
                style={{
                  width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                }}
              />
            </div>

            {/* Thumbnail indicators */}
            <div className="flex gap-1.5 flex-wrap justify-center">
              {Array.from({ length: uploadProgress.total }).map((_, i) => (
                <div
                  key={i}
                  className={`w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold transition-all duration-200 ${
                    i < uploadProgress.current
                      ? 'bg-[#059669] text-white scale-110'
                      : i === uploadProgress.current
                      ? 'bg-[#F59E0B] text-white animate-pulse'
                      : 'bg-[#E5E7EB] text-[#9CA3AF]'
                  }`}
                >
                  {i < uploadProgress.current ? '✓' : i + 1}
                </div>
              ))}
            </div>

            <p className="text-[10px] text-[#9CA3AF] text-center">Batas max 10MB / foto • Simpan langsung ke Firestore</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default MbgCookingPage;
