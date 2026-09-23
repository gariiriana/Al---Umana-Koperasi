// ============================================================================
// MBG Spreadsheet Import Modal
// Lets Admin MBG inspect Beneficiary (Penerima Manfaat) data from a Google
// Sheets URL or local Excel file before applying it as a draft to the batch.
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  FileSpreadsheet,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Upload,
  Layers,
  Users,
  School,
  Baby,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { MbgPmBatch, MbgPmEntry, MbgDayMenu } from '@/types/mbg';
import {
  fetchGoogleSpreadsheetWorkbook,
  parseFileToWorkbook,
  getVisibleSheetNames,
  parsePmRowsToEntries,
  detectPreferredSheet,
} from '@/utils/mbgSpreadsheetParser';

interface SpreadsheetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBatch: MbgPmBatch | undefined;
  weeklySchedule: MbgDayMenu[];
  userUid: string;
  onApplyEntries: (entries: Omit<MbgPmEntry, 'id'>[]) => Promise<void>;
}

export const SpreadsheetImportModal: React.FC<SpreadsheetImportModalProps> = ({
  isOpen,
  onClose,
  selectedBatch,
  weeklySchedule,
  userUid,
  onApplyEntries,
}) => {
  const [urlInput, setUrlInput] = useState(() => {
    return localStorage.getItem('mbg_last_spreadsheet_url') || '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [showAllRows, setShowAllRows] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setShowAllRows(false);
      setIsApplying(false);
    }
  }, [isOpen]);

  // Handle Fetching Spreadsheet via Google Sheets link
  const handleFetchSpreadsheet = async () => {
    if (!urlInput.trim()) {
      setError('Silakan masukkan link Google Spreadsheet');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const wb = await fetchGoogleSpreadsheetWorkbook(urlInput);
      setWorkbook(wb);

      const sheets = getVisibleSheetNames(wb);
      setAvailableSheets(sheets);

      if (sheets.length === 0) {
        throw new Error('Tidak ditemukan lembar kerja (sheet) yang aktif di dalam spreadsheet ini.');
      }

      // Save valid URL to localStorage
      try {
        localStorage.setItem('mbg_last_spreadsheet_url', urlInput.trim());
      } catch {
        // ignore
      }

      // Smart sheet auto-detection:
      const preferredSheet = detectPreferredSheet(sheets, selectedBatch?.tanggal, weeklySchedule);
      setSelectedSheet(preferredSheet);
    } catch (err: unknown) {
      console.error('Fetch spreadsheet error:', err);
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal mengunduh spreadsheet. Pastikan link dapat diakses secara publik.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle local file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const wb = await parseFileToWorkbook(file);
      setWorkbook(wb);

      const sheets = getVisibleSheetNames(wb);
      setAvailableSheets(sheets);

      if (sheets.length === 0) {
        throw new Error('File Excel tidak memiliki lembar kerja (sheet) yang valid.');
      }

      const preferredSheet = detectPreferredSheet(sheets, selectedBatch?.tanggal, weeklySchedule);
      setSelectedSheet(preferredSheet);
    } catch (err: unknown) {
      console.error('File upload error:', err);
      setError(err instanceof Error ? err.message : 'Gagal membaca file Excel');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  // Parse entries from currently selected sheet
  const parsedPreview = useMemo(() => {
    if (!workbook || !selectedSheet) return [];
    const ws = workbook.Sheets[selectedSheet];
    if (!ws) return [];

    const rows = XLSX.utils.sheet_to_json<Array<string | number | undefined | null>>(ws, {
      header: 1,
    });

    const batchDate = selectedBatch?.tanggal || new Date().toISOString().split('T')[0];

    return parsePmRowsToEntries(
      rows,
      selectedBatch?.id || '',
      userUid,
      weeklySchedule,
      batchDate
    );
  }, [workbook, selectedSheet, selectedBatch, userUid, weeklySchedule]);

  // Statistics from parsed entries
  const stats = useMemo(() => {
    let totalPorsiSekolah = 0;
    let totalPorsiPosyandu = 0;
    let totalPorsiKecil = 0;
    let totalPorsiBesar = 0;
    let totalMurid = 0;
    let totalGuruKader = 0;
    let sekolahCount = 0;
    let posyanduCount = 0;

    parsedPreview.forEach((e) => {
      totalPorsiKecil += (e.qtPorsiKecil || 0) + (e.qtPorsiBalita || 0);
      totalPorsiBesar += e.qtPorsiBesar || 0;
      totalMurid += (e.qtSiswaBalita || 0) + (e.qtBumilBusui || 0);
      totalGuruKader += e.qtGuruKader || 0;
      if (e.institutionType === 'posyandu') {
        posyanduCount++;
        totalPorsiPosyandu += e.jumlah || 0;
      } else {
        sekolahCount++;
        totalPorsiSekolah += e.jumlah || 0;
      }
    });

    return {
      totalPorsi: totalPorsiSekolah + totalPorsiPosyandu,
      totalPorsiSekolah,
      totalPorsiPosyandu,
      totalPorsiKecil,
      totalPorsiBesar,
      totalMurid,
      totalGuruKader,
      sekolahCount,
      posyanduCount,
      count: parsedPreview.length,
    };
  }, [parsedPreview]);

  // Derived filtered arrays for display
  const sekolahEntries = useMemo(() => parsedPreview.filter(e => e.institutionType !== 'posyandu'), [parsedPreview]);
  const posyanduEntries = useMemo(() => parsedPreview.filter(e => e.institutionType === 'posyandu'), [parsedPreview]);

  // Handle Apply
  const handleApply = async () => {
    if (parsedPreview.length === 0) return;
    try {
      setIsApplying(true);
      await onApplyEntries(parsedPreview);
      onClose();
    } catch (err) {
      console.error('Apply error:', err);
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-['Hanken_Grotesk',system-ui,sans-serif] backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-xs">
              <FileSpreadsheet className="h-5 w-5 text-emerald-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">Import Link / File Excel PM</h3>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-white/20 text-white rounded-full">
                  Admin MBG
                </span>
              </div>
              <p className="text-xs text-emerald-100 mt-0.5">
                Pilih sheet, periksa preview, lalu terapkan sebagai draft ke Batch{' '}
                <span className="font-extrabold text-white underline decoration-emerald-300">
                  {selectedBatch?.tanggal || 'Hari Ini'}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Tutup Modal"
            aria-label="Tutup Modal"
            className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 text-xs">
          {/* URL Input Section */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700">
              1. Masukkan Link Google Spreadsheet (Akses Publik / Anyone with link):
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition-all"
                />
              </div>
              <button
                type="button"
                onClick={handleFetchSpreadsheet}
                disabled={loading}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span>Baca Spreadsheet</span>
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>💡 Format: Google Sheets public view URL atau export xlsx</span>
              <label className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer">
                <Upload className="h-3 w-3" />
                <span>Atau upload file Excel / CSV dari perangkat</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">{error}</p>
                <p className="text-[11px] text-red-600">
                  Tips: Buka Google Sheets &gt; Klik tombol <strong>Share/Bagikan</strong> di kanan atas &gt; Ubah General Access menjadi <strong>"Anyone with the link" (Siapa saja yang memiliki link)</strong> dengan peran Viewer.
                </p>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="py-8 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
              <p className="font-bold text-xs">Sedang membaca dan mengunduh data spreadsheet...</p>
            </div>
          )}

          {/* Sheets & Preview Section */}
          {workbook && availableSheets.length > 0 && !loading && (
            <div className="space-y-5 pt-2 border-t border-slate-100">
              {/* Sheet Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-emerald-600" />
                    <span>2. Pilih Lembar / Sheet Kerja ({availableSheets.length} lembar ditemukan):</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">Klik tab untuk preview data</span>
                </div>

                <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-200">
                  {availableSheets.map((sheetName) => {
                    const isSelected = selectedSheet === sheetName;
                    const isPmTab =
                      sheetName.toLowerCase().includes('penerima manfaat') ||
                      sheetName.toLowerCase().includes('rekapitulasi') ||
                      sheetName.toLowerCase().includes('rekap pm');

                    return (
                      <button
                        key={sheetName}
                        type="button"
                        onClick={() => setSelectedSheet(sheetName)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                        <span>{sheetName}</span>
                        {isPmTab && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-full font-black uppercase ${
                              isSelected ? 'bg-emerald-700 text-emerald-100' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            PM
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Parsing Result Summary Card */}
              {stats.count > 0 ? (
                <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-emerald-950 text-xs">
                          {stats.count} Lembaga / Institusi Terdeteksi Valid
                        </h4>
                        <p className="text-[11px] text-emerald-700">
                          Sheet: <strong className="text-emerald-900">{selectedSheet}</strong>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-right flex-wrap justify-end">
                      <div>
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                          Total Porsi Sekolah
                        </span>
                        <span className="text-lg font-black text-blue-900">
                          {stats.totalPorsiSekolah.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-pink-600 uppercase tracking-wider block">
                          Total Porsi Posyandu
                        </span>
                        <span className="text-lg font-black text-pink-900">
                          {stats.totalPorsiPosyandu.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="pl-4 border-l border-emerald-200">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                          Grand Total Porsi
                        </span>
                        <span className="text-lg font-black text-emerald-900">
                          {stats.totalPorsi.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Micro Breakdown Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="bg-white/80 p-2 rounded-xl border border-emerald-100 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-500">
                        <School className="h-3 w-3 text-blue-500" />
                        <span>Sekolah</span>
                      </div>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">
                        {stats.sekolahCount} lembaga
                      </span>
                    </div>

                    <div className="bg-white/80 p-2 rounded-xl border border-emerald-100 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-500">
                        <Baby className="h-3 w-3 text-pink-500" />
                        <span>Posyandu</span>
                      </div>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">
                        {stats.posyanduCount} kelompok
                      </span>
                    </div>

                    <div className="bg-white/80 p-2 rounded-xl border border-emerald-100 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-500">
                        <Users className="h-3 w-3 text-emerald-600" />
                        <span>Siswa & Balita</span>
                      </div>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">
                        {stats.totalMurid.toLocaleString('id-ID')}
                      </span>
                    </div>

                    <div className="bg-white/80 p-2 rounded-xl border border-emerald-100 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-500">
                        <Users className="h-3 w-3 text-amber-600" />
                        <span>Guru & Kader</span>
                      </div>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">
                        {stats.totalGuruKader.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAllRows(!showAllRows)}
                      className="text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 cursor-pointer font-extrabold text-[11px]"
                    >
                      <span>{showAllRows ? 'Sembunyikan' : `Tampilkan Semua (${stats.count})`}</span>
                      {showAllRows ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {/* Preview Table of Detected Institutions - Sekolah */}
                  {sekolahEntries.length > 0 && (
                    <div className="space-y-1.5 pt-1 mt-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-blue-700">
                        <span>Daftar Institusi Terdeteksi (Sekolah): {sekolahEntries.length}</span>
                      </div>

                      <div className="max-h-48 overflow-y-auto rounded-xl border border-blue-200/80 bg-white">
                        <table className="w-full text-[11px] text-left border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 font-bold">
                            <tr>
                              <th className="px-2.5 py-1.5 w-8 text-center">No</th>
                              <th className="px-2.5 py-1.5">Nama Lembaga</th>
                              <th className="px-2.5 py-1.5 text-center">Tipe</th>
                              <th className="px-2.5 py-1.5 text-right">Porsi Kecil</th>
                              <th className="px-2.5 py-1.5 text-right">Porsi Besar</th>
                              <th className="px-2.5 py-1.5 text-right">Guru/Kader</th>
                              <th className="px-2.5 py-1.5 text-right font-black text-blue-900">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(showAllRows ? sekolahEntries : sekolahEntries.slice(0, 5)).map((entry, idx) => (
                              <tr key={`sekolah-${entry.institutionName}-${idx}`} className="hover:bg-slate-50">
                                <td className="px-2.5 py-1.5 text-center text-slate-400">{idx + 1}</td>
                                <td className="px-2.5 py-1.5 font-bold text-slate-800">{entry.institutionName}</td>
                                <td className="px-2.5 py-1.5 text-center">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-blue-100 text-blue-700">
                                    {entry.institutionType}
                                  </span>
                                </td>
                                <td className="px-2.5 py-1.5 text-right text-slate-600">
                                  {(entry.qtPorsiKecil || 0) + (entry.qtPorsiBalita || 0) || '-'}
                                </td>
                                <td className="px-2.5 py-1.5 text-right text-slate-600">{entry.qtPorsiBesar || '-'}</td>
                                <td className="px-2.5 py-1.5 text-right text-slate-600">{entry.qtGuruKader || '-'}</td>
                                <td className="px-2.5 py-1.5 text-right font-black text-blue-800">
                                  {entry.jumlah || 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Preview Table of Detected Institutions - Posyandu */}
                  {posyanduEntries.length > 0 && (
                    <div className="space-y-1.5 pt-1 mt-4">
                      <div className="flex items-center justify-between text-[11px] font-bold text-pink-700">
                        <span>Daftar Institusi Terdeteksi (Posyandu): {posyanduEntries.length}</span>
                      </div>

                      <div className="max-h-48 overflow-y-auto rounded-xl border border-pink-200/80 bg-white">
                        <table className="w-full text-[11px] text-left border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 font-bold">
                            <tr>
                              <th className="px-2.5 py-1.5 w-8 text-center">No</th>
                              <th className="px-2.5 py-1.5">Nama Lembaga</th>
                              <th className="px-2.5 py-1.5 text-center">Tipe</th>
                              <th className="px-2.5 py-1.5 text-right">Porsi Kecil</th>
                              <th className="px-2.5 py-1.5 text-right">Porsi Besar</th>
                              <th className="px-2.5 py-1.5 text-right">Guru/Kader</th>
                              <th className="px-2.5 py-1.5 text-right font-black text-pink-900">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(showAllRows ? posyanduEntries : posyanduEntries.slice(0, 5)).map((entry, idx) => (
                              <tr key={`posyandu-${entry.institutionName}-${idx}`} className="hover:bg-slate-50">
                                <td className="px-2.5 py-1.5 text-center text-slate-400">{idx + 1}</td>
                                <td className="px-2.5 py-1.5 font-bold text-slate-800">{entry.institutionName}</td>
                                <td className="px-2.5 py-1.5 text-center">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-pink-100 text-pink-700">
                                    {entry.institutionType}
                                  </span>
                                </td>
                                <td className="px-2.5 py-1.5 text-right text-slate-600">
                                  {(entry.qtPorsiKecil || 0) + (entry.qtPorsiBalita || 0) || '-'}
                                </td>
                                <td className="px-2.5 py-1.5 text-right text-slate-600">{entry.qtPorsiBesar || '-'}</td>
                                <td className="px-2.5 py-1.5 text-right text-slate-600">{entry.qtGuruKader || '-'}</td>
                                <td className="px-2.5 py-1.5 text-right font-black text-pink-800">
                                  {entry.jumlah || 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 space-y-1">
                  <div className="flex items-center gap-2 font-extrabold text-xs">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Tidak ditemukan baris institusi/sekolah di sheet "{selectedSheet}"</span>
                  </div>
                  <p className="text-[11px] text-amber-700 pl-6">
                    Sheet ini mungkin berisi standar resep, rekapitulasi tanpa nama lembaga, atau format khusus. Silakan pilih tab/sheet lain pada daftar lembar kerja di atas.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 max-w-sm">
            {stats.count > 0 ? (
              <span>
                Siap diterapkan ke preview: <strong className="text-emerald-700">{stats.count} lembaga</strong> ({stats.totalPorsi.toLocaleString('id-ID')} porsi). Data tetap DRAFT sampai tombol Submit Data PM ditekan.
              </span>
            ) : (
              <span>Pilih spreadsheet &amp; sheet kerja untuk melanjutkan</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-white cursor-pointer transition-colors"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={stats.count === 0 || isApplying}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Menerapkan ke Preview...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Terapkan ke Preview ({stats.count} Lembaga)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
