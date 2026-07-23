// ============================================================================
// MBG Admin Page — Administrasi MBG: Input Data PM
// ============================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Trash2,
  Search,
  Calendar,
  CheckCircle2,
  Loader2,
  X,
  AlertTriangle,
  Sparkles,
  ChefHat,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgPmEntry, MbgInstitutionType, MbgClassBreakdown } from '@/types/mbg';
import {
  subscribeBatches,
  subscribeEntries,
  createBatch,
  updateBatchStatus,
  addEntry,
  updateEntry,
  deleteEntry,
  recalculateBatchTotals,
  copyFromBatch,
  deleteBatch,
  bulkAddEntriesFromMaster,
} from '@/services/mbgAdminService';
import { subscribeCustomRecipes } from '@/services/mbgProductionService';
import resepStandardData from '@/constants/standarResep.json';
import { MBG_BATCH_STATUS_CONFIG, MBG_MASTER_INSTITUTIONS } from '@/constants/mbgConstants';

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

// ---- New Batch Modal ----
function NewBatchModal({
  isOpen,
  onClose,
  onSubmit,
  batches,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (tanggal: string, copyFromId?: string) => void;
  batches: MbgPmBatch[];
}) {
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [copyFrom, setCopyFrom] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 font-['Hanken_Grotesk',system-ui,sans-serif]"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-extrabold text-[#111827]">Batch Baru</h3>
          <button onClick={onClose} title="Tutup Modal" aria-label="Tutup Modal" className="p-1.5 rounded-full hover:bg-gray-100 cursor-pointer">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="tanggal-pengiriman" className="block text-xs font-bold text-[#374151] mb-1.5">
              Tanggal Pengiriman
            </label>
            <input
              id="tanggal-pengiriman"
              type="date"
              title="Tanggal Pengiriman"
              placeholder="Tanggal Pengiriman"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="copy-from-select" className="block text-xs font-bold text-[#374151] mb-1.5">
              Salin dari Batch Sebelumnya (opsional)
            </label>
            <select
              id="copy-from-select"
              title="Salin dari Batch Sebelumnya"
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent"
            >
              <option value="">— Tidak menyalin —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.tanggal} ({b.totalJumlah} porsi)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] text-sm font-bold text-[#6B7280] hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Batal
          </button>
          <button
            onClick={() => {
              onSubmit(tanggal, copyFrom || undefined);
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-[#FBBF24] text-sm font-bold text-[#111827] hover:bg-[#F59E0B] cursor-pointer transition-colors"
          >
            Buat Batch
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---- PM Entry Row ----
function PmEntryRow({
  entry,
  onUpdate,
  onDelete,
  isLibur,
  onManageClasses,
  onConfirmAction,
  viewMode,
}: {
  entry: MbgPmEntry;
  onUpdate: (id: string, updates: Partial<MbgPmEntry>) => void;
  onDelete: (id: string) => void;
  isLibur: boolean;
  onManageClasses: () => void;
  onConfirmAction: (config: {
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }) => void;
  viewMode: 'ringkas' | 'rinci';
}) {
  const isPosyandu = entry.institutionType === 'posyandu';
  const hasClasses = entry.classesBreakdown && entry.classesBreakdown.length > 0;

  const handleSelectMaster = (name: string) => {
    const master = MBG_MASTER_INSTITUTIONS.find((m) => m.institutionName === name);
    if (master) {
      const jumlah = (master.qtSiswaBalita || 0) + (master.qtBumilBusui || 0) + (master.qtGuruKader || 0);
      const qtAlergi = master.qtAlergi || 0;
      const qtTidakAlergi = master.qtTidakAlergi ?? Math.max(0, jumlah - qtAlergi);
      onUpdate(entry.id, {
        institutionName: master.institutionName,
        institutionType: master.institutionType,
        schoolLevel: master.schoolLevel,
        qtSiswaBalita: master.qtSiswaBalita,
        qtBumilBusui: master.qtBumilBusui,
        qtBumil: master.qtBumil || 0,
        qtBusui: master.qtBusui || 0,
        qtGuruKader: master.qtGuruKader,
        qtPobiaNasi: master.qtPobiaNasi || 0,
        qtAlergi,
        qtTidakAlergi,
        keteranganAlergi: master.keteranganAlergi || '',
        qtPorsiBalita: master.qtPorsiBalita || 0,
        qtPorsiKecil: master.qtPorsiKecil || 0,
        qtPorsiBesar: master.qtPorsiBesar || 0,
        qtPorsiBumilBusui: master.qtPorsiBumilBusui || 0,
        qtPorsiKecilL: master.qtPorsiKecilL || 0,
        qtPorsiKecilP: master.qtPorsiKecilP || 0,
        qtPorsiBesarL: master.qtPorsiBesarL || 0,
        qtPorsiBesarP: master.qtPorsiBesarP || 0,
        qtGuruL: master.qtGuruL || 0,
        qtGuruP: master.qtGuruP || 0,
        qtTendikL: master.qtTendikL || 0,
        qtTendikP: master.qtTendikP || 0,
        jumlah,
        jadwalPengantaran: master.jadwalPengantaran || '06.00-08.30',
      });
    } else {
      handleFieldChange('institutionName', name);
    }
  };

  const handleFieldChange = (field: keyof MbgPmEntry, value: string | number | boolean) => {
    const updates: Partial<MbgPmEntry> = { [field]: value };
    const tempEntry = { ...entry, [field]: value };

    // Auto-update qtBumilBusui if we changed qtBumil or qtBusui
    if (field === 'qtBumil' || field === 'qtBusui') {
      const b = field === 'qtBumil' ? (value as number) : (entry.qtBumil || 0);
      const s = field === 'qtBusui' ? (value as number) : (entry.qtBusui || 0);
      updates.qtBumil = field === 'qtBumil' ? (value as number) : (entry.qtBumil || 0);
      updates.qtBusui = field === 'qtBusui' ? (value as number) : (entry.qtBusui || 0);
      updates.qtBumilBusui = b + s;
      updates.qtPorsiBumilBusui = b + s;
      tempEntry.qtBumil = updates.qtBumil;
      tempEntry.qtBusui = updates.qtBusui;
      tempEntry.qtBumilBusui = b + s;
      tempEntry.qtPorsiBumilBusui = b + s;
    }

    // Auto-update qtSiswaBalita if directly edited (e.g. for Posyandu Porsi Balita)
    if (field === 'qtSiswaBalita') {
      const val = value as number;
      updates.qtSiswaBalita = val;
      updates.qtPorsiBalita = val;
      updates.qtPorsiKecil = val;
      tempEntry.qtSiswaBalita = val;
      tempEntry.qtPorsiBalita = val;
      tempEntry.qtPorsiKecil = val;
    }

    // Auto-update qtSiswaBalita if we changed any Porsi L/P
    if (['qtPorsiKecilL', 'qtPorsiKecilP', 'qtPorsiBesarL', 'qtPorsiBesarP'].includes(field)) {
      const pkl = field === 'qtPorsiKecilL' ? (value as number) : (entry.qtPorsiKecilL || 0);
      const pkp = field === 'qtPorsiKecilP' ? (value as number) : (entry.qtPorsiKecilP || 0);
      const pbl = field === 'qtPorsiBesarL' ? (value as number) : (entry.qtPorsiBesarL || 0);
      const pbp = field === 'qtPorsiBesarP' ? (value as number) : (entry.qtPorsiBesarP || 0);

      const newSiswa = pkl + pkp + pbl + pbp;
      updates.qtSiswaBalita = newSiswa;
      updates.qtPorsiKecil = pkl + pkp;
      updates.qtPorsiBesar = pbl + pbp;
      tempEntry.qtSiswaBalita = newSiswa;
      tempEntry.qtPorsiKecil = pkl + pkp;
      tempEntry.qtPorsiBesar = pbl + pbp;
    }

    // Auto-update qtGuruKader if we changed any Guru/Tendik L/P
    if (['qtGuruL', 'qtGuruP', 'qtTendikL', 'qtTendikP'].includes(field)) {
      const gl = field === 'qtGuruL' ? (value as number) : (entry.qtGuruL || 0);
      const gp = field === 'qtGuruP' ? (value as number) : (entry.qtGuruP || 0);
      const tl = field === 'qtTendikL' ? (value as number) : (entry.qtTendikL || 0);
      const tp = field === 'qtTendikP' ? (value as number) : (entry.qtTendikP || 0);

      const newGuruKader = gl + gp + tl + tp;
      updates.qtGuruKader = newGuruKader;
      tempEntry.qtGuruKader = newGuruKader;
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

    const newJumlah = calcJumlah(tempEntry);
    updates.jumlah = newJumlah;

    // Recalculate qtTidakAlergi
    const alergi = (field === 'qtAlergi' ? (value as number) : entry.qtAlergi) || 0;
    updates.qtTidakAlergi = Math.max(0, newJumlah - alergi);

    onUpdate(entry.id, updates);
  };

  const isMasterSelected = MBG_MASTER_INSTITUTIONS.some((m) => m.institutionName === entry.institutionName);

  return (
    <tr
      className={`
        border-b border-[#F3F4F6] transition-colors text-xs
        ${isLibur ? 'bg-red-50 opacity-60' : 'hover:bg-[#FAFAFA]'}
        ${entry.qtPobiaNasi > 0 ? 'bg-amber-50/50' : ''}
        ${(entry.qtAlergi || 0) > 0 ? 'bg-red-50/30' : ''}
      `}
    >
      {/* Institusi */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <select
            value={isMasterSelected ? entry.institutionName : entry.institutionName ? '_custom_' : ''}
            onChange={(e) => {
              if (e.target.value === '_custom_') {
                if (!entry.institutionName) {
                  handleFieldChange('institutionName', 'Institusi Baru');
                }
              } else {
                handleSelectMaster(e.target.value);
              }
            }}
            title="Pilih Institusi Master"
            className="w-full rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-xs font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent bg-white cursor-pointer shadow-sm"
          >
            <option value="">— Pilih Master Institusi —</option>
            {MBG_MASTER_INSTITUTIONS.map((inst) => (
              <option key={inst.institutionName} value={inst.institutionName}>
                {inst.institutionName}
              </option>
            ))}
            <option value="_custom_">✍️ Input Manual Custom...</option>
          </select>

          {(!isMasterSelected || entry.institutionName === '') && (
            <input
              type="text"
              value={entry.institutionName}
              onChange={(e) => handleFieldChange('institutionName', e.target.value)}
              placeholder="Nama Institusi Custom"
              className="w-full rounded-lg border border-[#E5E7EB] px-2 py-1 text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
            />
          )}
        </div>
      </td>

      {/* Tipe */}
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

      {viewMode === 'rinci' ? (
        <>
          {/* Porsi Posyandu (Balita, Bumil, Busui) ATAU Sekolah (Porsi Kecil & Porsi Besar L/P) */}
          {isPosyandu ? (
            <>
              {/* Porsi Balita */}
              <td colSpan={2} className="px-2 py-2 text-center bg-amber-50/40 border-r border-[#E5E7EB]">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-extrabold text-amber-800 mb-0.5 uppercase tracking-tight">Porsi Balita</span>
                  <input
                    type="number"
                    min={0}
                    value={entry.qtSiswaBalita || ''}
                    onChange={(e) => handleFieldChange('qtSiswaBalita', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-14 rounded-lg border border-amber-300 bg-white px-1 py-1 text-xs text-center font-extrabold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </td>

              {/* Porsi Bumil */}
              <td className="px-1.5 py-2 text-center bg-orange-50/40">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-extrabold text-orange-800 mb-0.5 uppercase tracking-tight">Porsi Bumil</span>
                  <input
                    type="number"
                    min={0}
                    value={entry.qtBumil || ''}
                    onChange={(e) => handleFieldChange('qtBumil', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-12 rounded-lg border border-orange-300 bg-white px-1 py-1 text-xs text-center font-extrabold text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </td>

              {/* Porsi Busui */}
              <td className="px-1.5 py-2 text-center bg-purple-50/40 border-r border-[#E5E7EB]">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-extrabold text-purple-800 mb-0.5 uppercase tracking-tight">Porsi Busui</span>
                  <input
                    type="number"
                    min={0}
                    value={entry.qtBusui || ''}
                    onChange={(e) => handleFieldChange('qtBusui', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-12 rounded-lg border border-purple-300 bg-white px-1 py-1 text-xs text-center font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </td>
            </>
          ) : (
            <>
              {/* Porsi Kecil L & P */}
              <td className="px-1.5 py-2.5 text-center bg-amber-50/20">
                <input
                  type="number"
                  min={0}
                  value={entry.qtPorsiKecilL || ''}
                  onChange={(e) => handleFieldChange('qtPorsiKecilL', parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-10 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </td>
              <td className="px-1.5 py-2.5 text-center bg-amber-50/20 border-r border-[#E5E7EB]">
                <input
                  type="number"
                  min={0}
                  value={entry.qtPorsiKecilP || ''}
                  onChange={(e) => handleFieldChange('qtPorsiKecilP', parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-10 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </td>

              {/* Porsi Besar L & P */}
              <td className="px-1.5 py-2.5 text-center bg-blue-50/20">
                <input
                  type="number"
                  min={0}
                  value={entry.qtPorsiBesarL || ''}
                  onChange={(e) => handleFieldChange('qtPorsiBesarL', parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-10 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </td>
              <td className="px-1.5 py-2.5 text-center bg-blue-50/20 border-r border-[#E5E7EB]">
                <input
                  type="number"
                  min={0}
                  value={entry.qtPorsiBesarP || ''}
                  onChange={(e) => handleFieldChange('qtPorsiBesarP', parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-10 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </td>
            </>
          )}

          {/* Total Siswa / Balita / Ibu */}
          <td className="px-2 py-2.5 text-center bg-indigo-50/30 border-r border-[#E5E7EB]">
            <span className="inline-block min-w-[36px] rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-1 text-xs font-black text-indigo-700">
              {(entry.qtSiswaBalita || 0) + (isPosyandu ? (entry.qtBumilBusui || 0) : 0)}
            </span>
          </td>

          {/* Guru L & P */}
          <td className="px-1.5 py-2.5 text-center bg-emerald-50/20">
            <input
              type="number"
              min={0}
              value={entry.qtGuruL || ''}
              onChange={(e) => handleFieldChange('qtGuruL', parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-10 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </td>
          <td className="px-1.5 py-2.5 text-center bg-emerald-50/20 border-r border-[#E5E7EB]">
            <input
              type="number"
              min={0}
              value={entry.qtGuruP || ''}
              onChange={(e) => handleFieldChange('qtGuruP', parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-10 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </td>

          {/* Tendik L & P */}
          <td className="px-1.5 py-2.5 text-center bg-teal-50/20">
            <input
              type="number"
              min={0}
              value={entry.qtTendikL || ''}
              onChange={(e) => handleFieldChange('qtTendikL', parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-10 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </td>
          <td className="px-1.5 py-2.5 text-center bg-teal-50/20 border-r border-[#E5E7EB]">
            <input
              type="number"
              min={0}
              value={entry.qtTendikP || ''}
              onChange={(e) => handleFieldChange('qtTendikP', parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-10 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </td>

          {/* Total Guru & Tendik */}
          <td className="px-2 py-2.5 text-center bg-emerald-100/30 border-r border-[#E5E7EB]">
            <span className="inline-block min-w-[36px] rounded-lg bg-emerald-100 border border-emerald-300 px-2 py-1 text-xs font-black text-emerald-800">
              {entry.qtGuruKader || 0}
            </span>
          </td>
        </>
      ) : (
        <>
          {/* QT Siswa/Balita */}
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

          {/* QT Guru/Kader */}
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

          {/* Pobia Nasi */}
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
        </>
      )}

      {/* Alergi */}
      <td className="px-2 py-2.5">
        <div className="flex flex-col gap-1 items-center min-w-[70px]">
          <input
            type="number"
            min={0}
            value={entry.qtAlergi ?? 0}
            onChange={(e) => {
              const alergiVal = parseInt(e.target.value) || 0;
              const totalVal = entry.jumlah || 0;
              onUpdate(entry.id, {
                qtAlergi: alergiVal,
                qtTidakAlergi: Math.max(0, totalVal - alergiVal),
              });
            }}
            placeholder="0"
            className="w-12 rounded-lg border border-red-200 bg-red-50/50 px-1.5 py-1 text-xs text-center font-bold text-red-600 focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          {(entry.qtAlergi || 0) > 0 && (
            <input
              type="text"
              value={entry.keteranganAlergi || ''}
              onChange={(e) => onUpdate(entry.id, { keteranganAlergi: e.target.value })}
              placeholder="Rincian alergi"
              title="Ket. Alergi (mis. 2 Telur, 1 Udang)"
              className="w-full text-[10px] border border-red-200 rounded px-1 py-0.5 text-red-700 bg-red-50 focus:outline-none"
            />
          )}
        </div>
      </td>

      {/* Tidak Alergi */}
      <td className="px-2 py-2.5 text-center">
        <span className="inline-block min-w-[36px] rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700">
          {entry.qtTidakAlergi ?? Math.max(0, (entry.jumlah || 0) - (entry.qtAlergi || 0))}
        </span>
      </td>

      {/* Jumlah (auto) */}
      <td className="px-3 py-2.5 text-center">
        <span className="inline-block min-w-[40px] rounded-full bg-[#FBBF24]/20 px-3 py-1 text-xs font-extrabold text-[#92400E]">
          {entry.jumlah}
        </span>
      </td>

      {/* Jadwal Pengantaran */}
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

      {/* Flags & Actions */}
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
// Main Page Component
// ============================================================================
export function MbgAdminPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [selectedEntryForMenu, setSelectedEntryForMenu] = useState<MbgPmEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'ringkas' | 'rinci'>('rinci');
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  } | null>(null);

  // Subscribe to batches and auto-create today's batch
  useEffect(() => {
    const unsub = subscribeBatches(
      async (b) => {
        // Only show DRAFT batches on the active input page
        const draftBatches = b.filter((batch) => batch.status === 'DRAFT');
        setBatches(draftBatches);
        setLoadingBatches(false);
        
        const todayStr = new Date().toISOString().split('T')[0];
        const todayBatch = draftBatches.find((batch) => batch.tanggal === todayStr);
        
        if (todayBatch) {
          setSelectedBatchId((current) => current || todayBatch.id);
        } else if (user) {
          // Check if today's batch exists in the master list at all (including submitted)
          const anyTodayBatch = b.find((batch) => batch.tanggal === todayStr);
          if (!anyTodayBatch) {
            try {
              const newId = await createBatch(todayStr, user.uid);
              setSelectedBatchId(newId);
            } catch (err) {
              console.error('Failed to auto-create batch for today:', err);
            }
          }
        } else if (draftBatches.length > 0) {
          setSelectedBatchId((current) => current || draftBatches[0].id);
        }
      },
      (err) => {
        console.error('Error loading batches:', err);
        setLoadingBatches(false);
      }
    );
    return unsub;
  }, [user]);

  // Subscribe to entries when batch is selected
  useEffect(() => {
    if (!selectedBatchId) {
      setEntries([]);
      return;
    }
    setLoadingEntries(true);
    const unsub = subscribeEntries(
      selectedBatchId,
      (e) => {
        setEntries(e);
        setLoadingEntries(false);
      },
      (err) => {
        console.error('Error loading entries:', err);
        setLoadingEntries(false);
      }
    );
    return unsub;
  }, [selectedBatchId]);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);

  // Filter entries based on search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.institutionName.toLowerCase().includes(q) ||
        (e.assignedPetugasName || '').toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  // Grand totals
  const grandTotals = useMemo(() => {
    const active = entries.filter((e) => !e.isSekolahLibur);
    const petugasSet = new Set<string>();
    active.forEach((e) => {
      if (e.assignedPetugasName) petugasSet.add(e.assignedPetugasName.trim());
    });
    return {
      siswa: active.reduce((s, e) => s + (e.qtSiswaBalita || 0), 0),
      bumil: active.reduce((s, e) => s + (e.qtBumilBusui || 0), 0),
      guru: active.reduce((s, e) => s + (e.qtGuruKader || 0), 0),
      pobia: active.reduce((s, e) => s + (e.qtPobiaNasi || 0), 0),
      alergi: active.reduce((s, e) => s + (e.qtAlergi || 0), 0),
      tidakAlergi: active.reduce((s, e) => s + (e.qtTidakAlergi ?? Math.max(0, (e.jumlah || 0) - (e.qtAlergi || 0))), 0),
      jumlah: active.reduce((s, e) => s + (e.jumlah || 0), 0),
      
      // Detailed L/P breakdown
      porsiKecilL: active.reduce((s, e) => s + (e.qtPorsiKecilL || 0), 0),
      porsiKecilP: active.reduce((s, e) => s + (e.qtPorsiKecilP || 0), 0),
      porsiBesarL: active.reduce((s, e) => s + (e.qtPorsiBesarL || 0), 0),
      porsiBesarP: active.reduce((s, e) => s + (e.qtPorsiBesarP || 0), 0),
      guruL: active.reduce((s, e) => s + (e.qtGuruL || 0), 0),
      guruP: active.reduce((s, e) => s + (e.qtGuruP || 0), 0),
      tendikL: active.reduce((s, e) => s + (e.qtTendikL || 0), 0),
      tendikP: active.reduce((s, e) => s + (e.qtTendikP || 0), 0),
      totalGuruTendik: active.reduce((s, e) => s + (e.qtGuruL || 0) + (e.qtGuruP || 0) + (e.qtTendikL || 0) + (e.qtTendikP || 0), 0),

      totalInstitusi: entries.length,
      totalPetugas: petugasSet.size,
    };
  }, [entries]);

  const handleLoadMasterData = async () => {
    if (!selectedBatchId || !user) return;
    setSaving(true);
    try {
      await bulkAddEntriesFromMaster(selectedBatchId, user.uid);
      await recalculateBatchTotals(selectedBatchId);
      showToast({ message: 'Berhasil memuat 27 institusi dari Master Data!', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal memuat master data institusi', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ---- Handlers ----
  const handleCreateBatch = async (tanggal: string, copyFromId?: string) => {
    if (!user) return;
    try {
      const newId = await createBatch(tanggal, user.uid);
      if (copyFromId) {
        await copyFromBatch(copyFromId, newId, user.uid);
      }
      setSelectedBatchId(newId);
      showToast({ message: 'Batch baru berhasil dibuat!', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal membuat batch', variant: 'error' });
    }
  };

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
        const sortOrder = entries.length;
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
    [selectedBatchId, entries.length, user, showToast]
  );

  const handleSubmitBatch = () => {
    if (!selectedBatchId || !selectedBatch) return;

    setConfirmState({
      title: 'Submit Data PM',
      message: `Apakah Anda yakin ingin men-submit seluruh data PM untuk tanggal ${selectedBatch.tanggal}? Setelah disubmit, data tidak dapat diubah lagi di halaman Administrasi dan akan diteruskan ke departemen Purchasing.`,
      variant: 'warning',
      onConfirm: async () => {
        setSaving(true);
        try {
          await recalculateBatchTotals(selectedBatchId);
          await updateBatchStatus(selectedBatchId, 'PM_SUBMITTED');
          showToast({ message: 'Data PM berhasil disubmit!', variant: 'success' });
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal submit data', variant: 'error' });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const handleDeleteBatch = async () => {
    if (!selectedBatchId || !selectedBatch) return;
    const confirmText = `Apakah Anda yakin ingin menghapus seluruh data batch untuk tanggal ${selectedBatch.tanggal}? Tindakan ini tidak dapat dibatalkan.`;
    if (!window.confirm(confirmText)) return;

    setSaving(true);
    try {
      await deleteBatch(selectedBatchId);
      showToast({ message: 'Batch berhasil dihapus!', variant: 'success' });
      setSelectedBatchId(null);
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal menghapus batch', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMenu = async (
    entryId: string,
    menuItems: string[],
    menuKeringanItems: string[],
    address?: string,
    classes?: MbgClassBreakdown[]
  ) => {
    try {
      const entry = entries.find((e) => e.id === entryId);
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

  // ---- Render ----
  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">
          Administrasi MBG
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Input data PM (Penanggung Jawab Makanan) per institusi
        </p>
      </div>

      {/* Batch Selector */}
      {loadingBatches ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
        </div>
      ) : batches.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-[#6B7280]">Belum ada batch</p>
          <p className="text-xs text-[#9CA3AF] mt-1 mb-4">Buat batch baru untuk mulai input data PM</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setShowNewBatchModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FBBF24] text-[#111827] text-sm font-extrabold rounded-xl hover:bg-[#F59E0B] cursor-pointer transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Batch Baru
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Dropdown Selector Card */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 mb-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 rounded-xl text-amber-500">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tanggal Pengiriman</span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedBatchId || ''}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    title="Pilih Tanggal Pengiriman"
                    aria-label="Pilih Tanggal Pengiriman"
                    className="text-sm font-extrabold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] rounded-lg border border-[#E5E7EB] px-3 py-1.5 bg-gray-50 cursor-pointer min-w-[180px]"
                  >
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.tanggal}
                      </option>
                    ))}
                  </select>
                  {selectedBatch && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#92400E]">
                      {MBG_BATCH_STATUS_CONFIG[selectedBatch.status]?.label || selectedBatch.status}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {selectedBatchId && selectedBatch?.status === 'DRAFT' && (
                <button
                  onClick={handleLoadMasterData}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                  title="Muat otomatis 27 institusi dari Master Data"
                >
                  <Sparkles className="h-4 w-4" />
                  ⚡ Load 27 Master Institusi
                </button>
              )}

              <button
                onClick={() => setShowNewBatchModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FBBF24] text-[#111827] text-xs font-extrabold rounded-xl hover:bg-[#F59E0B] cursor-pointer transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Batch Baru
              </button>

              {selectedBatchId && (
                <button
                  onClick={handleDeleteBatch}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-red-200 hover:border-red-300 text-red-600 text-xs font-extrabold rounded-xl hover:bg-red-50 cursor-pointer transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus Batch
                </button>
              )}
            </div>
          </div>

          {/* Search & View Mode Switcher */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari institusi atau petugas..."
                className="w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-4 py-2.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>

            <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200 shadow-inner">
              <button
                onClick={() => setViewMode('rinci')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  viewMode === 'rinci'
                    ? 'bg-[#FBBF24] text-[#111827] shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                📊 Mode Rinci (L/P & Tendik)
              </button>
              <button
                onClick={() => setViewMode('ringkas')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  viewMode === 'ringkas'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                📋 Mode Ringkas
              </button>
            </div>
          </div>

          {/* Single Unified Table */}
          {loadingEntries ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border border-[#E5E7EB] rounded-xl bg-white shadow-sm">
                <table className="w-full text-left font-['Hanken_Grotesk',system-ui,sans-serif] min-w-[760px]">
                  <thead>
                    {viewMode === 'rinci' ? (
                      <>
                        <tr className="bg-[#FEF3C7] text-[#92400E] text-[11px] font-extrabold uppercase tracking-wider border-b border-[#FDE68A]">
                          <th rowSpan={2} className="px-3 py-2 text-left min-w-[140px] align-middle">Institusi</th>
                          <th rowSpan={2} className="px-2 py-2 text-center min-w-[90px] align-middle">Tipe</th>
                          <th colSpan={2} className="px-2 py-1.5 text-center bg-amber-100/70 border-x border-[#FDE68A] text-amber-900">Porsi Kecil / Balita</th>
                          <th colSpan={2} className="px-2 py-1.5 text-center bg-blue-100/70 border-r border-[#FDE68A] text-blue-900">Porsi Besar / Bumil & Busui</th>
                          <th rowSpan={2} className="px-3 py-2 text-center bg-indigo-100/60 border-r border-[#FDE68A] text-indigo-900 align-middle">Total Siswa / Balita / Ibu</th>
                          <th colSpan={2} className="px-2 py-1.5 text-center bg-emerald-100/70 border-r border-[#FDE68A] text-emerald-900">Guru</th>
                          <th colSpan={2} className="px-2 py-1.5 text-center bg-teal-100/70 border-r border-[#FDE68A] text-teal-900">Tendik</th>
                          <th rowSpan={2} className="px-3 py-2 text-center bg-emerald-200/50 border-r border-[#FDE68A] text-emerald-950 align-middle">Total Guru/Tendik</th>
                          <th rowSpan={2} className="px-2 py-2 text-center text-red-600 align-middle">Alergi</th>
                          <th rowSpan={2} className="px-2 py-2 text-center text-emerald-700 align-middle">Tidak Alergi</th>
                          <th rowSpan={2} className="px-3 py-2 text-center bg-amber-200/60 text-amber-950 align-middle">Total Porsi</th>
                          <th rowSpan={2} className="px-3 py-2 text-center align-middle">Jadwal</th>
                          <th rowSpan={2} className="px-3 py-2 align-middle"></th>
                        </tr>
                        <tr className="bg-[#FFFBEB] text-[#78350F] text-[10px] font-extrabold text-center border-b border-[#E5E7EB]">
                          <th className="px-1.5 py-1 border-r border-[#FDE68A] bg-amber-50/50 text-amber-800">L</th>
                          <th className="px-1.5 py-1 border-r border-[#FDE68A] bg-amber-50/50 text-amber-800">P</th>
                          <th className="px-1.5 py-1 border-r border-[#FDE68A] bg-blue-50/50 text-blue-800">L</th>
                          <th className="px-1.5 py-1 border-r border-[#FDE68A] bg-blue-50/50 text-blue-800">P</th>
                          <th className="px-1.5 py-1 border-r border-[#FDE68A] bg-emerald-50/50 text-emerald-800">L</th>
                          <th className="px-1.5 py-1 border-r border-[#FDE68A] bg-emerald-50/50 text-emerald-800">P</th>
                          <th className="px-1.5 py-1 border-r border-[#FDE68A] bg-teal-50/50 text-teal-800">L</th>
                          <th className="px-1.5 py-1 border-r border-[#FDE68A] bg-teal-50/50 text-teal-800">P</th>
                        </tr>
                      </>
                    ) : (
                      <tr className="bg-[#FEF3C7] text-[10px] font-extrabold text-[#92400E] uppercase tracking-wider">
                        <th className="px-3 py-3 whitespace-nowrap">Institusi</th>
                        <th className="px-3 py-3 whitespace-nowrap">Tipe</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">QT Siswa / Balita</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">QT Bumil / Busui</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">QT Guru / Kader</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Pobia Nasi</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap text-red-600">Alergi</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap text-emerald-700">Tidak Alergi</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Jumlah</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap">Jadwal Pengantaran</th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={viewMode === 'rinci' ? 16 : 11} className="px-4 py-8 text-center text-xs font-semibold text-gray-400 italic">
                          Belum ada data institusi. Klik "⚡ Load 27 Master Institusi" di atas atau "Tambah Institusi Baru" di bawah.
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
                          onManageClasses={() => setSelectedEntryForMenu(entry)}
                          onConfirmAction={setConfirmState}
                          viewMode={viewMode}
                        />
                      ))
                    )}
                    {/* Total Row */}
                    {filteredEntries.length > 0 && (
                      viewMode === 'rinci' ? (
                        <tr className="bg-[#111827] text-white text-xs font-extrabold">
                          <td className="px-3 py-3" colSpan={2}>TOTAL (REKAPITULASI)</td>
                          <td className="px-1.5 py-3 text-center text-amber-300 font-bold">{grandTotals.porsiKecilL}</td>
                          <td className="px-1.5 py-3 text-center text-amber-300 font-bold">{grandTotals.porsiKecilP}</td>
                          <td className="px-1.5 py-3 text-center text-blue-300 font-bold">{grandTotals.porsiBesarL}</td>
                          <td className="px-1.5 py-3 text-center text-blue-300 font-bold">{grandTotals.porsiBesarP}</td>
                          <td className="px-3 py-3 text-center text-indigo-300 font-black text-sm">{grandTotals.siswa}</td>
                          <td className="px-1.5 py-3 text-center text-emerald-300 font-bold">{grandTotals.guruL}</td>
                          <td className="px-1.5 py-3 text-center text-emerald-300 font-bold">{grandTotals.guruP}</td>
                          <td className="px-1.5 py-3 text-center text-teal-300 font-bold">{grandTotals.tendikL}</td>
                          <td className="px-1.5 py-3 text-center text-teal-300 font-bold">{grandTotals.tendikP}</td>
                          <td className="px-3 py-3 text-center text-emerald-300 font-black text-sm">{grandTotals.totalGuruTendik}</td>
                          <td className="px-2 py-3 text-center text-red-400 font-extrabold">{grandTotals.alergi}</td>
                          <td className="px-2 py-3 text-center text-emerald-400 font-extrabold">{grandTotals.tidakAlergi}</td>
                          <td className="px-3 py-3 text-center">
                            <span className="inline-block rounded-full bg-[#FBBF24] text-[#111827] px-3 py-1 text-xs font-black">
                              {grandTotals.jumlah}
                            </span>
                          </td>
                          <td className="px-3 py-3" colSpan={2}></td>
                        </tr>
                      ) : (
                        <tr className="bg-[#111827] text-white text-xs font-extrabold">
                          <td className="px-3 py-3" colSpan={2}>TOTAL (YANG AKTIF)</td>
                          <td className="px-3 py-3 text-center">{grandTotals.siswa}</td>
                          <td className="px-3 py-3 text-center">{grandTotals.bumil}</td>
                          <td className="px-3 py-3 text-center">{grandTotals.guru}</td>
                          <td className="px-3 py-3 text-center">{grandTotals.pobia}</td>
                          <td className="px-3 py-3 text-center text-red-400 font-extrabold">{grandTotals.alergi}</td>
                          <td className="px-3 py-3 text-center text-emerald-400 font-extrabold">{grandTotals.tidakAlergi}</td>
                          <td className="px-3 py-3 text-center">
                            <span className="inline-block rounded-full bg-[#FBBF24] text-[#111827] px-3 py-0.5">
                              {grandTotals.jumlah}
                            </span>
                          </td>
                          <td className="px-3 py-3" colSpan={2}></td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
                <button
                  onClick={handleAddRow}
                  className="w-full py-3.5 text-xs font-bold text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] border-t border-[#E5E7EB] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Institusi Baru
                </button>
              </div>

              {/* Submit Button */}
              {selectedBatch && selectedBatch.status === 'DRAFT' && entries.length > 0 && (
                <div className="mt-8 flex justify-end">
                  <button
                    onClick={handleSubmitBatch}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#059669] text-white text-sm font-extrabold rounded-xl hover:bg-[#047857] cursor-pointer transition-colors shadow-lg shadow-green-500/20 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Submit Data PM
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* New Batch Modal */}
      <AnimatePresence>
        <NewBatchModal
          isOpen={showNewBatchModal}
          onClose={() => setShowNewBatchModal(false)}
          onSubmit={handleCreateBatch}
          batches={batches}
        />
      </AnimatePresence>

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
                  className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] text-xs font-bold text-[#6B7280] hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    confirmState.onConfirm();
                    setConfirmState(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer ${
                    confirmState.variant === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-[#FBBF24] text-[#111827] hover:bg-[#F59E0B]'
                  }`}
                >
                  Ya, Lanjutkan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Manage Menu & Portion Modal ----
export function ManageMenuModal({
  isOpen,
  onClose,
  entry,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  entry: MbgPmEntry | null;
  onSave: (
    entryId: string,
    menuItems: string[],
    menuKeringanItems: string[],
    address?: string,
    classes?: MbgClassBreakdown[]
  ) => Promise<void>;
}) {
  const [menuItems, setMenuItems] = useState<string[]>([]);
  const [menuKeringanItems, setMenuKeringanItems] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [newRegItem, setNewRegItem] = useState('');
  const [newKerItem, setNewKerItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<MbgClassBreakdown[]>([]);
  const [isRegManual, setIsRegManual] = useState(false);
  const [isKerManual, setIsKerManual] = useState(false);
  
  const [customRecipes, setCustomRecipes] = useState<{ namaMenu: string; jenisMenu: string }[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeCustomRecipes((recipes) => {
      setCustomRecipes(recipes as unknown as { namaMenu: string; jenisMenu: string }[]);
    });
    return unsub;
  }, [isOpen]);

  const combinedRecipes = useMemo(() => {
    const map = new Map<string, { namaMenu: string; jenisMenu: string }>();
    const standard = resepStandardData as unknown as { namaMenu: string; jenisMenu: string }[];
    standard.forEach((item) => {
      map.set(item.namaMenu.toLowerCase().trim(), item);
    });
    customRecipes.forEach((item) => {
      map.set(item.namaMenu.toLowerCase().trim(), item);
    });
    return Array.from(map.values()).sort((a, b) => a.namaMenu.localeCompare(b.namaMenu));
  }, [customRecipes]);

  const groupedRecipes = useMemo(() => {
    const groups: Record<string, { namaMenu: string; jenisMenu: string }[]> = {};
    combinedRecipes.forEach((recipe) => {
      const cat = recipe.jenisMenu || 'Lain-lain';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(recipe);
    });
    return groups;
  }, [combinedRecipes]);

  useEffect(() => {
    if (entry) {
      setMenuItems(entry.menuItems || []);
      setMenuKeringanItems(entry.menuKeringanItems || []);
      setAddress(entry.address || '');

      const initialClasses = (entry.classesBreakdown || []).map((c) => {
        const type = c.portionType || (c.qtPorsiBesar && c.qtPorsiBesar > 0 ? 'besar' : 'kecil');
        return {
          ...c,
          portionType: type as 'balita' | 'kecil' | 'besar' | 'ibu',
        };
      });
      setClasses(initialClasses);
    }
  }, [entry]);

  if (!isOpen || !entry) return null;

  const isSekolah = entry.institutionType === 'sekolah';
  const hasClassesBreakdown = isSekolah && classes.length > 0;

  const displayPorsiBalita = hasClassesBreakdown
    ? classes.reduce((sum, c) => sum + (c.qtPorsiBalita || 0), 0)
    : (entry.qtPorsiBalita || 0);

  const displayPorsiKecil = hasClassesBreakdown
    ? classes.reduce((sum, c) => sum + (c.qtPorsiKecil || 0), 0)
    : (entry.qtPorsiKecil || 0);

  const displayPorsiBesar = hasClassesBreakdown
    ? classes.reduce((sum, c) => sum + (c.qtPorsiBesar || 0), 0) + (entry.qtGuruKader || 0)
    : (entry.qtPorsiBesar || 0);

  const displayPorsiBumilBusui = hasClassesBreakdown
    ? classes.reduce((sum, c) => sum + (c.qtPorsiBumilBusui || 0), 0)
    : (entry.qtPorsiBumilBusui || 0);

  const handleAddReg = () => {
    if (!newRegItem.trim()) return;
    if (menuItems.includes(newRegItem.trim())) return;
    setMenuItems([...menuItems, newRegItem.trim()]);
    setNewRegItem('');
    setIsRegManual(false);
  };

  const handleAddKer = () => {
    if (!newKerItem.trim()) return;
    if (menuKeringanItems.includes(newKerItem.trim())) return;
    setMenuKeringanItems([...menuKeringanItems, newKerItem.trim()]);
    setNewKerItem('');
    setIsKerManual(false);
  };

  const handleRemoveReg = (item: string) => {
    setMenuItems(menuItems.filter((i) => i !== item));
  };

  const handleRemoveKer = (item: string) => {
    setMenuKeringanItems(menuKeringanItems.filter((i) => i !== item));
  };

  const handleAddClass = () => {
    const newClass: MbgClassBreakdown = {
      id: Math.random().toString(36).substring(2, 9),
      className: '',
      totalSiswa: 0,
      qtPobiaNasi: 0,
      portionType: 'kecil',
      qtPorsiBalita: 0,
      qtPorsiKecil: 0,
      qtPorsiBesar: 0,
      qtPorsiBumilBusui: 0,
      jumlah: 0,
      menuItems: [],
      menuKeringanItems: [],
      jadwalPengantaran: '',
    };
    setClasses([...classes, newClass]);
  };

  const handleRemoveClass = (id: string) => {
    setClasses(classes.filter((c) => c.id !== id));
  };

  const handleClassChange = (id: string, field: keyof MbgClassBreakdown, value: unknown) => {
    setClasses(
      classes.map((c) => {
        if (c.id === id) {
          const updated = { ...c, [field]: value };

          if (field === 'totalSiswa' || field === 'portionType') {
            const total = field === 'totalSiswa' ? (value as number) : (c.totalSiswa || 0);
            const pType = field === 'portionType' ? (value as 'balita' | 'kecil' | 'besar' | 'ibu') : (updated.portionType || 'kecil');

            // Reset portions
            updated.qtPorsiBalita = 0;
            updated.qtPorsiKecil = 0;
            updated.qtPorsiBesar = 0;
            updated.qtPorsiBumilBusui = 0;

            if (pType === 'balita') {
              updated.qtPorsiBalita = total;
            } else if (pType === 'kecil') {
              updated.qtPorsiKecil = total;
            } else if (pType === 'besar') {
              updated.qtPorsiBesar = total;
            } else if (pType === 'ibu') {
              updated.qtPorsiBumilBusui = total;
            }
            updated.jumlah = total;
            updated.portionType = pType;
          }
          return updated;
        }
        return c;
      })
    );
  };

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const getJadwalParts = (jadwalStr?: string) => {
    const val = jadwalStr || '';
    const match = val.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})\s*WIB$/);
    if (match) {
      return { dateVal: match[1], hourVal: match[2], minuteVal: match[3] };
    }
    const datePart = val.split(' ')[0] || '';
    const dateVal = datePart.match(/^\d{4}-\d{2}-\d{2}$/) ? datePart : '';
    const timePart = val.split(' ')[1] || '';
    const timeParts = timePart.split(':');
    const hourVal = (timeParts[0] && timeParts[0].length === 2) ? timeParts[0] : '10';
    const minuteVal = (timeParts[1] && timeParts[1].substring(0, 2).length === 2) ? timeParts[1].substring(0, 2) : '00';
    return { dateVal, hourVal, minuteVal };
  };

  const handleJadwalChange = (classId: string, date: string, hour: string, minute: string) => {
    if (!date) {
      handleClassChange(classId, 'jadwalPengantaran', '');
    } else {
      handleClassChange(classId, 'jadwalPengantaran', `${date} ${hour}:${minute} WIB`);
    }
  };

  const handleSave = async () => {
    if (isSekolah && classes.length > 0) {
      const emptyClass = classes.some((c) => !c.className.trim());
      if (emptyClass) {
        alert('Nama kelas harus diisi!');
        return;
      }
    }
    setSaving(true);
    await onSave(entry.id, menuItems, menuKeringanItems, address, isSekolah ? classes : undefined);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`bg-white rounded-2xl shadow-2xl w-full p-6 font-['Hanken_Grotesk',system-ui,sans-serif] transition-all duration-300 ${
          isSekolah ? 'max-w-5xl' : 'max-w-3xl'
        }`}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-extrabold text-[#111827]">Atur Menu & Porsi</h3>
            <p className="text-xs text-[#6B7280]">{entry.institutionName || 'Institusi Tanpa Nama'}</p>
          </div>
          <button onClick={onClose} title="Tutup Modal" aria-label="Tutup Modal" className="p-1.5 rounded-full hover:bg-gray-100 cursor-pointer">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Portion breakdown */}
        <div className="bg-[#FEF3C7] rounded-xl p-4 mb-5 border border-[#FDE68A]">
          <h4 className="text-xs font-bold text-[#92400E] mb-2 uppercase tracking-wider flex items-center gap-1">
            <ChefHat className="h-4 w-4" /> Spesifikasi Porsi Penerima
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-2.5 border border-amber-100 flex justify-between items-center">
              <div>
                <span className="text-[9px] font-bold text-gray-400 block uppercase">Porsi Balita</span>
                <span className="text-xs font-bold text-gray-700">Balita</span>
              </div>
              <span className="text-lg font-extrabold text-[#92400E] bg-[#FEF3C7] px-2.5 py-0.5 rounded-full">
                {displayPorsiBalita}
              </span>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-amber-100 flex justify-between items-center">
              <div>
                <span className="text-[9px] font-bold text-gray-400 block uppercase">Porsi Kecil</span>
                <span className="text-xs font-bold text-gray-700">Anak TK-SD3</span>
              </div>
              <span className="text-lg font-extrabold text-[#92400E] bg-[#FEF3C7] px-2.5 py-0.5 rounded-full">
                {displayPorsiKecil}
              </span>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-amber-100 flex justify-between items-center">
              <div>
                <span className="text-[9px] font-bold text-gray-400 block uppercase">Porsi Besar</span>
                <span className="text-xs font-bold text-gray-700">Dewasa/SD4+</span>
              </div>
              <span className="text-lg font-extrabold text-[#92400E] bg-[#FEF3C7] px-2.5 py-0.5 rounded-full">
                {displayPorsiBesar}
              </span>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-amber-100 flex justify-between items-center">
              <div>
                <span className="text-[9px] font-bold text-gray-400 block uppercase">Porsi Ibu</span>
                <span className="text-xs font-bold text-gray-700">Bumil/Busui</span>
              </div>
              <span className="text-lg font-extrabold text-[#92400E] bg-[#FEF3C7] px-2.5 py-0.5 rounded-full">
                {displayPorsiBumilBusui}
              </span>
            </div>
          </div>
        </div>

        {/* Menu inputs */}
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
          {/* Section 1: Menu */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left side: Menu Reguler */}
            <div className="space-y-4">
              {/* Menu Reguler */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label htmlFor="reg-menu-input" className="block text-xs font-bold text-[#374151]">
                    Menu Makanan & Minuman Reguler
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegManual(!isRegManual);
                      setNewRegItem('');
                    }}
                    className="text-[10px] font-extrabold text-amber-700 hover:text-amber-950 hover:underline cursor-pointer"
                  >
                    {isRegManual ? '← Pilih dari List' : '➕ Ketik Manual...'}
                  </button>
                </div>
                <div className="flex gap-2 mb-2">
                  {isRegManual ? (
                    <input
                      id="reg-menu-input"
                      type="text"
                      placeholder="Ketik nama menu kustom..."
                      value={newRegItem}
                      onChange={(e) => setNewRegItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddReg();
                        }
                      }}
                      className="flex-1 rounded-xl border border-[#E5E7EB] px-4 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                    />
                  ) : (
                    <select
                      id="reg-menu-input"
                      value={newRegItem}
                      onChange={(e) => {
                        if (e.target.value === '__manual__') {
                          setIsRegManual(true);
                          setNewRegItem('');
                        } else {
                          setNewRegItem(e.target.value);
                        }
                      }}
                      className="flex-1 rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] bg-white font-semibold"
                    >
                      <option value="">-- Pilih Menu Reguler --</option>
                      <option value="__manual__">➕ Ketik Manual...</option>
                      {Object.entries(groupedRecipes).map(([cat, list]) => (
                        <optgroup key={cat} label={cat} className="font-bold text-gray-700">
                          {list.map((r) => (
                            <option key={r.namaMenu} value={r.namaMenu} className="font-semibold text-gray-900">
                              {r.namaMenu}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={handleAddReg}
                    disabled={!newRegItem.trim()}
                    className="px-4 py-2 rounded-xl bg-[#111827] text-white text-xs font-bold hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    Tambah
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[40px] p-2 rounded-xl border border-dashed border-[#E5E7EB] bg-gray-50/50">
                  {menuItems.length === 0 ? (
                    <span className="text-[10px] text-gray-400 font-semibold italic p-1">Belum ada menu reguler</span>
                  ) : (
                    menuItems.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-[#92400E] rounded-lg text-[10px] font-extrabold"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => handleRemoveReg(item)}
                          title={`Hapus ${item}`}
                          className="hover:text-red-500 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right side: Menu Keringan */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5 flex-wrap gap-1">
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="ker-menu-input" className="block text-xs font-bold text-[#374151]">
                      Menu Keringan / Alternatif Non-Nasi (Pobia Nasi)
                    </label>
                    {entry.qtPobiaNasi > 0 && (
                      <span className="text-[9px] font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        ⚠️ {entry.qtPobiaNasi} penerima butuh menu keringan
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsKerManual(!isKerManual);
                      setNewKerItem('');
                    }}
                    className="text-[10px] font-extrabold text-amber-700 hover:text-amber-950 hover:underline cursor-pointer"
                  >
                    {isKerManual ? '← Pilih dari List' : '➕ Ketik Manual...'}
                  </button>
                </div>
                <div className="flex gap-2 mb-2">
                  {isKerManual ? (
                    <input
                      id="ker-menu-input"
                      type="text"
                      placeholder="Ketik nama menu alternatif..."
                      value={newKerItem}
                      onChange={(e) => setNewKerItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddKer();
                        }
                      }}
                      className="flex-1 rounded-xl border border-[#E5E7EB] px-4 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                    />
                  ) : (
                    <select
                      id="ker-menu-input"
                      value={newKerItem}
                      onChange={(e) => {
                        if (e.target.value === '__manual__') {
                          setIsKerManual(true);
                          setNewKerItem('');
                        } else {
                          setNewKerItem(e.target.value);
                        }
                      }}
                      className="flex-1 rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] bg-white font-semibold"
                    >
                      <option value="">-- Pilih Menu Alternatif --</option>
                      <option value="__manual__">➕ Ketik Manual...</option>
                      {Object.entries(groupedRecipes).map(([cat, list]) => (
                        <optgroup key={cat} label={cat} className="font-bold text-gray-700">
                          {list.map((r) => (
                            <option key={r.namaMenu} value={r.namaMenu} className="font-semibold text-gray-900">
                              {r.namaMenu}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={handleAddKer}
                    disabled={!newKerItem.trim()}
                    className="px-4 py-2 rounded-xl bg-[#111827] text-white text-xs font-bold hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    Tambah
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[40px] p-2 rounded-xl border border-dashed border-[#E5E7EB] bg-gray-50/50">
                  {menuKeringanItems.length === 0 ? (
                    <span className="text-[10px] text-gray-400 font-semibold italic p-1">Belum ada menu alternatif</span>
                  ) : (
                    menuKeringanItems.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[10px] font-extrabold"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => handleRemoveKer(item)}
                          title={`Hapus ${item}`}
                          className="hover:text-red-500 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Breakdown Kelas (Only for Sekolah) */}
          {isSekolah && (
            <div className="border-t border-gray-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-[#374151] uppercase tracking-wider">
                  Breakdown Kelas ({classes.length})
                </h4>
                <button
                  type="button"
                  onClick={handleAddClass}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#E5E7EB] hover:border-[#FBBF24] hover:bg-amber-50/50 text-[#111827] text-[10px] font-bold rounded-lg cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-[#FBBF24]" />
                  Tambah Kelas Baru
                </button>
              </div>

              <div className="overflow-x-auto border border-[#E5E7EB] rounded-xl bg-white max-h-[40vh]">
                <table className="w-full text-left text-xs font-semibold text-[#111827]">
                  <thead>
                    <tr className="bg-[#FEF3C7] text-[9px] font-extrabold text-[#92400E] uppercase tracking-wider">
                      <th className="px-3 py-2.5 w-[25%]">Nama Kelas</th>
                      <th className="px-3 py-2.5 w-[15%] text-center">Jml Siswa</th>
                      <th className="px-3 py-2.5 w-[22%] text-center">Tipe Porsi</th>
                      <th className="px-3 py-2.5 w-[15%] text-center">Pobia Nasi</th>
                      <th className="px-3 py-2.5 w-[10%] text-center">Jml Porsi</th>
                      <th className="px-3 py-2.5 w-[10%] text-center">Jadwal</th>
                      <th className="px-3 py-2.5 w-[3%]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {classes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-xs text-gray-400 italic">
                          Belum ada breakdown kelas. Klik "Tambah Kelas Baru" untuk memulai.
                        </td>
                      </tr>
                    ) : (
                      classes.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50/50">
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              placeholder="Kelas 1A"
                              value={c.className}
                              onChange={(e) => handleClassChange(c.id, 'className', e.target.value)}
                              className="w-full rounded-lg border border-[#E5E7EB] px-2.5 py-1 text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={c.totalSiswa || ''}
                              onChange={(e) => handleClassChange(c.id, 'totalSiswa', parseInt(e.target.value) || 0)}
                              className="w-14 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <select
                              value={c.portionType || 'kecil'}
                              onChange={(e) => handleClassChange(c.id, 'portionType', e.target.value)}
                              title="Kategori Porsi"
                              className="w-full rounded-lg border border-[#E5E7EB] pl-2 pr-6 py-1 text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] cursor-pointer"
                            >
                              <option value="balita">Balita</option>
                              <option value="kecil">Porsi Kecil</option>
                              <option value="besar">Porsi Besar</option>
                              <option value="ibu">Porsi Ibu</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={c.qtPobiaNasi || ''}
                              onChange={(e) => handleClassChange(c.id, 'qtPobiaNasi', parseInt(e.target.value) || 0)}
                              className="w-14 rounded-lg border border-[#E5E7EB] px-1 py-1 text-xs text-center font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <span className="inline-block min-w-[24px] rounded bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-700">
                              {c.jumlah || 0}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            {(() => {
                              const { dateVal, hourVal, minuteVal } = getJadwalParts(c.jadwalPengantaran);
                              return (
                                <div className="flex flex-col gap-1 min-w-[130px]">
                                  <input
                                    type="date"
                                    title="Tanggal Pengantaran"
                                    value={dateVal}
                                    onChange={(e) => handleJadwalChange(c.id, e.target.value, hourVal, minuteVal)}
                                    className="w-full rounded-lg border border-[#E5E7EB] px-1.5 py-0.5 text-[10px] font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                                  />
                                  <div className="flex items-center gap-1">
                                    <select
                                      value={hourVal}
                                      onChange={(e) => handleJadwalChange(c.id, dateVal, e.target.value, minuteVal)}
                                      title="Jam Pengantaran"
                                      className="flex-1 rounded-lg border border-[#E5E7EB] px-1 py-0.5 text-[10px] font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                                    >
                                      {hours.map((h) => (
                                        <option key={h} value={h}>{h}</option>
                                      ))}
                                    </select>
                                    <span className="text-[10px] font-bold text-gray-400">:</span>
                                    <select
                                      value={minuteVal}
                                      onChange={(e) => handleJadwalChange(c.id, dateVal, hourVal, e.target.value)}
                                      title="Menit Pengantaran"
                                      className="flex-1 rounded-lg border border-[#E5E7EB] px-1 py-0.5 text-[10px] font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                                    >
                                      {minutes.map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                      ))}
                                    </select>
                                    <span className="text-[9px] font-bold text-gray-500 shrink-0">WIB</span>
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveClass(c.id)}
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
                              title="Hapus Kelas"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex gap-3 mt-6 border-t border-[#F3F4F6] pt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] text-sm font-bold text-[#6B7280] hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#FBBF24] text-sm font-bold text-[#111827] hover:bg-[#F59E0B] cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Simpan Menu & Porsi
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default MbgAdminPage;
