// ============================================================================
// MBG Delivery Page — Kurir MBG: Handover, Delivery, and Proof
// ============================================================================

import { useEffect, useState, useMemo, useRef } from 'react';
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
  X,
  FolderOpen,
  History,
  Search,
  Download,
  Trash2,
  Upload,
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
  deleteSchoolDeliveryProof,
  updatePhotoDescription,
  saveDeliveryDocument,
  subscribeAllDeliveryDocuments,
  type MbgDeliveryDocument,
} from '@/services/mbgDeliveryService';
import { LiveCamera } from '@/components/LiveCamera';
import { MBG_DELIVERY_STATUS_CONFIG } from '@/constants/mbgConstants';

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { exportMbgDeliveryReportPdf } from '@/utils/mbgDeliveryReportPdfExporter';

export function MbgDeliveryPage() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(() => {
    return sessionStorage.getItem('mbg_delivery_selected_batch') || null;
  });
  const [tasks, setTasks] = useState<MbgDeliveryTask[]>([]);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Page tab: tugas aktif vs arsip dokumen
  const [pageTab, setPageTab] = useState<'active' | 'archive'>('active');
  const [archiveDocs, setArchiveDocs] = useState<MbgDeliveryDocument[]>([]);

  // Fallback selector for testing when user profile is admin or doesn't match a specific kurir
  const [selectedPetugasName, setSelectedPetugasName] = useState<string>('');
  const [detectedPetugasId, setDetectedPetugasId] = useState<string>('');

  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'handover' | 'delivery'>('handover');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedEntryForDeliveryPhoto, setSelectedEntryForDeliveryPhoto] = useState<MbgPmEntry | null>(null);

  // 4-Proof Modal state
  const [proofModalEntry, setProofModalEntry] = useState<MbgPmEntry | null>(null);
  const [targetProofType, setTargetProofType] = useState<'menu' | 'penerima' | 'serah_terima' | 'surat_jalan'>('penerima');

  // Description edit state (per entry per proof type)
  const descTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Subscribe active batches
  useEffect(() => {
    const unsub = subscribeBatches((data) => {
      const activeBatches = data.filter((b) => b.status !== 'DRAFT');
      setBatches(activeBatches);
      const savedBatchId = sessionStorage.getItem('mbg_delivery_selected_batch');
      if (savedBatchId && activeBatches.some((b) => b.id === savedBatchId)) {
        setSelectedBatchId(savedBatchId);
      } else if (activeBatches.length > 0) {
        setSelectedBatchId(activeBatches[0].id);
        sessionStorage.setItem('mbg_delivery_selected_batch', activeBatches[0].id);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Subscribe arsip dokumen
  useEffect(() => {
    const unsub = subscribeAllDeliveryDocuments(setArchiveDocs);
    return unsub;
  }, []);

  // Determine petugasId/name based on logged in user profile
  useEffect(() => {
    if (profile) {
      if (['kurir_mbg', 'kurir', 'distribusi_mbg', 'distribusi', 'admin', 'admin_mbg'].includes(profile.role)) {
        setDetectedPetugasId(user?.uid || '');
        if (!selectedPetugasName) {
          setSelectedPetugasName(profile.displayName || (user?.email ? user.email.split('@')[0] : ''));
        }
      }
    }
  }, [profile, user, selectedPetugasName]);

  // Subscribe to tasks for the selected batch & petugas
  useEffect(() => {
    if (!selectedBatchId) return;

    const uUid = user?.uid || '';
    const uEmail = user?.email || '';
    const uName = selectedPetugasName || profile?.displayName || '';

    const unsubTasks = subscribeKurirTasks(
      selectedBatchId,
      selectedPetugasName ? '' : uUid,
      selectedPetugasName ? '' : uEmail,
      uName,
      (data) => {
        setTasks(data);
      }
    );

    const unsubEntries = subscribeEntries(selectedBatchId, setEntries);

    return () => {
      unsubTasks();
      unsubEntries();
    };
  }, [selectedBatchId, selectedPetugasName, profile?.displayName, user]);

  // Keep proofModalEntry in sync with live entries snapshot
  useEffect(() => {
    if (proofModalEntry) {
      const updated = entries.find((e) => e.id === proofModalEntry.id);
      if (updated) {
        setProofModalEntry(updated);
      }
    }
  }, [entries, proofModalEntry]);

  const uniqueKurirNames = useMemo(() => {
    const fromEntries = entries.map((e) => e.assignedPetugasName).filter(Boolean);
    const fromTasks = tasks.map((t) => t.petugasName).filter(Boolean);
    return Array.from(new Set([...fromEntries, ...fromTasks]));
  }, [entries, tasks]);

  // Current active task (with auto-fallback synthesis from entries if admin hasn't submitted delivery tasks yet)
  const activeTask = useMemo<MbgDeliveryTask | null>(() => {
    const targetPetugas = selectedPetugasName || profile?.displayName || (user?.email ? user.email.split('@')[0] : '');
    const tLower = targetPetugas.toLowerCase().trim();
    const uUid = (user?.uid || '').toLowerCase().trim();

    // 1. Try finding from real tasks collection first
    if (tasks.length > 0) {
      if (selectedPetugasName) {
        const match = tasks.find(
          (t) =>
            t.petugasName.toLowerCase().trim().includes(tLower) ||
            tLower.includes(t.petugasName.toLowerCase().trim())
        );
        if (match) return match;
      } else {
        // Try matching logged-in user's name, email, or uid in tasks first
        const match = tasks.find(
          (t) =>
            (t.petugasId && uUid && t.petugasId.toLowerCase().trim() === uUid) ||
            (t.petugasName && tLower && (t.petugasName.toLowerCase().trim().includes(tLower) || tLower.includes(t.petugasName.toLowerCase().trim())))
        );
        if (match) return match;
      }
    }

    // 2. Fallback: Synthesize virtual task from assigned entries directly so courier never loses task!
    if (entries.length > 0 && targetPetugas) {
      const assignedEntries = entries.filter((e) => {
        const pName = (e.assignedPetugasName || '').toLowerCase().trim();
        const pId = (e.assignedPetugasId || '').toLowerCase().trim();
        return (
          (pName && (pName === tLower || pName.includes(tLower) || tLower.includes(pName))) ||
          (pId && uUid && pId === uUid)
        );
      });

      if (assignedEntries.length > 0) {
        const matchedName = assignedEntries[0].assignedPetugasName || targetPetugas;
        const totalPorsi = assignedEntries.reduce((sum, e) => sum + (e.jumlah || 0), 0);
        const firstKenek = assignedEntries.find((e) => e.assignedKenekName)?.assignedKenekName;

        return {
          id: `virt-task-${selectedBatchId}-${matchedName.replace(/\s+/g, '-')}`,
          batchId: selectedBatchId || '',
          petugasId: assignedEntries[0].assignedPetugasId || user?.uid || matchedName.toLowerCase().replace(/\s+/g, '-'),
          petugasName: matchedName,
          kenekName: firstKenek,
          entryIds: assignedEntries.map((e) => e.id),
          totalPorsi,
          handoverPhotoId: '',
          handoverAt: '',
          status: 'waiting',
          deliveryPhotos: [],
          completedAt: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    }

    return tasks[0] || null;
  }, [tasks, selectedPetugasName, profile?.displayName, user, entries, selectedBatchId]);

  // Get full entries detail for the current task
  const taskEntries = useMemo(() => {
    if (!activeTask) return [];
    // 1. Direct match by task.entryIds if present
    if (activeTask.entryIds && activeTask.entryIds.length > 0) {
      const byIds = entries.filter((e) => activeTask.entryIds.includes(e.id));
      if (byIds.length > 0) return byIds;
    }
    // 2. Match by assignedPetugasName
    const tNameLower = (activeTask.petugasName || '').toLowerCase().trim();
    return entries.filter((e) => {
      const eNameLower = (e.assignedPetugasName || '').toLowerCase().trim();
      if (!eNameLower) return false;
      return (
        eNameLower === tNameLower ||
        eNameLower.includes(tNameLower) ||
        tNameLower.includes(eNameLower)
      );
    });
  }, [activeTask, entries]);

  const activeNonLiburEntries = useMemo(() => {
    return taskEntries.filter((e) => !e.isSekolahLibur);
  }, [taskEntries]);

  const completedInstitutionsCount = useMemo(() => {
    return activeNonLiburEntries.filter(
      (e) => e.photoMenuUrl && e.photoPenerimaUrl && e.photoSerahTerimaUrl && e.photoSuratJalanUrl
    ).length;
  }, [activeNonLiburEntries]);

  const isAllInstitutionsComplete = useMemo(() => {
    if (activeNonLiburEntries.length === 0) return false;
    return completedInstitutionsCount === activeNonLiburEntries.length;
  }, [activeNonLiburEntries, completedInstitutionsCount]);

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
    if (!isAllInstitutionsComplete) {
      showToast({
        message: `Belum dapat konfirmasi serah terima! Lengkapi foto bukti (3/3) pada seluruh institusi terlebih dahulu (${completedInstitutionsCount}/${activeNonLiburEntries.length} selesai).`,
        variant: 'error',
      });
      return;
    }
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

  const handleStartProofCapture = (entry: MbgPmEntry, type: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan') => {
    if (!activeTask) return;
    setCameraMode('delivery');
    setTargetProofType(type);
    setActiveTaskId(activeTask.id);
    setSelectedEntryForDeliveryPhoto(entry);
    setShowCamera(true);
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
          try {
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
          } catch (err) {
            console.error('Error saving delivery photo proof:', err);
            showToast({ message: 'Gagal menyimpan foto bukti', variant: 'error' });
          }
        };
        reader.onerror = () => {
          showToast({ message: 'Gagal membaca file foto dari kamera', variant: 'error' });
        };
        reader.readAsDataURL(_file);
      }
    } catch {
      showToast({ message: 'Gagal memproses foto', variant: 'error' });
    }
  };

  // Debounced description update
  const handleDescriptionChange = (entryId: string, proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan', value: string) => {
    const key = `${entryId}_${proofType}`;
    if (descTimers.current[key]) clearTimeout(descTimers.current[key]);
    descTimers.current[key] = setTimeout(async () => {
      try {
        await updatePhotoDescription(entryId, proofType, value);
      } catch (err) {
        console.warn('Failed to save description:', err);
      }
    }, 800);
  };

  const handleDeviceFileUpload = async (
    file: File,
    entry: MbgPmEntry,
    proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan'
  ) => {
    if (!activeTask) return;
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const timestampStr = new Date().toLocaleString('id-ID');
          await updateSchoolDeliveryProof(
            entry.id,
            entry.institutionName,
            proofType,
            dataUrl,
            activeTask.id,
            { timestamp: timestampStr, location: 'Upload Device' }
          );
          showToast({
            message: `Foto ${proofType.replace('_', ' ')} untuk ${entry.institutionName} berhasil diunggah`,
            variant: 'success',
          });
        } catch (err) {
          console.error('Error uploading device file proof:', err);
          showToast({ message: 'Gagal mengunggah foto', variant: 'error' });
        }
      };
      reader.onerror = () => {
        showToast({ message: 'Gagal membaca file dari device', variant: 'error' });
      };
      reader.readAsDataURL(file);
    } catch {
      showToast({ message: 'Gagal mengunggah foto', variant: 'error' });
    }
  };

  const handleDeleteProofPhoto = async (
    entryId: string,
    proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan'
  ) => {
    if (!activeTask) return;
    try {
      await deleteSchoolDeliveryProof(entryId, proofType, activeTask.id);
      showToast({ message: 'Foto berhasil dihapus', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal menghapus foto', variant: 'error' });
    }
  };

  const handleDownloadProofPhoto = (url?: string, filename?: string) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'bukti_foto.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ─── PDF Export (Sesuai Layout Resmi Google Doc) ───
  const handleExportDeliveryPdf = async () => {
    if (!activeTask || taskEntries.length === 0) return;
    showToast({ message: 'Menyiapkan PDF Laporan Distribusi...', variant: 'info' });

    try {
      const batch = batches.find((b) => b.id === selectedBatchId);
      const activeEntries = taskEntries.filter((e) => !e.isSekolahLibur);
      const totalPorsi = activeEntries.reduce((s, e) => s + (e.jumlah || 0), 0);
      const completedCount = activeEntries.filter(
        (e) => e.photoMenuUrl && e.photoSerahTerimaUrl && e.photoSuratJalanUrl
      ).length;

      const fileName = `Laporan_Distribusi_MBG_${activeTask.petugasName.replace(/\s+/g, '_')}_${batch?.tanggal || 'undated'}.pdf`;

      await exportMbgDeliveryReportPdf({
        entries: taskEntries,
        petugasName: activeTask.petugasName,
        tanggalBatch: batch?.tanggal,
        fileName,
      });

      // Save document metadata to Firestore for arsip
      try {
        const pName = selectedPetugasName || profile?.displayName || '';
        const pId = detectedPetugasId || pName.toLowerCase().replace(/\s+/g, '-');
        await saveDeliveryDocument({
          batchId: selectedBatchId || '',
          tanggalBatch: batch?.tanggal || '',
          petugasName: activeTask.petugasName,
          petugasId: pId,
          documentType: 'delivery_report',
          fileName,
          totalInstitusi: activeEntries.length,
          totalPorsi,
          completedCount,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid || '',
        });
      } catch (archiveErr) {
        console.warn('Failed to save document archive:', archiveErr);
      }

      showToast({ message: 'PDF Laporan Distribusi berhasil diunduh & diarsipkan!', variant: 'success' });
    } catch (err) {
      console.error('Failed to export delivery PDF:', err);
      showToast({ message: 'Gagal mengekspor PDF Laporan', variant: 'error' });
    }
  };

  // Search & Filter state for Archive Documents
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');

  // Combine saved archive docs with live active task entries so couriers immediately see uploaded photos in History
  const combinedArchiveDocs = useMemo(() => {
    const docMap = new Map<string, MbgDeliveryDocument>();

    // Add saved documents from Firestore first
    archiveDocs.forEach((d) => {
      docMap.set(`${d.batchId}_${d.petugasName.toLowerCase().trim()}`, d);
    });

    // Synthesize live tasks/entries if available
    if (entries.length > 0) {
      const petugasGroups: Record<string, MbgPmEntry[]> = {};
      entries.forEach((e) => {
        if (e.assignedPetugasName && !e.isSekolahLibur) {
          const pKey = e.assignedPetugasName.trim();
          if (!petugasGroups[pKey]) petugasGroups[pKey] = [];
          petugasGroups[pKey].push(e);
        }
      });

      const batch = batches.find((b) => b.id === selectedBatchId);
      const batchTanggal = batch?.tanggal || new Date().toISOString().split('T')[0];

      Object.entries(petugasGroups).forEach(([pName, pEntries]) => {
        const pKey = pName.toLowerCase().trim();
        const mapKey = `${selectedBatchId}_${pKey}`;

        const completedCount = pEntries.filter((e) =>
          Boolean(e.photoMenuUrl && e.photoSerahTerimaUrl && e.photoSuratJalanUrl && e.photoPenerimaUrl)
        ).length;
        const totalPorsi = pEntries.reduce((sum, e) => sum + (e.jumlah || 0), 0);

        if (docMap.has(mapKey)) {
          const existing = docMap.get(mapKey)!;
          docMap.set(mapKey, {
            ...existing,
            totalInstitusi: pEntries.length,
            totalPorsi,
            completedCount: Math.max(existing.completedCount || 0, completedCount),
          });
        } else {
          // Include live tasks if photos have been uploaded or task is assigned
          const hasAnyPhoto = pEntries.some((e) =>
            Boolean(e.photoMenuUrl || e.photoSerahTerimaUrl || e.photoSuratJalanUrl || e.photoPenerimaUrl)
          );

          if (hasAnyPhoto || (activeTask && activeTask.petugasName.toLowerCase().trim() === pKey)) {
            docMap.set(mapKey, {
              id: `virt-doc-${selectedBatchId}-${pKey.replace(/\s+/g, '-')}`,
              batchId: selectedBatchId || '',
              tanggalBatch: batchTanggal,
              petugasName: pName,
              petugasId: pEntries[0]?.assignedPetugasId || pKey.replace(/\s+/g, '-'),
              documentType: 'delivery_report',
              fileName: `Laporan_Distribusi_MBG_${pName.replace(/\s+/g, '_')}_${batchTanggal}.pdf`,
              totalInstitusi: pEntries.length,
              totalPorsi,
              completedCount,
              createdAt: new Date().toISOString(),
              createdBy: user?.uid || pName,
            });
          }
        }
      });
    }

    return Array.from(docMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [archiveDocs, entries, batches, selectedBatchId, activeTask, user?.uid]);

  const filteredArchiveDocs = useMemo(() => {
    if (!archiveSearchQuery.trim()) return combinedArchiveDocs;
    const q = archiveSearchQuery.toLowerCase().trim();
    return combinedArchiveDocs.filter((d) => {
      const matchPetugas = d.petugasName?.toLowerCase().includes(q);
      const matchTanggal = d.tanggalBatch?.toLowerCase().includes(q);
      const matchFile = d.fileName?.toLowerCase().includes(q);
      return matchPetugas || matchTanggal || matchFile;
    });
  }, [combinedArchiveDocs, archiveSearchQuery]);

  // Re-export PDF for an archived document in MbgDeliveryPage (Sesuai Layout Resmi Google Doc)
  const handleReExportArchivedDoc = async (docMeta: MbgDeliveryDocument) => {
    showToast({ message: 'Menyiapkan unduhan PDF Laporan...', variant: 'info' });

    try {
      let targetEntries: MbgPmEntry[] = [];
      let targetTasks: MbgDeliveryTask[] = [];

      // Fetch the exact entries & tasks for this batch from Firestore
      if (docMeta.batchId) {
        if (selectedBatchId === docMeta.batchId && entries.length > 0) {
          targetEntries = entries;
          targetTasks = tasks;
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
        targetTasks = tasks;
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

      showToast({ message: `PDF Laporan ${fileName} berhasil diunduh!`, variant: 'success' });
    } catch (err) {
      console.error('Failed to re-export PDF:', err);
      showToast({ message: 'Gagal mengunduh ulang PDF', variant: 'error' });
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

        {/* Petugas Selector for preview / simulation */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">Pilih Petugas:</span>
          <select
            title="Pilih Petugas"
            value={selectedPetugasName}
            onChange={(e) => setSelectedPetugasName(e.target.value)}
            className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all cursor-pointer"
          >
            <option value="">-- Semua / Akun Saya --</option>
            {uniqueKurirNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Page Tab: Tugas Aktif / Arsip Dokumen */}
      <div className="flex gap-1 mb-6 bg-[#F3F4F6] rounded-xl p-1 max-w-md">
        <button
          onClick={() => setPageTab('active')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
            pageTab === 'active'
              ? 'bg-white text-[#111827] shadow-sm'
              : 'text-[#6B7280] hover:text-[#111827]'
          }`}
        >
          <ClipboardList className="h-3.5 w-3.5" /> Tugas Aktif
        </button>
        <button
          onClick={() => setPageTab('archive')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
            pageTab === 'archive'
              ? 'bg-white text-[#111827] shadow-sm'
              : 'text-[#6B7280] hover:text-[#111827]'
          }`}
        >
          <FolderOpen className="h-3.5 w-3.5" /> Arsip Dokumen
          {archiveDocs.length > 0 && (
            <span className="bg-[#FBBF24] text-[#111827] text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
              {archiveDocs.length}
            </span>
          )}
        </button>
      </div>

      {/* Archive Tab Content */}
      {pageTab === 'archive' ? (
        <div className="space-y-4">
          {archiveDocs.length === 0 ? (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
              <History className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-lg font-bold text-[#111827]">Belum Ada Arsip Dokumen</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                Arsip dokumen akan muncul setelah Anda mengekspor PDF laporan distribusi.
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
                    value={archiveSearchQuery}
                    onChange={(e) => setArchiveSearchQuery(e.target.value)}
                    placeholder="Cari nama petugas, tanggal batch, atau nama file PDF..."
                    className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:bg-white transition-all"
                  />
                  {archiveSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setArchiveSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3.5 py-2 rounded-xl">
                    Menampilkan {filteredArchiveDocs.length} dari {archiveDocs.length} Dokumen
                  </span>
                </div>
              </div>

              {/* Table Container */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-[#111827] text-white flex items-center justify-between rounded-t-2xl">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4.5 w-4.5 text-[#FBBF24]" />
                    <span className="text-sm font-extrabold uppercase tracking-wider">Arsip Laporan Distribusi</span>
                  </div>
                  <span className="text-xs font-bold bg-white/15 px-3 py-1.5 rounded-full">
                    {filteredArchiveDocs.length} Dokumen
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[9px] tracking-wider">
                        <th className="py-3 px-6">Tanggal Batch</th>
                        <th className="py-3 px-4">Petugas</th>
                        <th className="py-3 px-4 text-center">Institusi</th>
                        <th className="py-3 px-4 text-center">Total Porsi</th>
                        <th className="py-3 px-4 text-center">Kelengkapan</th>
                        <th className="py-3 px-4">Waktu Dibuat</th>
                        <th className="py-3 px-6">Nama File</th>
                        <th className="py-3 px-6 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredArchiveDocs.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-gray-400 font-bold">
                            Tidak ada arsip yang cocok dengan pencarian "{archiveSearchQuery}"
                          </td>
                        </tr>
                      ) : (
                        filteredArchiveDocs.map((d) => (
                          <tr key={d.id} className="hover:bg-gray-50/50">
                            <td className="py-3 px-6 font-bold text-[#111827]">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                                {d.tanggalBatch || '-'}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-semibold text-gray-700">
                              <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                {d.petugasName}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-extrabold text-[10px]">
                                {d.totalInstitusi}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="bg-[#FBBF24]/20 text-[#92400E] px-2 py-0.5 rounded-full font-extrabold text-[10px]">
                                {d.totalPorsi}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] ${
                                d.completedCount === d.totalInstitusi
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {d.completedCount}/{d.totalInstitusi}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-500 text-[10px]">
                              {new Date(d.createdAt).toLocaleString('id-ID', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </td>
                            <td className="py-3 px-6 text-[10px] text-gray-600 font-mono">
                              {d.fileName}
                            </td>
                            <td className="py-3 px-6 text-center">
                              <button
                                type="button"
                                onClick={() => handleReExportArchivedDoc(d)}
                                className="inline-flex items-center gap-1.5 bg-[#111827] hover:bg-black text-white text-[11px] font-extrabold px-3 py-1.5 rounded-xl shadow-xs cursor-pointer transition-all active:scale-95"
                                title="Unduh ulang file PDF laporan ini"
                              >
                                <FileDown className="h-3.5 w-3.5 text-[#FBBF24]" />
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
      ) : loading ? (
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
                      {activeTask.kenekName && (
                        <span className="ml-2 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                          Kenek: {activeTask.kenekName}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Status Tugas: {MBG_DELIVERY_STATUS_CONFIG[activeTask.status]?.label}
                    </p>
                    {activeTask.deadlineAt && (() => {
                      const isOverdue = new Date().getTime() > new Date(activeTask.deadlineAt).getTime() && activeTask.status !== 'delivered';
                      return (
                        <div className={`mt-2 px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                          isOverdue
                            ? 'bg-red-600 text-white animate-bounce shadow-md'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}>
                          <span>⚠️</span>
                          <span>
                            {isOverdue
                              ? `MELEWATI DEADLINE! (Harus Sampai: ${new Date(activeTask.deadlineAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB)`
                              : `Deadline Pengantaran: ${new Date(activeTask.deadlineAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Progress actions based on status */}
                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                  {activeTask.status === 'waiting' && (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={handleStartHandover}
                        disabled={!isAllInstitutionsComplete}
                        className={`flex-1 md:flex-initial flex items-center justify-center gap-2 font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-sm ${
                          isAllInstitutionsComplete
                            ? 'bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] cursor-pointer active:scale-95'
                            : 'bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed'
                        }`}
                        title={
                          isAllInstitutionsComplete
                            ? 'Klik untuk konfirmasi serah terima'
                            : `Lengkapi foto bukti (3/3) pada seluruh institusi terlebih dahulu (${completedInstitutionsCount}/${activeNonLiburEntries.length} selesai)`
                        }
                      >
                        🤝 Konfirmasi Serah Terima
                      </button>
                      {!isAllInstitutionsComplete && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          ⚠️ Kelola bukti {completedInstitutionsCount}/{activeNonLiburEntries.length} institusi selesai
                        </span>
                      )}
                    </div>
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
                    <>
                      <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl">
                        🚚 Silakan ambil foto bukti di setiap tujuan sekolah/posyandu
                      </span>
                      <button
                        onClick={handleExportDeliveryPdf}
                        className="flex items-center gap-2 bg-[#111827] text-white hover:bg-black font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer shadow-sm"
                      >
                        <FileDown className="h-4 w-4 text-[#FBBF24]" /> Export PDF
                      </button>
                    </>
                  )}

                  {activeTask.status === 'delivered' && (
                    <div className="flex gap-2">
                      <span className="text-xs font-extrabold text-green-700 bg-green-50 border border-green-200 px-4 py-2.5 rounded-xl flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" /> Pengiriman Selesai!
                      </span>
                      <button
                        onClick={handleExportDeliveryPdf}
                        className="flex items-center gap-2 bg-[#111827] text-white hover:bg-black font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer shadow-sm"
                      >
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
                        <th className="py-3 px-4 text-center">🚐 Kedatangan Ompreng</th>
                        <th className="py-3 px-4 text-center">🤝 Serah Terima PJ Sekolah</th>
                        <th className="py-3 px-4 text-center">📄 Foto Surat Jalan</th>
                        <th className="py-3 px-4 text-center">📦 Pengambilan Ompreng Kosong</th>
                        <th className="py-3 px-6 text-center">Kelola Bukti</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {taskEntries.map((entry) => {
                        const hasMenu = !!entry.photoMenuUrl;
                        const hasSerahTerima = !!entry.photoSerahTerimaUrl;
                        const hasSuratJalan = !!entry.photoSuratJalanUrl;
                        const hasPenerima = !!entry.photoPenerimaUrl;
                        const proofCount = (hasMenu ? 1 : 0) + (hasSerahTerima ? 1 : 0) + (hasSuratJalan ? 1 : 0) + (hasPenerima ? 1 : 0);

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

                            {/* Foto Kedatangan Ompreng */}
                            <td className="py-3 px-4 text-center">
                              {hasMenu ? (
                                <img
                                  src={entry.photoMenuUrl}
                                  alt="Kedatangan Ompreng"
                                  className="w-12 h-12 object-cover rounded-lg border border-green-300 mx-auto shadow-xs"
                                />
                              ) : (
                                <button
                                  onClick={() => handleStartProofCapture(entry, 'menu')}
                                  className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg cursor-pointer flex items-center gap-1 mx-auto"
                                >
                                  <Camera className="h-3 w-3" /> Ambil
                                </button>
                              )}
                            </td>

                            {/* Foto Serah Terima PJ Sekolah */}
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
                                  className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg cursor-pointer flex items-center gap-1 mx-auto"
                                >
                                  <Camera className="h-3 w-3" /> Ambil
                                </button>
                              )}
                            </td>

                            {/* Foto Pengambilan Ompreng Kosong */}
                            <td className="py-3 px-4 text-center">
                              {hasPenerima ? (
                                <img
                                  src={entry.photoPenerimaUrl}
                                  alt="Pengambilan Ompreng Kosong"
                                  className="w-12 h-12 object-cover rounded-lg border border-green-300 mx-auto shadow-xs"
                                />
                              ) : (
                                <button
                                  onClick={() => handleStartProofCapture(entry, 'penerima')}
                                  className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg cursor-pointer flex items-center gap-1 mx-auto"
                                >
                                  <Camera className="h-3 w-3" /> Geotag
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
                                    proofCount === 4
                                      ? 'bg-green-600 text-white hover:bg-green-700'
                                      : 'bg-[#111827] text-white hover:bg-black'
                                  }`}
                                >
                                  {proofCount === 4 ? '✓ Complete (4/4)' : `Kelola (${proofCount}/4)`}
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

      {/* 4-Proof Management Modal with LiveCamera & Description */}
      {proofModalEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  Kelola 4 Bukti Pengiriman
                </span>
                <h3 className="text-lg font-extrabold text-gray-900">
                  {proofModalEntry.institutionName}
                </h3>
              </div>
              <button
                onClick={() => setProofModalEntry(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Slot 1: Foto Kedatangan Ompreng */}
              <ProofSlot
                entry={proofModalEntry}
                proofType="menu"
                emoji="🚐"
                label="Foto Kedatangan Ompreng di Sekolah"
                sublabel="Kedatangan kendaraan / ompreng di sekolah"
                photoUrl={proofModalEntry.photoMenuUrl}
                description={proofModalEntry.photoMenuDesc}
                onCapture={() => handleStartProofCapture(proofModalEntry, 'menu')}
                onDeviceUpload={(file) => handleDeviceFileUpload(file, proofModalEntry, 'menu')}
                onDownload={() => handleDownloadProofPhoto(proofModalEntry.photoMenuUrl, `ompreng_${proofModalEntry.institutionName}.jpg`)}
                onDelete={() => handleDeleteProofPhoto(proofModalEntry.id, 'menu')}
                onDescChange={(val) => handleDescriptionChange(proofModalEntry.id, 'menu', val)}
              />

              {/* Slot 2: Foto Serah Terima PJ Sekolah */}
              <ProofSlot
                entry={proofModalEntry}
                proofType="serah_terima"
                emoji="🤝"
                label="Foto Serah Terima dengan PJ Sekolah (Geotag)"
                sublabel="Penyerahan fisik makanan bersama PJ Sekolah"
                photoUrl={proofModalEntry.photoSerahTerimaUrl}
                description={proofModalEntry.photoSerahTerimaDesc}
                onCapture={() => handleStartProofCapture(proofModalEntry, 'serah_terima')}
                onDeviceUpload={(file) => handleDeviceFileUpload(file, proofModalEntry, 'serah_terima')}
                onDownload={() => handleDownloadProofPhoto(proofModalEntry.photoSerahTerimaUrl, `serah_terima_${proofModalEntry.institutionName}.jpg`)}
                onDelete={() => handleDeleteProofPhoto(proofModalEntry.id, 'serah_terima')}
                onDescChange={(val) => handleDescriptionChange(proofModalEntry.id, 'serah_terima', val)}
                isGeotag
              />

              {/* Slot 3: Foto Surat Jalan */}
              <ProofSlot
                entry={proofModalEntry}
                proofType="surat_jalan"
                emoji="📄"
                label="Foto Surat Jalan / BAST"
                sublabel="Sudah TTD & stempel resmi (Kamera Live / Device)"
                photoUrl={proofModalEntry.photoSuratJalanUrl}
                description={proofModalEntry.photoSuratJalanDesc}
                onCapture={() => handleStartProofCapture(proofModalEntry, 'surat_jalan')}
                onDeviceUpload={(file) => handleDeviceFileUpload(file, proofModalEntry, 'surat_jalan')}
                onDownload={() => handleDownloadProofPhoto(proofModalEntry.photoSuratJalanUrl, `surat_jalan_${proofModalEntry.institutionName}.jpg`)}
                onDelete={() => handleDeleteProofPhoto(proofModalEntry.id, 'surat_jalan')}
                onDescChange={(val) => handleDescriptionChange(proofModalEntry.id, 'surat_jalan', val)}
              />

              {/* Slot 4: Foto Pengambilan Ompreng Kosong */}
              <ProofSlot
                entry={proofModalEntry}
                proofType="penerima"
                emoji="📦"
                label="Foto Pengambilan Ompreng Kosong"
                sublabel="Dokumentasi penarikan ompreng kosong dari sekolah"
                photoUrl={proofModalEntry.photoPenerimaUrl}
                description={proofModalEntry.photoPenerimaDesc}
                onCapture={() => handleStartProofCapture(proofModalEntry, 'penerima')}
                onDeviceUpload={(file) => handleDeviceFileUpload(file, proofModalEntry, 'penerima')}
                onDownload={() => handleDownloadProofPhoto(proofModalEntry.photoPenerimaUrl, `ompreng_kosong_${proofModalEntry.institutionName}.jpg`)}
                onDelete={() => handleDeleteProofPhoto(proofModalEntry.id, 'penerima')}
                onDescChange={(val) => handleDescriptionChange(proofModalEntry.id, 'penerima', val)}
                isGeotag
              />
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

// ─── ProofSlot Component ───
function ProofSlot({
  emoji,
  label,
  sublabel,
  photoUrl,
  description,
  onCapture,
  onDeviceUpload,
  onDownload,
  onDelete,
  onDescChange,
  isGeotag,
}: {
  entry: MbgPmEntry;
  proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan';
  emoji: string;
  label: string;
  sublabel: string;
  photoUrl?: string;
  description?: string;
  onCapture: () => void;
  onDeviceUpload: (file: File) => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onDescChange: (val: string) => void;
  isGeotag?: boolean;
}) {
  const [localDesc, setLocalDesc] = useState(description || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when Firestore data updates
  useEffect(() => {
    setLocalDesc(description || '');
  }, [description]);

  return (
    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onDeviceUpload(file);
            e.target.value = '';
          }
        }}
      />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={label}
              className="w-14 h-14 object-cover rounded-xl border border-green-400 cursor-pointer shadow-xs hover:opacity-90"
              onClick={onDownload}
              title="Klik untuk lihat / download"
            />
          ) : (
            <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center text-xl font-bold">
              {emoji}
            </div>
          )}
          <div>
            <h4 className="text-xs font-bold text-gray-900">{label}</h4>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {photoUrl ? '✓ Foto tersimpan' : sublabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Camera live button */}
          <button
            type="button"
            onClick={onCapture}
            title="Ambil foto dengan Kamera Live"
            className={`px-2.5 py-1.5 text-[10px] font-extrabold rounded-xl cursor-pointer flex items-center gap-1 ${
              isGeotag
                ? 'bg-[#FBBF24] text-[#111827] hover:bg-[#F59E0B]'
                : 'bg-[#111827] text-white hover:bg-black'
            }`}
          >
            <Camera className="h-3 w-3" />
            {photoUrl ? 'Kamera' : isGeotag ? 'Geotag' : 'Kamera'}
          </button>

          {/* Upload device button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload foto dari Device"
            className="px-2.5 py-1.5 text-[10px] font-extrabold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl cursor-pointer flex items-center gap-1"
          >
            <Upload className="h-3 w-3" />
            Upload
          </button>

          {/* Action buttons when photo exists */}
          {photoUrl && (
            <>
              {onDownload && (
                <button
                  type="button"
                  onClick={onDownload}
                  title="Download foto"
                  className="p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl cursor-pointer transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  title="Hapus foto ini"
                  className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl cursor-pointer transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Description input — visible after photo is captured */}
      {photoUrl && (
        <div>
          <input
            type="text"
            value={localDesc}
            onChange={(e) => {
              setLocalDesc(e.target.value);
              onDescChange(e.target.value);
            }}
            placeholder="Tulis deskripsi foto ini..."
            className="w-full text-xs rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all font-semibold text-gray-800 placeholder:text-gray-400"
          />
        </div>
      )}
    </div>
  );
}
