// ============================================================================
// MBG Bahan Checklist Page — Form Pemeriksaan Bahan Makanan
// Standar Resmi Badan Gizi Nasional Republik Indonesia
// WYSIWYG Form Layout + Edit + Ceklis + Export PDF/DOCX + Arsip
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ClipboardCheck,
  Save,
  FileDown,
  Plus,
  Trash2,
  Loader2,
  Search,
  Check,
  History,
  FileText,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { SearchableBatchSelector } from '@/components/mbg/SearchableBatchSelector';
import type {
  MbgPmBatch,
  MbgBahanChecklistForm,
  MbgInspectionFormRow,
  MbgProductionDailyReport,
} from '@/types/mbg';
import {
  subscribeBatches,
} from '@/services/mbgAdminService';
import {
  subscribeDailyReport,
} from '@/services/mbgProductionService';
import {
  subscribeBahanChecklist,
  subscribeAllBahanChecklist,
  saveBahanChecklist,
  deleteBahanChecklist,
  extractIngredientsFromDailyReport,
} from '@/services/mbgBahanService';
import { exportBahanChecklistPdf } from '@/utils/mbgBahanPdfGenerator';
import { exportBahanChecklistDocx } from '@/utils/mbgBahanDocxGenerator';
import { getJakartaDate } from '@/utils/date';

function formatIndoDateLong(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

export function MbgBahanChecklistPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [dailyReport, setDailyReport] = useState<MbgProductionDailyReport | null>(null);
  const [savedForm, setSavedForm] = useState<MbgBahanChecklistForm | null>(null);
  const [allForms, setAllForms] = useState<MbgBahanChecklistForm[]>([]);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  // Form editable states
  const [noForm, setNoForm] = useState('01/PBM/IX/2026');
  const [dari, setDari] = useState('Koperasi Al Umanaa Sejahtera Mandiri');
  const [kepada, setKepada] = useState('SPPG Sukabumi Gunungguruh Kebonmanggu');
  const [waktu, setWaktu] = useState('06.00 - 08.00 WIB');
  const [rows, setRows] = useState<MbgInspectionFormRow[]>([]);
  const [lokasiTtd, setLokasiTtd] = useState('Sukabumi');
  const [tanggalTtd, setTanggalTtd] = useState('01 September 2026');
  const [officerName, setOfficerName] = useState('Ragha Eskha Utama, S. Hum.');
  const [officerTitle, setOfficerTitle] = useState('Kepala Satuan Pelayanan Pemenuhan Gizi');

  // 1. Subscribe Batches
  useEffect(() => {
    const unsub = subscribeBatches((list) => {
      setBatches(list);
      if (!selectedBatchId && list.length > 0) {
        const todayStr = getJakartaDate();
        const active = list.find((b) => b.tanggal === todayStr) || list[0];
        setSelectedBatchId(active.id);
      }
    });
    return () => unsub();
  }, []);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId),
    [batches, selectedBatchId]
  );

  // 2. Subscribe Daily Report for this batch (to get ingredients from production)
  useEffect(() => {
    if (!selectedBatchId) {
      setDailyReport(null);
      return;
    }
    const unsub = subscribeDailyReport(selectedBatchId, (report) => {
      setDailyReport(report);
    });
    return () => unsub();
  }, [selectedBatchId]);

  // 3. Subscribe Bahan Checklist from Firestore for this batch
  useEffect(() => {
    if (!selectedBatchId) {
      setSavedForm(null);
      return;
    }
    const unsub = subscribeBahanChecklist(selectedBatchId, (form) => {
      setSavedForm(form);
    });
    return () => unsub();
  }, [selectedBatchId]);

  // 4. Subscribe all checklist forms for Archive Drawer
  useEffect(() => {
    const unsub = subscribeAllBahanChecklist((list) => {
      setAllForms(list);
    });
    return () => unsub();
  }, []);

  // 5. Populate or initialize form state when batch or savedForm changes
  useEffect(() => {
    if (savedForm) {
      setNoForm(savedForm.noForm || '01/PBM/IX/2026');
      setDari(savedForm.dari || 'Koperasi Al Umanaa Sejahtera Mandiri');
      setKepada(savedForm.kepada || 'SPPG Sukabumi Gunungguruh Kebonmanggu');
      setWaktu(savedForm.waktu || '06.00 - 08.00 WIB');
      setRows(savedForm.rows || []);
      setLokasiTtd(savedForm.lokasiTtd || 'Sukabumi');
      setTanggalTtd(savedForm.tanggalTtd || formatIndoDateLong(savedForm.tanggal) || '01 September 2026');
      setOfficerName(savedForm.officerName || 'Ragha Eskha Utama, S. Hum.');
      setOfficerTitle(savedForm.officerTitle || 'Kepala Satuan Pelayanan Pemenuhan Gizi');
      return;
    }

    // Default initialization when no saved form exists yet for this batch
    if (selectedBatch) {
      const indoDate = formatIndoDateLong(selectedBatch.tanggal);
      setTanggalTtd(indoDate);

      // Generate intelligent form number based on date: e.g. 01/PBM/IX/2026
      try {
        const parts = selectedBatch.tanggal.split('-');
        if (parts.length === 3) {
          const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
          const mIdx = parseInt(parts[1], 10) - 1;
          const romanM = romanMonths[mIdx] || 'IX';
          setNoForm(`01/PBM/${romanM}/${parts[0]}`);
        }
      } catch {
        setNoForm('01/PBM/IX/2026');
      }

      // Extract ingredients from daily report if available
      const extracted = extractIngredientsFromDailyReport(dailyReport);
      if (extracted.length > 0) {
        setRows(extracted);
      } else {
        // Sample standard template rows if batch has no data yet
        setRows([
          { jenisBahan: 'Beras Medium / Premium', banyaknya: 250, satuan: 'kg', isSesuai: true, isBaik: true, notes: 'Kemasan bersih dan utuh' },
          { jenisBahan: 'Daging Ayam Broiler', banyaknya: 180, satuan: 'kg', isSesuai: true, isBaik: true, notes: 'Segar dan bersertifikat halal' },
          { jenisBahan: 'Telur Ayam Ras', banyaknya: 220, satuan: 'butir', isSesuai: true, isBaik: true, notes: 'Cangkang bersih dan tidak retak' },
          { jenisBahan: 'Wortel Segar', banyaknya: 35, satuan: 'kg', isSesuai: true, isBaik: true, notes: 'Keras dan segar' },
          { jenisBahan: 'Buncis', banyaknya: 25, satuan: 'kg', isSesuai: true, isBaik: true, notes: 'Hijau segar' },
          { jenisBahan: 'Tempe Kedelai', banyaknya: 40, satuan: 'papan', isSesuai: true, isBaik: true, notes: 'Padat dan beraroma segar' },
        ]);
      }
    }
  }, [selectedBatch, savedForm, dailyReport]);

  // Handlers for Row editing
  const handleUpdateRow = (index: number, updates: Partial<MbgInspectionFormRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        jenisBahan: '',
        banyaknya: 0,
        satuan: 'kg',
        isSesuai: true,
        isBaik: true,
        notes: '',
      },
    ]);
  };

  const handleDeleteRow = (index: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Quick 1-click shortcut: check all Sesuai & Baik
  const handleCheckAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        isSesuai: true,
        isBaik: true,
      }))
    );
    showToast({ message: 'Semua bahan diceklis Sesuai & Baik!', variant: 'success' });
  };

  // Build current form object
  const currentFormData: Omit<MbgBahanChecklistForm, 'id'> = useMemo(() => {
    return {
      batchId: selectedBatchId || '',
      tanggal: selectedBatch?.tanggal || getJakartaDate(),
      noForm,
      dari,
      kepada,
      waktu,
      rows,
      officerName,
      officerTitle,
      lokasiTtd,
      tanggalTtd,
      createdBy: user?.uid || 'petugas',
      createdAt: savedForm?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [
    selectedBatchId,
    selectedBatch,
    noForm,
    dari,
    kepada,
    waktu,
    rows,
    officerName,
    officerTitle,
    lokasiTtd,
    tanggalTtd,
    user,
    savedForm,
  ]);

  // Save to Firestore
  const handleSave = async () => {
    if (!selectedBatchId) {
      showToast({ message: 'Pilih batch terlebih dahulu!', variant: 'error' });
      return;
    }
    try {
      setIsSaving(true);
      await saveBahanChecklist(currentFormData, savedForm?.id);
      showToast({
        message: 'Formulir Pemeriksaan Bahan Makanan berhasil disimpan & disinkronkan!',
        variant: 'success',
      });
    } catch (err) {
      console.error('Save checklist error:', err);
      showToast({ message: 'Gagal menyimpan formulir pemeriksaan', variant: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Export PDF
  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      // Auto-save first so state is never lost
      await saveBahanChecklist(currentFormData, savedForm?.id);
      await exportBahanChecklistPdf({
        ...currentFormData,
        id: savedForm?.id || 'temp',
      });
      showToast({
        message: 'Berhasil mengunduh Formulir Pemeriksaan Bahan Makanan (PDF)!',
        variant: 'success',
      });
    } catch (err) {
      console.error('Export PDF error:', err);
      showToast({ message: 'Gagal mengunduh PDF', variant: 'error' });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Export DOCX
  const handleExportDocx = async () => {
    try {
      setIsExportingDocx(true);
      // Auto-save first
      await saveBahanChecklist(currentFormData, savedForm?.id);
      await exportBahanChecklistDocx({
        ...currentFormData,
        id: savedForm?.id || 'temp',
      });
      showToast({
        message: 'Berhasil mengunduh Formulir Pemeriksaan Bahan Makanan (Word DOCX)!',
        variant: 'success',
      });
    } catch (err) {
      console.error('Export DOCX error:', err);
      showToast({ message: 'Gagal mengunduh Word DOCX', variant: 'error' });
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Archive filtered
  const filteredArchive = useMemo(() => {
    if (!archiveSearch.trim()) return allForms;
    const queryStr = archiveSearch.toLowerCase();
    return allForms.filter(
      (f) =>
        f.tanggal.toLowerCase().includes(queryStr) ||
        f.noForm.toLowerCase().includes(queryStr) ||
        f.officerName.toLowerCase().includes(queryStr) ||
        (f.rows || []).some((r) => r.jenisBahan.toLowerCase().includes(queryStr))
    );
  }, [allForms, archiveSearch]);

  return (
    <div className="min-h-screen bg-slate-50 font-['Hanken_Grotesk',system-ui,sans-serif] pb-16">
      {/* Top Banner & Control Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Title & Badge */}
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200 shadow-xs">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-slate-900 leading-tight">
                  Form Pemeriksaan Bahan Makanan
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                  Standar BGN
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Pemeriksaan mutu, kuantitas & kondisi bahan baku harian MBG
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Batch Selector */}
            <div className="min-w-[200px]">
              <SearchableBatchSelector
                batches={batches}
                selectedBatchId={selectedBatchId}
                onSelectBatch={(id) => setSelectedBatchId(id)}
              />
            </div>

            {/* Quick Check All */}
            <button
              type="button"
              onClick={handleCheckAll}
              className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold text-xs hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Ceklis semua item menjadi Sesuai dan Baik"
            >
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span>Ceklis Semua Baik</span>
            </button>

            {/* Archive Drawer Button */}
            <button
              type="button"
              onClick={() => setShowArchiveModal(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Lihat arsip laporan cek list yang pernah dibuat"
            >
              <History className="h-3.5 w-3.5 text-slate-500" />
              <span>Arsip ({allForms.length})</span>
            </button>

            {/* Save Button */}
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 text-emerald-400" />}
              <span>Simpan Form</span>
            </button>

            {/* Export PDF Button */}
            <button
              type="button"
              disabled={isExportingPdf}
              onClick={handleExportPdf}
              className="px-3.5 py-1.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              title="Export format PDF resmi Badan Gizi Nasional"
            >
              {isExportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              <span>Export PDF</span>
            </button>

            {/* Export DOCX Button */}
            <button
              type="button"
              disabled={isExportingDocx}
              onClick={handleExportDocx}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              title="Export format Microsoft Word DOCX"
            >
              {isExportingDocx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              <span>Export DOCX</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile helper notice */}
      <div className="max-w-4xl mx-auto px-4 sm:hidden mt-3">
        <div className="flex items-center justify-between text-[11px] text-slate-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
          <span className="font-bold text-emerald-900 flex items-center gap-1">
            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-700" />
            Format Standar A4 Resmi BGN
          </span>
          <span className="text-[10px] text-emerald-700 font-semibold">👉 Geser untuk tabel lengkap</span>
        </div>
      </div>

      {/* Main Form Canvas (Paper-like WYSIWYG Document Card) */}
      <div className="max-w-4xl mx-auto px-2 sm:px-4 mt-2 sm:mt-6 overflow-x-auto pb-4">
        <div className="min-w-[700px] sm:min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-xl border border-slate-300 p-6 sm:p-10 font-['Times_New_Roman',serif] text-black"
          >
            {/* Header section */}
            <div className="flex items-start justify-between border-b-2 border-black pb-4 mb-4 gap-4">
              {/* Logo BGN & Title Left */}
              <div className="flex items-center gap-3 shrink-0">
                <img
                  src="/logo_badan_gizi.png"
                  alt="Badan Gizi Nasional"
                  className="h-14 w-14 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="leading-tight">
                  <span className="font-bold text-sm block tracking-wide">BADAN GIZI</span>
                  <span className="font-bold text-sm block tracking-wide">NASIONAL</span>
                </div>
              </div>

              {/* Form Title & Number Right */}
              <div className="text-right flex flex-col items-end shrink-0">
                <h2 className="font-bold text-sm sm:text-base uppercase tracking-tight">
                  FORM PEMERIKSAAN BAHAN MAKANAN
                </h2>
                <div className="flex items-center gap-1.5 mt-1 font-bold text-xs sm:text-sm">
                  <span>NO :</span>
                  <input
                    type="text"
                    value={noForm}
                    onChange={(e) => setNoForm(e.target.value)}
                    className="font-bold border-b border-dashed border-slate-400 focus:border-black outline-hidden px-1 text-right w-44 bg-transparent font-['Times_New_Roman',serif]"
                    title="Klik untuk mengedit Nomor Formulir"
                  />
                </div>
              </div>
            </div>

          {/* Metadata Block: Dari, Kepada, Waktu */}
          <div className="space-y-1.5 text-xs sm:text-sm mb-5 font-normal">
            <div className="grid grid-cols-[70px_10px_1fr] items-center">
              <span className="font-medium">Dari</span>
              <span>:</span>
              <input
                type="text"
                value={dari}
                onChange={(e) => setDari(e.target.value)}
                className="border-b border-dotted border-slate-300 focus:border-black outline-hidden px-1 w-full bg-transparent font-['Times_New_Roman',serif]"
              />
            </div>
            <div className="grid grid-cols-[70px_10px_1fr] items-center">
              <span className="font-medium">Kepada</span>
              <span>:</span>
              <input
                type="text"
                value={kepada}
                onChange={(e) => setKepada(e.target.value)}
                className="border-b border-dotted border-slate-300 focus:border-black outline-hidden px-1 w-full bg-transparent font-['Times_New_Roman',serif]"
              />
            </div>
            <div className="grid grid-cols-[70px_10px_1fr] items-center">
              <span className="font-medium">Waktu</span>
              <span>:</span>
              <input
                type="text"
                value={waktu}
                onChange={(e) => setWaktu(e.target.value)}
                placeholder="Contoh: 06.00 - 08.00 WIB"
                className="border-b border-dotted border-slate-300 focus:border-black outline-hidden px-1 w-full bg-transparent font-['Times_New_Roman',serif]"
              />
            </div>
          </div>

          {/* Interactive Inspection Table */}
          <div className="overflow-x-auto border border-black">
            <table className="w-full text-xs border-collapse border border-black font-['Times_New_Roman',serif]">
              <thead>
                <tr className="border-b border-black text-center font-bold">
                  <th rowSpan={2} className="border-r border-black p-1.5 w-8">No</th>
                  <th rowSpan={2} className="border-r border-black p-1.5 min-w-[180px]">Jenis Bahan Makanan</th>
                  <th rowSpan={2} className="border-r border-black p-1.5 w-20 leading-tight">
                    Banyaknya<br />(Angka)
                  </th>
                  <th rowSpan={2} className="border-r border-black p-1.5 w-14">Satuan</th>
                  <th colSpan={2} className="border-r border-black p-1 text-center">Jumlah</th>
                  <th colSpan={2} className="border-r border-black p-1 text-center">Kondisi Bahan Makanan</th>
                  <th rowSpan={2} className="border-r border-black p-1.5 min-w-[120px]">Keterangan</th>
                  <th rowSpan={2} className="p-1 w-8 text-center no-print"></th>
                </tr>
                <tr className="border-b border-black text-center font-bold text-[11px]">
                  <th className="border-r border-black p-1 w-12 bg-slate-50">Sesuai</th>
                  <th className="border-r border-black p-1 w-12 bg-slate-50">Tidak</th>
                  <th className="border-r border-black p-1 w-12 bg-slate-50">Baik</th>
                  <th className="border-r border-black p-1 w-12 bg-slate-50">Rusak</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-slate-400 italic font-sans text-xs">
                      Belum ada data bahan. Klik tombol "Tambah Baris Bahan" di bawah.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-black hover:bg-slate-50/70 transition-colors">
                      {/* 1. No */}
                      <td className="border-r border-black p-1 text-center font-semibold">
                        {idx + 1}
                      </td>

                      {/* 2. Jenis Bahan Makanan */}
                      <td className="border-r border-black p-1">
                        <input
                          type="text"
                          value={row.jenisBahan}
                          onChange={(e) => handleUpdateRow(idx, { jenisBahan: e.target.value })}
                          className="w-full bg-transparent px-1 py-0.5 outline-hidden focus:bg-amber-50/60 font-semibold"
                        />
                      </td>

                      {/* 3. Banyaknya (Angka) */}
                      <td className="border-r border-black p-1 text-center">
                        <input
                          type="number"
                          value={row.banyaknya || ''}
                          onChange={(e) => handleUpdateRow(idx, { banyaknya: parseFloat(e.target.value) || 0 })}
                          className="w-full text-center bg-transparent px-1 py-0.5 outline-hidden focus:bg-amber-50/60 font-bold"
                        />
                      </td>

                      {/* 4. Satuan */}
                      <td className="border-r border-black p-1 text-center">
                        <input
                          type="text"
                          value={row.satuan}
                          onChange={(e) => handleUpdateRow(idx, { satuan: e.target.value })}
                          className="w-full text-center bg-transparent px-1 py-0.5 outline-hidden focus:bg-amber-50/60"
                        />
                      </td>

                      {/* 5. Jumlah: Sesuai */}
                      <td
                        onClick={() => handleUpdateRow(idx, { isSesuai: true })}
                        className="border-r border-black p-1 text-center cursor-pointer hover:bg-emerald-50 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={row.isSesuai === true}
                          onChange={() => handleUpdateRow(idx, { isSesuai: true })}
                          className="h-3.5 w-3.5 accent-emerald-600 cursor-pointer"
                        />
                      </td>

                      {/* 6. Jumlah: Tidak Sesuai */}
                      <td
                        onClick={() => handleUpdateRow(idx, { isSesuai: false })}
                        className="border-r border-black p-1 text-center cursor-pointer hover:bg-red-50 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={row.isSesuai === false}
                          onChange={() => handleUpdateRow(idx, { isSesuai: false })}
                          className="h-3.5 w-3.5 accent-red-600 cursor-pointer"
                        />
                      </td>

                      {/* 7. Kondisi: Baik */}
                      <td
                        onClick={() => handleUpdateRow(idx, { isBaik: true })}
                        className="border-r border-black p-1 text-center cursor-pointer hover:bg-emerald-50 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={row.isBaik === true}
                          onChange={() => handleUpdateRow(idx, { isBaik: true })}
                          className="h-3.5 w-3.5 accent-emerald-600 cursor-pointer"
                        />
                      </td>

                      {/* 8. Kondisi: Rusak */}
                      <td
                        onClick={() => handleUpdateRow(idx, { isBaik: false })}
                        className="border-r border-black p-1 text-center cursor-pointer hover:bg-red-50 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={row.isBaik === false}
                          onChange={() => handleUpdateRow(idx, { isBaik: false })}
                          className="h-3.5 w-3.5 accent-red-600 cursor-pointer"
                        />
                      </td>

                      {/* 9. Keterangan */}
                      <td className="border-r border-black p-1">
                        <input
                          type="text"
                          value={row.notes || ''}
                          onChange={(e) => handleUpdateRow(idx, { notes: e.target.value })}
                          placeholder="Catatan / spesifikasi..."
                          className="w-full bg-transparent px-1 py-0.5 outline-hidden focus:bg-amber-50/60"
                        />
                      </td>

                      {/* 10. Delete Button */}
                      <td className="p-1 text-center no-print">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(idx)}
                          className="p-1 text-slate-300 hover:text-red-600 transition-colors cursor-pointer"
                          title="Hapus baris bahan"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Add Row Button */}
          <div className="mt-3 flex justify-between items-center text-xs font-sans">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-700 hover:border-slate-500 hover:bg-slate-50 font-bold transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Baris Bahan</span>
            </button>
            <span className="text-slate-400">Total {rows.length} item bahan baku</span>
          </div>

          {/* Signature Block (Bottom Right) */}
          <div className="mt-10 flex justify-end font-['Times_New_Roman',serif] text-xs sm:text-sm">
            <div className="text-left w-64">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={lokasiTtd}
                  onChange={(e) => setLokasiTtd(e.target.value)}
                  className="w-20 border-b border-dotted border-slate-300 focus:border-black outline-hidden bg-transparent"
                />
                <span>,</span>
                <input
                  type="text"
                  value={tanggalTtd}
                  onChange={(e) => setTanggalTtd(e.target.value)}
                  className="w-36 border-b border-dotted border-slate-300 focus:border-black outline-hidden bg-transparent"
                />
              </div>

              <input
                type="text"
                value={officerTitle}
                onChange={(e) => setOfficerTitle(e.target.value)}
                className="w-full mt-1 border-b border-dotted border-slate-300 focus:border-black outline-hidden bg-transparent"
              />

              {/* Signature space */}
              <div className="h-20 flex items-center justify-center text-slate-300 italic text-[11px] font-sans">
                (Tanda Tangan)
              </div>

              <input
                type="text"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                className="w-full font-bold border-b border-dotted border-slate-300 focus:border-black outline-hidden bg-transparent"
              />
            </div>
          </div>
        </motion.div>
        </div>
      </div>

      {/* Action Bar Paling Bawah (Simpan Form, Export PDF, Export DOCX) */}
      <div className="max-w-4xl mx-auto px-4 mt-4 mb-10">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 font-['Hanken_Grotesk']">
          <div>
            <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-emerald-600" />
              Finalisasi Form Pemeriksaan Bahan Makanan
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Simpan hasil pemeriksaan ke arsip sistem atau download format resmi PDF & Word.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-emerald-400" />}
              <span>Simpan Form</span>
            </button>

            <button
              type="button"
              disabled={isExportingPdf}
              onClick={handleExportPdf}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="Export format PDF resmi Badan Gizi Nasional"
            >
              {isExportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              disabled={isExportingDocx}
              onClick={handleExportDocx}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="Export format Microsoft Word DOCX"
            >
              {isExportingDocx ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              <span>Export DOCX</span>
            </button>
          </div>
        </div>
      </div>

      {/* Archive Modal / Drawer */}
      <AnimatePresence>
        {showArchiveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs font-['Hanken_Grotesk']">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200"
            >
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <History className="h-5 w-5 text-emerald-400" />
                  <div>
                    <h3 className="font-extrabold text-sm">Arsip Form Pemeriksaan Bahan Makanan</h3>
                    <p className="text-[11px] text-slate-400">Daftar formulir yang pernah disimpan ke sistem</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowArchiveModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-3 border-b border-slate-200 bg-slate-50">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari tanggal, nomor form, bahan..."
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="p-4 overflow-y-auto divide-y divide-slate-100 flex-1">
                {filteredArchive.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    Belum ada arsip formulir pemeriksaan bahan makanan yang cocok.
                  </div>
                ) : (
                  filteredArchive.map((form) => (
                    <div key={form.id} className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-xl">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">{form.tanggal}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {form.noForm || 'Form PBM'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {form.rows?.length || 0} bahan diperiksa • Petugas: {form.officerName}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBatchId(form.batchId);
                            setShowArchiveModal(false);
                            showToast({ message: `Memuat form tanggal ${form.tanggal}`, variant: 'info' });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Buka / Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => exportBahanChecklistPdf(form)}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                          title="Download PDF"
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => exportBahanChecklistDocx(form)}
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer"
                          title="Download Word DOCX"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`Hapus form pemeriksaan tanggal ${form.tanggal}?`)) {
                              await deleteBahanChecklist(form.id);
                              showToast({ message: 'Arsip berhasil dihapus', variant: 'success' });
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 cursor-pointer"
                          title="Hapus arsip"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
