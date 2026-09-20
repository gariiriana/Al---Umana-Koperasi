// ============================================================================
// MBG Archive Page — Arsip PM MBG
// ============================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Trash2,
  Search,
  Calendar,
  Loader2,
  Utensils,
  AlertTriangle,
  Save,
  Folder,
  ChevronLeft,
  BookOpen,
  Archive,
  ArchiveRestore,
  ShieldCheck,
  Shield,
  Check,
  CheckSquare,
  Square,
  MinusSquare,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ManageMenuModal } from './MbgAdminPage';
import type { MbgPmBatch, MbgPmEntry, MbgInstitutionType, MbgClassBreakdown } from '@/types/mbg';
import {
  subscribeBatches,
  subscribeAllEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  recalculateBatchTotals,
  deleteBatch,
  moveBatchToBackup,
  restoreBatchFromBackup,
  moveMultipleBatchesToBackup,
  restoreMultipleBatchesFromBackup,
  deleteMultipleBatches,
} from '@/services/mbgAdminService';
import { MBG_BATCH_STATUS_CONFIG } from '@/constants/mbgConstants';

// ---- Helper: Auto-calculate portion suggestions based on levels and inputs ----
function getAutoPortions(entry: Partial<MbgPmEntry>) {
  let qtPorsiBalita = 0;
  let qtPorsiKecil = 0;
  let qtPorsiBesar = 0;
  let qtPorsiBumilBusui = 0;

  if (entry.institutionType === 'posyandu') {
    qtPorsiBalita = entry.qtSiswaBalita || 0;
    qtPorsiBumilBusui = (entry.qtBumil || 0) + (entry.qtBusui || 0) || entry.qtBumilBusui || 0;
    qtPorsiBesar = entry.qtGuruKader || 0;
  } else {
    // sekolah
    if (entry.schoolLevel === 'tk_paud') {
      qtPorsiKecil = entry.qtSiswaBalita || 0;
      qtPorsiBesar = entry.qtGuruKader || 0;
    } else if (entry.schoolLevel === 'sma') {
      qtPorsiBesar = (entry.qtSiswaBalita || 0) + (entry.qtGuruKader || 0);
    } else {
      // SD
      qtPorsiKecil = entry.qtSiswaBalita || 0;
      qtPorsiBesar = entry.qtGuruKader || 0;
    }
  }
  return { qtPorsiBalita, qtPorsiKecil, qtPorsiBesar, qtPorsiBumilBusui };
}

// ---- Helper: Calculate jumlah ----
function calcJumlah(entry: Partial<MbgPmEntry>): number {
  const porsiTotal = (entry.qtPorsiBalita || 0) + (entry.qtPorsiKecil || 0) + (entry.qtPorsiBesar || 0) + (entry.qtPorsiBumilBusui || 0);
  if (porsiTotal > 0) return porsiTotal;

  const bumilBusuiSum = entry.qtBumilBusui || ((entry.qtBumil || 0) + (entry.qtBusui || 0));
  return (
    (entry.qtSiswaBalita || 0) +
    bumilBusuiSum +
    (entry.qtGuruKader || 0)
  );
}

// ---- PM Entry Row ----
function PmEntryRow({
  entry,
  onUpdate,
  onDelete,
  isLibur,
  onManageMenu,
  onManageClasses,
  onConfirmAction,
}: {
  entry: MbgPmEntry;
  onUpdate: (id: string, updates: Partial<MbgPmEntry>) => void;
  onDelete: (id: string) => void;
  isLibur: boolean;
  onManageMenu: () => void;
  onManageClasses: () => void;
  onConfirmAction: (config: {
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }) => void;
}) {
  const isPosyandu = entry.institutionType === 'posyandu';
  const hasClasses = entry.classesBreakdown && entry.classesBreakdown.length > 0;

  const handleFieldChange = (field: keyof MbgPmEntry, value: string | number | boolean) => {
    const updates: Partial<MbgPmEntry> = { [field]: value };
    const tempEntry = { ...entry, [field]: value };

    // Auto-update qtBumilBusui if we changed qtBumil or qtBusui
    if (field === 'qtBumil' || field === 'qtBusui') {
      const b = field === 'qtBumil' ? (value as number) : (entry.qtBumil || 0);
      const s = field === 'qtBusui' ? (value as number) : (entry.qtBusui || 0);
      updates.qtBumilBusui = b + s;
      tempEntry.qtBumilBusui = b + s;
    }

    // Reset bumil/busui and set default schoolLevel when switching to sekolah
    if (field === 'institutionType') {
      if (value === 'sekolah') {
        updates.qtBumilBusui = 0;
        updates.qtBumil = 0;
        updates.qtBusui = 0;
        updates.schoolLevel = 'sd';
        tempEntry.qtBumilBusui = 0;
        tempEntry.qtBumil = 0;
        tempEntry.qtBusui = 0;
        tempEntry.schoolLevel = 'sd';
      } else {
        updates.schoolLevel = undefined;
        tempEntry.schoolLevel = undefined;
      }
    }

    // Recalculate portions automatically if no classes
    if (!hasClasses) {
      const autoP = getAutoPortions(tempEntry);
      Object.assign(updates, autoP);
      Object.assign(tempEntry, autoP);
    } else {
      if (field === 'qtGuruKader') {
        const classPorsiBesar = (entry.classesBreakdown || []).reduce((sum, c) => sum + (c.qtPorsiBesar || 0), 0);
        updates.qtPorsiBesar = classPorsiBesar + (value as number);
        tempEntry.qtPorsiBesar = classPorsiBesar + (value as number);
      }
    }

    updates.jumlah = calcJumlah(tempEntry);
    onUpdate(entry.id, updates);
  };

  return (
    <tr
      className={`
        border-b border-[#F3F4F6] transition-colors text-xs
        ${isLibur ? 'bg-red-50 opacity-60' : 'hover:bg-[#FAFAFA]'}
        ${entry.qtPobiaNasi > 0 ? 'bg-amber-50/50' : ''}
      `}
    >
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={entry.institutionName}
          onChange={(e) => handleFieldChange('institutionName', e.target.value)}
          placeholder="Nama Institusi"
          className="w-full min-w-[110px] rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent"
        />
      </td>

      <td className="px-2 py-2 min-w-[90px]">
        <div className="flex flex-col gap-1 items-center w-full">
          <select
            value={entry.institutionType}
            onChange={(e) => handleFieldChange('institutionType', e.target.value as MbgInstitutionType)}
            title="Tipe Institusi"
            className="w-full min-w-[85px] rounded-lg border border-[#E5E7EB] px-1.5 py-1 text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
          >
            <option value="sekolah">Sekolah</option>
            <option value="posyandu">Posyandu</option>
          </select>

          {!isPosyandu && (
            <>
              <select
                value={entry.schoolLevel || 'sd'}
                onChange={(e) => handleFieldChange('schoolLevel', e.target.value)}
                title="Tingkatan Sekolah"
                className="w-full min-w-[85px] rounded-lg border border-[#E5E7EB] px-1.5 py-1 text-[10px] font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              >
                <option value="tk_paud">TK / PAUD</option>
                <option value="sd">SD</option>
                <option value="sma">SMP / SMA</option>
              </select>

              <button
                onClick={onManageClasses}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer shadow-sm w-full justify-center ${
                  hasClasses
                    ? 'bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100/70 hover:border-blue-300'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                title="Atur Breakdown Kelas"
              >
                <span>Atur Kelas ({entry.classesBreakdown?.length || 0})</span>
              </button>
            </>
          )}
        </div>
      </td>

      <td className="px-3 py-2.5">
        <input
          type="text"
          value={entry.assignedPetugasName || ''}
          onChange={(e) => handleFieldChange('assignedPetugasName', e.target.value)}
          placeholder="Nama Petugas"
          className="w-full min-w-[100px] rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent"
        />
      </td>

      <td className="px-3 py-2.5">
        <div className="flex justify-center">
          <input
            type="number"
            min={0}
            disabled={hasClasses}
            value={entry.qtSiswaBalita || ''}
            onChange={(e) => handleFieldChange('qtSiswaBalita', parseInt(e.target.value) || 0)}
            placeholder={isPosyandu ? 'Balita' : 'Siswa'}
            className={`w-14 rounded-lg border px-1.5 py-1 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#FBBF24] ${
              hasClasses
                ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                : 'border-[#E5E7EB] text-[#111827]'
            }`}
          />
        </div>
      </td>

      {/* QT Bumil/Busui (Split for Posyandu) */}
      <td className="px-3 py-2.5">
        {isPosyandu ? (
          <div className="flex flex-col gap-1 items-center min-w-[95px]">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-[#D97706] w-9 text-right">Bml:</span>
              <input
                type="number"
                min={0}
                value={entry.qtBumil ?? 0}
                onChange={(e) => handleFieldChange('qtBumil', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-11 rounded-lg border border-[#E5E7EB] px-1.5 py-0.5 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-[#D97706] w-9 text-right">Bsi:</span>
              <input
                type="number"
                min={0}
                value={entry.qtBusui ?? 0}
                onChange={(e) => handleFieldChange('qtBusui', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-11 rounded-lg border border-[#E5E7EB] px-1.5 py-0.5 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <input
              type="number"
              disabled
              placeholder="—"
              className="w-14 rounded-lg border border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed px-1.5 py-1 text-xs text-center font-bold"
            />
          </div>
        )}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex justify-center">
          <input
            type="number"
            min={0}
            value={entry.qtGuruKader || ''}
            onChange={(e) => handleFieldChange('qtGuruKader', parseInt(e.target.value) || 0)}
            placeholder={isPosyandu ? 'Kader' : 'Guru'}
            className="w-14 rounded-lg border border-[#E5E7EB] px-1.5 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
          />
        </div>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex justify-center">
          <input
            type="number"
            min={0}
            disabled={hasClasses}
            value={entry.qtPobiaNasi || ''}
            onChange={(e) => handleFieldChange('qtPobiaNasi', parseInt(e.target.value) || 0)}
            placeholder="0"
            className={`w-12 rounded-lg border px-1.5 py-1 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#FBBF24] ${
              hasClasses
                ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                : 'border-[#E5E7EB] text-[#111827]'
            }`}
          />
        </div>
      </td>



      <td className="px-3 py-2.5 text-center">
        <span className="inline-block min-w-[40px] rounded-full bg-[#FBBF24]/20 px-3 py-1 text-xs font-extrabold text-[#92400E]">
          {entry.jumlah}
        </span>
      </td>

      <td className="px-2 py-2 text-center min-w-[90px]">
        <button
          onClick={onManageMenu}
          className="inline-flex items-center gap-1 px-1.5 py-1 bg-white hover:bg-amber-50 text-[#92400E] border border-amber-200 hover:border-amber-300 rounded-lg text-[10px] font-bold transition-colors cursor-pointer shadow-sm w-full justify-center min-w-[80px]"
          title="Atur Menu & Porsi"
        >
          <Utensils className="h-3 w-3" />
          <span>Atur Menu</span>
        </button>
      </td>

      <td className="px-3 py-2.5">
        <input
          type="text"
          disabled={hasClasses}
          value={entry.jadwalPengantaran}
          onChange={(e) => handleFieldChange('jadwalPengantaran', e.target.value)}
          placeholder="06.00-08.30"
          className={`w-full min-w-[105px] rounded-lg border px-1.5 py-1 text-xs text-center font-semibold focus:outline-none focus:ring-2 focus:ring-[#FBBF24] ${
            hasClasses
              ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
              : 'border-[#E5E7EB] text-[#111827]'
          }`}
        />
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const actionText = entry.isSekolahLibur ? 'mengaktifkan kembali' : 'meliburkan';
              onConfirmAction({
                title: entry.isSekolahLibur ? 'Aktifkan Institusi' : 'Liburkan Institusi',
                message: `Apakah Anda yakin ingin ${actionText} institusi ${entry.institutionName || 'ini'}?`,
                onConfirm: () => handleFieldChange('isSekolahLibur', !entry.isSekolahLibur),
                variant: 'warning',
              });
            }}
            title={entry.isSekolahLibur ? 'Aktifkan' : 'Tandai Libur'}
            className={`p-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
              entry.isSekolahLibur
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
            {entry.isSekolahLibur ? '🔴' : '⚪'}
          </button>
          <button
            onClick={() => {
              onConfirmAction({
                title: 'Hapus Institusi',
                message: `Apakah Anda yakin ingin menghapus data institusi ${entry.institutionName || 'ini'}? Tindakan ini tidak dapat dibatalkan.`,
                onConfirm: () => onDelete(entry.id),
                variant: 'danger',
              });
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
            title="Hapus"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}



// ============================================================================
// Main Archive Page Component
// ============================================================================
export function MbgArchivePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [selectedEntryForMenu, setSelectedEntryForMenu] = useState<MbgPmEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  } | null>(null);

  const [archiveTab, setArchiveTab] = useState<'active' | 'backup'>('active');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  // Reset selection when tab changes or navigating between batch views
  useEffect(() => {
    setSelectedBatchIds([]);
  }, [archiveTab, selectedBatchId]);

  // Subscribe to submitted/archived batches (status !== 'DRAFT') and all entries (including backup)
  useEffect(() => {
    const unsubBatches = subscribeBatches(
      (b) => {
        const archived = b.filter((batch) => batch.status !== 'DRAFT');
        setBatches(archived);
        setLoadingBatches(false);
      },
      (err) => {
        console.error('Error loading batches:', err);
        setLoadingBatches(false);
      },
      true // includeBackup = true for MbgArchivePage
    );

    setLoadingEntries(true);
    const unsubEntries = subscribeAllEntries(
      (e) => {
        setEntries(e);
        setLoadingEntries(false);
      },
      (err) => {
        console.error('Error loading entries:', err);
        setLoadingEntries(false);
      },
      true // includeBackup = true for MbgArchivePage
    );

    return () => {
      unsubBatches();
      unsubEntries();
    };
  }, []);

  const regularBatches = useMemo(() => {
    return batches.filter((b) => !b.isBackup);
  }, [batches]);

  const backupBatches = useMemo(() => {
    return batches.filter((b) => !!b.isBackup);
  }, [batches]);

  const currentTabBatches = useMemo(() => {
    return archiveTab === 'active' ? regularBatches : backupBatches;
  }, [archiveTab, regularBatches, backupBatches]);

  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId);
  }, [batches, selectedBatchId]);

  const activeEntries = useMemo(() => {
    return entries.filter((e) => e.batchId === selectedBatchId);
  }, [entries, selectedBatchId]);

  // Filtered entries within the selected batch
  const filteredEntries = useMemo(() => {
    if (!searchQuery) return activeEntries;
    const q = searchQuery.toLowerCase();
    return activeEntries.filter(
      (e) =>
        e.institutionName.toLowerCase().includes(q) ||
        (e.assignedPetugasName || '').toLowerCase().includes(q)
    );
  }, [activeEntries, searchQuery]);

  // Filtered batches for folder list view
  const filteredBatches = useMemo(() => {
    return currentTabBatches.filter((b) => {
      // 1. Date filter
      if (searchDate && b.tanggal !== searchDate) {
        return false;
      }
      // 2. School/posyandu/petugas name filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const batchEntries = entries.filter((e) => e.batchId === b.id);
        const hasMatch = batchEntries.some(
          (e) =>
            e.institutionName.toLowerCase().includes(q) ||
            (e.assignedPetugasName || '').toLowerCase().includes(q)
        );
        return hasMatch;
      }
      return true;
    });
  }, [currentTabBatches, entries, searchDate, searchQuery]);

  const isAllFilteredSelected = useMemo(() => {
    return (
      filteredBatches.length > 0 &&
      filteredBatches.every((b) => selectedBatchIds.includes(b.id))
    );
  }, [filteredBatches, selectedBatchIds]);

  const isSomeFilteredSelected = useMemo(() => {
    return (
      selectedBatchIds.length > 0 &&
      !isAllFilteredSelected &&
      filteredBatches.some((b) => selectedBatchIds.includes(b.id))
    );
  }, [filteredBatches, selectedBatchIds, isAllFilteredSelected]);

  // Grand totals
  const grandTotals = useMemo(() => {
    const active = activeEntries.filter((e) => !e.isSekolahLibur);
    const petugasSet = new Set<string>();
    active.forEach((e) => {
      if (e.assignedPetugasName) petugasSet.add(e.assignedPetugasName.trim());
    });
    return {
      siswa: active.reduce((s, e) => s + (e.qtSiswaBalita || 0), 0),
      bumil: active.reduce((s, e) => s + (e.qtBumilBusui || 0), 0),
      guru: active.reduce((s, e) => s + (e.qtGuruKader || 0), 0),
      pobia: active.reduce((s, e) => s + (e.qtPobiaNasi || 0), 0),
      porsiBalita: active.reduce((s, e) => s + (e.qtPorsiBalita || 0), 0),
      porsiKecil: active.reduce((s, e) => s + (e.qtPorsiKecil || 0), 0),
      porsiBesar: active.reduce((s, e) => s + (e.qtPorsiBesar || 0), 0),
      porsiBumilBusui: active.reduce((s, e) => s + (e.qtPorsiBumilBusui || 0), 0),
      jumlah: active.reduce((s, e) => s + (e.jumlah || 0), 0),
      totalInstitusi: activeEntries.length,
      totalPetugas: petugasSet.size,
    };
  }, [activeEntries]);

  // ---- Handlers ----
  const handleUpdateEntry = useCallback(
    async (entryId: string, updates: Partial<MbgPmEntry>) => {
      try {
        await updateEntry(entryId, updates);
      } catch (err) {
        console.error(err);
        showToast({ message: 'Gagal mengupdate data', variant: 'error' });
      }
    },
    [showToast]
  );

  const handleDeleteEntry = useCallback(
    async (entryId: string) => {
      try {
        await deleteEntry(entryId);
        if (selectedBatchId) {
          await recalculateBatchTotals(selectedBatchId);
        }
        showToast({ message: 'Data dihapus', variant: 'success' });
      } catch (err) {
        console.error(err);
        showToast({ message: 'Gagal menghapus data', variant: 'error' });
      }
    },
    [selectedBatchId, showToast]
  );

  const handleAddRow = useCallback(
    async () => {
      if (!selectedBatchId || !user) return;
      try {
        const sortOrder = activeEntries.length;
        await addEntry({
          batchId: selectedBatchId,
          institutionName: '',
          institutionType: 'sekolah',
          qtSiswaBalita: 0,
          qtBumilBusui: 0,
          qtGuruKader: 0,
          qtPobiaNasi: 0,
          jumlah: 0,
          jadwalPengantaran: '',
          assignedPetugasId: '',
          assignedPetugasName: '',
          menuItems: [],
          menuKeringanItems: [],
          isSekolahLibur: false,
          notes: '',
          sortOrder,
          createdBy: user.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error(err);
        showToast({ message: 'Gagal menambah baris', variant: 'error' });
      }
    },
    [selectedBatchId, activeEntries.length, user, showToast]
  );

  const handleSaveChanges = async () => {
    if (!selectedBatchId) return;
    setSaving(true);
    try {
      await recalculateBatchTotals(selectedBatchId);
      showToast({ message: 'Perubahan arsip berhasil disimpan!', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal menyimpan perubahan', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBatchById = useCallback((batchId: string, tanggal: string) => {
    setConfirmState({
      title: 'Hapus Batch Arsip',
      message: `Apakah Anda yakin ingin menghapus seluruh data batch arsip untuk tanggal ${tanggal}? Data batch dan seluruh data PM di dalamnya akan dihapus permanen.`,
      variant: 'danger',
      onConfirm: async () => {
        setSaving(true);
        try {
          await deleteBatch(batchId);
          showToast({ message: `Batch arsip ${tanggal} berhasil dihapus!`, variant: 'success' });
          if (selectedBatchId === batchId) {
            setSelectedBatchId(null);
          }
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal menghapus batch arsip', variant: 'error' });
        } finally {
          setSaving(false);
        }
      },
    });
  }, [selectedBatchId, showToast]);

  const handleDeleteBatch = () => {
    if (!selectedBatchId || !selectedBatch) return;
    handleDeleteBatchById(selectedBatchId, selectedBatch.tanggal);
  };

  const handleMoveToBackup = useCallback((batchId: string, tanggal: string) => {
    setConfirmState({
      title: 'Pindahkan ke Arsip Backup',
      message: `Pindahkan seluruh data PM untuk batch tanggal ${tanggal} ke Arsip Backup? Data ini akan otomatis disembunyikan dari seluruh divisi/role lain (Produksi, Distribusi, Kurir, Purchasing). Anda dapat melihat dan memulihkannya kembali kapan saja melalui tab Data Arsip Backup.`,
      variant: 'warning',
      onConfirm: async () => {
        setSaving(true);
        try {
          await moveBatchToBackup(batchId, user?.uid);
          showToast({ message: `Batch ${tanggal} berhasil dipindahkan ke Arsip Backup!`, variant: 'success' });
          if (selectedBatchId === batchId) {
            setSelectedBatchId(null);
          }
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal memindahkan batch ke backup', variant: 'error' });
        } finally {
          setSaving(false);
        }
      },
    });
  }, [user, selectedBatchId, showToast]);

  const handleRestoreFromBackup = useCallback((batchId: string, tanggal: string) => {
    setConfirmState({
      title: 'Pulihkan dari Arsip Backup',
      message: `Kembalikan batch tanggal ${tanggal} ke Arsip Aktif? Data PM akan kembali terlihat oleh divisi operasional terkait (Produksi, Distribusi, Kurir, Purchasing).`,
      variant: 'info',
      onConfirm: async () => {
        setSaving(true);
        try {
          await restoreBatchFromBackup(batchId);
          showToast({ message: `Batch ${tanggal} berhasil dipulihkan ke Arsip Aktif!`, variant: 'success' });
          if (selectedBatchId === batchId) {
            setSelectedBatchId(null);
          }
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal memulihkan batch dari backup', variant: 'error' });
        } finally {
          setSaving(false);
        }
      },
    });
  }, [selectedBatchId, showToast]);

  const handleToggleSelectBatch = useCallback((batchId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId]
    );
  }, []);

  const handleSelectAllBatches = useCallback(() => {
    if (filteredBatches.length === 0) return;
    const allFilteredIds = filteredBatches.map((b) => b.id);
    const allSelected = allFilteredIds.every((id) => selectedBatchIds.includes(id));
    if (allSelected) {
      setSelectedBatchIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedBatchIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  }, [filteredBatches, selectedBatchIds]);

  const handleDeselectAllBatches = useCallback(() => {
    setSelectedBatchIds([]);
  }, []);

  const handleBulkMoveToBackup = useCallback(() => {
    if (selectedBatchIds.length === 0) return;
    const count = selectedBatchIds.length;
    setConfirmState({
      title: `Pindahkan ${count} Batch ke Arsip Backup`,
      message: `Pindahkan ${count} batch terpilih ke Data Arsip Backup? Seluruh data PM di dalamnya akan disembunyikan dari semua divisi/role operasional terkait (Produksi, Distribusi, Kurir, Purchasing). Anda dapat melihat dan memulihkannya kembali kapan saja melalui tab Data Arsip Backup.`,
      variant: 'warning',
      onConfirm: async () => {
        setSaving(true);
        try {
          await moveMultipleBatchesToBackup(selectedBatchIds, user?.uid);
          showToast({
            message: `Berhasil memindahkan ${count} batch ke Arsip Backup!`,
            variant: 'success',
          });
          setSelectedBatchIds([]);
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal memindahkan beberapa batch ke backup', variant: 'error' });
        } finally {
          setSaving(false);
        }
      },
    });
  }, [selectedBatchIds, user, showToast]);

  const handleBulkRestoreFromBackup = useCallback(() => {
    if (selectedBatchIds.length === 0) return;
    const count = selectedBatchIds.length;
    setConfirmState({
      title: `Pulihkan ${count} Batch ke Arsip Aktif`,
      message: `Kembalikan ${count} batch terpilih dari Arsip Backup ke Arsip Aktif? Data PM akan kembali dapat diakses oleh divisi operasional terkait (Produksi, Distribusi, Kurir, Purchasing).`,
      variant: 'info',
      onConfirm: async () => {
        setSaving(true);
        try {
          await restoreMultipleBatchesFromBackup(selectedBatchIds);
          showToast({
            message: `Berhasil memulihkan ${count} batch ke Arsip Aktif!`,
            variant: 'success',
          });
          setSelectedBatchIds([]);
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal memulihkan batch dari backup', variant: 'error' });
        } finally {
          setSaving(false);
        }
      },
    });
  }, [selectedBatchIds, showToast]);

  const handleBulkDeleteBatches = useCallback(() => {
    if (selectedBatchIds.length === 0) return;
    const count = selectedBatchIds.length;
    setConfirmState({
      title: `Hapus ${count} Batch Terpilih`,
      message: `Apakah Anda yakin ingin menghapus ${count} batch yang dipilih secara permanen beserta seluruh data PM di dalamnya? Tindakan ini tidak dapat dibatalkan.`,
      variant: 'danger',
      onConfirm: async () => {
        setSaving(true);
        try {
          await deleteMultipleBatches(selectedBatchIds);
          showToast({
            message: `Berhasil menghapus ${count} batch arsip!`,
            variant: 'success',
          });
          setSelectedBatchIds([]);
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal menghapus batch arsip terpilih', variant: 'error' });
        } finally {
          setSaving(false);
        }
      },
    });
  }, [selectedBatchIds, showToast]);

  const handleSaveMenu = async (
    entryId: string,
    menuItems: string[],
    menuKeringanItems: string[],
    address?: string,
    classes?: MbgClassBreakdown[]
  ) => {
    try {
      const entry = activeEntries.find((e) => e.id === entryId);
      if (!entry) return;

      const updates: Partial<MbgPmEntry> = {
        menuItems,
        menuKeringanItems,
        address,
      };

      if (classes) {
        const qtSiswaBalita = classes.reduce((sum, c) => sum + (c.totalSiswa || 0), 0);
        const qtPobiaNasi = classes.reduce((sum, c) => sum + (c.qtPobiaNasi || 0), 0);

        const teacherCount = entry.qtGuruKader || 0;
        const qtPorsiBalita = classes.reduce((sum, c) => sum + (c.qtPorsiBalita || 0), 0);
        const qtPorsiKecil = classes.reduce((sum, c) => sum + (c.qtPorsiKecil || 0), 0);
        const qtPorsiBesar = classes.reduce((sum, c) => sum + (c.qtPorsiBesar || 0), 0) + teacherCount;
        const qtPorsiBumilBusui = classes.reduce((sum, c) => sum + (c.qtPorsiBumilBusui || 0), 0);

        const jumlah = qtPorsiBalita + qtPorsiKecil + qtPorsiBesar + qtPorsiBumilBusui;

        // Merge class menus into main menus to ensure they exist on the entry
        const uniqueMenus = Array.from(new Set([...menuItems, ...classes.flatMap((c) => c.menuItems || [])]));
        const uniqueKeringan = Array.from(new Set([...menuKeringanItems, ...classes.flatMap((c) => c.menuKeringanItems || [])]));

        const uniqueSchedules = Array.from(new Set(classes.map((c) => c.jadwalPengantaran || '').filter(Boolean)));
        const jadwalPengantaran = uniqueSchedules.join(', ') || entry.jadwalPengantaran;

        Object.assign(updates, {
          classesBreakdown: classes,
          qtSiswaBalita,
          qtPobiaNasi,
          qtPorsiBalita,
          qtPorsiKecil,
          qtPorsiBesar,
          qtPorsiBumilBusui,
          jumlah,
          menuItems: uniqueMenus,
          menuKeringanItems: uniqueKeringan,
          jadwalPengantaran,
        });
      }

      await updateEntry(entryId, updates);

      if (selectedBatchId) {
        await recalculateBatchTotals(selectedBatchId);
      }

      showToast({ message: 'Menu, Porsi & Alamat berhasil disimpan!', variant: 'success' });
      setSelectedEntryForMenu(null);
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal menyimpan menu & porsi', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          {selectedBatchId ? (
            <button
              onClick={() => setSelectedBatchId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-amber-500 transition-colors mb-2 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              Kembali ke Daftar Folder
            </button>
          ) : null}
          <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-[#D97706]" />
            {selectedBatchId ? `Detail Arsip Batch` : 'Arsip Data PM MBG'}
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            {selectedBatchId 
              ? `Melihat dan mengedit data PM historis untuk batch tanggal ${selectedBatch?.tanggal}`
              : 'Kelola, edit, atau hapus data PM historis yang sudah disubmit'
            }
          </p>
        </div>

        {/* Search & Filter section in top header only when in folder list view */}
        {!selectedBatchId && !loadingBatches && batches.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari sekolah atau posyandu..."
                className="w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-4 py-2 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
            {/* Date Input Filter */}
            <div className="relative max-w-xs">
              <input
                type="date"
                title="Filter Tanggal"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
            {/* Reset Button */}
            {(searchQuery || searchDate) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchDate('');
                }}
                className="px-3 py-2 text-xs font-bold text-gray-500 hover:text-red-500 transition-colors border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Body Grid */}
      {loadingBatches || loadingEntries ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
          <span className="text-xs font-semibold">Memuat data arsip...</span>
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center shadow-sm">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-[#6B7280]">Belum ada batch di arsip</p>
          <p className="text-xs text-[#9CA3AF] mt-1">Data akan masuk ke arsip setelah disubmit di menu Administrasi MBG</p>
        </div>
      ) : !selectedBatchId ? (
        /* Folder List View */
        <>
          {/* ─── TAB NAVIGATION: ARSIP AKTIF vs ARSIP BACKUP ─── */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-[#E5E7EB] shadow-2xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setArchiveTab('active')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  archiveTab === 'active'
                    ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <Folder className="h-4 w-4" />
                <span>Arsip PM Aktif</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  archiveTab === 'active' ? 'bg-slate-950 text-amber-300' : 'bg-gray-200 text-gray-700'
                }`}>
                  {regularBatches.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setArchiveTab('backup')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  archiveTab === 'backup'
                    ? 'bg-slate-900 text-amber-300 font-black shadow-xs'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <Archive className="h-4 w-4 text-amber-400" />
                <span>Data Arsip Backup</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  archiveTab === 'backup' ? 'bg-amber-400 text-slate-950' : 'bg-gray-200 text-gray-700'
                }`}>
                  {backupBatches.length}
                </span>
              </button>
            </div>

            <div className="text-[11px] text-gray-500 px-2 font-medium">
              {archiveTab === 'active' ? (
                <span>Data PM aktif terlihat oleh divisi operasional terkait</span>
              ) : (
                <span className="text-amber-700 font-bold flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                  Data backup disembunyikan dari seluruh divisi/role lain
                </span>
              )}
            </div>
          </div>

          {/* Notice Banner for Backup Tab */}
          {archiveTab === 'backup' && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white border border-slate-700 shadow-xs flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-400/20 text-amber-400 rounded-xl shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Zona Data Arsip Backup (Tersembunyi)
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Batch dan data PM di tab ini disimpan sebagai backup cadangan dan <strong>tidak terlihat oleh divisi manapun</strong> (Produksi MBG, Distribusi MBG, Kurir, dan Purchasing). Anda dapat mengembalikannya ke Arsip Aktif kapan saja dengan menekan tombol <em>Pulihkan</em>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── SELECTION TOOLBAR & BULK ACTIONS ─── */}
          {filteredBatches.length > 0 && (
            <div className="mb-5 sticky top-3 z-20 bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3 transition-all">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAllBatches}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-300 hover:border-amber-400 bg-gray-50 hover:bg-amber-50/50 text-xs font-bold text-gray-700 transition-colors cursor-pointer"
                >
                  {isAllFilteredSelected ? (
                    <CheckSquare className="h-4 w-4 text-amber-600" />
                  ) : isSomeFilteredSelected ? (
                    <MinusSquare className="h-4 w-4 text-amber-600" />
                  ) : (
                    <Square className="h-4 w-4 text-gray-400" />
                  )}
                  <span>{isAllFilteredSelected ? 'Batalkan Semua' : 'Pilih Semua'}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-700 font-extrabold">
                    {filteredBatches.length}
                  </span>
                </button>

                {selectedBatchIds.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-amber-100 text-amber-950 border border-amber-300">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    {selectedBatchIds.length} batch dipilih
                  </span>
                )}
              </div>

              {selectedBatchIds.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {archiveTab === 'active' ? (
                    <button
                      type="button"
                      onClick={handleBulkMoveToBackup}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-slate-900 hover:bg-black text-amber-300 border border-slate-700 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      title="Pindahkan semua batch terpilih ke Arsip Backup"
                    >
                      <Archive className="h-4 w-4 text-amber-400" />
                      <span>Pindahkan ke Arsip Backup ({selectedBatchIds.length})</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleBulkRestoreFromBackup}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      title="Pulihkan semua batch terpilih ke Arsip Aktif"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                      <span>Pulihkan ke Arsip Aktif ({selectedBatchIds.length})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleBulkDeleteBatches}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-all cursor-pointer disabled:opacity-50"
                    title="Hapus permanen batch terpilih"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Hapus ({selectedBatchIds.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeselectAllBatches}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    Batal Pilih
                  </button>
                </div>
              )}
            </div>
          )}

          {filteredBatches.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm">
              {archiveTab === 'backup' ? (
                <>
                  <Archive className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-gray-600">Belum ada batch di Arsip Backup</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Gunakan checkbox atau tombol "Backup" pada kartu batch di Arsip Aktif untuk memindahkan data PM ke arsip cadangan tersembunyi.
                  </p>
                </>
              ) : (
                <>
                  <Folder className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-gray-600">Arsip tidak ditemukan</p>
                  <p className="text-xs text-gray-400 mt-1">Coba sesuaikan tanggal filter atau kata kunci pencarian Anda.</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredBatches.map((b) => {
                const batchEntries = entries.filter((e) => e.batchId === b.id);
                const matchingQuery = searchQuery.toLowerCase();
                const matchedSchools = searchQuery
                  ? batchEntries.filter(
                      (e) =>
                        e.institutionName.toLowerCase().includes(matchingQuery) ||
                        (e.assignedPetugasName || '').toLowerCase().includes(matchingQuery)
                    )
                  : [];
                const isSelected = selectedBatchIds.includes(b.id);
                
                return (
                  <motion.div
                    key={b.id}
                    whileHover={{ y: -4, scale: 1.02 }}
                    onClick={() => setSelectedBatchId(b.id)}
                    className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden group font-['Hanken_Grotesk'] ${
                      isSelected
                        ? 'ring-2 ring-amber-400 border-amber-400 bg-amber-50/30 shadow-md'
                        : b.isBackup
                        ? 'border-slate-300 hover:border-slate-500 bg-slate-50/40'
                        : 'border-[#E5E7EB] hover:border-amber-300'
                    }`}
                  >
                    {/* Visual tab of a folder */}
                    <div className={`absolute top-0 left-0 w-24 h-1 transition-colors ${
                      isSelected
                        ? 'bg-amber-500'
                        : b.isBackup
                        ? 'bg-slate-700 group-hover:bg-slate-900'
                        : 'bg-amber-400 group-hover:bg-[#F59E0B]'
                    }`} />
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => handleToggleSelectBatch(b.id, e)}
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-amber-400 border-amber-500 text-slate-950 shadow-xs'
                                : 'bg-white border-gray-300 text-transparent hover:border-amber-400 hover:text-gray-300'
                            }`}
                            title={isSelected ? 'Batalkan pilihan batch ini' : 'Pilih batch ini'}
                          >
                            <Check className={`h-4 w-4 stroke-[3] ${isSelected ? 'opacity-100 text-slate-950' : 'opacity-0'}`} />
                          </button>
                          <div className={`p-2.5 rounded-xl transition-colors ${
                            b.isBackup ? 'bg-slate-100 text-slate-700 group-hover:bg-slate-200' : 'bg-amber-50 text-amber-500 group-hover:bg-amber-100'
                          }`}>
                            {b.isBackup ? <Archive className="h-5 w-5" /> : <Folder className="h-5 w-5 fill-amber-100" />}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {b.isBackup ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-900 text-amber-300 border border-slate-700">
                              <Shield className="h-3 w-3 text-amber-400" />
                              Backup
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#FEF3C7] text-[#92400E]">
                              {MBG_BATCH_STATUS_CONFIG[b.status]?.label || b.status}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBatchById(b.id, b.tanggal);
                            }}
                            title={`Hapus arsip batch ${b.tanggal}`}
                            className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-xs font-extrabold text-gray-800 break-all select-none">
                          {b.tanggal}
                        </h4>
                        <span className="text-[10px] text-gray-400 font-medium select-none">
                          Dibuat oleh: {b.createdBy === user?.uid ? 'Anda' : 'Admin'}
                        </span>
                      </div>

                      {/* Matched Schools Preview if searching */}
                      {searchQuery && matchedSchools.length > 0 && (
                        <div className="bg-emerald-50 rounded-xl p-2 border border-emerald-100 space-y-1">
                          <span className="text-[9px] text-emerald-700 font-bold block uppercase tracking-wider">Hasil Cocok:</span>
                          <div className="max-h-[60px] overflow-y-auto space-y-1">
                            {matchedSchools.map((ms) => (
                              <span key={ms.id} className="text-[10px] font-semibold text-gray-700 block truncate">
                                • {ms.institutionName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 text-[10px] select-none">
                        <div>
                          <span className="text-gray-400 block font-medium">Total Porsi</span>
                          <span className="font-extrabold text-gray-800 text-xs">
                            {b.totalJumlah || batchEntries.reduce((sum, e) => sum + (e.isSekolahLibur ? 0 : e.jumlah), 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block font-medium">Sekolah/PM</span>
                          <span className="font-extrabold text-gray-800 text-xs">
                            {batchEntries.length}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px]">
                      <span className="text-gray-400 font-medium truncate max-w-[80px]">
                        {b.petugasList && b.petugasList.length > 0 
                          ? `${b.petugasList.length} Kurir`
                          : 'Belum ada kurir'
                        }
                      </span>
                      <div className="flex items-center gap-1.5">
                        {b.isBackup ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestoreFromBackup(b.id, b.tanggal);
                            }}
                            className="px-2 py-1 rounded-lg text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 font-bold flex items-center gap-1 transition-colors cursor-pointer border border-emerald-300 bg-emerald-50"
                            title={`Kembalikan batch ${b.tanggal} ke Arsip Aktif`}
                          >
                            <ArchiveRestore className="h-3 w-3" />
                            Pulihkan
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveToBackup(b.id, b.tanggal);
                            }}
                            className="px-2 py-1 rounded-lg text-slate-700 hover:text-slate-950 hover:bg-slate-200 font-bold flex items-center gap-1 transition-colors cursor-pointer border border-slate-300 bg-slate-100"
                            title={`Pindahkan batch ${b.tanggal} ke Arsip Backup (sembunyikan dari divisi operasional)`}
                          >
                            <Archive className="h-3 w-3 text-amber-600" />
                            Backup
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBatchById(b.id, b.tanggal);
                          }}
                          className="px-2 py-1 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title={`Hapus arsip batch ${b.tanggal}`}
                        >
                          <Trash2 className="h-3 w-3" />
                          Hapus
                        </button>
                        <span className="font-bold text-amber-600 group-hover:text-amber-700 flex items-center gap-0.5 ml-0.5">
                          Buka →
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Batch Detail View (Existing Table view for selected batch) */
        <>
          {/* Selected Batch Details Bar */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 mb-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${selectedBatch?.isBackup ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-500'}`}>
                {selectedBatch?.isBackup ? <Archive className="h-5 w-5 text-slate-800" /> : <Calendar className="h-5 w-5" />}
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Tanggal Pengiriman {selectedBatch?.isBackup ? '(Arsip Backup)' : '(Arsip Aktif)'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-[#111827]">{selectedBatch?.tanggal}</span>
                  {selectedBatch?.isBackup ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-amber-300 border border-slate-700">
                      <Shield className="h-3 w-3 text-amber-400" />
                      Backup Tersembunyi
                    </span>
                  ) : (
                    selectedBatch && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                        {MBG_BATCH_STATUS_CONFIG[selectedBatch.status]?.label || selectedBatch.status}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedBatch?.isBackup ? (
                <button
                  type="button"
                  onClick={() => selectedBatch && handleRestoreFromBackup(selectedBatch.id, selectedBatch.tanggal)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md transition-colors disabled:opacity-50"
                  title="Kembalikan batch ini ke Arsip Aktif"
                >
                  <ArchiveRestore className="h-4 w-4" />
                  <span>Pulihkan ke Arsip Aktif</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => selectedBatch && handleMoveToBackup(selectedBatch.id, selectedBatch.tanggal)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-amber-300 border border-slate-700 text-xs font-bold rounded-xl cursor-pointer shadow-md transition-colors disabled:opacity-50"
                  title="Pindahkan batch ini ke Arsip Backup (sembunyikan dari divisi operasional)"
                >
                  <Archive className="h-4 w-4 text-amber-400" />
                  <span>Pindahkan ke Arsip Backup</span>
                </button>
              )}

              {selectedBatch && !selectedBatch.isBackup && (
                <button
                  type="button"
                  onClick={() => navigate(`/mbg/production?batchId=${selectedBatch.id}`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl cursor-pointer shadow-md transition-all hover:scale-[1.02]"
                  title="Lihat data batch ini langsung di menu Produksi MBG"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Buka di Produksi MBG</span>
                </button>
              )}

              <button
                onClick={handleDeleteBatch}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Hapus Batch Ini
              </button>
            </div>
          </div>

          {/* Warning banner inside details view if it is a backup batch */}
          {selectedBatch?.isBackup && (
            <div className="mb-4 p-3.5 rounded-xl bg-slate-900 text-white border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Data Arsip Backup:</strong> Data PM ini tersimpan di arsip backup dan <strong>tidak terlihat</strong> oleh divisi manapun (Produksi, Distribusi, Kurir, Purchasing).
                </span>
              </div>
              <button
                type="button"
                onClick={() => selectedBatch && handleRestoreFromBackup(selectedBatch.id, selectedBatch.tanggal)}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg text-xs font-black transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
              >
                Pulihkan Sekarang
              </button>
            </div>
          )}

          {/* Search bar inside details view */}
          <div className="mb-4">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari institusi atau petugas..."
                className="w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-4 py-2.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
          </div>

          {/* Archive Table */}
          <div className="overflow-x-auto border border-[#E5E7EB] rounded-xl bg-white shadow-sm">
            <table className="w-full text-left font-['Hanken_Grotesk',system-ui,sans-serif] min-w-[760px]">
              <thead>
                <tr className="bg-[#F3F4F6] text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-b border-[#E5E7EB]">
                  <th className="px-3 py-3 whitespace-nowrap">Institusi</th>
                  <th className="px-3 py-3 whitespace-nowrap">Tipe</th>
                  <th className="px-3 py-3 whitespace-nowrap">Petugas / Kurir</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">QT Siswa / Balita</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">QT Bumil / Busui</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">QT Guru / Kader</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Pobia Nasi</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Jumlah</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Menu & Porsi</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Jadwal Pengantaran</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-xs font-semibold text-gray-400 italic">
                      Belum ada data institusi dalam batch arsip ini.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => (
                    <PmEntryRow
                      key={entry.id}
                      entry={entry}
                      onUpdate={handleUpdateEntry}
                      onDelete={handleDeleteEntry}
                      isLibur={entry.isSekolahLibur}
                      onManageMenu={() => setSelectedEntryForMenu(entry)}
                      onManageClasses={() => setSelectedEntryForMenu(entry)}
                      onConfirmAction={setConfirmState}
                    />
                  ))
                )}
                {/* Total Row */}
                {filteredEntries.length > 0 && (
                  <tr className="bg-[#111827] text-white text-xs font-extrabold">
                    <td className="px-3 py-3" colSpan={3}>TOTAL (YANG AKTIF)</td>
                    <td className="px-3 py-3 text-center">{grandTotals.siswa}</td>
                    <td className="px-3 py-3 text-center">{grandTotals.bumil}</td>
                    <td className="px-3 py-3 text-center">{grandTotals.guru}</td>
                    <td className="px-3 py-3 text-center">{grandTotals.pobia}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-block rounded-full bg-[#FBBF24] text-[#111827] px-3 py-0.5">
                        {grandTotals.jumlah}
                      </span>
                    </td>
                    <td className="px-3 py-3" colSpan={3}></td>
                  </tr>
                )}
              </tbody>
            </table>
            <button
              onClick={handleAddRow}
              className="w-full py-3.5 text-xs font-bold text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] border-t border-[#E5E7EB] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Institusi Baru Ke Arsip
            </button>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row justify-end items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-4 py-2.5 rounded-xl border border-amber-200 max-w-md">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Perubahan pada arsip akan memengaruhi total gizi, laporan QC, dan PO. Klik simpan untuk sinkronisasi.
              </span>
            </div>
            <button
              onClick={handleSaveChanges}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#059669] text-white text-sm font-extrabold rounded-xl hover:bg-[#047857] cursor-pointer transition-colors shadow-lg shadow-green-500/20 disabled:opacity-50 w-full sm:w-auto justify-center"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Simpan Perubahan Arsip
            </button>
          </div>
        </>
      )}

      {/* Manage Menu & Portion Modal */}
      <AnimatePresence>
        <ManageMenuModal
          isOpen={!!selectedEntryForMenu}
          onClose={() => setSelectedEntryForMenu(null)}
          entry={selectedEntryForMenu}
          onSave={handleSaveMenu}
        />

      </AnimatePresence>

      {/* Custom Confirm Dialog */}
      <AnimatePresence>
        {confirmState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 font-['Hanken_Grotesk']">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2.5 rounded-xl ${
                  confirmState.variant === 'danger'
                    ? 'bg-red-50 text-red-600'
                    : confirmState.variant === 'warning'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {confirmState.variant === 'danger' ? (
                    <Trash2 className="h-5 w-5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" />
                  )}
                </div>
                <h3 className="text-base font-extrabold text-[#111827]">
                  {confirmState.title}
                </h3>
              </div>
              <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                {confirmState.message}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmState(null)}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] text-xs font-bold text-[#6B7280] hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  disabled={saving}
                  onClick={async () => {
                    const fn = confirmState.onConfirm;
                    await fn();
                    setConfirmState(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                    confirmState.variant === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-[#FBBF24] text-[#111827] hover:bg-[#F59E0B]'
                  }`}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Menghapus...</span>
                    </>
                  ) : (
                    'Ya, Lanjutkan'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MbgArchivePage;
