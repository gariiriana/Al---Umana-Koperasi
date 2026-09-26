import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Truck,
  Calendar,
  Loader2,
  FileDown,
  FileText,
  Users,
  X,
  Send,
  Search,
  Edit3,
  Camera,
  Upload,
  Trash2,
  Download,
  Save,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type {
  MbgPmBatch,
  MbgPmEntry,
  MbgDeliveryTask,
  MbgSchoolProof,
  MbgProductionDailyReport,
} from '@/types/mbg';
import {
  subscribeBatches,
  subscribeEntries,
  updateEntry,
  addMultipleEntries,
  recalculateBatchTotals,
  updateBatchStatus,
} from '@/services/mbgAdminService';
import { subscribeAllDailyReports } from '@/services/mbgProductionService';
import {
  subscribeDeliveryTasks,
  addDeliveryTask,
  updateDeliveryTask,
  subscribeKurirUsers,
  type MbgKurirUser,
} from '@/services/mbgDistributionService';
import {
  subscribeAllDeliveryDocuments,
  updateSchoolDeliveryProof,
  deleteSchoolDeliveryProof,
  type MbgDeliveryDocument,
} from '@/services/mbgDeliveryService';
import { LiveCamera } from '@/components/LiveCamera';
import { SearchableBatchSelector } from '@/components/mbg/SearchableBatchSelector';
import { MbgBahanDocumentationSection } from '@/components/mbg/MbgBahanDocumentationSection';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  exportMbgDeliveryReportPdf,
  exportMbgDailyDistributionReportPdf,
  formatIndonesianDate,
  compareCouriers,
} from '@/utils/mbgDeliveryReportPdfExporter';
import { getJakartaDate } from '@/utils/date';

function getAutoRekapTotals(entries: MbgPmEntry[]) {
  return entries.filter((entry) => !entry.isSekolahLibur).reduce(
    (total, entry) => {
      const porsiKecilL = entry.qtPorsiKecilL || 0;
      const porsiKecilP = entry.qtPorsiKecilP || 0;
      const porsiBesarL = entry.qtPorsiBesarL || 0;
      const porsiBesarP = entry.qtPorsiBesarP || 0;
      const bumil = entry.qtBumil || 0;
      const busui = entry.qtBusui || 0;
      const guruL = entry.qtGuruL || 0;
      const guruP = entry.qtGuruP || 0;
      const tendikL = entry.qtTendikL || 0;
      const tendikP = entry.qtTendikP || 0;

      const subTotalL = porsiKecilL + porsiBesarL;
      const subTotalP = porsiKecilP + porsiBesarP + bumil + busui;

      total.porsiKecilL += porsiKecilL;
      total.porsiKecilP += porsiKecilP;
      total.porsiBesarL += porsiBesarL;
      total.porsiBesarP += porsiBesarP;
      total.totalL += subTotalL;
      total.totalP += subTotalP;
      total.totalSiswa += subTotalL + subTotalP;
      total.guruL += guruL;
      total.guruP += guruP;
      total.tendikL += tendikL;
      total.tendikP += tendikP;
      total.totalStaf += guruL + guruP + tendikL + tendikP;
      total.jumlah += entry.jumlah || 0;
      return total;
    },
    {
      porsiKecilL: 0,
      porsiKecilP: 0,
      porsiBesarL: 0,
      porsiBesarP: 0,
      totalL: 0,
      totalP: 0,
      totalSiswa: 0,
      guruL: 0,
      guruP: 0,
      tendikL: 0,
      tendikP: 0,
      totalStaf: 0,
      jumlah: 0,
    }
  );
}

export function MbgDistributionPage() {
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [deliveryTasks, setDeliveryTasks] = useState<MbgDeliveryTask[]>([]);
  const [deliveryDocs, setDeliveryDocs] = useState<MbgDeliveryDocument[]>([]);
  const [kurirUsers, setKurirUsers] = useState<MbgKurirUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'assignment' | 'reports' | 'bahan'>('assignment');
  const [isExportingDailyPdf, setIsExportingDailyPdf] = useState(false);
  const [allDailyReports, setAllDailyReports] = useState<MbgProductionDailyReport[]>([]);
  const [batchFilterMode, setBatchFilterMode] = useState<'imported' | 'all'>('imported');
  const [isSyncingEntries, setIsSyncingEntries] = useState(false);
  const [pmSearch, setPmSearch] = useState('');
  const [selectedCourierFilter, setSelectedCourierFilter] = useState('all');
  const [isCourierSummaryOpen, setIsCourierSummaryOpen] = useState(false);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId),
    [batches, selectedBatchId]
  );

  const currentDailyReport = useMemo(
    () => allDailyReports.find((r) => r.batchId === selectedBatchId) || null,
    [allDailyReports, selectedBatchId]
  );

  // Per-institution assignment modal
  const [assignModalEntry, setAssignModalEntry] = useState<MbgPmEntry | null>(null);
  const [assignKurirName, setAssignKurirName] = useState('');
  const [assignKenekName, setAssignKenekName] = useState('');
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});

  // Correction & Editing Modal state for Laporan Kurir
  const [editingReportDoc, setEditingReportDoc] = useState<MbgDeliveryDocument | null>(null);
  const [activeCorrectionSlot, setActiveCorrectionSlot] = useState<{
    entryId: string;
    institutionName: string;
    proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan';
  } | null>(null);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [isUploadingCorrectionPhoto, setIsUploadingCorrectionPhoto] = useState(false);

  const handleEditKurirReport = (docItem: MbgDeliveryDocument) => {
    setEditingReportDoc(docItem);
  };

  const handleFileUploadCorrection = async (
    e: React.ChangeEvent<HTMLInputElement>,
    entryId: string,
    institutionName: string,
    proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !editingReportDoc) return;

    setIsUploadingCorrectionPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const matchedTask = deliveryTasks.find(
          (t) => (t.petugasName === editingReportDoc.petugasName || t.petugasId === editingReportDoc.petugasId) && t.batchId === editingReportDoc.batchId
        );

        await updateSchoolDeliveryProof(
          entryId,
          institutionName,
          proofType,
          dataUrl,
          matchedTask?.id,
          {
            description: `Dikoreksi oleh Tim Distribusi MBG (${new Date().toLocaleTimeString('id-ID')})`,
            timestamp: new Date().toISOString(),
          }
        );

        showToast({ message: 'Bukti foto berhasil dikoreksi & diperbarui!', variant: 'success' });
        setIsUploadingCorrectionPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error uploading correction photo:', err);
      showToast({ message: 'Gagal memperbarui bukti foto', variant: 'error' });
      setIsUploadingCorrectionPhoto(false);
    }
  };

  const handleLiveCameraCaptureCorrection = async (file: File) => {
    if (!activeCorrectionSlot || !editingReportDoc) return;
    setIsUploadingCorrectionPhoto(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const matchedTask = deliveryTasks.find(
          (t) => (t.petugasName === editingReportDoc.petugasName || t.petugasId === editingReportDoc.petugasId) && t.batchId === editingReportDoc.batchId
        );

        await updateSchoolDeliveryProof(
          activeCorrectionSlot.entryId,
          activeCorrectionSlot.institutionName,
          activeCorrectionSlot.proofType,
          dataUrl,
          matchedTask?.id,
          {
            description: `Dikoreksi via Kamera Live oleh Tim Distribusi (${new Date().toLocaleTimeString('id-ID')})`,
            timestamp: new Date().toISOString(),
          }
        );

        showToast({ message: 'Bukti foto Kamera Live berhasil dikoreksi!', variant: 'success' });
        setIsLiveCameraOpen(false);
        setActiveCorrectionSlot(null);
        setIsUploadingCorrectionPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error live camera capture correction:', err);
      showToast({ message: 'Gagal mengunggah foto kamera live', variant: 'error' });
      setIsUploadingCorrectionPhoto(false);
    }
  };

  const handleDeleteCorrectionPhoto = async (
    entryId: string,
    proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan'
  ) => {
    if (!editingReportDoc) return;
    try {
      const matchedTask = deliveryTasks.find(
        (t) => (t.petugasName === editingReportDoc.petugasName || t.petugasId === editingReportDoc.petugasId) && t.batchId === editingReportDoc.batchId
      );

      await deleteSchoolDeliveryProof(entryId, proofType, matchedTask?.id);
      showToast({ message: 'Bukti foto berhasil dihapus/direset!', variant: 'info' });
    } catch (err) {
      console.error('Error deleting correction photo:', err);
      showToast({ message: 'Gagal menghapus bukti foto', variant: 'error' });
    }
  };

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
    const cleanKurir = bulkKurirName.trim();
    const cleanKenek = bulkKenekName.trim();

    const matched = kurirUsers.find(
      (u) =>
        u.name.toLowerCase() === cleanKurir.toLowerCase() ||
        u.email.toLowerCase().includes(cleanKurir.toLowerCase()) ||
        u.name.toLowerCase().includes(cleanKurir.toLowerCase()) ||
        cleanKurir.toLowerCase().includes(u.name.toLowerCase())
    );
    const kurirId = matched ? matched.uid : cleanKurir.toLowerCase().replace(/\s+/g, '-');
    const finalKurirName = matched ? matched.name : cleanKurir;

    const matchedKenek = cleanKenek ? kurirUsers.find(
      (u) =>
        u.name.toLowerCase() === cleanKenek.toLowerCase() ||
        u.email.toLowerCase().includes(cleanKenek.toLowerCase()) ||
        u.name.toLowerCase().includes(cleanKenek.toLowerCase()) ||
        cleanKenek.toLowerCase().includes(u.name.toLowerCase())
    ) : undefined;
    const kenekId = matchedKenek ? matchedKenek.uid : cleanKenek ? cleanKenek.toLowerCase().replace(/\s+/g, '-') : undefined;
    const finalKenekName = matchedKenek ? matchedKenek.name : cleanKenek;

    try {
      const updatedEntries = entries.map((entry) => selectedEntryIds.includes(entry.id) ? {
        ...entry,
        assignedPetugasName: finalKurirName,
        assignedPetugasId: kurirId,
        assignedKenekName: finalKenekName || undefined,
        assignedKenekId: kenekId || undefined,
      } : entry);
      await Promise.all(
        selectedEntryIds.map((id) =>
          updateEntry(id, {
            assignedPetugasName: finalKurirName,
            assignedPetugasId: kurirId,
            assignedKenekName: finalKenekName || undefined,
            assignedKenekId: kenekId || undefined,
          })
        )
      );
      showToast({
        message: `Penugasan ${selectedEntryIds.length} institusi ke ${finalKurirName} berhasil!`,
        variant: 'success',
      });
      setSelectedEntryIds([]);
      setIsBulkAssignOpen(false);
      setBulkKurirName('');
      setBulkKenekName('');

      setEntries(updatedEntries);
      await handleSyncDeliveryTasks(updatedEntries);
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
      const names = kurirUsers.map((u) => u.name);
      return names.sort((a, b) => compareCouriers(a, undefined, b, undefined));
    }
    return ['Andi Kurir', 'Dede Kurir', 'Yusep Kurir', 'Erik Kurir', 'Agus Kurir', 'Firdi Kurir'];
  }, [kurirUsers]);

  // Subscribe batches
  useEffect(() => {
    const unsub = subscribeBatches((data) => {
      // A populated import is still a draft until Admin MBG submits it.
      const activeBatches = data.filter((b) => b.status !== 'DRAFT');
      setBatches(activeBatches);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Subscribe all daily reports to know which batches have imported Excel data
  useEffect(() => {
    const unsub = subscribeAllDailyReports(setAllDailyReports);
    return unsub;
  }, []);

  const savedReportBatchIds = useMemo(() => {
    const set = new Set<string>();
    allDailyReports.forEach((r) => {
      if (r.batchId) set.add(r.batchId);
    });
    return set;
  }, [allDailyReports]);

  // Filter batches: only batches that have imported data from Produksi MBG
  const importedBatches = useMemo(() => {
    return batches.filter((b) => savedReportBatchIds.has(b.id));
  }, [batches, savedReportBatchIds]);

  const displayBatches = useMemo(() => {
    if (batchFilterMode === 'imported') {
      return importedBatches;
    }
    return batches;
  }, [batchFilterMode, importedBatches, batches]);

  // Keep selectedBatchId synced with displayBatches (auto-select latest imported batch)
  useEffect(() => {
    if (displayBatches.length > 0) {
      if (!selectedBatchId || !displayBatches.some((b) => b.id === selectedBatchId)) {
        setSelectedBatchId(displayBatches[0].id);
      }
    } else if (batchFilterMode === 'imported' && batches.length > 0 && importedBatches.length === 0) {
      setSelectedBatchId(null);
    }
  }, [displayBatches, selectedBatchId, batchFilterMode, batches.length, importedBatches.length]);

  // Helper to sync PM entries from Excel daily report if batch entries are empty in Firestore
  const syncEntriesFromDailyReport = async (report: MbgProductionDailyReport, targetBatchId: string) => {
    if (!report.sekolahList || report.sekolahList.length === 0) return;
    try {
      const newEntries: Omit<MbgPmEntry, 'id'>[] = report.sekolahList.map((s, idx) => {
        const nameLower = s.nama.toLowerCase();
        const isPosyandu = nameLower.includes('balita') || nameLower.includes('bumil') || nameLower.includes('busui') || nameLower.includes('posyandu') || nameLower.includes('3b');
        const schoolLevel = nameLower.includes('tk') || nameLower.includes('paud') ? 'tk_paud' : (nameLower.includes('smp') || nameLower.includes('sma') ? 'sma' : 'sd');
        const total = (s.murid || 0) + (s.guru || 0);
        return {
          batchId: targetBatchId,
          institutionName: s.nama,
          institutionType: isPosyandu ? 'posyandu' : 'sekolah',
          schoolLevel: isPosyandu ? undefined : schoolLevel,
          qtSiswaBalita: s.murid || 0,
          qtBumil: 0,
          qtBusui: 0,
          qtBumilBusui: 0,
          qtGuruKader: s.guru || 0,
          qtPobiaNasi: 0,
          qtPorsiBalita: isPosyandu && nameLower.includes('balita') ? s.murid : 0,
          qtPorsiBumilBusui: isPosyandu && (nameLower.includes('bumil') || nameLower.includes('busui')) ? s.murid : 0,
          jumlah: total,
          jadwalPengantaran: '06.30-08.30',
          assignedPetugasId: '',
          assignedPetugasName: '',
          menuItems: [],
          menuKeringanItems: [],
          isSekolahLibur: total === 0,
          notes: '',
          sortOrder: idx + 1,
          createdBy: report.createdBy || 'excel-import-sync',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      if (newEntries.length > 0) {
        await addMultipleEntries(newEntries);
        await recalculateBatchTotals(targetBatchId);
        // An Excel report can be attached to a batch already moving through
        // the workflow. Distribusi may only advance a fresh draft; it must
        // preserve every later status (QC, cooking, delivery, etc.).
        const targetBatch = batches.find((batch) => batch.id === targetBatchId);
        if (targetBatch?.status === 'DRAFT') {
          await updateBatchStatus(targetBatchId, 'PM_SUBMITTED');
        }
        showToast({
          message: `Berhasil memuat ${newEntries.length} institusi sekolah dari Excel Produksi ke Distribusi MBG!`,
          variant: 'success',
        });
      }
    } catch (err) {
      console.error('Failed to sync entries from daily report:', err);
      showToast({
        message: 'Gagal memuat data sekolah dari Excel ke Distribusi MBG',
        variant: 'error',
      });
    }
  };

  // Auto-sync entries if current selected batch has Excel report with sekolahList but 0 entries in mbg_pm_entries
  useEffect(() => {
    if (!selectedBatchId || loading || isSyncingEntries) return;
    if (entries.length === 0) {
      const matchedReport = allDailyReports.find((r) => r.batchId === selectedBatchId);
      if (matchedReport?.sekolahList && matchedReport.sekolahList.length > 0) {
        setIsSyncingEntries(true);
        syncEntriesFromDailyReport(matchedReport, selectedBatchId).finally(() => {
          setIsSyncingEntries(false);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId, entries.length, allDailyReports, loading]);

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

  // Filter delivery docs for selected batch & search query (synthesizing live uploads from couriers)
  const batchDeliveryDocs = useMemo(() => {
    const savedDocs = selectedBatchId
      ? deliveryDocs.filter((d) => d.batchId === selectedBatchId)
      : deliveryDocs;

    const docMap = new Map<string, MbgDeliveryDocument>();
    savedDocs.forEach((d) => docMap.set(d.petugasName.toLowerCase().trim(), d));

    if (entries.length > 0) {
      const petugasGroups: Record<string, MbgPmEntry[]> = {};
      entries.forEach((e) => {
        if (e.assignedPetugasName && !e.isSekolahLibur) {
          const key = e.assignedPetugasName.trim();
          if (!petugasGroups[key]) petugasGroups[key] = [];
          petugasGroups[key].push(e);
        }
      });

      Object.entries(petugasGroups).forEach(([pName, pEntries]) => {
        const key = pName.toLowerCase().trim();
        const completedCount = pEntries.filter((e) =>
          Boolean(e.photoMenuUrl && e.photoSerahTerimaUrl && e.photoSuratJalanUrl && e.photoPenerimaUrl)
        ).length;
        const totalPorsi = pEntries.reduce((sum, e) => sum + (e.jumlah || 0), 0);
        const matchedTask = deliveryTasks.find(
          (t) => t.petugasName.toLowerCase().trim() === key || (t.petugasId && t.petugasId === pEntries[0]?.assignedPetugasId)
        );

        if (docMap.has(key)) {
          // Update live metrics on existing saved doc
          const existing = docMap.get(key)!;
          docMap.set(key, {
            ...existing,
            totalInstitusi: pEntries.length,
            totalPorsi,
            completedCount: Math.max(existing.completedCount || 0, completedCount),
          });
        } else {
          // Create virtual doc from live entries
          docMap.set(key, {
            id: matchedTask ? matchedTask.id : `virt-${key}`,
            batchId: selectedBatchId || pEntries[0]?.batchId || '',
            tanggalBatch: selectedBatch?.tanggal || getJakartaDate(),
            petugasName: pName,
            petugasId: pEntries[0]?.assignedPetugasId || matchedTask?.petugasId || key.replace(/\s+/g, '-'),
            documentType: 'delivery_report',
            fileName: `Laporan_Distribusi_MBG_${pName.replace(/\s+/g, '_')}_${selectedBatch?.tanggal || 'aktif'}.pdf`,
            totalInstitusi: pEntries.length,
            totalPorsi,
            completedCount,
            createdAt: matchedTask?.createdAt || new Date().toISOString(),
            createdBy: pName,
          });
        }
      });
    }

    const docs = Array.from(docMap.values());
    docs.sort((a, b) => compareCouriers(a.petugasName, undefined, b.petugasName, undefined));
    return docs;
  }, [deliveryDocs, deliveryTasks, entries, selectedBatch, selectedBatchId]);

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

  // Group PM entries by petugas and sort by operational courier sequence
  const groupedEntries = useMemo(() => {
    const groups: Record<string, MbgPmEntry[]> = {};
    entries.forEach((e) => {
      const key = e.assignedPetugasName || 'Belum Ditugaskan';
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const kenekA = groups[a].find((e) => e.assignedKenekName)?.assignedKenekName;
      const kenekB = groups[b].find((e) => e.assignedKenekName)?.assignedKenekName;
      return compareCouriers(a, kenekA, b, kenekB);
    });

    const sortedGroups: Record<string, MbgPmEntry[]> = {};
    sortedKeys.forEach((k) => {
      sortedGroups[k] = [...groups[k]].sort((x, y) => {
        const diff = (x.sortOrder || 0) - (y.sortOrder || 0);
        if (diff !== 0) return diff;
        return (x.institutionName || '').localeCompare(y.institutionName || '');
      });
    });
    return sortedGroups;
  }, [entries]);

  // Distribution status filter for Penugasan Kurir
  const [distributionStatusFilter, setDistributionStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const totalPendingEntries = useMemo(() => {
    return entries.filter(
      (e) => !e.isSekolahLibur && !(e.photoMenuUrl && e.photoSerahTerimaUrl && e.photoSuratJalanUrl && e.photoPenerimaUrl)
    ).length;
  }, [entries]);

  const totalCompletedEntries = useMemo(() => {
    return entries.filter(
      (e) => !e.isSekolahLibur && Boolean(e.photoMenuUrl && e.photoSerahTerimaUrl && e.photoSuratJalanUrl && e.photoPenerimaUrl)
    ).length;
  }, [entries]);

  const courierFilterOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.assignedPetugasName && e.assignedPetugasName.trim() && e.assignedPetugasName !== 'Belum Ditugaskan') {
        set.add(e.assignedPetugasName.trim());
      }
    });
    return Array.from(set).sort((a, b) => compareCouriers(a, undefined, b, undefined));
  }, [entries]);

  const assignedCouriersList = useMemo(() => {
    const map = new Map<string, { count: number; porsi: number; kenekNames: Set<string> }>();
    entries.forEach((e) => {
      const name = (e.assignedPetugasName || '').trim();
      if (!name || name === 'Belum Ditugaskan') return;
      if (!map.has(name)) {
        map.set(name, { count: 0, porsi: 0, kenekNames: new Set() });
      }
      const item = map.get(name)!;
      item.count += 1;
      item.porsi += e.jumlah || 0;
      if (e.assignedKenekName && e.assignedKenekName.trim()) {
        item.kenekNames.add(e.assignedKenekName.trim());
      }
    });
    return Array.from(map.entries())
      .map(([petugasName, info]) => ({
        petugasName,
        count: info.count,
        porsi: info.porsi,
        kenekText: Array.from(info.kenekNames).join(', '),
      }))
      .sort((a, b) => compareCouriers(a.petugasName, undefined, b.petugasName, undefined));
  }, [entries]);

  const filteredPmEntries = useMemo(() => {
    return entries.filter((e) => {
      // Status filter
      if (distributionStatusFilter === 'pending') {
        const isCompleted =
          !e.isSekolahLibur &&
          Boolean(e.photoMenuUrl && e.photoSerahTerimaUrl && e.photoSuratJalanUrl && e.photoPenerimaUrl);
        if (isCompleted || e.isSekolahLibur) return false;
      } else if (distributionStatusFilter === 'completed') {
        const isCompleted =
          !e.isSekolahLibur &&
          Boolean(e.photoMenuUrl && e.photoSerahTerimaUrl && e.photoSuratJalanUrl && e.photoPenerimaUrl);
        if (!isCompleted) return false;
      }

      // Courier filter
      if (selectedCourierFilter !== 'all') {
        if (selectedCourierFilter === 'unassigned') {
          if (
            e.assignedPetugasName &&
            e.assignedPetugasName.trim() !== '' &&
            e.assignedPetugasName !== 'Belum Ditugaskan'
          ) {
            return false;
          }
        } else {
          if ((e.assignedPetugasName || '').toLowerCase().trim() !== selectedCourierFilter.toLowerCase().trim()) {
            return false;
          }
        }
      }

      // Search query
      if (pmSearch.trim()) {
        const q = pmSearch.toLowerCase().trim();
        const matchName = (e.institutionName || '').toLowerCase().includes(q);
        const matchKurir = (e.assignedPetugasName || '').toLowerCase().includes(q);
        const matchKenek = (e.assignedKenekName || '').toLowerCase().includes(q);
        if (!matchName && !matchKurir && !matchKenek) return false;
      }

      return true;
    });
  }, [entries, distributionStatusFilter, selectedCourierFilter, pmSearch]);

  const schoolPmEntries = useMemo(
    () => filteredPmEntries.filter((e) => e.institutionType !== 'posyandu'),
    [filteredPmEntries]
  );

  const posyanduPmEntries = useMemo(
    () => filteredPmEntries.filter((e) => e.institutionType === 'posyandu'),
    [filteredPmEntries]
  );

  const overallTotals = useMemo(() => getAutoRekapTotals(filteredPmEntries), [filteredPmEntries]);

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

    const matched = kurirUsers.find(
      (u) =>
        u.name.toLowerCase() === cleanKurir.toLowerCase() ||
        u.email.toLowerCase().includes(cleanKurir.toLowerCase()) ||
        u.name.toLowerCase().includes(cleanKurir.toLowerCase()) ||
        cleanKurir.toLowerCase().includes(u.name.toLowerCase())
    );
    const kurirId = matched ? matched.uid : cleanKurir.toLowerCase().replace(/\s+/g, '-');
    const finalKurirName = matched ? matched.name : cleanKurir;

    const matchedKenek = cleanKenek ? kurirUsers.find(
      (u) =>
        u.name.toLowerCase() === cleanKenek.toLowerCase() ||
        u.email.toLowerCase().includes(cleanKenek.toLowerCase()) ||
        u.name.toLowerCase().includes(cleanKenek.toLowerCase()) ||
        cleanKenek.toLowerCase().includes(u.name.toLowerCase())
    ) : undefined;
    const kenekId = matchedKenek ? matchedKenek.uid : cleanKenek ? cleanKenek.toLowerCase().replace(/\s+/g, '-') : undefined;
    const finalKenekName = matchedKenek ? matchedKenek.name : cleanKenek;

    try {
      const updatedEntries = entries.map((entry) => entry.id === assignModalEntry.id ? {
        ...entry,
        assignedPetugasName: finalKurirName,
        assignedPetugasId: kurirId,
        assignedKenekName: finalKenekName || undefined,
        assignedKenekId: kenekId || undefined,
      } : entry);
      await updateEntry(assignModalEntry.id, {
        assignedPetugasName: finalKurirName,
        assignedPetugasId: kurirId,
        assignedKenekName: finalKenekName || undefined,
        assignedKenekId: kenekId || undefined,
      });
      showToast({
        message: `${assignModalEntry.institutionName} ditugaskan ke ${finalKurirName}${finalKenekName ? ` + ${finalKenekName}` : ''}`,
        variant: 'success',
      });
      setAssignModalEntry(null);

      setEntries(updatedEntries);
      await handleSyncDeliveryTasks(updatedEntries);
    } catch {
      showToast({ message: 'Gagal menugaskan petugas', variant: 'error' });
    }
  };

  // Generate / Sync Delivery Tasks
  const handleSyncDeliveryTasks = async (sourceEntries = entries) => {
    if (!selectedBatchId) return;
    try {
      const kurirs = Array.from(new Set(sourceEntries.map((e) => e.assignedPetugasName).filter(Boolean)));

      if (kurirs.length === 0) {
        showToast({ message: 'Belum ada institusi yang ditugaskan ke Kurir', variant: 'info' });
        return;
      }

      let created = 0;
      let updated = 0;

      for (const kName of kurirs) {
        const kEntries = sourceEntries.filter((e) => e.assignedPetugasName === kName && !e.isSekolahLibur);
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

        const taskDeadline = deadlines[kName] || existingTask?.deadlineAt || (selectedBatch ? `${selectedBatch.tanggal}T15:00` : undefined);

        if (existingTask) {
          await updateDeliveryTask(existingTask.id, {
            petugasId: kId,
            petugasName: finalPetugasName,
            entryIds,
            totalPorsi,
            kenekName: finalKenekName || undefined,
            kenekId: kenekId || undefined,
            deadlineAt: taskDeadline,
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
            deadlineAt: taskDeadline,
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

      // A reassigned institution must disappear from the former courier's
      // waiting task immediately; completed tasks remain as history.
      for (const task of deliveryTasks) {
        const stillAssigned = sourceEntries.some((entry) => !entry.isSekolahLibur &&
          (entry.assignedPetugasId === task.petugasId || entry.assignedPetugasName === task.petugasName));
        if (!stillAssigned && task.status === 'waiting') {
          await updateDeliveryTask(task.id, { entryIds: [], totalPorsi: 0 });
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

  // Re-generate PDF from kurir report data (Sesuai Layout Resmi Google Doc)
  const handleViewKurirReport = async (docMeta: MbgDeliveryDocument) => {
    showToast({ message: 'Menyiapkan PDF Laporan Distribusi...', variant: 'info' });

    try {
      let targetEntries: MbgPmEntry[] = [];
      let targetTasks: MbgDeliveryTask[] = [];

      // Fetch the exact entries & tasks for this batch from Firestore
      if (docMeta.batchId) {
        if (selectedBatchId === docMeta.batchId && entries.length > 0) {
          targetEntries = entries;
          targetTasks = deliveryTasks;
        } else {
          const entriesSnap = await getDocs(
            query(collection(db, 'mbg_pm_entries'), where('batchId', '==', docMeta.batchId))
          );
          targetEntries = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgPmEntry));
          targetEntries.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

          const tasksSnap = await getDocs(
            query(collection(db, 'mbg_delivery_tasks'), where('batchId', '==', docMeta.batchId))
          );
          targetTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgDeliveryTask));
        }
      } else {
        targetEntries = entries;
        targetTasks = deliveryTasks;
      }

      // Filter entries by petugasName or petugasId
      const pNameLower = (docMeta.petugasName || '').toLowerCase().trim();
      const pIdLower = (docMeta.petugasId || '').toLowerCase().trim();

      let filteredEntries = targetEntries.filter((e) => {
        const eName = (e.assignedPetugasName || '').toLowerCase().trim();
        const eId = (e.assignedPetugasId || '').toLowerCase().trim();
        if (!pNameLower && !pIdLower) return true;
        return (
          (pNameLower && (eName === pNameLower || eName.includes(pNameLower) || pNameLower.includes(eName))) ||
          (pIdLower && eId === pIdLower)
        );
      });

      if (filteredEntries.length === 0) {
        filteredEntries = targetEntries;
      }

      // Merge proof photos from tasks if entry doesn't have them
      const matchedTask = targetTasks.find((t) => {
        const tName = (t.petugasName || '').toLowerCase().trim();
        const tId = (t.petugasId || '').toLowerCase().trim();
        return (
          (pNameLower && (tName === pNameLower || tName.includes(pNameLower) || pNameLower.includes(tName))) ||
          (pIdLower && tId === pIdLower)
        );
      });

      const mergedEntries = filteredEntries.map((entry) => {
        const proof = matchedTask?.schoolProofs?.[entry.id];
        return {
          ...entry,
          photoMenuUrl: entry.photoMenuUrl || proof?.photoMenuUrl,
          photoSerahTerimaUrl: entry.photoSerahTerimaUrl || proof?.photoSerahTerimaUrl,
          photoPenerimaUrl: entry.photoPenerimaUrl || proof?.photoPenerimaUrl,
          photoSuratJalanUrl: entry.photoSuratJalanUrl || proof?.photoSuratJalanUrl,
        };
      });

      if (mergedEntries.length === 0) {
        showToast({ message: 'Data institusi untuk laporan ini tidak ditemukan', variant: 'error' });
        return;
      }

      const fileName =
        docMeta.fileName ||
        `Laporan_Distribusi_MBG_${(docMeta.petugasName || 'Kurir').replace(/\s+/g, '_')}_${docMeta.tanggalBatch || 'undated'}.pdf`;

      await exportMbgDeliveryReportPdf({
        docMeta,
        entries: mergedEntries,
        petugasName: docMeta.petugasName,
        tanggalBatch: docMeta.tanggalBatch,
        fileName,
      });

      showToast({ message: 'PDF Laporan Distribusi berhasil diunduh!', variant: 'success' });
    } catch (err) {
      console.error('Failed to export delivery report PDF:', err);
      showToast({ message: 'Gagal mengekspor PDF laporan', variant: 'error' });
    }
  };

  // Export combined daily report for ALL couriers on the active batch date
  const handleExportDailyDistributionPdf = async (customBatchId?: string) => {
    const targetBatchId = customBatchId || selectedBatchId;
    const targetBatch = batches.find((b) => b.id === targetBatchId) || selectedBatch;
    const batchDate = targetBatch?.tanggal || getJakartaDate();

    setIsExportingDailyPdf(true);
    showToast({ message: `Menyiapkan PDF Laporan Distribusi Harian (${batchDate})...`, variant: 'info' });

    try {
      let targetEntries: MbgPmEntry[] = [];
      let targetTasks: MbgDeliveryTask[] = [];

      if (targetBatchId) {
        if (selectedBatchId === targetBatchId && entries.length > 0) {
          targetEntries = entries;
          targetTasks = deliveryTasks;
        } else {
          const entriesSnap = await getDocs(
            query(collection(db, 'mbg_pm_entries'), where('batchId', '==', targetBatchId))
          );
          targetEntries = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgPmEntry));
          targetEntries.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

          const tasksSnap = await getDocs(
            query(collection(db, 'mbg_delivery_tasks'), where('batchId', '==', targetBatchId))
          );
          targetTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgDeliveryTask));
        }
      } else {
        targetEntries = entries;
        targetTasks = deliveryTasks;
      }

      if (targetEntries.length === 0) {
        showToast({ message: 'Tidak ada data institusi/sekolah untuk tanggal ini', variant: 'error' });
        setIsExportingDailyPdf(false);
        return;
      }

      const fileName = `Laporan_Distribusi_MBG_Harian_${batchDate}.pdf`;

      await exportMbgDailyDistributionReportPdf({
        tanggalBatch: batchDate,
        batchName: targetBatch?.batchNotes || `Batch MBG ${batchDate}`,
        entries: targetEntries,
        deliveryTasks: targetTasks,
        fileName,
      });

      showToast({ message: 'PDF Laporan Distribusi Harian (Semua Kurir) berhasil diunduh!', variant: 'success' });
    } catch (err) {
      console.error('Failed to export daily delivery report PDF:', err);
      showToast({ message: 'Gagal mengekspor PDF laporan harian', variant: 'error' });
    } finally {
      setIsExportingDailyPdf(false);
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
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Daily Combined Export PDF (All Couriers) */}
            <button
              type="button"
              onClick={() => handleExportDailyDistributionPdf()}
              disabled={isExportingDailyPdf}
              className="flex items-center gap-2 bg-[#111827] hover:bg-black text-white font-extrabold text-xs px-4 py-3 rounded-xl cursor-pointer shadow-md active:scale-95 transition-all disabled:opacity-50"
              title="Export PDF Laporan Distribusi Harian yang menggabungkan seluruh kurir pada tanggal ini"
            >
              {isExportingDailyPdf ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#FBBF24]" />
              ) : (
                <FileDown className="h-4 w-4 text-[#FBBF24]" />
              )}
              <span>{isExportingDailyPdf ? 'Memproses PDF...' : '📄 Export PDF Harian (Semua Kurir)'}</span>
            </button>

            {activeTab === 'assignment' && (
              <button
                type="button"
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
          {/* Batch Selector Bar with Excel Filter */}
          <div className="mb-6 bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-gray-700 uppercase tracking-wide">
                  PILIH TANGGAL BATCH / PENGIRIMAN:
                </span>
                <span className="text-[11px] font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  {importedBatches.length} Batch Siap Distribusi (Sudah Import)
                </span>
                {batches.length - importedBatches.length > 0 && (
                  <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200">
                    {batches.length - importedBatches.length} Belum Import
                  </span>
                )}
              </div>

              {/* Mode Filter: Hanya Sudah Import vs Semua */}
              <div className="inline-flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => setBatchFilterMode('imported')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    batchFilterMode === 'imported'
                      ? 'bg-white text-emerald-800 shadow-xs font-black'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  ✓ Hanya Sudah Import ({importedBatches.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBatchFilterMode('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    batchFilterMode === 'all'
                      ? 'bg-white text-gray-900 shadow-xs font-black'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Semua Batch ({batches.length})
                </button>
              </div>
            </div>

            <div>
              <SearchableBatchSelector
                batches={displayBatches}
                selectedBatchId={selectedBatchId}
                onSelectBatch={setSelectedBatchId}
                importedBatchIds={savedReportBatchIds}
              />
            </div>

            {displayBatches.length === 0 && (
              <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Belum ada data batch yang di-import oleh Produksi MBG. Silakan import Excel di halaman Produksi MBG terlebih dahulu.</span>
              </div>
            )}
          </div>

          {selectedBatchId ? (
            <>
              {/* Tab Controller */}
              <div className="flex gap-1.5 mb-6 bg-[#F3F4F6] rounded-xl p-1 overflow-x-auto no-scrollbar max-w-2xl">
                {(['assignment', 'reports', 'bahan'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`shrink-0 sm:flex-1 py-2 sm:py-2.5 px-3.5 sm:px-3 rounded-lg text-xs font-bold cursor-pointer transition-all whitespace-nowrap ${
                      activeTab === tab
                        ? 'bg-white text-[#111827] shadow-sm font-black'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    {tab === 'assignment'
                      ? '🚚 Penugasan Kurir'
                      : tab === 'reports'
                      ? '📄 Laporan Kurir'
                      : '📷 Dokumentasi Bahan'}
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

                  {/* GANTI MENU KERINGAN & PAKET 3B BANNERS */}
                  {hasMenuKeringan && (
                    <div className="flex items-center justify-between text-xs font-extrabold text-red-700 bg-red-50 px-4 py-3 rounded-xl border border-red-200">
                      <span>🍚 GANTI MENU KERINGAN / PAKET SEHAT 3B (Balita, Bumil, Busui)</span>
                      <span className="text-[10px] text-red-600 bg-white px-2 py-0.5 rounded border border-red-200 font-mono">
                        {entries.filter((e) => e.institutionType === 'posyandu' || e.institutionName.toLowerCase().includes('3b')).length} Institusi 3B
                      </span>
                    </div>
                  )}

                  {/* Ringkasan Beban & Deadline Kurir */}
                  {assignedCouriersList.length > 0 && (
                    <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-sm border border-slate-800 space-y-3 font-['Hanken_Grotesk']">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                            <Truck className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                              Ringkasan Rute & Deadline Kurir ({assignedCouriersList.length} Kurir)
                            </h4>
                            <p className="text-[11px] text-slate-400">
                              Atur deadline pengantaran dan kirim notifikasi penugasan per kurir.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsCourierSummaryOpen((prev) => !prev)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                        >
                          <span>{isCourierSummaryOpen ? 'Sembunyikan' : 'Buka Detail'}</span>
                          {isCourierSummaryOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      {isCourierSummaryOpen && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 animate-in fade-in duration-150">
                          {assignedCouriersList.map(({ petugasName, count, porsi, kenekText }) => {
                            const currentDeadline =
                              deadlines[petugasName] ||
                              deliveryTasks.find((t) => t.petugasName === petugasName)?.deadlineAt ||
                              (selectedBatch ? `${selectedBatch.tanggal}T15:00` : '');

                            return (
                              <div
                                key={petugasName}
                                className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 flex flex-col justify-between gap-3 shadow-2xs"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-xs font-black text-amber-400 uppercase tracking-wide">
                                      {petugasName}
                                    </div>
                                    {kenekText && (
                                      <div className="text-[10px] text-slate-300 font-semibold mt-0.5">
                                        Kenek: <span className="text-slate-100 font-bold">{kenekText}</span>
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-black bg-slate-700 text-slate-200 px-2 py-0.5 rounded-lg shrink-0">
                                    {count} Inst • {porsi.toLocaleString('id-ID')} Porsi
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 pt-1 border-t border-slate-700/60">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[9px] font-bold text-slate-400 block uppercase mb-0.5">Deadline:</span>
                                    <input
                                      type="datetime-local"
                                      value={currentDeadline}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setDeadlines((prev) => ({ ...prev, [petugasName]: val }));
                                        const task = deliveryTasks.find((t) => t.petugasName === petugasName);
                                        if (task) {
                                          updateDeliveryTask(task.id, { deadlineAt: val });
                                        }
                                      }}
                                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleSyncDeliveryTasks()}
                                    className="self-end shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                                    title={`Kirim tugas pengiriman ke akun ${petugasName}`}
                                  >
                                    <Send className="h-3 w-3" />
                                    <span>Kirim</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Filter & Search Bar */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3 font-['Hanken_Grotesk']">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Search Input */}
                      <div className="relative max-w-sm flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="search"
                          value={pmSearch}
                          onChange={(e) => setPmSearch(e.target.value)}
                          placeholder="Cari sekolah, posyandu, kurir, atau kenek..."
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-2xs"
                        />
                      </div>

                      {/* Filter Status Buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setDistributionStatusFilter('all')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                            distributionStatusFilter === 'all'
                              ? 'bg-[#111827] text-white shadow-xs'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Semua Institusi ({entries.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDistributionStatusFilter('pending')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                            distributionStatusFilter === 'pending'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          ⏳ Belum Selesai ({totalPendingEntries})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDistributionStatusFilter('completed')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                            distributionStatusFilter === 'completed'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          ✓ Selesai / Diarsipkan ({totalCompletedEntries})
                        </button>
                      </div>
                    </div>

                    {/* Filter Courier Select & Overall Stats */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-600">Filter Kurir:</span>
                        <select
                          value={selectedCourierFilter}
                          onChange={(e) => setSelectedCourierFilter(e.target.value)}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                        >
                          <option value="all">Semua Kurir ({entries.length})</option>
                          <option value="unassigned">
                            Belum Ditugaskan ({entries.filter((e) => !e.assignedPetugasName || e.assignedPetugasName === 'Belum Ditugaskan').length})
                          </option>
                          {courierFilterOptions.map((name) => (
                            <option key={name} value={name}>
                              {name} ({entries.filter((e) => (e.assignedPetugasName || '').toLowerCase().trim() === name.toLowerCase().trim()).length})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap font-bold">
                        <span className="text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
                          Total: {filteredPmEntries.length} Lembaga
                        </span>
                        <span className="text-amber-950 bg-amber-100/80 border border-amber-300 px-3 py-1.5 rounded-xl shadow-2xs font-black">
                          Total Alokasi: {overallTotals.jumlah.toLocaleString('id-ID')} Porsi
                        </span>
                      </div>
                    </div>
                  </div>

                  {filteredPmEntries.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center space-y-2">
                      <Truck className="h-10 w-10 mx-auto text-gray-300" />
                      <p className="text-sm font-bold text-gray-700">Tidak ada institusi pada filter ini</p>
                      <p className="text-xs text-gray-400">Silakan ubah filter status atau kata kunci pencarian di atas.</p>
                    </div>
                  ) : (
                    /* Split Tables: Sekolah and Posyandu in AUTO REKAP Format */
                    [
                      {
                        title: 'DATA SEKOLAH — FORMAT AUTO REKAP',
                        list: schoolPmEntries,
                        isPosyandu: false,
                      },
                      {
                        title: 'DATA POSYANDU',
                        list: posyanduPmEntries,
                        isPosyandu: true,
                      },
                    ].map(({ title, list, isPosyandu }) => {
                      const totals = getAutoRekapTotals(list);
                      const isAllListSelected = list.length > 0 && list.every((e) => selectedEntryIds.includes(e.id));
                      return (
                        <div key={title} className="mb-6 last:mb-0">
                          <div className="flex items-center justify-between gap-3 mb-2.5 px-1">
                            <h3 className="font-extrabold text-slate-800 text-xs sm:text-sm uppercase tracking-wide flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${isPosyandu ? 'bg-purple-500' : 'bg-emerald-500'}`}></div>
                              {title}
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-lg">
                                {list.length} {isPosyandu ? 'Posyandu' : 'Sekolah'} • {totals.jumlah.toLocaleString('id-ID')} Porsi
                              </span>
                            </div>
                          </div>
                          <div className="overflow-x-auto border border-slate-300 rounded-xl bg-white shadow-xs">
                            <table className="w-full text-left font-['Hanken_Grotesk',system-ui,sans-serif] border-collapse border border-slate-300 text-xs">
                              <thead>
                                <tr className="bg-slate-200 text-[9px] font-extrabold text-slate-800 uppercase tracking-tight text-center border-b border-slate-300">
                                  <th rowSpan={2} className="px-2 py-1.5 border-r border-slate-300 text-center w-8">
                                    <input
                                      type="checkbox"
                                      title={`Pilih Semua ${isPosyandu ? 'Posyandu' : 'Sekolah'}`}
                                      checked={isAllListSelected}
                                      onChange={() => toggleSelectAllGroup(list)}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-[#FBBF24] focus:ring-[#FBBF24] cursor-pointer"
                                    />
                                  </th>
                                  <th rowSpan={2} className="px-2 py-1.5 border-r border-slate-300 text-left min-w-[170px]">
                                    {isPosyandu ? 'POSYANDU' : 'SEKOLAH'}
                                  </th>
                                  <th colSpan={2} className="px-1 py-1 border-r border-slate-300">PORSI KECIL</th>
                                  <th colSpan={2} className="px-1 py-1 border-r border-slate-300">PORSI BESAR</th>
                                  <th colSpan={2} className="px-1 py-1 border-r border-slate-300 bg-slate-300/60 font-black">TOTAL</th>
                                  <th rowSpan={2} className="px-1 py-1 border-r border-slate-300 bg-slate-300/60 font-black">JML</th>
                                  <th colSpan={2} className="px-1 py-1 border-r border-slate-300">GURU</th>
                                  <th colSpan={2} className="px-1 py-1 border-r border-slate-300">TENDIK</th>
                                  <th rowSpan={2} className="px-1 py-1 border-r border-slate-300 bg-slate-300/50 font-extrabold">JML</th>
                                  <th rowSpan={2} className="px-1.5 py-1 border-r border-slate-300 bg-amber-100/80 text-amber-900 font-black text-[9px]">TOTAL KESELURUHAN</th>
                                  <th rowSpan={2} className="px-2 py-1 border-r border-slate-300 min-w-[110px]">PETUGAS KURIR</th>
                                  <th rowSpan={2} className="px-2 py-1 border-r border-slate-300 min-w-[100px]">KENEK</th>
                                  <th rowSpan={2} className="px-2 py-1 border-r border-slate-300 min-w-[90px]">JADWAL</th>
                                  <th rowSpan={2} className="px-2 py-1 min-w-[80px]">AKSI</th>
                                </tr>
                                <tr className="bg-slate-100 text-[8.5px] font-bold text-slate-700 uppercase tracking-tight text-center border-b border-slate-300">
                                  <th className="px-1 py-0.5 border-r border-slate-300 w-8">L</th>
                                  <th className="px-1 py-0.5 border-r border-slate-300 w-8">P</th>
                                  <th className="px-1 py-0.5 border-r border-slate-300 w-8">L</th>
                                  <th className="px-1 py-0.5 border-r border-slate-300 w-8">P</th>
                                  <th className="px-1 py-0.5 border-r border-slate-300 bg-slate-200/50 w-8">L</th>
                                  <th className="px-1 py-0.5 border-r border-slate-300 bg-slate-200/50 w-8">P</th>
                                  <th className="px-1 py-0.5 border-r border-slate-300 w-8">L</th>
                                  <th className="px-1 py-0.5 border-r border-slate-300 w-8">P</th>
                                  <th className="px-1 py-0.5 border-r border-slate-300 w-8">L</th>
                                  <th className="px-1 py-0.5 border-r border-slate-300 w-8">P</th>
                                </tr>
                              </thead>
                              <tbody>
                                {list.length === 0 ? (
                                  <tr>
                                    <td colSpan={19} className="px-4 py-8 text-center text-xs font-medium text-slate-400 italic">
                                      Belum ada data {isPosyandu ? 'Posyandu' : 'Sekolah'} untuk filter ini.
                                    </td>
                                  </tr>
                                ) : (
                                  list.map((entry) => {
                                    const isSelected = selectedEntryIds.includes(entry.id);
                                    if (entry.isSekolahLibur) {
                                      return (
                                        <tr key={entry.id} className="border-b border-red-200 bg-red-50/70 text-xs font-semibold text-red-900">
                                          <td className="px-2 py-1.5 border-r border-red-200 text-center">
                                            <input
                                              type="checkbox"
                                              disabled
                                              className="h-3.5 w-3.5 rounded border-red-300 opacity-40"
                                            />
                                          </td>
                                          <td className="px-2 py-1.5 border-r border-red-200 font-bold">
                                            {entry.institutionName} <span className="ml-1 text-[9px] text-red-600 font-black uppercase">(LIBUR)</span>
                                          </td>
                                          <td colSpan={13} className="px-2 py-1.5 text-center text-red-600 font-bold tracking-wider text-[11px] border-r border-red-200">
                                            TIDAK ADA PENGIRIMAN (LIBUR)
                                          </td>
                                          <td className="px-2 py-1.5 text-center border-r border-red-200 text-slate-500 text-[11px]">{entry.assignedPetugasName || '—'}</td>
                                          <td className="px-2 py-1.5 text-center border-r border-red-200 text-slate-500 text-[11px]">{entry.assignedKenekName || '—'}</td>
                                          <td className="px-2 py-1.5 text-center border-r border-red-200 text-slate-400 text-[11px]">{entry.jadwalPengantaran || '—'}</td>
                                          <td className="px-2 py-1.5 text-center text-slate-400 text-[11px]">—</td>
                                        </tr>
                                      );
                                    }

                                    const totalL = (entry.qtPorsiKecilL || 0) + (entry.qtPorsiBesarL || 0);
                                    const totalP = (entry.qtPorsiKecilP || 0) + (entry.qtPorsiBesarP || 0) + (entry.qtBumil || 0) + (entry.qtBusui || 0);
                                    const totalSiswa = totalL + totalP;
                                    const totalStaf = (entry.qtGuruL || 0) + (entry.qtGuruP || 0) + (entry.qtTendikL || 0) + (entry.qtTendikP || 0);

                                    return (
                                      <tr
                                        key={entry.id}
                                        className={`border-b border-slate-200 text-xs font-semibold text-slate-800 transition-colors ${
                                          isSelected ? 'bg-amber-50/70 hover:bg-amber-100/60' : 'hover:bg-slate-50'
                                        }`}
                                      >
                                        <td className="border-r border-slate-200 px-2 py-1.5 text-center w-8">
                                          <input
                                            type="checkbox"
                                            title={`Pilih ${entry.institutionName}`}
                                            checked={isSelected}
                                            onChange={() => toggleSelectEntry(entry.id)}
                                            className="h-3.5 w-3.5 rounded border-slate-300 text-[#FBBF24] focus:ring-[#FBBF24] cursor-pointer"
                                          />
                                        </td>
                                        <td className="min-w-[170px] border-r border-slate-200 px-2 py-1.5">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-bold text-slate-900">{entry.institutionName}</span>
                                            {entry.classesBreakdown && entry.classesBreakdown.length > 0 && (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                {entry.classesBreakdown.length} Kelas
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="border-r border-slate-200 p-1 text-center">{entry.qtPorsiKecilL || '—'}</td>
                                        <td className="border-r border-slate-200 p-1 text-center">{entry.qtPorsiKecilP || '—'}</td>
                                        <td className="border-r border-slate-200 p-1 text-center">{entry.qtPorsiBesarL || '—'}</td>
                                        <td className="border-r border-slate-200 p-1 text-center">{entry.qtPorsiBesarP || '—'}</td>
                                        <td className="border-r border-slate-200 bg-slate-50 px-2 py-1 text-center font-bold text-slate-700">{totalL || '—'}</td>
                                        <td className="border-r border-slate-200 bg-slate-50 px-2 py-1 text-center font-bold text-slate-700">{totalP || '—'}</td>
                                        <td className="border-r border-slate-300 bg-slate-100 px-2 py-1 text-center font-black text-slate-900">{totalSiswa || '—'}</td>
                                        <td className="border-r border-slate-200 p-1 text-center">{entry.qtGuruL || '—'}</td>
                                        <td className="border-r border-slate-200 p-1 text-center">{entry.qtGuruP || '—'}</td>
                                        <td className="border-r border-slate-200 p-1 text-center">{entry.qtTendikL || '—'}</td>
                                        <td className="border-r border-slate-200 p-1 text-center">{entry.qtTendikP || '—'}</td>
                                        <td className="border-r border-slate-300 bg-slate-100 px-2 py-1 text-center font-black text-slate-900">{totalStaf || '—'}</td>
                                        <td className="border-r border-amber-200 bg-amber-50 px-2 py-1 text-center font-black text-amber-900">{entry.jumlah}</td>
                                        <td className="border-r border-slate-200 px-2 py-1 text-slate-600 font-medium text-[11px] truncate max-w-[120px]">
                                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                            entry.assignedPetugasName
                                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                              : 'bg-gray-100 text-gray-500'
                                          }`}>
                                            {entry.assignedPetugasName || 'Belum Ditugaskan'}
                                          </span>
                                        </td>
                                        <td className="border-r border-slate-200 px-2 py-1 text-slate-600 font-medium text-[11px] truncate max-w-[110px]">
                                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                            entry.assignedKenekName
                                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                              : 'bg-gray-100 text-gray-400'
                                          }`}>
                                            {entry.assignedKenekName || '—'}
                                          </span>
                                        </td>
                                        <td className="border-r border-slate-200 px-2 py-1 text-slate-500 text-[11px] whitespace-nowrap text-center">
                                          {entry.jadwalPengantaran || '—'}
                                        </td>
                                        <td className="px-2 py-1 text-center">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenAssign(entry)}
                                            className="px-2.5 py-1 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] font-extrabold text-[10px] rounded-lg cursor-pointer transition-all shadow-2xs active:scale-95 flex items-center gap-1 mx-auto"
                                          >
                                            <Users className="h-3 w-3" />
                                            Tugaskan
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                                {list.length > 0 && (
                                  <tr className="bg-slate-800 text-white text-xs font-bold border-t border-slate-700 text-center">
                                    <td colSpan={2} className="px-2 py-2 text-left font-black text-slate-200">TOTAL</td>
                                    <td className="px-1 py-2">{totals.porsiKecilL}</td>
                                    <td className="px-1 py-2">{totals.porsiKecilP}</td>
                                    <td className="px-1 py-2">{totals.porsiBesarL}</td>
                                    <td className="px-1 py-2">{totals.porsiBesarP}</td>
                                    <td className="px-1 py-2 bg-slate-900/60 font-black">{totals.totalL}</td>
                                    <td className="px-1 py-2 bg-slate-900/60 font-black">{totals.totalP}</td>
                                    <td className="px-1 py-2 bg-slate-900 font-black text-amber-400">{totals.totalSiswa}</td>
                                    <td className="px-1 py-2">{totals.guruL}</td>
                                    <td className="px-1 py-2">{totals.guruP}</td>
                                    <td className="px-1 py-2">{totals.tendikL}</td>
                                    <td className="px-1 py-2">{totals.tendikP}</td>
                                    <td className="px-1 py-2 bg-slate-900 font-black">{totals.totalStaf}</td>
                                    <td className="px-2 py-2 bg-amber-500 text-slate-950 font-black text-xs">
                                      {totals.jumlah.toLocaleString('id-ID')}
                                    </td>
                                    <td colSpan={4} className="px-2 py-2 text-slate-400 text-[10px] italic">
                                      {list.filter((e) => !e.isSekolahLibur).length} Lembaga Aktif
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (

                /* Laporan Kurir Tab */
                <div className="space-y-5 font-['Hanken_Grotesk']">
                  {/* Daily Report Combined Export Banner */}
                  <div className="bg-gradient-to-r from-[#111827] via-[#1E293B] to-[#0F172A] rounded-2xl p-5 sm:p-6 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-[#FBBF24] text-[#111827] text-[10px] font-black rounded-md uppercase tracking-wider">
                          Laporan Harian
                        </span>
                        <h3 className="text-base font-extrabold text-white">
                          Export Laporan Distribusi Harian (Semua Kurir)
                        </h3>
                      </div>
                      <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
                        Unduh 1 file PDF gabungan yang memuat rekapitulasi seluruh kurir, alokasi rute, serta dokumentasi foto (Menu, Serah Terima, & Surat Jalan) untuk tanggal{' '}
                        <strong className="text-white font-bold">{selectedBatch?.tanggal ? formatIndonesianDate(selectedBatch.tanggal, true) : 'operasional'}</strong>.
                      </p>
                      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-gray-400 pt-1">
                        <span className="bg-white/10 px-2.5 py-1 rounded-lg text-white">
                          👥 {Object.keys(groupedEntries).filter((k) => k !== 'Belum Ditugaskan').length || 1} Kurir Terdaftar
                        </span>
                        <span className="bg-white/10 px-2.5 py-1 rounded-lg text-white">
                          🏫 {entries.filter((e) => !e.isSekolahLibur).length} Institusi Aktif
                        </span>
                        <span className="bg-white/10 px-2.5 py-1 rounded-lg text-white">
                          🍱 {entries.filter((e) => !e.isSekolahLibur).reduce((acc, e) => acc + (e.jumlah || 0), 0)} Total Porsi
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleExportDailyDistributionPdf()}
                      disabled={isExportingDailyPdf || entries.length === 0}
                      className="shrink-0 flex items-center gap-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] font-black text-xs px-5 py-3 rounded-xl cursor-pointer shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isExportingDailyPdf ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[#111827]" />
                      ) : (
                        <FileDown className="h-4 w-4 text-[#111827]" />
                      )}
                      <span>{isExportingDailyPdf ? 'Mengunduh PDF Harian...' : 'Download PDF Harian (Semua Kurir)'}</span>
                    </button>
                  </div>

                  {batchDeliveryDocs.length === 0 ? (
                    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
                      <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                      <h3 className="text-lg font-bold text-[#111827]">Belum Ada Arsip Satuan</h3>
                      <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                        Anda tetap dapat mengekspor laporan harian gabungan di atas, atau menunggu kurir mengunggah laporan perorangan.
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
                                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${docItem.completedCount === docItem.totalInstitusi
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-amber-50 text-amber-700'
                                        }`}>
                                        {docItem.completedCount}/{docItem.totalInstitusi} Lengkap
                                      </span>
                                    </td>
                                    <td className="py-3 px-6 text-center text-gray-500">
                                      {new Date(docItem.createdAt).toLocaleDateString('id-ID')}
                                    </td>
                                    <td className="py-3 px-6 text-center whitespace-nowrap">
                                      <div className="flex items-center justify-center gap-2">
                                        <button
                                          onClick={() => handleViewKurirReport(docItem)}
                                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#111827] text-white hover:bg-black font-extrabold text-[10px] rounded-lg cursor-pointer shadow-xs transition-all active:scale-95"
                                          title="Unduh / Lihat PDF Laporan"
                                        >
                                          <FileDown className="h-3 w-3 text-[#FBBF24]" />
                                          <span>Unduh PDF</span>
                                        </button>
                                        <button
                                          onClick={() => handleEditKurirReport(docItem)}
                                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 font-extrabold text-[10px] rounded-lg cursor-pointer shadow-xs transition-all active:scale-95"
                                          title="Edit & Koreksi Data / Foto Laporan Kurir"
                                        >
                                          <Edit3 className="h-3 w-3 text-amber-700" />
                                          <span>Edit & Koreksi</span>
                                        </button>
                                      </div>
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

              {activeTab === 'bahan' && (
                <MbgBahanDocumentationSection
                  selectedBatch={selectedBatch}
                  dailyReport={currentDailyReport}
                />
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
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${assignKurirName === name
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
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${assignKenekName === name
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
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${bulkKurirName === name
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
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${bulkKenekName === name
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

      {/* Modal Koreksi & Edit Laporan Kurir oleh Distribusi MBG */}
      <AnimatePresence>
        {editingReportDoc && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-4xl w-full shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto font-['Hanken_Grotesk']"
            >
              <div className="flex justify-between items-center pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-900 font-bold">
                    <Edit3 className="h-5 w-5 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-[#111827]">
                      Koreksi & Edit Laporan Kurir: {editingReportDoc.petugasName}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Batch Tanggal: {editingReportDoc.tanggalBatch} | Total: {editingReportDoc.totalInstitusi} Institusi ({editingReportDoc.totalPorsi} Porsi)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingReportDoc(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full cursor-pointer hover:bg-gray-100 transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6">
                {(() => {
                  const matchedTask = deliveryTasks.find(
                    (t) => (t.petugasName === editingReportDoc.petugasName || t.petugasId === editingReportDoc.petugasId) && t.batchId === editingReportDoc.batchId
                  );
                  const activeTaskEntries = entries.filter(
                    (e) => (matchedTask?.entryIds || []).includes(e.id) || (e.assignedPetugasName === editingReportDoc.petugasName && !e.isSekolahLibur)
                  );

                  if (activeTaskEntries.length === 0) {
                    return (
                      <div className="py-8 text-center text-gray-400 font-bold text-sm">
                        Tidak ada institusi yang ditemukan untuk tugas ini.
                      </div>
                    );
                  }

                  return activeTaskEntries.map((entry, idx) => {
                    const proof = (matchedTask?.schoolProofs?.[entry.id] || {}) as Partial<MbgSchoolProof>;
                    const proofTypes = [
                      { id: 'menu', title: '1. Kedatangan Ompreng', url: entry.photoMenuUrl || proof.photoMenuUrl },
                      { id: 'serah_terima', title: '2. Serah Terima PJ Sekolah', url: entry.photoSerahTerimaUrl || proof.photoSerahTerimaUrl },
                      { id: 'surat_jalan', title: '3. Foto Surat Jalan', url: entry.photoSuratJalanUrl || proof.photoSuratJalanUrl },
                      { id: 'penerima', title: '4. Pengambilan Ompreng Kosong', url: entry.photoPenerimaUrl || proof.photoPenerimaUrl },
                    ] as const;

                    return (
                      <div key={entry.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-4 shadow-xs">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#111827] text-white font-bold text-xs flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <h4 className="text-sm font-extrabold text-gray-900">{entry.institutionName}</h4>
                            <span className="text-xs font-bold text-gray-500">({entry.jumlah} Porsi)</span>
                          </div>
                          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                            {entry.institutionType === 'posyandu' ? '👶 Posyandu' : '🏫 Sekolah'}
                          </span>
                        </div>

                        {/* 4 Proof Slots */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                          {proofTypes.map((pt) => (
                            <div key={pt.id} className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col justify-between gap-3 shadow-2xs">
                              <div>
                                <span className="text-[10px] font-extrabold text-gray-500 uppercase block mb-1">
                                  {pt.title}
                                </span>
                                {pt.url ? (
                                  <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-4/3">
                                    <img src={pt.url} alt={pt.title} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                      <a
                                        href={pt.url}
                                        download={`bukti_${pt.id}_${entry.institutionName}.jpg`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1.5 bg-white text-gray-900 rounded-lg hover:bg-gray-100 cursor-pointer"
                                        title="Unduh Foto"
                                      >
                                        <Download className="h-4 w-4" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteCorrectionPhoto(entry.id, pt.id)}
                                        className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer"
                                        title="Hapus Foto"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50 aspect-4/3 flex flex-col items-center justify-center">
                                    <Camera className="h-6 w-6 text-gray-400 mb-1" />
                                    <span className="text-[10px] font-bold text-gray-400">Belum Ada Foto</span>
                                  </div>
                                )}
                              </div>

                              {/* Control Buttons */}
                              <div className="flex gap-1.5 pt-1">
                                <label className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-extrabold rounded-lg border border-blue-200 cursor-pointer">
                                  <Upload className="h-3 w-3" />
                                  <span>Upload</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={isUploadingCorrectionPhoto}
                                    onChange={(e) => handleFileUploadCorrection(e, entry.id, entry.institutionName, pt.id)}
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveCorrectionSlot({
                                      entryId: entry.id,
                                      institutionName: entry.institutionName,
                                      proofType: pt.id,
                                    });
                                    setIsLiveCameraOpen(true);
                                  }}
                                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[10px] font-extrabold rounded-lg border border-amber-300 cursor-pointer"
                                >
                                  <Camera className="h-3 w-3 text-amber-700" />
                                  <span>Camera</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-3 justify-end sticky bottom-0 bg-white z-10">
                <button
                  type="button"
                  onClick={() => setEditingReportDoc(null)}
                  className="px-5 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-100 text-xs font-bold text-gray-700 cursor-pointer text-center"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (editingReportDoc) {
                      await handleViewKurirReport(editingReportDoc);
                      showToast({ message: 'Laporan berhasil diperbarui & PDF di-export ulang!', variant: 'success' });
                      setEditingReportDoc(null);
                    }
                  }}
                  className="px-6 py-2.5 bg-[#111827] hover:bg-black text-white rounded-xl cursor-pointer text-xs font-extrabold shadow-md flex items-center justify-center gap-2"
                >
                  <Save className="h-4 w-4 text-[#FBBF24]" />
                  <span>Simpan & Export Ulang PDF</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Live Camera for Correction */}
      {isLiveCameraOpen && activeCorrectionSlot && (
        <LiveCamera
          isOpen={isLiveCameraOpen}
          onClose={() => {
            setIsLiveCameraOpen(false);
            setActiveCorrectionSlot(null);
          }}
          onCapture={handleLiveCameraCaptureCorrection}
          activityType="PENGIRIMAN"
          orderId={selectedBatchId || 'DISTRIB'}
        />
      )}
    </div>
  );
}
