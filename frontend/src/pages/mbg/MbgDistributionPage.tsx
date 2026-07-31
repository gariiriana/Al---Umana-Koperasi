import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Truck,
  Calendar,
  Loader2,
  Building2,
  FileDown,
  FileText,
  Users,
  X,
  Send,
  Search,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/contexts/ToastContext';
import type {
  MbgPmBatch,
  MbgPmEntry,
  MbgDeliveryTask,
} from '@/types/mbg';
import { subscribeBatches, subscribeEntries, updateEntry } from '@/services/mbgAdminService';
import {
  subscribeDeliveryTasks,
  addDeliveryTask,
  updateDeliveryTask,
  subscribeKurirUsers,
  type MbgKurirUser,
} from '@/services/mbgDistributionService';
import { subscribeAllDeliveryDocuments, type MbgDeliveryDocument } from '@/services/mbgDeliveryService';
import { SearchableBatchSelector } from '@/components/mbg/SearchableBatchSelector';

const MBG_LOGO_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Badan_Gizi_Nasional.svg/1200px-Badan_Gizi_Nasional.svg.png';

export function MbgDistributionPage() {
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [deliveryTasks, setDeliveryTasks] = useState<MbgDeliveryTask[]>([]);
  const [deliveryDocs, setDeliveryDocs] = useState<MbgDeliveryDocument[]>([]);
  const [kurirUsers, setKurirUsers] = useState<MbgKurirUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'assignment' | 'reports'>('assignment');

  // Per-institution assignment modal
  const [assignModalEntry, setAssignModalEntry] = useState<MbgPmEntry | null>(null);
  const [assignKurirName, setAssignKurirName] = useState('');
  const [assignKenekName, setAssignKenekName] = useState('');

  // Multi-select bulk assignment state
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [bulkKurirName, setBulkKurirName] = useState('');
  const [bulkKenekName, setBulkKenekName] = useState('');
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);

  const toggleSelectEntry = (id: string) => {
    setSelectedEntryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllGroup = (groupEntries: MbgPmEntry[]) => {
    const groupIds = groupEntries.map((e) => e.id);
    const allSelected = groupIds.every((id) => selectedEntryIds.includes(id));

    if (allSelected) {
      setSelectedEntryIds((prev) => prev.filter((id) => !groupIds.includes(id)));
    } else {
      setSelectedEntryIds((prev) => Array.from(new Set([...prev, ...groupIds])));
    }
  };

  const handleBulkAssignSubmit = async () => {
    if (!bulkKurirName) {
      showToast({ message: 'Pilih nama Kurir MBG terlebih dahulu', variant: 'info' });
      return;
    }
    if (selectedEntryIds.length === 0) return;

    setIsSubmittingBulk(true);
    try {
      await Promise.all(
        selectedEntryIds.map((id) =>
          updateEntry(id, {
            assignedPetugasName: bulkKurirName,
            assignedKenekName: bulkKenekName,
          })
        )
      );
      showToast({
        message: `Penugasan ${selectedEntryIds.length} institusi ke ${bulkKurirName} berhasil!`,
        variant: 'success',
      });
      setSelectedEntryIds([]);
      setIsBulkAssignOpen(false);
      setBulkKurirName('');
      setBulkKenekName('');
    } catch (err) {
      console.error('Bulk assign error:', err);
      showToast({ message: 'Gagal memperbarui penugasan institusi', variant: 'error' });
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  // Subscribe users with role 'kurir_mbg'
  useEffect(() => {
    const unsub = subscribeKurirUsers(setKurirUsers);
    return unsub;
  }, []);

  const kurirOptions = useMemo(() => {
    if (kurirUsers.length > 0) {
      return kurirUsers.map((u) => u.name);
    }
    return ['Dede Kurir', 'Andi Kurir', 'Erik Kurir', 'Yusep Kurir', 'Agus Kurir', 'Firdi Kurir'];
  }, [kurirUsers]);

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
    const unsub2 = subscribeDeliveryTasks(selectedBatchId, setDeliveryTasks);
    return () => {
      unsub1();
      unsub2();
    };
  }, [selectedBatchId]);

  // Subscribe delivery documents (for reports tab)
  useEffect(() => {
    const unsub = subscribeAllDeliveryDocuments(setDeliveryDocs);
    return unsub;
  }, []);

  // Search & Filter state for Laporan Kurir in Distribusi MBG
  const [distribSearchQuery, setDistribSearchQuery] = useState('');

  // Filter delivery docs for selected batch & search query
  const batchDeliveryDocs = useMemo(() => {
    if (!selectedBatchId) return deliveryDocs;
    return deliveryDocs.filter((d) => d.batchId === selectedBatchId);
  }, [deliveryDocs, selectedBatchId]);

  const filteredBatchDeliveryDocs = useMemo(() => {
    if (!distribSearchQuery.trim()) return batchDeliveryDocs;
    const q = distribSearchQuery.toLowerCase().trim();
    return batchDeliveryDocs.filter((d) => {
      const matchPetugas = d.petugasName?.toLowerCase().includes(q);
      const matchTanggal = d.tanggalBatch?.toLowerCase().includes(q);
      const matchFile = d.fileName?.toLowerCase().includes(q);
      return matchPetugas || matchTanggal || matchFile;
    });
  }, [batchDeliveryDocs, distribSearchQuery]);

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

  // Open assign modal for a specific institution entry
  const handleOpenAssign = (entry: MbgPmEntry) => {
    setAssignModalEntry(entry);
    setAssignKurirName(entry.assignedPetugasName || '');
    setAssignKenekName(entry.assignedKenekName || '');
  };

  const handleSaveAssignment = async () => {
    if (!assignModalEntry || !assignKurirName.trim()) return;
    const cleanKurir = assignKurirName.trim();
    const cleanKenek = assignKenekName.trim();
    const kurirId = cleanKurir.toLowerCase().replace(/\s+/g, '-');

    try {
      await updateEntry(assignModalEntry.id, {
        assignedPetugasName: cleanKurir,
        assignedPetugasId: kurirId,
        assignedKenekName: cleanKenek || undefined,
      });
      showToast({
        message: `${assignModalEntry.institutionName} ditugaskan ke ${cleanKurir}${cleanKenek ? ` + ${cleanKenek}` : ''}`,
        variant: 'success',
      });
      setAssignModalEntry(null);
    } catch {
      showToast({ message: 'Gagal menugaskan petugas', variant: 'error' });
    }
  };

  // Generate / Sync Delivery Tasks
  const handleSyncDeliveryTasks = async (targetKurirName?: string) => {
    if (!selectedBatchId) return;
    try {
      let kurirs = Array.from(new Set(entries.map((e) => e.assignedPetugasName).filter(Boolean)));
      if (targetKurirName) {
        kurirs = kurirs.filter((k) => k === targetKurirName);
      }

      if (kurirs.length === 0) {
        showToast({ message: 'Belum ada institusi yang ditugaskan ke Kurir', variant: 'info' });
        return;
      }

      let created = 0;
      let updated = 0;

      for (const kName of kurirs) {
        const kEntries = entries.filter((e) => e.assignedPetugasName === kName && !e.isSekolahLibur);
        const totalPorsi = kEntries.reduce((sum, e) => sum + (e.jumlah || 0), 0);
        const entryIds = kEntries.map((e) => e.id);

        // Find matching kurir user profile from kurirUsers list for accurate UID
        const matchedKurir = kurirUsers.find(
          (u) =>
            u.name.toLowerCase() === kName.toLowerCase() ||
            u.email.toLowerCase().includes(kName.toLowerCase()) ||
            u.email.split('@')[0].toLowerCase() === kName.toLowerCase()
        );

        const kId = matchedKurir ? matchedKurir.uid : kName.toLowerCase().replace(/\s+/g, '-');
        const finalPetugasName = matchedKurir ? matchedKurir.name : kName;

        // Collect kenek info from entries (use the first non-empty kenek name)
        const kenekName = kEntries.find((e) => e.assignedKenekName)?.assignedKenekName || '';
        const matchedKenek = kurirUsers.find(
          (u) =>
            u.name.toLowerCase() === kenekName.toLowerCase() ||
            u.email.toLowerCase().includes(kenekName.toLowerCase()) ||
            u.email.split('@')[0].toLowerCase() === kenekName.toLowerCase()
        );
        const kenekId = matchedKenek ? matchedKenek.uid : (kenekName ? kenekName.toLowerCase().replace(/\s+/g, '-') : '');
        const finalKenekName = matchedKenek ? matchedKenek.name : kenekName;

        const existingTask = deliveryTasks.find(
          (t) => t.petugasName === kName || t.petugasId === kId || t.petugasName.toLowerCase() === kName.toLowerCase()
        );

        if (existingTask) {
          await updateDeliveryTask(existingTask.id, {
            petugasId: kId,
            petugasName: finalPetugasName,
            entryIds,
            totalPorsi,
            kenekName: finalKenekName || undefined,
            kenekId: kenekId || undefined,
          });
          updated++;
        } else {
          await addDeliveryTask({
            batchId: selectedBatchId,
            petugasId: kId,
            petugasName: finalPetugasName,
            kenekId: kenekId || undefined,
            kenekName: finalKenekName || undefined,
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
        message: `Tugas Pengiriman berhasil dikirim ke akun Kurir! (${created} tugas baru, ${updated} diperbarui)`,
        variant: 'success',
      });
    } catch (err) {
      console.error('Sync error:', err);
      showToast({ message: 'Gagal mengirim tugas ke akun kurir', variant: 'error' });
    }
  };

  // Re-generate PDF from kurir report data
  const handleViewKurirReport = async (docMeta: MbgDeliveryDocument) => {
    showToast({ message: 'Menyiapkan PDF Laporan Distribusi...', variant: 'info' });

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Load logo
      let logoLoaded = false;
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        logoImg.onload = () => { logoLoaded = true; resolve(); };
        logoImg.onerror = () => resolve();
        logoImg.src = MBG_LOGO_URL;
      });

      // Cover
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, 'F');
      if (logoLoaded) doc.addImage(logoImg, 'PNG', pageW / 2 - 20, 30, 40, 40);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(17, 24, 39);
      doc.text('LAPORAN BUKTI DISTRIBUSI', pageW / 2, 85, { align: 'center' });
      doc.text('MAKANAN BERGIZI GRATIS (MBG)', pageW / 2, 95, { align: 'center' });

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Tanggal: ${docMeta.tanggalBatch || '-'}`, pageW / 2, 110, { align: 'center' });
      doc.text(`Petugas: ${docMeta.petugasName}`, pageW / 2, 117, { align: 'center' });
      doc.text(`Total: ${docMeta.totalInstitusi} Institusi | ${docMeta.totalPorsi} Porsi | ${docMeta.completedCount}/${docMeta.totalInstitusi} Lengkap`, pageW / 2, 124, { align: 'center' });

      doc.setDrawColor(226, 232, 240);
      doc.line(30, 135, pageW - 30, 135);

      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text('Dokumen ini dihasilkan secara otomatis oleh Sistem MBG Al-Umana', pageW / 2, 145, { align: 'center' });

      // Get related entries for this petugas
      const relatedEntries = entries.filter((e) => e.assignedPetugasName === docMeta.petugasName && !e.isSekolahLibur);

      if (relatedEntries.length > 0) {
        // Summary Page
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39);
        doc.text('RINGKASAN PENGIRIMAN', pageW / 2, 18, { align: 'center' });

        const summaryHeaders = ['No', 'Institusi', 'Porsi', 'Menu ✓', 'Serah Terima ✓', 'Surat Jalan ✓', 'Status'];
        const summaryRows = relatedEntries.map((entry, idx) => [
          `${idx + 1}`,
          entry.institutionName,
          `${entry.jumlah}`,
          entry.photoMenuUrl ? '✓' : '—',
          entry.photoSerahTerimaUrl ? '✓' : '—',
          entry.photoSuratJalanUrl ? '✓' : '—',
          entry.photoMenuUrl && entry.photoSerahTerimaUrl && entry.photoSuratJalanUrl ? 'LENGKAP' : 'BELUM',
        ]);

        autoTable(doc, {
          startY: 24,
          head: [summaryHeaders],
          body: summaryRows,
          theme: 'grid',
          headStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] },
          styles: { lineWidth: 0.2, lineColor: [203, 213, 225] },
        });

        // Per-institution photo pages
        for (const entry of relatedEntries) {
          doc.addPage();
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(17, 24, 39);
          doc.text(entry.institutionName, pageW / 2, 16, { align: 'center' });

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(`Jumlah Porsi: ${entry.jumlah} | Jadwal: ${entry.jadwalPengantaran || '-'}`, pageW / 2, 22, { align: 'center' });

          doc.setDrawColor(226, 232, 240);
          doc.line(14, 25, pageW - 14, 25);

          const photoSlots = [
            { label: '1. Foto Menu / Box', url: entry.photoMenuUrl, desc: entry.photoMenuDesc },
            { label: '2. Foto Serah Terima', url: entry.photoSerahTerimaUrl, desc: entry.photoSerahTerimaDesc },
            { label: '3. Foto Surat Jalan', url: entry.photoSuratJalanUrl, desc: entry.photoSuratJalanDesc },
          ];

          const slotW = (pageW - 28 - 10) / 3;
          const startY = 30;

          for (let i = 0; i < photoSlots.length; i++) {
            const slot = photoSlots[i];
            const x = 14 + i * (slotW + 5);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(17, 24, 39);
            doc.text(slot.label, x, startY);

            const photoY = startY + 3;
            const photoH = 55;

            if (slot.url) {
              try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise<void>((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                  img.src = slot.url!;
                });
                if (img.complete && img.naturalWidth > 0) {
                  doc.addImage(img, 'JPEG', x, photoY, slotW, photoH);
                } else {
                  doc.setDrawColor(203, 213, 225);
                  doc.rect(x, photoY, slotW, photoH);
                  doc.setFontSize(7);
                  doc.setTextColor(148, 163, 184);
                  doc.text('Foto tidak tersedia', x + slotW / 2, photoY + photoH / 2, { align: 'center' });
                }
              } catch {
                doc.setDrawColor(203, 213, 225);
                doc.rect(x, photoY, slotW, photoH);
                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text('Foto gagal dimuat', x + slotW / 2, photoY + photoH / 2, { align: 'center' });
              }
            } else {
              doc.setDrawColor(203, 213, 225);
              doc.rect(x, photoY, slotW, photoH);
              doc.setFontSize(7);
              doc.setTextColor(148, 163, 184);
              doc.text('Belum diambil', x + slotW / 2, photoY + photoH / 2, { align: 'center' });
            }

            if (slot.desc) {
              doc.setFontSize(7);
              doc.setFont('helvetica', 'italic');
              doc.setTextColor(100, 116, 139);
              const lines = doc.splitTextToSize(slot.desc, slotW);
              doc.text(lines, x, photoY + photoH + 4);
            }
          }
        }
      }

      const fileName = `Laporan_Distribusi_MBG_${docMeta.petugasName.replace(/\s+/g, '_')}_${docMeta.tanggalBatch || 'undated'}.pdf`;
      doc.save(fileName);
      showToast({ message: 'PDF Laporan Distribusi berhasil diunduh!', variant: 'success' });
    } catch (err) {
      console.error('Failed to export delivery report PDF:', err);
      showToast({ message: 'Gagal mengekspor PDF laporan', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Distribusi MBG</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Atur penugasan kurir + kenek per institusi dan lihat laporan pengiriman
          </p>
        </div>

        {selectedBatchId && (
          <div className="flex items-center gap-2">
            {activeTab === 'assignment' && (
              <button
                onClick={() => handleSyncDeliveryTasks()}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-3 rounded-xl cursor-pointer shadow-md active:scale-95 transition-all"
              >
                <Send className="h-4 w-4 text-white" />
                <span>🚀 Submit & Kirim Tugas Kurir</span>
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
                {(['assignment', 'reports'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      activeTab === tab
                        ? 'bg-white text-[#111827] shadow-sm'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    {tab === 'assignment' ? '🚚 Penugasan Kurir' : '📄 Laporan Kurir'}
                  </button>
                ))}
              </div>

              {activeTab === 'assignment' ? (
                /* Kurir Assignment Tab - Per institution with Kurir + Kenek */
                <div className="space-y-6">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs font-bold text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                      <span>💡 Klik <strong>"Tugaskan"</strong> untuk memilih Kurir & Kenek, lalu klik <strong>"Submit & Kirim Tugas Kurir"</strong> agar tugas masuk ke akun Kurir MBG.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSyncDeliveryTasks()}
                      className="shrink-0 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-lg cursor-pointer shadow-xs active:scale-95 transition-all"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Submit Semua Tugas</span>
                    </button>
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
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex gap-3 text-xs font-bold text-white bg-white/10 px-3.5 py-1.5 rounded-full">
                              <span>{entriesList.length} Institusi</span>
                              <span>•</span>
                              <span>{totalPorsi} Porsi</span>
                            </div>
                            {petugasName !== 'Belum Ditugaskan' && (
                              <button
                                type="button"
                                onClick={() => handleSyncDeliveryTasks(petugasName)}
                                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg cursor-pointer shadow-xs active:scale-95 transition-all"
                                title={`Kirim tugas pengiriman ke akun ${petugasName}`}
                              >
                                <Send className="h-3.5 w-3.5" />
                                <span>Kirim Tugas {petugasName}</span>
                              </button>
                            )}
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
                                <th className="py-3 px-3 text-center w-10">
                                  <input
                                    type="checkbox"
                                    title="Pilih Semua Institusi di Grup Ini"
                                    checked={
                                      entriesList.length > 0 &&
                                      entriesList.every((e) => selectedEntryIds.includes(e.id))
                                    }
                                    onChange={() => toggleSelectAllGroup(entriesList)}
                                    className="h-4 w-4 rounded border-gray-300 text-[#FBBF24] focus:ring-[#FBBF24] cursor-pointer"
                                  />
                                </th>
                                <th className="py-3 px-6">Institusi</th>
                                <th className="py-3 px-4 text-center">QT Siswa/Balita</th>
                                <th className="py-3 px-4 text-center">QT Bumil/Busui</th>
                                <th className="py-3 px-4 text-center">QT Guru/Kader</th>
                                <th className="py-3 px-4 text-center">Pobia Nasi</th>
                                <th className="py-3 px-4 text-center">Jumlah</th>
                                <th className="py-3 px-4">Jadwal</th>
                                <th className="py-3 px-4">Kurir</th>
                                <th className="py-3 px-4">Kenek</th>
                                <th className="py-3 px-4 text-center">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {entriesList.map((entry) => (
                                <tr
                                  key={entry.id}
                                  className={`hover:bg-gray-50/50 ${
                                    selectedEntryIds.includes(entry.id) ? 'bg-amber-50/60' : ''
                                  } ${
                                    entry.isSekolahLibur ? 'bg-red-50/40 text-red-500 line-through' : ''
                                  }`}
                                >
                                  <td className="py-3 px-3 text-center w-10">
                                    <input
                                      type="checkbox"
                                      title={`Pilih ${entry.institutionName}`}
                                      checked={selectedEntryIds.includes(entry.id)}
                                      onChange={() => toggleSelectEntry(entry.id)}
                                      className="h-4 w-4 rounded border-gray-300 text-[#FBBF24] focus:ring-[#FBBF24] cursor-pointer"
                                    />
                                  </td>
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
                                  <td className="py-3 px-4 text-center font-bold">
                                    {entry.qtSiswaBalita}
                                  </td>
                                  <td className="py-3 px-4 text-center font-bold">
                                    {entry.qtBumilBusui}
                                  </td>
                                  <td className="py-3 px-4 text-center font-bold">
                                    {entry.qtGuruKader}
                                  </td>
                                  <td className="py-3 px-4 text-center font-bold text-amber-600">
                                    {entry.qtPobiaNasi}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className="px-2 py-0.5 bg-[#FBBF24]/20 text-[#92400E] rounded-full font-extrabold text-[10px]">
                                      {entry.jumlah}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-bold text-gray-700">
                                    {entry.jadwalPengantaran || '-'}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                      entry.assignedPetugasName
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-gray-100 text-gray-500'
                                    }`}>
                                      {entry.assignedPetugasName || '-'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                      entry.assignedKenekName
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'bg-gray-100 text-gray-400'
                                    }`}>
                                      {entry.assignedKenekName || '-'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <button
                                      onClick={() => handleOpenAssign(entry)}
                                      disabled={entry.isSekolahLibur}
                                      className="px-3 py-1.5 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] font-extrabold text-[10px] rounded-lg cursor-pointer transition-all shadow-xs active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                                    >
                                      <Users className="h-3 w-3" />
                                      Tugaskan
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {/* Total Row */}
                              <tr className="bg-[#111827] text-white font-extrabold text-xs">
                                <td className="py-3 px-6" colSpan={1}>TOTAL</td>
                                <td className="py-3 px-4 text-center">{totalSiswa}</td>
                                <td className="py-3 px-4 text-center">{totalBumil}</td>
                                <td className="py-3 px-4 text-center">{totalGuru}</td>
                                <td className="py-3 px-4 text-center">{totalPobia}</td>
                                <td className="py-3 px-4 text-center">
                                  <span className="px-2.5 py-0.5 bg-[#FBBF24] text-[#111827] rounded-full font-extrabold">
                                    {totalPorsi}
                                  </span>
                                </td>
                                <td className="py-3 px-4" colSpan={4}></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Laporan Kurir Tab */
                <div className="space-y-4 font-['Hanken_Grotesk']">
                  {batchDeliveryDocs.length === 0 ? (
                    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
                      <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                      <h3 className="text-lg font-bold text-[#111827]">Belum Ada Laporan</h3>
                      <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                        Laporan kurir akan muncul setelah kurir MBG atau kenek melakukan export PDF dari halaman delivery mereka.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Search & Filter Bar */}
                      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs">
                        <div className="relative flex-1">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            type="text"
                            value={distribSearchQuery}
                            onChange={(e) => setDistribSearchQuery(e.target.value)}
                            placeholder="Cari nama petugas, tanggal batch, atau nama file PDF..."
                            className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:bg-white transition-all"
                          />
                          {distribSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setDistribSearchQuery('')}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3.5 py-2 rounded-xl">
                            Menampilkan {filteredBatchDeliveryDocs.length} dari {batchDeliveryDocs.length} Laporan
                          </span>
                        </div>
                      </div>

                      {/* Table Container */}
                      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                        <div className="px-6 py-4 bg-[#111827] text-white flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <FileDown className="h-4.5 w-4.5 text-[#FBBF24]" />
                            <span className="text-sm font-extrabold uppercase tracking-wider">
                              Arsip Laporan Kurir
                            </span>
                          </div>
                          <span className="text-xs font-bold bg-white/15 px-3 py-1.5 rounded-full">
                            {filteredBatchDeliveryDocs.length} Laporan
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left min-w-[700px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[9px] tracking-wider">
                                <th className="py-3 px-6">Petugas</th>
                                <th className="py-3 px-6 text-center">Tanggal Batch</th>
                                <th className="py-3 px-6 text-center">Institusi</th>
                                <th className="py-3 px-6 text-center">Porsi</th>
                                <th className="py-3 px-6 text-center">Kelengkapan</th>
                                <th className="py-3 px-6 text-center">Dibuat</th>
                                <th className="py-3 px-6 text-center">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {filteredBatchDeliveryDocs.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">
                                    Tidak ada laporan yang cocok dengan pencarian "{distribSearchQuery}"
                                  </td>
                                </tr>
                              ) : (
                                filteredBatchDeliveryDocs.map((docItem) => (
                                  <tr key={docItem.id} className="hover:bg-gray-50/50">
                                    <td className="py-3 px-6 font-bold text-[#111827]">{docItem.petugasName}</td>
                                    <td className="py-3 px-6 text-center font-semibold text-gray-600">{docItem.tanggalBatch}</td>
                                    <td className="py-3 px-6 text-center font-bold">{docItem.totalInstitusi}</td>
                                    <td className="py-3 px-6 text-center font-bold">{docItem.totalPorsi}</td>
                                    <td className="py-3 px-6 text-center">
                                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                        docItem.completedCount === docItem.totalInstitusi
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-amber-50 text-amber-700'
                                      }`}>
                                        {docItem.completedCount}/{docItem.totalInstitusi} Lengkap
                                      </span>
                                    </td>
                                    <td className="py-3 px-6 text-center text-gray-500">
                                      {new Date(docItem.createdAt).toLocaleDateString('id-ID')}
                                    </td>
                                    <td className="py-3 px-6 text-center">
                                      <button
                                        onClick={() => handleViewKurirReport(docItem)}
                                        className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-[#111827] text-white hover:bg-black font-extrabold text-[10px] rounded-lg cursor-pointer shadow-xs transition-all active:scale-95"
                                        title="Unduh / Lihat PDF Laporan"
                                      >
                                        <FileDown className="h-3 w-3 text-[#FBBF24]" />
                                        <span>Unduh PDF</span>
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-lg font-bold text-[#111827]">Pilih batch pengiriman</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                Silakan pilih batch pengiriman di atas untuk melihat data Penugasan Kurir dan Laporan.
              </p>
            </div>
          )}
        </>
      )}

      {/* Assign Kurir + Kenek Modal (Per Institution) */}
      <AnimatePresence>
        {assignModalEntry && (
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
                    Penugasan Per Institusi
                  </span>
                  <h3 className="text-lg font-extrabold text-[#111827]">
                    {assignModalEntry.institutionName}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {assignModalEntry.jumlah} Porsi • Jadwal: {assignModalEntry.jadwalPengantaran || '-'}
                  </p>
                </div>
                <button
                  onClick={() => setAssignModalEntry(null)}
                  title="Tutup Modal"
                  className="p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Kurir Selection */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Kurir MBG (Wajib)</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {kurirOptions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setAssignKurirName(name)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          assignKurirName === name
                            ? 'bg-[#111827] text-white border-[#111827]'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    required
                    title="Nama Kurir MBG"
                    value={assignKurirName}
                    onChange={(e) => setAssignKurirName(e.target.value)}
                    placeholder="Ketik atau pilih nama kurir..."
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all font-bold text-gray-900"
                  />
                </div>

                {/* Kenek Selection */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Kenek / Asisten (Opsional)</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {kurirOptions.filter((n) => n !== assignKurirName).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setAssignKenekName(name)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          assignKenekName === name
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    title="Nama Kenek (Asisten)"
                    value={assignKenekName}
                    onChange={(e) => setAssignKenekName(e.target.value)}
                    placeholder="Nama kenek / asisten (opsional)..."
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all font-bold text-gray-900"
                  />
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAssignModalEntry(null)}
                    className="flex-1 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 text-xs font-bold text-gray-700 cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveAssignment}
                    disabled={!assignKurirName.trim()}
                    className="flex-1 py-2.5 bg-[#111827] text-white hover:bg-black rounded-xl cursor-pointer text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Simpan Penugasan
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {selectedEntryIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#111827] text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-6 border border-gray-800 font-['Hanken_Grotesk']"
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-extrabold">
                {selectedEntryIds.length} Institusi Terpilih
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setBulkKurirName('');
                  setBulkKenekName('');
                  setIsBulkAssignOpen(true);
                }}
                className="flex items-center gap-2 bg-[#FBBF24] hover:bg-amber-400 text-[#111827] font-extrabold text-xs px-4 py-2 rounded-xl cursor-pointer shadow-md active:scale-95 transition-all"
              >
                <Users className="h-4 w-4" />
                <span>Tugaskan Kurir & Kenek Sekaligus ({selectedEntryIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedEntryIds([])}
                className="text-xs font-bold text-gray-400 hover:text-white cursor-pointer px-2 py-1"
              >
                Batal
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Assign Modal */}
      <AnimatePresence>
        {isBulkAssignOpen && (
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
                    Penugasan Massal (Bulk Assign)
                  </span>
                  <h3 className="text-lg font-extrabold text-[#111827]">
                    Tugaskan {selectedEntryIds.length} Institusi Terpilih
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pilihan Kurir & Kenek akan diterapkan langsung ke {selectedEntryIds.length} institusi terpilih.
                  </p>
                </div>
                <button
                  onClick={() => setIsBulkAssignOpen(false)}
                  title="Tutup Modal"
                  className="p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Selected items summary */}
                <div className="bg-gray-50 p-3 rounded-xl max-h-32 overflow-y-auto space-y-1 border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                    Daftar Institusi Terpilih ({selectedEntryIds.length}):
                  </span>
                  {entries
                    .filter((e) => selectedEntryIds.includes(e.id))
                    .map((e) => (
                      <div key={e.id} className="text-xs font-bold text-gray-700 flex justify-between">
                        <span>• {e.institutionName}</span>
                        <span className="text-gray-400 font-normal">{e.jumlah} Porsi</span>
                      </div>
                    ))}
                </div>

                {/* Kurir Selection */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                    Pilih Kurir MBG (Wajib)
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {kurirOptions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setBulkKurirName(name)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          bulkKurirName === name
                            ? 'bg-[#111827] text-white border-[#111827]'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    required
                    title="Nama Kurir MBG"
                    value={bulkKurirName}
                    onChange={(e) => setBulkKurirName(e.target.value)}
                    placeholder="Ketik atau pilih nama kurir..."
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all font-bold text-gray-900"
                  />
                </div>

                {/* Kenek Selection */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                    Pilih Kenek / Asisten (Opsional)
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {kurirOptions.filter((n) => n !== bulkKurirName).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setBulkKenekName(name)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          bulkKenekName === name
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    title="Nama Kenek (Asisten)"
                    value={bulkKenekName}
                    onChange={(e) => setBulkKenekName(e.target.value)}
                    placeholder="Nama kenek / asisten (opsional)..."
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all font-bold text-gray-900"
                  />
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsBulkAssignOpen(false)}
                    className="flex-1 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 text-xs font-bold text-gray-700 cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingBulk || !bulkKurirName.trim()}
                    onClick={handleBulkAssignSubmit}
                    className="flex-1 py-2.5 bg-[#111827] hover:bg-black text-white disabled:bg-gray-300 rounded-xl cursor-pointer text-xs font-bold text-center shadow-md flex items-center justify-center gap-2"
                  >
                    {isSubmittingBulk ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#FBBF24]" />
                    ) : (
                      <Send className="h-4 w-4 text-[#FBBF24]" />
                    )}
                    <span>Simpan Penugasan ({selectedEntryIds.length})</span>
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
