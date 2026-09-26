// ============================================================================
// MBG Admin Page — Administrasi MBG: Input Data PM
// ============================================================================

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
  ChefHat,
  FileSpreadsheet,
  Edit,
  Archive,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import * as XLSX from 'xlsx';
import type { MbgPmBatch, MbgPmEntry, MbgInstitutionType, MbgClassBreakdown, MbgDayMenu } from '@/types/mbg';
import { WeeklyScheduleModal } from '@/components/mbg/WeeklyScheduleModal';
import { SpreadsheetImportModal } from '@/components/mbg/SpreadsheetImportModal';
import { parsePmRowsToEntries, detectPreferredSheet } from '@/utils/mbgSpreadsheetParser';
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
  moveBatchToBackup,
  subscribeWeeklySchedule,
  saveWeeklySchedule,
  getMenuForDate,
  bulkAddEntriesFromMaster,
  deleteAllMbgData,
  cleanDuplicateBatchEntries,
  replaceBatchEntries,
  type MbgPortionClassification,
} from '@/services/mbgAdminService';
import { getJakartaDate } from '@/utils/date';
import { subscribeCustomRecipes } from '@/services/mbgProductionService';
import resepStandardData from '@/constants/standarResep.json';
import { MBG_BATCH_STATUS_CONFIG, MBG_MASTER_INSTITUTIONS, DEFAULT_WEEKLY_SCHEDULE } from '@/constants/mbgConstants';

import { isPosyanduName } from '@/utils/mbgDeliveryReportPdfExporter';


// ---- Helper: Auto-calculate portion suggestions based on levels and inputs ----
function getAutoPortions(entry: Partial<MbgPmEntry>) {
  let qtPorsiBalita = 0;
  let qtPorsiKecil = 0;
  let qtPorsiBesar = 0;
  let qtPorsiBumilBusui = 0;

  if (entry.institutionType === 'posyandu') {
    const balita = (entry.qtPorsiKecilL || 0) + (entry.qtPorsiKecilP || 0) || entry.qtSiswaBalita || entry.qtPorsiBalita || 0;
    qtPorsiBalita = balita;
    qtPorsiBumilBusui = (entry.qtBumil || 0) + (entry.qtBusui || 0) || entry.qtBumilBusui || 0;
    qtPorsiBesar = (entry.qtPorsiBesarL || 0) + (entry.qtPorsiBesarP || 0) + (entry.qtGuruKader || 0);
    qtPorsiKecil = 0;
  } else {
    // sekolah
    const pkl = (entry.qtPorsiKecilL || 0) + (entry.qtPorsiKecilP || 0);
    const pbl = (entry.qtPorsiBesarL || 0) + (entry.qtPorsiBesarP || 0);
    qtPorsiKecil = pkl || (entry.schoolLevel === 'sma' ? 0 : entry.qtSiswaBalita || 0);
    qtPorsiBesar = pbl || ((entry.schoolLevel === 'sma' ? (entry.qtSiswaBalita || 0) : 0) + (entry.qtGuruKader || 0));
    qtPorsiBumilBusui = (entry.qtBumil || 0) + (entry.qtBusui || 0) || entry.qtBumilBusui || 0;
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

      total.porsiKecilL += porsiKecilL;
      total.porsiKecilP += porsiKecilP;
      total.porsiBesarL += porsiBesarL;
      total.porsiBesarP += porsiBesarP;
      total.totalL += porsiKecilL + porsiBesarL;
      total.totalP += porsiKecilP + porsiBesarP + bumil + busui;
      total.guruL += guruL;
      total.guruP += guruP;
      total.tendikL += tendikL;
      total.tendikP += tendikP;
      total.jumlah += entry.jumlah || 0;
      return total;
    },
    { porsiKecilL: 0, porsiKecilP: 0, porsiBesarL: 0, porsiBesarP: 0, totalL: 0, totalP: 0, guruL: 0, guruP: 0, tendikL: 0, tendikP: 0, jumlah: 0 }
  );
}

// ---- New Batch Modal ----
// ---- New Batch Modal ----
function NewBatchModal({
  isOpen,
  onClose,
  onSubmit,
  batches,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (tanggal: string, copyFromId?: string, autoPopulateMaster?: boolean) => void;
  batches: MbgPmBatch[];
}) {
  const [tanggal, setTanggal] = useState(getJakartaDate());
  const [creationMode, setCreationMode] = useState<'copy' | 'master' | 'blank'>('copy');
  const [copyFrom, setCopyFrom] = useState('');

  // Sort batches descending by date
  const sortedBatches = useMemo(() => {
    return [...batches].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
  }, [batches]);

  // Find first batch with > 0 portions as default copy candidate if available
  useEffect(() => {
    if (!copyFrom && sortedBatches.length > 0) {
      const best = sortedBatches.find((b) => (b.totalJumlah || 0) > 0);
      if (best) {
        setCopyFrom(best.id);
      } else {
        setCopyFrom(sortedBatches[0].id);
      }
    }
  }, [sortedBatches, copyFrom]);

  if (!isOpen) return null;

  const selectedCopyBatch = sortedBatches.find((b) => b.id === copyFrom);
  const selectedCopyPortions = selectedCopyBatch
    ? (selectedCopyBatch.totalJumlah ?? 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 font-['Hanken_Grotesk',system-ui,sans-serif]"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-extrabold text-[#111827]">Batch Baru</h3>
            <p className="text-xs text-gray-500 mt-0.5">Pilih tanggal dan metode pengisian data institusi</p>
          </div>
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
              className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#374151] mb-2">
              Sumber Data Institusi & Porsi
            </label>
            
            <div className="space-y-2">
              {/* Option 1: Salin dari Batch Sebelumnya */}
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                creationMode === 'copy'
                  ? 'border-[#FBBF24] bg-amber-50/60 ring-1 ring-[#FBBF24]'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="creationMode"
                  value="copy"
                  checked={creationMode === 'copy'}
                  onChange={() => setCreationMode('copy')}
                  className="mt-0.5 text-[#FBBF24] focus:ring-[#FBBF24]"
                />
                <div className="flex-1">
                  <span className="text-xs font-bold text-[#111827]">📋 Salin dari Batch Sebelumnya</span>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Menyalin seluruh data sekolah, kuantitas siswa/guru, serta alokasi kurir dari tanggal lain.
                  </p>
                  {creationMode === 'copy' && (
                    <div className="mt-2.5">
                      <select
                        id="copy-from-select"
                        title="Salin dari Batch Sebelumnya"
                        value={copyFrom}
                        onChange={(e) => setCopyFrom(e.target.value)}
                        className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                      >
                        {sortedBatches.length === 0 ? (
                          <option value="">(Belum ada batch sebelumnya)</option>
                        ) : (
                          sortedBatches.map((b) => {
                            const porsi = b.totalJumlah ?? 0;
                            const statusBadge = b.status === 'DRAFT' ? 'Draft' : 'Final';
                            return (
                              <option key={b.id} value={b.id}>
                                {b.tanggal} — {statusBadge} ({porsi.toLocaleString('id-ID')} porsi)
                              </option>
                            );
                          })
                        )}
                      </select>

                      {selectedCopyBatch && selectedCopyPortions === 0 && (
                        <p className="text-[10px] text-amber-700 font-semibold mt-1.5 flex items-center gap-1">
                          ⚠️ Batch sumber ini belum memiliki data porsi (0 porsi). Jika ingin data standar, pilih opsi "Isi Otomatis 27 Institusi Master" di bawah.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </label>

              {/* Option 2: Isi Otomatis 27 Master Institutions */}
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                creationMode === 'master'
                  ? 'border-[#FBBF24] bg-amber-50/60 ring-1 ring-[#FBBF24]'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="creationMode"
                  value="master"
                  checked={creationMode === 'master'}
                  onChange={() => setCreationMode('master')}
                  className="mt-0.5 text-[#FBBF24] focus:ring-[#FBBF24]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#111827]">🏫 Isi Otomatis 27 Institusi Master</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
                      Standar BGN (~2.800 Porsi)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Membuat batch dengan 27 daftar sekolah & posyandu resmi lengkap dengan porsi standar dan pembagian rute kurir.
                  </p>
                </div>
              </label>

              {/* Option 3: Batch Kosong */}
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                creationMode === 'blank'
                  ? 'border-[#FBBF24] bg-amber-50/60 ring-1 ring-[#FBBF24]'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="creationMode"
                  value="blank"
                  checked={creationMode === 'blank'}
                  onChange={() => setCreationMode('blank')}
                  className="mt-0.5 text-[#FBBF24] focus:ring-[#FBBF24]"
                />
                <div className="flex-1">
                  <span className="text-xs font-bold text-[#111827]">📄 Buat Batch Kosong</span>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Buat template kosong untuk kemudian diisi dengan "Import Excel / CSV PM" atau tambah baris manual.
                  </p>
                </div>
              </label>
            </div>
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
              if (creationMode === 'copy') {
                onSubmit(tanggal, copyFrom || undefined, false);
              } else if (creationMode === 'master') {
                onSubmit(tanggal, undefined, true);
              } else {
                onSubmit(tanggal, undefined, false);
              }
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-[#FBBF24] text-sm font-extrabold text-[#111827] hover:bg-[#F59E0B] cursor-pointer transition-colors shadow-sm active:scale-95"
          >
            Buat Batch
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---- Source-compatible Auto Rekap row ----
// This keeps the website column order identical to the workbook's AUTO REKAP
// sheet: Porsi Kecil, Porsi Besar, Total, Guru, Tendik, and grand total.
function AutoRekapEntryRow({
  entry,
  onUpdate,
  onDelete,
  isLibur,
  onConfirmAction,
}: {
  entry: MbgPmEntry;
  onUpdate: (id: string, updates: Partial<MbgPmEntry>) => void;
  onDelete: (id: string) => void;
  isLibur: boolean;
  onConfirmAction: (config: {
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }) => void;
}) {
  const isPosyandu = entry.institutionType === 'posyandu';
  const nameLower = entry.institutionName.toLowerCase();
  const isBumil = isPosyandu && nameLower.includes('bumil');
  const isBusui = isPosyandu && nameLower.includes('busui');

  const totalL = (entry.qtPorsiKecilL || 0) + (entry.qtPorsiBesarL || 0);
  const totalP = (entry.qtPorsiKecilP || 0) + (entry.qtPorsiBesarP || 0) + (entry.qtBumil || 0) + (entry.qtBusui || 0);
  const totalSiswa = totalL + totalP;
  const totalStaf = (entry.qtGuruL || 0) + (entry.qtGuruP || 0) + (entry.qtTendikL || 0) + (entry.qtTendikP || 0);

  const updateNumber = (field: keyof MbgPmEntry, value: number) => {
    const next = { ...entry, [field]: value } as MbgPmEntry;
    const nextName = next.institutionName.toLowerCase();
    const nextIsPosyandu = next.institutionType === 'posyandu';
    const nextIsBumil = nextIsPosyandu && nextName.includes('bumil');
    const nextIsBusui = nextIsPosyandu && nextName.includes('busui');
    const nextBalita = (next.qtPorsiKecilL || 0) + (next.qtPorsiKecilP || 0);
    const nextBumil = next.qtBumil || 0;
    const nextBusui = next.qtBusui || 0;
    const nextSiswaL = (next.qtPorsiKecilL || 0) + (next.qtPorsiBesarL || 0);
    const nextSiswaP = (next.qtPorsiKecilP || 0) + (next.qtPorsiBesarP || 0) + nextBumil + nextBusui;
    const nextStaf = (next.qtGuruL || 0) + (next.qtGuruP || 0) + (next.qtTendikL || 0) + (next.qtTendikP || 0);

    onUpdate(entry.id, {
      [field]: value,
      qtSiswaBalita: nextIsPosyandu ? (nextIsBumil || nextIsBusui ? 0 : nextBalita) : (next.qtPorsiKecilL || 0) + (next.qtPorsiKecilP || 0) + (next.qtPorsiBesarL || 0) + (next.qtPorsiBesarP || 0),
      qtBumilBusui: nextBumil + nextBusui,
      qtGuruKader: nextStaf,
      qtPorsiBalita: nextIsPosyandu ? nextBalita : 0,
      qtPorsiKecil: nextIsPosyandu ? 0 : (next.qtPorsiKecilL || 0) + (next.qtPorsiKecilP || 0),
      qtPorsiBesar: nextIsPosyandu ? 0 : (next.qtPorsiBesarL || 0) + (next.qtPorsiBesarP || 0),
      qtPorsiBumilBusui: nextBumil + nextBusui,
      jumlah: nextSiswaL + nextSiswaP + nextStaf,
    });
  };

  if (isLibur) {
    return (
      <tr className="bg-red-600 text-white text-xs font-bold text-center">
        <td className="px-3 py-2 text-left">{entry.institutionName || 'Institusi'} (LIBUR)</td>
        <td colSpan={13}>TIDAK ADA PENGIRIMAN</td>
        <td className="px-2 py-2">
          <button type="button" onClick={() => onUpdate(entry.id, { isSekolahLibur: false })} className="rounded bg-white px-2 py-1 text-[10px] text-red-700">Aktifkan</button>
        </td>
      </tr>
    );
  }

  const inputClass = 'w-10 rounded border border-slate-300 bg-white px-1 py-1 text-center text-xs font-bold text-slate-900 focus:ring-1 focus:ring-emerald-500';
  const numberInput = (field: keyof MbgPmEntry, value: number, disabled = false) => (
    <input
      type="number"
      min={0}
      disabled={disabled}
      value={value || ''}
      onChange={(event) => updateNumber(field, Number.parseInt(event.target.value, 10) || 0)}
      className={`${inputClass} ${disabled ? 'cursor-not-allowed border-transparent bg-transparent text-slate-300' : ''}`}
    />
  );

  return (
    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50">
      <td className="min-w-[170px] border-r border-slate-200 px-2 py-1.5">
        <input
          type="text"
          value={entry.institutionName}
          onChange={(event) => onUpdate(entry.id, { institutionName: event.target.value })}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold"
        />
      </td>
      <td className="border-r border-slate-200 p-1 text-center">{numberInput('qtPorsiKecilL', entry.qtPorsiKecilL || 0, isBumil || isBusui)}</td>
      <td className="border-r border-slate-200 p-1 text-center">{numberInput('qtPorsiKecilP', entry.qtPorsiKecilP || 0, isBumil || isBusui)}</td>
      <td className="border-r border-slate-200 p-1 text-center">{numberInput('qtPorsiBesarL', entry.qtPorsiBesarL || 0, isPosyandu)}</td>
      <td className="border-r border-slate-200 p-1 text-center">{numberInput('qtPorsiBesarP', entry.qtPorsiBesarP || 0, isPosyandu)}</td>
      <td className="border-r border-slate-200 bg-slate-50 px-2 py-1 text-center">{totalL || '—'}</td>
      <td className="border-r border-slate-200 bg-slate-50 px-2 py-1 text-center">{totalP || '—'}</td>
      <td className="border-r border-slate-300 bg-slate-100 px-2 py-1 text-center font-extrabold">{totalSiswa}</td>
      <td className="border-r border-slate-200 p-1 text-center">{numberInput('qtGuruL', entry.qtGuruL || 0)}</td>
      <td className="border-r border-slate-200 p-1 text-center">{numberInput('qtGuruP', entry.qtGuruP || 0)}</td>
      <td className="border-r border-slate-200 p-1 text-center">{numberInput('qtTendikL', entry.qtTendikL || 0)}</td>
      <td className="border-r border-slate-200 p-1 text-center">{numberInput('qtTendikP', entry.qtTendikP || 0)}</td>
      <td className="border-r border-slate-300 bg-slate-100 px-2 py-1 text-center font-extrabold">{totalStaf}</td>
      <td className="border-r border-amber-200 bg-amber-50 px-2 py-1 text-center font-black text-amber-900">{entry.jumlah}</td>
      <td className="px-1 py-1 text-center">
        <button type="button" onClick={() => onConfirmAction({ title: 'Hapus Institusi', message: `Hapus ${entry.institutionName || 'institusi'} dari rekap?`, onConfirm: () => onDelete(entry.id), variant: 'danger' })} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus institusi">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
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
  sourceLayout = false,
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
  sourceLayout?: boolean;
}) {
  if (sourceLayout) {
    return (
      <AutoRekapEntryRow
        entry={entry}
        onUpdate={onUpdate}
        onDelete={onDelete}
        isLibur={isLibur}
        onConfirmAction={onConfirmAction}
      />
    );
  }

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

    // Auto-detect Posyandu on institutionName change
    if (field === 'institutionName') {
      const nameStr = String(value);
      if (isPosyanduName(nameStr) && entry.institutionType !== 'posyandu') {
        updates.institutionType = 'posyandu';
        updates.schoolLevel = undefined;
        tempEntry.institutionType = 'posyandu';
        tempEntry.schoolLevel = undefined;

        // Smart migration if numbers were already entered in the 4 boxes
        const pbl = entry.qtPorsiBesarL || 0;
        const pbp = entry.qtPorsiBesarP || 0;
        const pkl = entry.qtPorsiKecilL || 0;
        const pkp = entry.qtPorsiKecilP || 0;

        if (pbl || pbp) {
          updates.qtPorsiKecilL = pbl;
          updates.qtPorsiKecilP = pbp;
          updates.qtBumil = pkl;
          updates.qtBusui = pkp;
          updates.qtPorsiBesarL = 0;
          updates.qtPorsiBesarP = 0;
          updates.qtPorsiBalita = pbl + pbp;
          updates.qtBumilBusui = pkl + pkp;
          updates.qtPorsiBumilBusui = pkl + pkp;
          updates.qtSiswaBalita = pbl + pbp;
          updates.qtPorsiKecil = 0;
          updates.qtPorsiBesar = entry.qtGuruKader || 0;
        } else if (pkl || pkp) {
          updates.qtPorsiBalita = pkl + pkp;
          updates.qtSiswaBalita = pkl + pkp;
          updates.qtPorsiKecil = 0;
          updates.qtPorsiBesar = entry.qtGuruKader || 0;
        }
        Object.assign(tempEntry, updates);
      }
    }

    // Explicit institutionType switch
    if (field === 'institutionType') {
      if (value === 'posyandu') {
        updates.institutionType = 'posyandu';
        updates.schoolLevel = undefined;
        tempEntry.institutionType = 'posyandu';
        tempEntry.schoolLevel = undefined;

        const pbl = entry.qtPorsiBesarL || 0;
        const pbp = entry.qtPorsiBesarP || 0;
        const pkl = entry.qtPorsiKecilL || 0;
        const pkp = entry.qtPorsiKecilP || 0;

        if (pbl || pbp) {
          updates.qtPorsiKecilL = pbl;
          updates.qtPorsiKecilP = pbp;
          updates.qtBumil = pkl;
          updates.qtBusui = pkp;
          updates.qtPorsiBesarL = 0;
          updates.qtPorsiBesarP = 0;
          updates.qtPorsiBalita = pbl + pbp;
          updates.qtBumilBusui = pkl + pkp;
          updates.qtPorsiBumilBusui = pkl + pkp;
          updates.qtSiswaBalita = pbl + pbp;
          updates.qtPorsiKecil = 0;
          updates.qtPorsiBesar = entry.qtGuruKader || 0;
        } else if (pkl || pkp) {
          updates.qtPorsiBalita = pkl + pkp;
          updates.qtSiswaBalita = pkl + pkp;
          updates.qtPorsiKecil = 0;
          updates.qtPorsiBesar = entry.qtGuruKader || 0;
        }
        Object.assign(tempEntry, updates);
      } else {
        updates.institutionType = 'sekolah';
        updates.schoolLevel = 'sd';
        updates.qtBumil = 0;
        updates.qtBusui = 0;
        updates.qtBumilBusui = 0;
        updates.qtPorsiBumilBusui = 0;
        updates.qtPorsiBalita = 0;
        updates.qtPorsiKecil = (entry.qtPorsiKecilL || 0) + (entry.qtPorsiKecilP || 0);
        updates.qtSiswaBalita = updates.qtPorsiKecil;
        updates.qtPorsiBesar = entry.qtGuruKader || 0;
        tempEntry.institutionType = 'sekolah';
        tempEntry.schoolLevel = 'sd';
        Object.assign(tempEntry, updates);
      }
    }

    // Auto-update for Posyandu fields
    if (tempEntry.institutionType === 'posyandu') {
      if (['qtPorsiKecilL', 'qtPorsiKecilP'].includes(field)) {
        const pkl = field === 'qtPorsiKecilL' ? (value as number) : (entry.qtPorsiKecilL || 0);
        const pkp = field === 'qtPorsiKecilP' ? (value as number) : (entry.qtPorsiKecilP || 0);
        updates.qtPorsiBalita = pkl + pkp;
        updates.qtSiswaBalita = pkl + pkp;
        updates.qtPorsiKecil = 0;
        updates.qtPorsiBesar = entry.qtGuruKader || 0;
        tempEntry.qtPorsiBalita = pkl + pkp;
        tempEntry.qtSiswaBalita = pkl + pkp;
        tempEntry.qtPorsiKecil = 0;
        tempEntry.qtPorsiBesar = entry.qtGuruKader || 0;
      }
      if (field === 'qtBumil' || field === 'qtBusui') {
        const b = field === 'qtBumil' ? (value as number) : (entry.qtBumil || 0);
        const s = field === 'qtBusui' ? (value as number) : (entry.qtBusui || 0);
        updates.qtBumil = b;
        updates.qtBusui = s;
        updates.qtBumilBusui = b + s;
        updates.qtPorsiBumilBusui = b + s;
        tempEntry.qtBumil = b;
        tempEntry.qtBusui = s;
        tempEntry.qtBumilBusui = b + s;
        tempEntry.qtPorsiBumilBusui = b + s;
      }
    } else {
      // For Sekolah fields
      if (['qtPorsiKecilL', 'qtPorsiKecilP', 'qtPorsiBesarL', 'qtPorsiBesarP'].includes(field)) {
        const pkl = field === 'qtPorsiKecilL' ? (value as number) : (entry.qtPorsiKecilL || 0);
        const pkp = field === 'qtPorsiKecilP' ? (value as number) : (entry.qtPorsiKecilP || 0);
        const pbl = field === 'qtPorsiBesarL' ? (value as number) : (entry.qtPorsiBesarL || 0);
        const pbp = field === 'qtPorsiBesarP' ? (value as number) : (entry.qtPorsiBesarP || 0);

        const newSiswa = pkl + pkp + pbl + pbp;
        updates.qtSiswaBalita = newSiswa;
        updates.qtPorsiKecil = pkl + pkp;
        updates.qtPorsiBesar = pbl + pbp + (entry.qtGuruKader || 0);
        tempEntry.qtSiswaBalita = newSiswa;
        tempEntry.qtPorsiKecil = pkl + pkp;
        tempEntry.qtPorsiBesar = updates.qtPorsiBesar;
      }
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
      if (tempEntry.institutionType === 'posyandu') {
        updates.qtPorsiBesar = newGuruKader;
        tempEntry.qtPorsiBesar = newGuruKader;
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

  if (isLibur) {
    return (
      <tr className="bg-[#DC2626] text-white font-extrabold border-b border-red-700 text-xs text-center">
        <td className="px-3 py-2.5 text-left font-extrabold border-r border-red-700 min-w-[180px]">
          🚫 {entry.institutionName || 'Sekolah'} (LIBUR)
        </td>
        <td colSpan={19} className="px-3 py-2.5 text-center text-red-100 italic tracking-wider font-semibold">
          SEKOLAH LIBUR / TIDAK ADA PENGIRIMAN
        </td>
        <td className="px-3 py-2.5 text-center font-extrabold bg-red-900 text-white">0</td>
        <td className="px-2 py-2.5">
          <button
            type="button"
            onClick={() => handleFieldChange('isSekolahLibur', false)}
            className="text-[10px] font-bold bg-white text-red-700 hover:bg-red-50 px-2 py-1 rounded shadow-xs cursor-pointer"
          >
            Aktifkan
          </button>
        </td>
      </tr>
    );
  }

  const totalSiswaL = isPosyandu
    ? (entry.qtPorsiKecilL || entry.qtSiswaBalita || 0)
    : ((entry.qtPorsiKecilL || 0) + (entry.qtPorsiBesarL || 0));

  const totalSiswaP = isPosyandu
    ? ((entry.qtPorsiKecilP || 0) + (entry.qtBumil || 0) + (entry.qtBusui || 0))
    : ((entry.qtPorsiKecilP || 0) + (entry.qtPorsiBesarP || 0));

  const totalSiswaJml = isPosyandu
    ? ((entry.qtSiswaBalita || 0) + (entry.qtBumilBusui || 0))
    : (entry.qtSiswaBalita || 0);

  return (
    <tr className="border-b border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-800">
      {/* 1. SEKOLAH / POSYANDU */}
      <td className="px-2.5 py-2 border-r border-slate-200">
        <div className="flex flex-col gap-1 min-w-[170px]">
          <input
            type="text"
            list="master-institutions-datalist"
            value={entry.institutionName}
            onChange={(e) => {
              const val = e.target.value;
              handleFieldChange('institutionName', val);
            }}
            placeholder="Nama Sekolah / Posyandu"
            title="Ketik nama institusi atau pilih dari master"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <datalist id="master-institutions-datalist">
            {MBG_MASTER_INSTITUTIONS.map((inst) => (
              <option key={inst.institutionName} value={inst.institutionName} />
            ))}
          </datalist>

          <div className="flex items-center gap-1 mt-0.5">
            <select
              value={entry.institutionType}
              onChange={(e) => handleFieldChange('institutionType', e.target.value as MbgInstitutionType)}
              title="Tipe Institusi: Sekolah atau Posyandu"
              className={`text-[10px] font-bold rounded border px-1.5 py-0.5 cursor-pointer transition-colors ${
                isPosyandu ? 'bg-purple-100 text-purple-800 border-purple-300 font-extrabold' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <option value="sekolah">🏫 Sekolah</option>
              <option value="posyandu">👶 Posyandu</option>
            </select>

            <select
              value=""
              onChange={(e) => {
                if (e.target.value) handleSelectMaster(e.target.value);
              }}
              title="Pilih Master Institusi untuk mengisi otomatis standar porsi"
              className="text-[10px] font-semibold rounded border border-slate-200 px-1 py-0.5 bg-slate-50 text-slate-600 max-w-[85px] truncate cursor-pointer"
            >
              <option value="">Master...</option>
              {MBG_MASTER_INSTITUTIONS.map((inst) => (
                <option key={inst.institutionName} value={inst.institutionName}>
                  {inst.institutionName}
                </option>
              ))}
            </select>

            {!isPosyandu && (
              <button
                type="button"
                onClick={onManageClasses}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors cursor-pointer shrink-0 ${
                  hasClasses ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Atur Kelas"
              >
                Kelas ({entry.classesBreakdown?.length || 0})
              </button>
            )}
          </div>
        </div>
      </td>

      {/* 2. PORSI BESAR L */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={entry.qtPorsiBesarL || ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (isPosyandu && val > 0) handleFieldChange('institutionType', 'sekolah');
            handleFieldChange('qtPorsiBesarL', val);
          }}
          placeholder="0"
          title="Porsi Besar (Laki-laki)"
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            isPosyandu ? 'border-slate-200 bg-slate-50/60 text-slate-400 placeholder:text-slate-300' : 'border-slate-300 bg-white'
          }`}
        />
      </td>

      {/* 3. PORSI BESAR P */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={entry.qtPorsiBesarP || ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (isPosyandu && val > 0) handleFieldChange('institutionType', 'sekolah');
            handleFieldChange('qtPorsiBesarP', val);
          }}
          placeholder="0"
          title="Porsi Besar (Perempuan)"
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            isPosyandu ? 'border-slate-200 bg-slate-50/60 text-slate-400 placeholder:text-slate-300' : 'border-slate-300 bg-white'
          }`}
        />
      </td>

      {/* 4. PORSI KECIL L (Sekolah) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={!isPosyandu ? (entry.qtPorsiKecilL || '') : ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (isPosyandu) handleFieldChange('institutionType', 'sekolah');
            handleFieldChange('qtPorsiKecilL', val);
          }}
          placeholder={!isPosyandu ? "0" : "—"}
          title={!isPosyandu ? "Porsi Kecil (Laki-laki)" : "Klik untuk beralih ke Sekolah dan isi Porsi Kecil"}
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            isPosyandu ? 'border-slate-200 bg-slate-50/50 text-slate-400 placeholder:text-slate-300' : 'border-slate-300 bg-white'
          }`}
        />
      </td>

      {/* 5. PORSI KECIL P (Sekolah) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={!isPosyandu ? (entry.qtPorsiKecilP || '') : ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (isPosyandu) handleFieldChange('institutionType', 'sekolah');
            handleFieldChange('qtPorsiKecilP', val);
          }}
          placeholder={!isPosyandu ? "0" : "—"}
          title={!isPosyandu ? "Porsi Kecil (Perempuan)" : "Klik untuk beralih ke Sekolah dan isi Porsi Kecil"}
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            isPosyandu ? 'border-slate-200 bg-slate-50/50 text-slate-400 placeholder:text-slate-300' : 'border-slate-300 bg-white'
          }`}
        />
      </td>

      {/* 6. PORSI BALITA L (Posyandu) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center bg-amber-50/30">
        <input
          type="number"
          min={0}
          value={isPosyandu ? (entry.qtPorsiKecilL || '') : ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (!isPosyandu) handleFieldChange('institutionType', 'posyandu');
            handleFieldChange('qtPorsiKecilL', val);
          }}
          placeholder={isPosyandu ? "0" : "—"}
          title={isPosyandu ? "Porsi Balita (Laki-laki)" : "Klik untuk beralih ke Posyandu dan isi Balita"}
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            !isPosyandu ? 'border-slate-200 bg-slate-50/50 text-slate-400 placeholder:text-slate-300' : 'border-amber-300 bg-white'
          }`}
        />
      </td>

      {/* 7. PORSI BALITA P (Posyandu) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center bg-amber-50/30">
        <input
          type="number"
          min={0}
          value={isPosyandu ? (entry.qtPorsiKecilP || '') : ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (!isPosyandu) handleFieldChange('institutionType', 'posyandu');
            handleFieldChange('qtPorsiKecilP', val);
          }}
          placeholder={isPosyandu ? "0" : "—"}
          title={isPosyandu ? "Porsi Balita (Perempuan)" : "Klik untuk beralih ke Posyandu dan isi Balita"}
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            !isPosyandu ? 'border-slate-200 bg-slate-50/50 text-slate-400 placeholder:text-slate-300' : 'border-amber-300 bg-white'
          }`}
        />
      </td>

      {/* 8. PORSI BUMIL */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center bg-purple-50/30">
        <input
          type="number"
          min={0}
          value={entry.qtBumil ?? (entry.institutionName.toLowerCase().includes('bumil') ? entry.qtBumilBusui || '' : '')}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (!isPosyandu && val > 0) handleFieldChange('institutionType', 'posyandu');
            handleFieldChange('qtBumil', val);
          }}
          placeholder="0"
          title="Porsi Ibu Hamil (Bumil)"
          className="w-8 rounded border border-purple-200 bg-white px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900"
        />
      </td>

      {/* 9. PORSI BUSUI */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center bg-purple-50/30">
        <input
          type="number"
          min={0}
          value={entry.qtBusui ?? (entry.institutionName.toLowerCase().includes('busui') ? entry.qtBumilBusui || '' : '')}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (!isPosyandu && val > 0) handleFieldChange('institutionType', 'posyandu');
            handleFieldChange('qtBusui', val);
          }}
          placeholder="0"
          title="Porsi Ibu Menyusui (Busui)"
          className="w-8 rounded border border-purple-200 bg-white px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900"
        />
      </td>

      {/* 10. TOTAL L */}
      <td className="px-1 py-1 border-r border-slate-200 text-center bg-slate-50 font-bold text-slate-700">
        {totalSiswaL || '—'}
      </td>

      {/* 11. TOTAL P */}
      <td className="px-1 py-1 border-r border-slate-200 text-center bg-slate-100/70 font-bold text-slate-700">
        {totalSiswaP || '—'}
      </td>

      {/* 12. TOTAL JML */}
      <td className="px-1.5 py-1 border-r border-slate-300 text-center bg-slate-200 font-extrabold text-slate-900">
        {totalSiswaJml}
      </td>

      {/* 13. PIC / GURU L (Sekolah) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={!isPosyandu ? (entry.qtGuruL || '') : ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (isPosyandu) handleFieldChange('institutionType', 'sekolah');
            handleFieldChange('qtGuruL', val);
          }}
          placeholder={!isPosyandu ? "0" : "—"}
          title={!isPosyandu ? "PIC / Guru Sekolah (Laki-laki)" : "Klik untuk beralih ke Sekolah dan isi Guru L"}
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            isPosyandu ? 'border-slate-200 bg-slate-50/50 text-slate-400 placeholder:text-slate-300' : 'border-slate-300 bg-white'
          }`}
        />
      </td>

      {/* 14. PIC / GURU P (Sekolah) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={!isPosyandu ? (entry.qtGuruP || '') : ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (isPosyandu) handleFieldChange('institutionType', 'sekolah');
            handleFieldChange('qtGuruP', val);
          }}
          placeholder={!isPosyandu ? "0" : "—"}
          title={!isPosyandu ? "PIC / Guru Sekolah (Perempuan)" : "Klik untuk beralih ke Sekolah dan isi Guru P"}
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            isPosyandu ? 'border-slate-200 bg-slate-50/50 text-slate-400 placeholder:text-slate-300' : 'border-slate-300 bg-white'
          }`}
        />
      </td>

      {/* 15. KADER L (Posyandu) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={isPosyandu ? (entry.qtGuruL || '') : ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (!isPosyandu) handleFieldChange('institutionType', 'posyandu');
            handleFieldChange('qtGuruL', val);
          }}
          placeholder={isPosyandu ? "0" : "—"}
          title={isPosyandu ? "Kader Posyandu (Laki-laki)" : "Klik untuk beralih ke Posyandu dan isi Kader L"}
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            !isPosyandu ? 'border-slate-200 bg-slate-50/50 text-slate-400 placeholder:text-slate-300' : 'border-slate-300 bg-white'
          }`}
        />
      </td>

      {/* 16. KADER P (Posyandu) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={isPosyandu ? (entry.qtGuruP || '') : ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (!isPosyandu) handleFieldChange('institutionType', 'posyandu');
            handleFieldChange('qtGuruP', val);
          }}
          placeholder={isPosyandu ? "0" : "—"}
          title={isPosyandu ? "Kader Posyandu (Perempuan)" : "Klik untuk beralih ke Posyandu dan isi Kader P"}
          className={`w-8 rounded border px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900 ${
            !isPosyandu ? 'border-slate-200 bg-slate-50/50 text-slate-400 placeholder:text-slate-300' : 'border-slate-300 bg-white'
          }`}
        />
      </td>

      {/* 17. TENDIK L (Sekolah) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={entry.qtTendikL || ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (isPosyandu && val > 0) handleFieldChange('institutionType', 'sekolah');
            handleFieldChange('qtTendikL', val);
          }}
          placeholder="0"
          title="Tendik / Staf Sekolah (Laki-laki)"
          className="w-8 rounded border border-slate-300 bg-white px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900"
        />
      </td>

      {/* 18. TENDIK P (Sekolah) */}
      <td className="px-0.5 py-1 border-r border-slate-200 text-center">
        <input
          type="number"
          min={0}
          value={entry.qtTendikP || ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (isPosyandu && val > 0) handleFieldChange('institutionType', 'sekolah');
            handleFieldChange('qtTendikP', val);
          }}
          placeholder="0"
          title="Tendik / Staf Sekolah (Perempuan)"
          className="w-8 rounded border border-slate-300 bg-white px-0.5 py-0.5 text-xs text-center font-bold focus:ring-1 focus:ring-slate-500 text-slate-900"
        />
      </td>

      {/* 19. JML STAF / KADER */}
      <td className="px-1.5 py-1 border-r border-slate-300 text-center bg-slate-200/80 font-extrabold text-slate-900">
        {entry.qtGuruKader || 0}
      </td>

      {/* 20. TOTAL KESELURUHAN */}
      <td className="px-2 py-1 border-r border-slate-300 text-center bg-[#FEF3C7] font-black text-[#92400E] text-xs">
        {entry.jumlah}
      </td>

      {/* 21. AKSI */}
      <td className="px-2 py-2 text-center">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => handleFieldChange('isSekolahLibur', true)}
            title="Tandai Sekolah Libur"
            className="p-1 rounded text-amber-600 hover:bg-amber-50 cursor-pointer"
          >
            🏖️
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirmAction({
                title: 'Hapus Institusi',
                message: `Apakah Anda yakin ingin menghapus data institusi ${entry.institutionName || 'ini'}?`,
                onConfirm: () => onDelete(entry.id),
                variant: 'danger',
              });
            }}
            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
            title="Hapus Institusi"
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
  const navigate = useNavigate();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [allBatches, setAllBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [selectedEntryForMenu, setSelectedEntryForMenu] = useState<MbgPmEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [weeklySchedule, setWeeklySchedule] = useState<MbgDayMenu[]>(DEFAULT_WEEKLY_SCHEDULE);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  } | null>(null);

  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [showSpreadsheetModal, setShowSpreadsheetModal] = useState(false);

  const [selectedPortionClassification, setSelectedPortionClassification] = useState<MbgPortionClassification>('porsi_besar');

  const handleImportExcelPm = (file: File) => {
    if (!selectedBatchId) {
      showToast({ message: 'Pilih atau buat Batch Pengiriman terlebih dahulu sebelum import!', variant: 'error' });
      return;
    }
    if (!user) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        setSaving(true);
        let rows: Array<Array<string | number | undefined | null>> = [];
        const isBinary = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

        if (isBinary) {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Smart sheet detection: prioritas sheet sesuai tanggal batch / rekap / data pm
          const pmSheetName = detectPreferredSheet(workbook.SheetNames, selectedBatch?.tanggal, weeklySchedule);

          const worksheet = workbook.Sheets[pmSheetName];
          rows = XLSX.utils.sheet_to_json<Array<string | number | undefined | null>>(worksheet, { header: 1 });
        } else {
          const text = e.target?.result as string;
          const lines = text.split(/\r?\n/).filter((l) => l.trim());
          rows = lines.map((line) => {
            const delimiter = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
            return line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
          });
        }

        if (!rows || rows.length < 1) {
          showToast({ message: 'File Excel / CSV kosong atau format tidak sesuai', variant: 'error' });
          return;
        }

        const parsedEntries = parsePmRowsToEntries(
          rows,
          selectedBatchId,
          user.uid,
          weeklySchedule,
          selectedBatch?.tanggal
        );

        if (parsedEntries.length === 0) {
          showToast({ message: 'Tidak ditemukan data institusi yang valid di dalam file Excel / CSV ini.', variant: 'error' });
          setSaving(false);
          return;
        }

        const executeImport = async () => {
          let targetBatchId = selectedBatchId;
          let targetDate = selectedBatch?.tanggal;

          const currentBatch = targetBatchId
            ? (allBatches.find((b) => b.id === targetBatchId) || batches.find((b) => b.id === targetBatchId))
            : null;

          if (currentBatch && !targetDate) {
            targetDate = currentBatch.tanggal;
          }

          if (!targetBatchId || !targetDate) {
            const todayStr = getJakartaDate();
            const existing = allBatches.find((b) => b.tanggal === todayStr) || batches.find((b) => b.tanggal === todayStr);
            if (existing) {
              targetBatchId = existing.id;
              targetDate = existing.tanggal;
              setSelectedBatchId(existing.id);
            } else {
              try {
                targetBatchId = await createBatch(todayStr, user?.uid || 'admin', false, weeklySchedule);
                targetDate = todayStr;
                setSelectedBatchId(targetBatchId);
              } catch (err) {
                console.error('Failed to create batch for excel import:', err);
              }
            }
          }

          if (!targetBatchId) {
            showToast({ message: 'Gagal menentukan batch pengiriman!', variant: 'error' });
            return;
          }

          try {
            setSaving(true);
            const { menuItems, menuKeringanItems } = targetDate
              ? getMenuForDate(targetDate, weeklySchedule)
              : { menuItems: [], menuKeringanItems: [] };

            // Pastikan setiap entry memiliki batchId target yang valid dan menu lengkap!
            const entriesToSave = parsedEntries.map((e, idx) => ({
              ...e,
              batchId: targetBatchId!,
              createdBy: user?.uid || e.createdBy || 'system',
              sortOrder: idx,
              menuItems: (e.menuItems && e.menuItems.length > 0) ? e.menuItems : menuItems,
              menuKeringanItems: (e.menuKeringanItems && e.menuKeringanItems.length > 0) ? e.menuKeringanItems : menuKeringanItems,
            }));

            await replaceBatchEntries(targetBatchId, entriesToSave);

            if (currentBatch && currentBatch.status !== 'DRAFT') {
              await updateBatchStatus(targetBatchId, 'DRAFT');
            }

            setSelectedBatchId(targetBatchId);

            const dayInfo = targetDate ? getMenuForDate(targetDate, weeklySchedule).dayMenu.dayName : '';
            showToast({
              message: `Berhasil mengimpor ${entriesToSave.length} data PM baru dari file Excel & generate Menu (${dayInfo}) untuk ${targetDate}!`,
              variant: 'success',
            });
          } catch (err) {
            console.error('Import execution error:', err);
            showToast({ message: 'Gagal mengimpor data PM', variant: 'error' });
          } finally {
            setSaving(false);
          }
        };

        await executeImport();
      } catch (err) {
        console.error('Excel / CSV import error:', err);
        showToast({ message: 'Gagal membaca atau memproses file Excel / CSV', variant: 'error' });
        setSaving(false);
      }
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleApplySpreadsheetEntries = async (
    parsedEntries: Omit<MbgPmEntry, 'id'>[]
  ) => {
    let targetBatchId = selectedBatchId;
    let targetDate = selectedBatch?.tanggal;

    const currentBatch = targetBatchId
      ? (allBatches.find((b) => b.id === targetBatchId) || batches.find((b) => b.id === targetBatchId))
      : null;

    if (currentBatch && !targetDate) {
      targetDate = currentBatch.tanggal;
    }

    if (!targetBatchId || !targetDate) {
      const todayStr = getJakartaDate();
      const existing = allBatches.find((b) => b.tanggal === todayStr) || batches.find((b) => b.tanggal === todayStr);
      if (existing) {
        targetBatchId = existing.id;
        targetDate = existing.tanggal;
        setSelectedBatchId(existing.id);
      } else {
        try {
          targetBatchId = await createBatch(todayStr, user?.uid || 'admin', false, weeklySchedule);
          targetDate = todayStr;
          setSelectedBatchId(targetBatchId);
        } catch (err) {
          console.error('Failed to create batch for spreadsheet import:', err);
        }
      }
    }

    if (!targetBatchId) {
      showToast({ message: 'Gagal menentukan batch target. Silakan pilih atau buat batch baru terlebih dahulu.', variant: 'error' });
      return;
    }

    try {
      setSaving(true);
      // Pastikan SEMUA data yang disimpan memiliki batchId target yang aktif dan menu valid
      const { menuItems, menuKeringanItems } = targetDate
        ? getMenuForDate(targetDate, weeklySchedule)
        : { menuItems: [], menuKeringanItems: [] };

      const entriesToSave = parsedEntries.map((e, idx) => ({
        ...e,
        batchId: targetBatchId!,
        createdBy: user?.uid || e.createdBy || 'system',
        sortOrder: idx,
        menuItems: (e.menuItems && e.menuItems.length > 0) ? e.menuItems : menuItems,
        menuKeringanItems: (e.menuKeringanItems && e.menuKeringanItems.length > 0) ? e.menuKeringanItems : menuKeringanItems,
      }));

      await replaceBatchEntries(targetBatchId, entriesToSave);

      if (currentBatch && currentBatch.status !== 'DRAFT') {
        await updateBatchStatus(targetBatchId, 'DRAFT');
      }

      // Pastikan selectedBatchId aktif mengarah ke batch yang baru saja diisi
      setSelectedBatchId(targetBatchId);

      const dayInfo = targetDate ? getMenuForDate(targetDate, weeklySchedule).dayMenu.dayName : '';
      showToast({
        message: `Berhasil memasukkan ${entriesToSave.length} data PM baru dari Spreadsheet & generate Menu (${dayInfo}) untuk ${targetDate}!`,
        variant: 'success',
      });
    } catch (err) {
      console.error('Apply spreadsheet entries error:', err);
      showToast({ message: 'Gagal menerapkan data spreadsheet ke batch', variant: 'error' });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // Subscribe to weekly menu schedule
  useEffect(() => {
    const unsub = subscribeWeeklySchedule(setWeeklySchedule, selectedPortionClassification);
    return unsub;
  }, [selectedPortionClassification]);

  // Subscribe to batches and auto-create today's batch
  useEffect(() => {
    const unsub = subscribeBatches(
      async (b) => {
        setAllBatches(b);
        // Tampilkan semua batch agar batch yang telah disubmit tetap dapat diakses dan diedit/reopen
        setBatches(b);
        setLoadingBatches(false);

        const todayStr = getJakartaDate();
        const todayBatch = b.find((batch) => batch.tanggal === todayStr);

        setSelectedBatchId((current) => {
          const isCurrentValid = current ? b.some((batch) => batch.id === current) : false;
          if (isCurrentValid) return current;
          if (todayBatch) return todayBatch.id;
          if (b.length > 0) return b[0].id;
          return null;
        });

        // Auto-create batch for today if completely absent from Firestore
        if (!todayBatch) {
          try {
            const newId = await createBatch(todayStr, user?.uid || 'admin', false, weeklySchedule);
            setSelectedBatchId((current) => current || newId);
          } catch (err) {
            console.error('Failed to auto-create batch for today:', err);
          }
        }
      },
      (err) => {
        console.error('Error loading batches:', err);
        setLoadingBatches(false);
      }
    );
    return unsub;
  }, [user, weeklySchedule]);

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

  const selectedBatch = allBatches.find((b) => b.id === selectedBatchId) || batches.find((b) => b.id === selectedBatchId);

  const handleSelectOrPickDate = async (newDateStr: string) => {
    if (!newDateStr || !user) return;

    const existing = allBatches.find((b) => b.tanggal === newDateStr) || batches.find((b) => b.tanggal === newDateStr);
    if (existing) {
      setSelectedBatchId(existing.id);
      return;
    }

    try {
      setSaving(true);
      const newId = await createBatch(newDateStr, user.uid, false, weeklySchedule);
      setSelectedBatchId(newId);
      showToast({
        message: `Berhasil membuat batch ${newDateStr}. Silakan klik "Import Excel / CSV PM" untuk mengisi data penerima manfaat!`,
        variant: 'success',
      });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal membuat batch untuk tanggal tersebut', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

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

  // Check for misclassified Posyandu entries in active batch
  const misclassifiedPosyanduCount = useMemo(() => {
    return entries.filter((e) => isPosyanduName(e.institutionName) && e.institutionType !== 'posyandu').length;
  }, [entries]);

  // Deteksi jika terdapat data institusi duplikat (menyebabkan total ganda)
  const duplicateEntriesCount = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    for (const e of entries) {
      const key = (e.institutionName || '').trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        count++;
      } else {
        seen.add(key);
      }
    }
    return count;
  }, [entries]);

  const handleCleanDuplicates = async () => {
    if (!selectedBatchId) return;
    try {
      setSaving(true);
      const deletedCount = await cleanDuplicateBatchEntries(selectedBatchId);
      showToast({
        message: `Berhasil membersihkan ${deletedCount} data institusi duplikat! Total porsi kini sudah normal.`,
        variant: 'success',
      });
    } catch (err) {
      console.error('Failed to clean duplicates:', err);
      showToast({ message: 'Gagal membersihkan data duplikat', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Grand totals perhitungan akurat murni dari entri aktif
  const grandTotals = useMemo(() => {
    const active = entries.filter((e) => !e.isSekolahLibur);
    const posyanduActive = active.filter((e) => e.institutionType === 'posyandu');
    const sekolahActive = active.filter((e) => e.institutionType !== 'posyandu');

    const petugasSet = new Set<string>();
    active.forEach((e) => {
      if (e.assignedPetugasName) petugasSet.add(e.assignedPetugasName.trim());
    });

    const calc = (list: typeof active, isPos: boolean) => {
      const porsiBesarL = list.reduce((s, e) => s + (e.qtPorsiBesarL || 0), 0);
      const porsiBesarP = list.reduce((s, e) => s + (e.qtPorsiBesarP || 0), 0);
      
      const porsiKecilL_raw = list.reduce((s, e) => s + (e.qtPorsiKecilL || 0), 0);
      const porsiKecilP_raw = list.reduce((s, e) => s + (e.qtPorsiKecilP || 0), 0);

      const porsiBalitaL = isPos ? porsiKecilL_raw : 0;
      const porsiBalitaP = isPos ? porsiKecilP_raw : 0;
      const porsiKecilL = isPos ? 0 : porsiKecilL_raw;
      const porsiKecilP = isPos ? 0 : porsiKecilP_raw;

      const porsiBumil = list.reduce((s, e) => s + (e.qtBumil ?? (e.institutionName.toLowerCase().includes('bumil') ? e.qtBumilBusui || 0 : 0)), 0);
      const porsiBusui = list.reduce((s, e) => s + (e.qtBusui ?? (e.institutionName.toLowerCase().includes('busui') ? e.qtBumilBusui || 0 : 0)), 0);

      const guruL_raw = list.reduce((s, e) => s + (e.qtGuruL || 0), 0);
      const guruP_raw = list.reduce((s, e) => s + (e.qtGuruP || 0), 0);

      const guruL = isPos ? 0 : guruL_raw;
      const guruP = isPos ? 0 : guruP_raw;
      const kaderL = isPos ? guruL_raw : 0;
      const kaderP = isPos ? guruP_raw : 0;

      const tendikL = list.reduce((s, e) => s + (e.qtTendikL || 0), 0);
      const tendikP = list.reduce((s, e) => s + (e.qtTendikP || 0), 0);

      const totalSiswaL = porsiBesarL + porsiKecilL + porsiBalitaL;
      const totalSiswaP = porsiBesarP + porsiKecilP + porsiBalitaP + porsiBumil + porsiBusui;
      const totalSiswaJml = totalSiswaL + totalSiswaP;
      const totalStafKader = guruL + guruP + kaderL + kaderP + tendikL + tendikP;
      const totalKeseluruhan = totalSiswaJml + totalStafKader;

      return {
        porsiBesarL, porsiBesarP,
        porsiKecilL, porsiKecilP,
        porsiBalitaL, porsiBalitaP,
        porsiBumil, porsiBusui,
        totalSiswaL, totalSiswaP, totalSiswaJml,
        guruL, guruP, kaderL, kaderP, tendikL, tendikP,
        totalStafKader, totalKeseluruhan
      };
    };

    const sekolah = calc(sekolahActive, false);
    const posyandu = calc(posyanduActive, true);
    
    // For root (combined)
    const combined = {
      porsiBesarL: sekolah.porsiBesarL + posyandu.porsiBesarL,
      porsiBesarP: sekolah.porsiBesarP + posyandu.porsiBesarP,
      porsiKecilL: sekolah.porsiKecilL + posyandu.porsiKecilL,
      porsiKecilP: sekolah.porsiKecilP + posyandu.porsiKecilP,
      porsiBalitaL: sekolah.porsiBalitaL + posyandu.porsiBalitaL,
      porsiBalitaP: sekolah.porsiBalitaP + posyandu.porsiBalitaP,
      porsiBumil: sekolah.porsiBumil + posyandu.porsiBumil,
      porsiBusui: sekolah.porsiBusui + posyandu.porsiBusui,
      totalSiswaL: sekolah.totalSiswaL + posyandu.totalSiswaL,
      totalSiswaP: sekolah.totalSiswaP + posyandu.totalSiswaP,
      totalSiswaJml: sekolah.totalSiswaJml + posyandu.totalSiswaJml,
      guruL: sekolah.guruL + posyandu.guruL,
      guruP: sekolah.guruP + posyandu.guruP,
      kaderL: sekolah.kaderL + posyandu.kaderL,
      kaderP: sekolah.kaderP + posyandu.kaderP,
      tendikL: sekolah.tendikL + posyandu.tendikL,
      tendikP: sekolah.tendikP + posyandu.tendikP,
      totalStafKader: sekolah.totalStafKader + posyandu.totalStafKader,
      totalKeseluruhan: sekolah.totalKeseluruhan + posyandu.totalKeseluruhan,
      
      // additional fields
      siswa: sekolah.totalSiswaJml + posyandu.totalSiswaJml,
      bumil: sekolah.porsiBumil + posyandu.porsiBumil + sekolah.porsiBusui + posyandu.porsiBusui,
      guru: sekolah.totalStafKader + posyandu.totalStafKader,
      pobia: active.reduce((s, e) => s + (e.qtPobiaNasi || 0), 0),
      alergi: active.reduce((s, e) => s + (e.qtAlergi || 0), 0),
      tidakAlergi: active.reduce((s, e) => s + (e.qtTidakAlergi ?? Math.max(0, (e.jumlah || 0) - (e.qtAlergi || 0))), 0),
      jumlah: sekolah.totalKeseluruhan + posyandu.totalKeseluruhan,
      totalInstitusi: entries.length,
      totalPetugas: petugasSet.size,
    };

    return { ...combined, sekolah, posyandu };
  }, [entries]);

  const autoRekapTotals = useMemo(() => getAutoRekapTotals(entries), [entries]);
  const schoolAutoRekapTotals = useMemo(
    () => getAutoRekapTotals(entries.filter((entry) => entry.institutionType !== 'posyandu')),
    [entries]
  );
  const posyanduAutoRekapTotals = useMemo(
    () => getAutoRekapTotals(entries.filter((entry) => entry.institutionType === 'posyandu')),
    [entries]
  );
  const autoRekapTableTotals = useMemo(() => ({
    ...grandTotals,
    ...autoRekapTotals,
    totalSiswaL: autoRekapTotals.totalL,
    totalSiswaP: autoRekapTotals.totalP,
    totalSiswaJml: autoRekapTotals.totalL + autoRekapTotals.totalP,
    totalStafKader: autoRekapTotals.guruL + autoRekapTotals.guruP + autoRekapTotals.tendikL + autoRekapTotals.tendikP,
    totalKeseluruhan: autoRekapTotals.jumlah,
  }), [grandTotals, autoRekapTotals]);

  const handleAutoFixPosyanduEntries = async () => {
    if (!selectedBatchId) return;
    try {
      setSaving(true);
      const updatesList: Promise<void>[] = [];
      entries.forEach((e) => {
        if (isPosyanduName(e.institutionName) && e.institutionType !== 'posyandu') {
          const pbl = e.qtPorsiBesarL || 0;
          const pbp = e.qtPorsiBesarP || 0;
          const pkl = e.qtPorsiKecilL || 0;
          const pkp = e.qtPorsiKecilP || 0;

          const lowerName = e.institutionName.toLowerCase();
          let balitaL = 0;
          let balitaP = 0;
          let bumil = 0;
          let busui = 0;

          if (lowerName.includes('bumil')) {
            bumil = pbl || pkl || pbp || pkp || e.qtBumil || e.qtSiswaBalita || 0;
          } else if (lowerName.includes('busui')) {
            busui = pbl || pkl || pbp || pkp || e.qtBusui || e.qtSiswaBalita || 0;
          } else {
            // Balita
            balitaL = pbl || pkl;
            balitaP = pbp || pkp;
          }

          const totalBalita = balitaL + balitaP;
          const totalBumilBusui = bumil + busui;
          const totalKader = (e.qtGuruL || 0) + (e.qtGuruP || 0) + (e.qtTendikL || 0) + (e.qtTendikP || 0) || e.qtGuruKader || 0;
          const jumlah = totalBalita + totalBumilBusui + totalKader;

          updatesList.push(
            updateEntry(e.id, {
              institutionType: 'posyandu',
              schoolLevel: undefined,
              qtPorsiBesarL: 0,
              qtPorsiBesarP: 0,
              qtPorsiKecilL: balitaL,
              qtPorsiKecilP: balitaP,
              qtBumil: bumil,
              qtBusui: busui,
              qtBumilBusui: totalBumilBusui,
              qtPorsiBalita: totalBalita,
              qtPorsiBumilBusui: totalBumilBusui,
              qtSiswaBalita: totalBalita,
              qtPorsiKecil: 0,
              qtPorsiBesar: totalKader,
              qtGuruKader: totalKader,
              jumlah,
              qtTidakAlergi: Math.max(0, jumlah - (e.qtAlergi || 0)),
            })
          );
        }
      });
      await Promise.all(updatesList);
      await recalculateBatchTotals(selectedBatchId);
      showToast({
        message: `Berhasil mengonversi ${updatesList.length} data Posyandu (Cempaka dll) ke porsi Balita, Bumil, dan Busui!`,
        variant: 'success',
      });
    } catch (err) {
      console.error('Failed to auto-fix posyandu entries:', err);
      showToast({ message: 'Gagal memperbaiki klasifikasi posyandu', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ---- Handlers ----
  const handleApplyScheduleMenuToBatch = async () => {
    if (!selectedBatchId || !selectedBatch) return;
    const { menuItems, menuKeringanItems } = getMenuForDate(selectedBatch.tanggal, weeklySchedule);

    try {
      if (entries.length === 0) {
        await bulkAddEntriesFromMaster(selectedBatchId, user?.uid || '', selectedBatch.tanggal, weeklySchedule);
        await recalculateBatchTotals(selectedBatchId);
      } else {
        const batchOps = entries.map((e) =>
          updateEntry(e.id, {
            menuItems: [...menuItems],
            menuKeringanItems: [...menuKeringanItems],
          })
        );
        await Promise.all(batchOps);
      }
      showToast({
        message: `Berhasil menerapkan menu jadwal (${menuItems.join(', ')}) ke seluruh institusi!`,
        variant: 'success',
      });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal mengupdate menu jadwal ke institusi', variant: 'error' });
    }
  };

  const handleSaveWeeklySchedule = async (updatedDays: MbgDayMenu[], portion?: MbgPortionClassification) => {
    if (!user) return;
    const targetPortion = portion || selectedPortionClassification;
    try {
      await saveWeeklySchedule(updatedDays, user.uid, targetPortion);
      setWeeklySchedule(updatedDays);
      showToast({ message: `Master Jadwal Menu Mingguan (${targetPortion}) berhasil disimpan!`, variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal menyimpan jadwal menu mingguan', variant: 'error' });
    }
  };

  const handleCreateBatch = async (tanggal: string, copyFromId?: string, autoPopulateMaster?: boolean) => {
    if (!user) return;
    try {
      setSaving(true);
      const newId = await createBatch(tanggal, user.uid, autoPopulateMaster || false, weeklySchedule);
      if (copyFromId) {
        await copyFromBatch(copyFromId, newId, user.uid, tanggal, weeklySchedule);
      }
      setSelectedBatchId(newId);
      const successMsg = copyFromId
        ? `Batch ${tanggal} berhasil dibuat dengan menyalin data dari batch sebelumnya!`
        : autoPopulateMaster
        ? `Batch ${tanggal} berhasil dibuat dengan 27 Institusi Master otomatis!`
        : `Batch ${tanggal} baru berhasil dibuat! Silakan klik "Import Excel / CSV PM" untuk mengisi data PM.`;
      showToast({ message: successMsg, variant: 'success' });
    } catch (err: unknown) {
      console.error(err);
      const errObj = err as { message?: string };
      showToast({ message: errObj?.message || 'Gagal membuat batch', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEntry = useCallback(
    async (entryId: string, updates: Partial<MbgPmEntry>) => {
      // 1. Instant optimistic local state update for zero-latency typing
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== entryId) return e;
          const merged = { ...e, ...updates };
          const newJumlah = calcJumlah(merged);
          merged.jumlah = newJumlah;
          if (updates.qtAlergi !== undefined || updates.jumlah !== undefined) {
            merged.qtTidakAlergi = Math.max(0, newJumlah - (merged.qtAlergi || 0));
          }
          return merged;
        })
      );

      // 2. Persist to Firestore in background
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
      message: `Apakah Anda yakin ingin men-submit seluruh data PM untuk tanggal ${selectedBatch.tanggal}? Setelah disubmit, data akan diteruskan ke Produksi/Purchasing dan muncul di Arsip PM.`,
      variant: 'warning',
      onConfirm: async () => {
        setSaving(true);
        try {
          await recalculateBatchTotals(selectedBatchId);
          await updateBatchStatus(selectedBatchId, 'PM_SUBMITTED');
          showToast({ message: 'Data PM berhasil disubmit ke Produksi dan Arsip PM!', variant: 'success' });
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal submit data', variant: 'error' });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const handleReopenBatchToDraft = () => {
    if (!selectedBatchId || !selectedBatch) return;

    setConfirmState({
      title: 'Buka Kembali Batch',
      message: `Apakah Anda ingin membuka kembali batch untuk tanggal ${selectedBatch.tanggal} ke status DRAFT agar dapat diedit dan disubmit ulang?`,
      variant: 'info',
      onConfirm: async () => {
        setSaving(true);
        try {
          await updateBatchStatus(selectedBatchId, 'DRAFT');
          showToast({ message: 'Batch berhasil dibuka kembali ke status DRAFT!', variant: 'success' });
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal membuka kembali batch', variant: 'error' });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const handleDeleteBatch = async () => {
    if (!selectedBatchId || !selectedBatch) return;
    const confirmText = `Pindahkan batch tanggal ${selectedBatch.tanggal} ke Arsip Backup? Data PM ini akan diamankan di tab Arsip Backup (menu Arsip PM) dan dapat Anda pulihkan kembali kapan saja.`;
    if (!window.confirm(confirmText)) return;

    const idToDelete = selectedBatchId;
    // Optimistic update
    setBatches((prev) => prev.filter((b) => b.id !== idToDelete));
    setSelectedBatchId(null);

    setSaving(true);
    try {
      await moveBatchToBackup(idToDelete, user?.uid);
      showToast({ message: `Batch ${selectedBatch.tanggal} berhasil diamankan ke Arsip Backup!`, variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal memindahkan batch ke arsip backup', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllMbgData = async () => {
    try {
      setDeletingAll(true);
      await deleteAllMbgData();
      showToast({
        message: 'Seluruh data MBG (Admin, Produksi, Distribusi, Purchasing, Kurir) berhasil dihapus!',
        variant: 'success',
      });
      setSelectedBatchId(null);
      setEntries([]);
      setShowDeleteAllModal(false);
    } catch (err) {
      console.error('Failed to delete all MBG data:', err);
      showToast({ message: 'Gagal menghapus data MBG', variant: 'error' });
    } finally {
      setDeletingAll(false);
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
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 mb-6 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
            {/* Left Info: Calendar Icon + Date Picker + Batch Select + Status + Menu Preview */}
            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
              <div className="p-2 bg-amber-500/10 rounded-xl text-amber-600 flex items-center justify-center shrink-0">
                <Calendar className="h-4.5 w-4.5" />
              </div>

              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider hidden sm:inline">Pengiriman:</span>
                  {selectedBatch && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
                      {MBG_BATCH_STATUS_CONFIG[selectedBatch.status]?.label || selectedBatch.status}
                    </span>
                  )}
                </div>

                <input
                  type="date"
                  title="Pilih Tanggal Pengiriman"
                  value={selectedBatch ? selectedBatch.tanggal : getJakartaDate()}
                  onChange={(e) => handleSelectOrPickDate(e.target.value)}
                  className="text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 rounded-lg border border-slate-300 px-2 py-1 bg-slate-50 cursor-pointer shrink-0"
                />

                {selectedBatch && (
                  <div className="text-xs text-slate-600 font-medium pl-2 border-l border-slate-200 flex items-center gap-1.5 min-w-0">
                    <span className="font-extrabold text-slate-800 shrink-0">
                      {getMenuForDate(selectedBatch.tanggal, weeklySchedule).dayMenu.dayName}
                    </span>
                    <span className="text-slate-300 shrink-0">•</span>
                    <span className="text-slate-500 text-xs truncate max-w-[160px] md:max-w-[220px] 2xl:max-w-[320px]">
                      {getMenuForDate(selectedBatch.tanggal, weeklySchedule).menuItems.join(', ') || 'Tanpa Menu'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Action Buttons: Responsive & Neatly Grouped */}
            <div className="flex items-center gap-1.5 flex-wrap justify-start xl:justify-end">
              <input
                type="file"
                ref={csvFileInputRef}
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImportExcelPm(file);
                    e.target.value = '';
                  }
                }}
              />

              <button
                type="button"
                onClick={() => setShowSpreadsheetModal(true)}
                disabled={!selectedBatchId}
                title="Pilih link Google Sheets atau file Excel/CSV, lalu periksa preview sebelum menerapkan data"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs whitespace-nowrap"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                Import Link / Excel
              </button>

              {/* Submit / Reopen Button in Top Action Bar */}
              {selectedBatch && entries.length > 0 && (
                selectedBatch.status === 'DRAFT' ? (
                  <button
                    type="button"
                    onClick={handleSubmitBatch}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-extrabold transition-all cursor-pointer shadow-sm disabled:opacity-50 whitespace-nowrap active:scale-95"
                    title="Submit Data PM untuk diteruskan ke Purchasing dan Produksi"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Submit Data PM
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 whitespace-nowrap">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      PM Disubmit
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/mbg/archive?batchId=${selectedBatchId}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 text-xs font-bold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                      title="Lihat batch ini langsung di menu Arsip PM"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                      Lihat di Arsip PM
                    </button>
                    <button
                      type="button"
                      onClick={handleReopenBatchToDraft}
                      disabled={saving}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 text-xs font-extrabold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                      title="Buka kembali batch ke mode DRAFT untuk mengedit data dan submit ulang"
                    >
                      <Edit className="h-3.5 w-3.5 text-amber-700" />
                      Buka / Edit Batch
                    </button>
                  </div>
                )
              )}

              <button
                onClick={() => setShowScheduleModal(true)}
                title="Master Jadwal Menu Mingguan MBG"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                <ChefHat className="h-3.5 w-3.5 text-slate-600" />
                Jadwal Menu
              </button>

              <button
                type="button"
                onClick={handleApplyScheduleMenuToBatch}
                disabled={!selectedBatchId || saving}
                title="Terapkan / sinkronisasi menu dari jadwal hari ini ke semua institusi"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-2xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                Sync Menu
              </button>

              <button
                onClick={() => setShowNewBatchModal(true)}
                title="Buat batch pengiriman baru"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FBBF24] hover:bg-[#F59E0B] text-slate-900 text-xs font-extrabold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Batch Baru
              </button>

              {selectedBatchId && (
                <button
                  onClick={handleDeleteBatch}
                  title="Amankan batch pengiriman ini ke Arsip Backup agar tersimpan sebagai cadangan dan dapat dipulihkan kapan saja"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-300 hover:border-amber-400 text-amber-900 bg-amber-50/70 hover:bg-amber-100 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Archive className="h-3.5 w-3.5 text-amber-700" />
                  Backup Batch
                </button>
              )}

              <button
                onClick={() => setShowDeleteAllModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                title="Hapus seluruh data operasional MBG (Admin, Produksi, Distribusi, Purchasing, Kurir)"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Semua Data
              </button>
            </div>
          </div>

          {/* Main Content Layout: Full Width Table */}
          <div className="w-full min-w-0">
              {/* Search Bar & Actions */}
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

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg">
                    Total: {filteredEntries.length} Institusi
                  </span>

                  {selectedBatch && entries.length > 0 && (
                    selectedBatch.status === 'DRAFT' ? (
                      <button
                        type="button"
                        onClick={handleSubmitBatch}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-extrabold transition-all cursor-pointer shadow-md shadow-green-600/20 disabled:opacity-50 whitespace-nowrap active:scale-95"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Submit Data PM
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/mbg/archive?batchId=${selectedBatchId}`)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 text-xs font-bold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                          Lihat di Arsip PM
                        </button>
                        <button
                          type="button"
                          onClick={handleReopenBatchToDraft}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-extrabold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          <Edit className="h-3.5 w-3.5 text-amber-700" />
                          Edit / Buka Batch
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Alert Banner: Duplicate Entries Detected */}
              {duplicateEntriesCount > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <div>
                      <h4 className="text-xs font-extrabold text-amber-950">
                        Terdeteksi {duplicateEntriesCount} Data Institusi Duplikat (Total Porsi Menjadi Ganda)!
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Import Excel sebelumnya menyebabkan nama institusi terinput lebih dari satu kali sehingga total menjadi ganda ({grandTotals.totalKeseluruhan}). Klik tombol di samping untuk otomatis membersihkan duplikat.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCleanDuplicates}
                    disabled={saving}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95 disabled:opacity-50"
                  >
                    <span>🧹 Bersihkan Duplikat Sekarang</span>
                  </button>
                </div>
              )}

              {/* Alert Banner: Misclassified Posyandu */}
              {misclassifiedPosyanduCount > 0 && (
                <div className="mb-4 bg-purple-50 border border-purple-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">👶</span>
                    <div>
                      <h4 className="text-xs font-extrabold text-purple-950">
                        Terdeteksi {misclassifiedPosyanduCount} Institusi Posyandu (Cempaka dll) masih terdaftar sebagai Sekolah
                      </h4>
                      <p className="text-[11px] text-purple-700 mt-0.5">
                        Porsi saat ini masih masuk ke Porsi Besar/Kecil. Klik tombol di samping untuk otomatis memindahkan ke kolom Balita, Bumil, dan Busui!
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoFixPosyanduEntries}
                    disabled={saving}
                    className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95 disabled:opacity-50"
                  >
                    <span>⚡ Perbaiki Otomatis ke Posyandu</span>
                  </button>
                </div>
              )}

              {/* Single Unified Table */}
              {loadingEntries ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
                </div>
              ) : (
                <>
                  {[
                    {
                      title: 'DATA PM — FORMAT AUTO REKAP',
                      list: filteredEntries.filter((entry) => entry.institutionType !== 'posyandu'),
                      totals: { ...autoRekapTableTotals, ...schoolAutoRekapTotals },
                    },
                    {
                      title: 'DATA POSYANDU',
                      list: filteredEntries.filter((entry) => entry.institutionType === 'posyandu'),
                      totals: { ...autoRekapTableTotals, ...posyanduAutoRekapTotals },
                    },
                  ].map(({ title, list, totals }) => (
                    <div key={title} className="mb-8 last:mb-0">
                      <h3 className="font-bold text-slate-800 text-sm mb-3 uppercase tracking-wide px-1 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        {title}
                      </h3>
                      <div className="overflow-x-auto border border-slate-300 rounded-xl bg-white shadow-xs">
                        <table className="w-full text-left font-['Hanken_Grotesk',system-ui,sans-serif] border-collapse border border-slate-300">
                          <thead>
                            <tr className="bg-slate-200 text-[9px] font-extrabold text-slate-800 uppercase tracking-tight text-center border-b border-slate-300">
                              <th rowSpan={2} className="px-2 py-1.5 border-r border-slate-300 text-left min-w-[170px]">SEKOLAH</th>
                              <th colSpan={2} className="px-1 py-1 border-r border-slate-300">PORSI KECIL</th>
                              <th colSpan={2} className="px-1 py-1 border-r border-slate-300">PORSI BESAR</th>
                              <th colSpan={2} className="px-1 py-1 border-r border-slate-300 bg-slate-300/60 font-black">TOTAL</th>
                              <th rowSpan={2} className="px-1 py-1 border-r border-slate-300 bg-slate-300/60 font-black">JML</th>
                              <th colSpan={2} className="px-1 py-1 border-r border-slate-300">GURU</th>
                              <th colSpan={2} className="px-1 py-1 border-r border-slate-300">TENDIK</th>
                              <th rowSpan={2} className="px-1 py-1 border-r border-slate-300 bg-slate-300/50 font-extrabold">JML</th>
                              <th rowSpan={2} className="px-1.5 py-1 border-r border-slate-300 bg-amber-100/80 text-amber-900 font-black text-[9px]">TOTAL KESELURUHAN</th>
                              <th rowSpan={2} className="px-1 py-1">AKSI</th>
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
                                <td colSpan={15} className="px-4 py-8 text-center text-xs font-medium text-slate-400 italic">
                                  Belum ada data PM.
                                </td>
                              </tr>
                            ) : (
                              list.map((entry) => (
                                <PmEntryRow
                                  key={entry.id}
                                  entry={entry}
                                  onUpdate={handleUpdateEntry}
                                  onDelete={handleDeleteEntry}
                                  isLibur={entry.isSekolahLibur}
                                  onManageClasses={() => setSelectedEntryForMenu(entry)}
                                  onConfirmAction={setConfirmState}
                                  sourceLayout
                                />
                              ))
                            )}
                            {list.length > 0 && (
                              <tr className="bg-slate-800 text-white text-xs font-bold border-t border-slate-700 text-center">
                                <td className="px-3 py-3 text-left font-black tracking-wide">TOTAL</td>
                                <td className="px-1 py-3">{totals.porsiKecilL || '—'}</td>
                                <td className="px-1 py-3">{totals.porsiKecilP || '—'}</td>
                                <td className="px-1 py-3">{totals.porsiBesarL || '—'}</td>
                                <td className="px-1 py-3">{totals.porsiBesarP || '—'}</td>
                                <td className="px-1 py-3 bg-slate-700">{totals.totalL || '—'}</td>
                                <td className="px-1 py-3 bg-slate-700">{totals.totalP || '—'}</td>
                                <td className="px-1 py-3 bg-slate-600 font-black">{(totals.totalL + totals.totalP) || '—'}</td>
                                <td className="px-1 py-3">{totals.guruL || '—'}</td>
                                <td className="px-1 py-3">{totals.guruP || '—'}</td>
                                <td className="px-1 py-3">{totals.tendikL || '—'}</td>
                                <td className="px-1 py-3">{totals.tendikP || '—'}</td>
                                <td className="px-1 py-3 bg-slate-700 font-black">{totals.guruL + totals.guruP + totals.tendikL + totals.tendikP || '—'}</td>
                                <td className="px-2 py-3 bg-amber-400 text-slate-950 font-black text-sm">{totals.jumlah}</td>
                                <td className="px-1 py-3"></td>
                              </tr>
                            )}

                            {/* Legacy total row retained only for source compatibility during hot reload. */}
                            {list.length > 0 && (
                              <tr className="hidden">
                                {/* 1. SEKOLAH / POSYANDU */}
                                <td className="px-3 py-3 text-left font-black tracking-wide">TOTAL (AKTIF)</td>
                                {/* 2. PORSI BESAR L */}
                                <td className="px-1 py-3 text-center">{totals.porsiBesarL || '—'}</td>
                                {/* 3. PORSI BESAR P */}
                                <td className="px-1 py-3 text-center">{totals.porsiBesarP || '—'}</td>
                                {/* 4. PORSI KECIL L */}
                                <td className="px-1 py-3 text-center">{totals.porsiKecilL || '—'}</td>
                                {/* 5. PORSI KECIL P */}
                                <td className="px-1 py-3 text-center">{totals.porsiKecilP || '—'}</td>
                                {/* 6. PORSI BALITA L */}
                                <td className="px-1 py-3 text-center font-bold text-amber-300">{totals.porsiBalitaL || '—'}</td>
                                {/* 7. PORSI BALITA P */}
                                <td className="px-1 py-3 text-center font-bold text-amber-300">{totals.porsiBalitaP || '—'}</td>
                                {/* 8. PORSI BUMIL */}
                                <td className="px-1 py-3 text-center font-bold text-purple-300">{totals.porsiBumil || '—'}</td>
                                {/* 9. PORSI BUSUI */}
                                <td className="px-1 py-3 text-center font-bold text-purple-300">{totals.porsiBusui || '—'}</td>
                                {/* 10. TOTAL SISWA L */}
                                <td className="px-1 py-3 text-center bg-slate-700">{totals.totalSiswaL || '—'}</td>
                                {/* 11. TOTAL SISWA P */}
                                <td className="px-1 py-3 text-center bg-slate-700">{totals.totalSiswaP || '—'}</td>
                                {/* 12. TOTAL SISWA JML */}
                                <td className="px-1 py-3 text-center bg-slate-600 font-black">{totals.totalSiswaJml || '—'}</td>
                                {/* 13. GURU L */}
                                <td className="px-1 py-3 text-center">{totals.guruL || '—'}</td>
                                {/* 14. GURU P */}
                                <td className="px-1 py-3 text-center">{totals.guruP || '—'}</td>
                                {/* 15. KADER L */}
                                <td className="px-1 py-3 text-center">{totals.kaderL || '—'}</td>
                                {/* 16. KADER P */}
                                <td className="px-1 py-3 text-center">{totals.kaderP || '—'}</td>
                                {/* 17. TENDIK L */}
                                <td className="px-1 py-3 text-center">{totals.tendikL || '—'}</td>
                                {/* 18. TENDIK P */}
                                <td className="px-1 py-3 text-center">{totals.tendikP || '—'}</td>
                                {/* 19. STAF/KADER JML */}
                                <td className="px-1 py-3 text-center bg-slate-700 font-black">{totals.totalStafKader || '—'}</td>
                                {/* 20. TOTAL KESELURUHAN */}
                                <td className="px-2 py-3 text-center bg-amber-400 text-slate-950 font-black text-sm">
                                  {totals.totalKeseluruhan}
                                </td>
                                {/* 21. AKSI */}
                                <td className="px-1 py-3"></td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {/* The same grand-total convention used by AUTO REKAP. */}
                  {entries.length > 0 && (
                    <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-extrabold text-emerald-950">RINGKASAN TOTAL HASIL IMPORT</p>
                        <p className="text-[11px] text-emerald-800 mt-0.5">
                          Jumlah ini adalah penjumlahan semua baris pada format AUTO REKAP.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                        <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white font-black">
                          Total Keseluruhan: {autoRekapTotals.jumlah.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 border border-slate-300 rounded-xl overflow-hidden bg-white shadow-xs">
                    <button
                      onClick={handleAddRow}
                      className="w-full py-4 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Tambah Institusi Baru
                    </button>
                  </div>

                  {/* Submit / Reopen Bottom Bar */}
                  {selectedBatch && entries.length > 0 && (
                    <div className="mt-8 flex justify-end gap-3">
                      {selectedBatch.status === 'DRAFT' ? (
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
                      ) : (
                        <button
                          onClick={handleReopenBatchToDraft}
                          disabled={saving}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-sm font-extrabold rounded-xl cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                        >
                          <Edit className="h-4 w-4 text-amber-700" />
                          Buka Kembali / Edit Data PM
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
          </div>
        </>
      )}

      {/* Weekly Schedule Modal */}
      <AnimatePresence>
        <WeeklyScheduleModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          scheduleDays={weeklySchedule}
          selectedPortion={selectedPortionClassification}
          onPortionChange={(p) => setSelectedPortionClassification(p)}
          onSave={handleSaveWeeklySchedule}
        />
      </AnimatePresence>

      {/* Delete All MBG Data Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-100 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-full shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Konfirmasi Hapus Semua Data MBG</h3>
                <p className="text-xs text-slate-500 mt-0.5">Tindakan ini tidak dapat dibatalkan!</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed bg-red-50 p-3.5 rounded-xl border border-red-200 space-y-2">
              <p className="font-extrabold text-red-800">
                ⚠️ Anda akan menghapus permanen seluruh data operasional MBG:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 font-medium">
                <li><strong>Admin MBG</strong>: Batch Pengiriman & Data Institusi</li>
                <li><strong>Produksi MBG</strong>: Sesi Masak, Resep & Kadar Gizi</li>
                <li><strong>Distribusi & QC</strong>: Checklist QC & Penugasan Kurir</li>
                <li><strong>Purchasing</strong>: Purchase Order (PO) Belanja</li>
                <li><strong>Kurir MBG</strong>: Bukti Foto Pengantaran & Arsip Laporan</li>
              </ul>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteAllModal(false)}
                disabled={deletingAll}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDeleteAllMbgData}
                disabled={deletingAll}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {deletingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Menghapus...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" /> Ya, Hapus Semua
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Batch Modal */}
      <AnimatePresence>
        <NewBatchModal
          isOpen={showNewBatchModal}
          onClose={() => setShowNewBatchModal(false)}
          onSubmit={handleCreateBatch}
          batches={allBatches.length > 0 ? allBatches : batches}
        />
      </AnimatePresence>

      {/* Google Spreadsheet Import Modal */}
      <AnimatePresence>
        {showSpreadsheetModal && (
          <SpreadsheetImportModal
            isOpen={showSpreadsheetModal}
            onClose={() => setShowSpreadsheetModal(false)}
            selectedBatch={selectedBatch}
            weeklySchedule={weeklySchedule}
            userUid={user?.uid || ''}
            onApplyEntries={handleApplySpreadsheetEntries}
          />
        )}
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
                <div className={`p-2.5 rounded-xl ${confirmState.variant === 'danger'
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
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer ${confirmState.variant === 'danger'
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
        className={`bg-white rounded-2xl shadow-2xl w-full p-6 font-['Hanken_Grotesk',system-ui,sans-serif] transition-all duration-300 ${isSekolah ? 'max-w-5xl' : 'max-w-3xl'
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
