// ============================================================================
// MBG Cooking Page — Proses Masak + Multi-foto + Export PDF #2
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Camera, FileDown, Loader2, CheckCircle2,
  ChefHat, Clock, Image as ImageIcon,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgCookingSession, MbgPmEntry, MbgNutritionEntry, MbgPurchaseOrder } from '@/types/mbg';
import { subscribeBatches, subscribeEntries } from '@/services/mbgAdminService';
import {
  subscribeCookingSessions, createCookingSession, updateCookingSession, addCookingPhoto, subscribeNutrition
} from '@/services/mbgProductionService';
import { subscribePurchaseOrders } from '@/services/mbgPurchasingService';
import { updateBatchStatus } from '@/services/mbgAdminService';
import { MBG_COOKING_PHOTO_TEMPLATES, MBG_COOKING_STATUS_CONFIG, NUTRIENTS_LIST } from '@/constants/mbgConstants';
import { LiveCamera } from '@/components/LiveCamera';

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

  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId);
  }, [batches, selectedBatchId]);

  useEffect(() => {
    const unsub = subscribeBatches((b) => {
      setBatches(b.filter((batch) => ['QC_PASSED', 'COOKING', 'COOKED'].includes(batch.status)));
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedBatchId) return;
    const unsub1 = subscribeCookingSessions(selectedBatchId, (s) => {
      setSessions(s);
      if (s.length > 0) setActiveSession(s[0]);
    });
    const unsub2 = subscribeEntries(selectedBatchId, setEntries);
    const unsub3 = subscribeNutrition(selectedBatchId, setNutritionData);
    const unsub4 = subscribePurchaseOrders(selectedBatchId, setOrders);
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
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

  const handlePhotoCapture = async () => {
    if (!activeSession) return;
    setShowCamera(false);
    // In production, this would upload via chunkUploadService and get a fileId
    const fakeFileId = `photo_${Date.now()}`;
    try {
      await addCookingPhoto(activeSession.id, activeSession.photos, {
        fileId: fakeFileId,
        description: selectedDescription,
        capturedAt: new Date().toISOString(),
      });
      showToast({ message: 'Foto berhasil ditambahkan!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal menambah foto', variant: 'error' });
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
        theme: 'striped',
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6 },
        bodyStyles: { fontSize: 6 },
        margin: { left: 14, right: 14 },
      });

      nextY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

      // Section 3: Dokumentasi Memasak
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text("3. DOKUMENTASI PROSES MEMASAK", 14, nextY);

      const photoRows = (activeSession?.photos || []).map((p, i) => [
        i + 1,
        new Date(p.capturedAt).toLocaleTimeString('id-ID'),
        p.description,
        'Terlampir di Sistem',
      ]);

      autoTable(doc, {
        startY: nextY + 3,
        head: [['No', 'Waktu', 'Keterangan Aktivitas', 'Status Foto']],
        body: photoRows.length > 0 ? photoRows : [['-', '-', 'Belum ada dokumentasi foto', '-']],
        theme: 'striped',
        headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
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

                       {/* Photo Description Selector + Capture */}
                       <div className="flex flex-col sm:flex-row gap-3 mb-4">
                         <select value={selectedDescription} onChange={(e) => setSelectedDescription(e.target.value)}
                           title="Keterangan Foto"
                           className="flex-1 rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-[#FBBF24] focus:outline-none">
                           {MBG_COOKING_PHOTO_TEMPLATES.map((t) => (
                             <option key={t} value={t}>{t}</option>
                           ))}
                         </select>
                         <button onClick={() => setShowCamera(true)}
                           className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FBBF24] text-[#111827] rounded-xl text-xs font-extrabold cursor-pointer hover:bg-[#F59E0B] transition-colors">
                           <Camera className="h-4 w-4" /> Ambil Foto
                         </button>
                       </div>

                      {/* Photo Gallery */}
                      {activeSession.photos.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-[#6B7280] mb-2">Dokumentasi Foto ({activeSession.photos.length})</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {activeSession.photos.map((photo, i) => (
                              <div key={i} className="bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] p-3 text-center">
                                <div className="w-full h-24 bg-gray-200 rounded-lg flex items-center justify-center mb-2">
                                  <ImageIcon className="h-8 w-8 text-gray-400" />
                                </div>
                                <p className="text-[10px] font-bold text-[#111827]">{photo.description}</p>
                                <p className="text-[9px] text-[#9CA3AF] mt-0.5">
                                  {new Date(photo.capturedAt).toLocaleTimeString('id-ID')}
                                </p>
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
    </div>
  );
}

export default MbgCookingPage;
