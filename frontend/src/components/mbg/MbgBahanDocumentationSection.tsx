// ============================================================================
// MBG Bahan Documentation Section — Foto Per Bahan & Arsip Dokumentasi
// Digunakan di Distribusi MBG saat menerima data PM dan Produksi MBG
// ============================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Upload,
  CheckCircle2,
  FileDown,
  FileText,
  Save,
  Trash2,
  Plus,
  Eye,
  X,
  History,
  Search,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { LiveCamera } from '@/components/LiveCamera';
import type {
  MbgPmBatch,
  MbgBahanDocumentation,
  MbgBahanPhotoItem,
  MbgProductionDailyReport,
} from '@/types/mbg';
import {
  subscribeBahanDocumentation,
  subscribeAllBahanDocumentation,
  saveBahanDocumentation,
  deleteBahanDocumentation,
  extractIngredientsFromDailyReport,
} from '@/services/mbgBahanService';
import { exportBahanDocumentationPdf } from '@/utils/mbgBahanPdfGenerator';
import { exportBahanDocumentationDocx } from '@/utils/mbgBahanDocxGenerator';
import { compressImageBase64 } from '@/services/mbgDeliveryService';

interface MbgBahanDocumentationSectionProps {
  selectedBatch: MbgPmBatch | undefined;
  dailyReport?: MbgProductionDailyReport | null;
}

export const MbgBahanDocumentationSection: React.FC<MbgBahanDocumentationSectionProps> = ({
  selectedBatch,
  dailyReport,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [savedDoc, setSavedDoc] = useState<MbgBahanDocumentation | null>(null);
  const [allDocs, setAllDocs] = useState<MbgBahanDocumentation[]>([]);
  const [items, setItems] = useState<MbgBahanPhotoItem[]>([]);
  const [officerName, setOfficerName] = useState(user?.displayName || 'Petugas Distribusi MBG');
  const [generalNotes, setGeneralNotes] = useState('');

  // Active sub-tab: 'capture' (Foto Bahan) vs 'archive' (Arsip Dokumentasi)
  const [subTab, setSubTab] = useState<'capture' | 'archive'>('capture');
  const [archiveSearch, setArchiveSearch] = useState('');

  // Camera modal state
  const [cameraActiveIndex, setCameraActiveIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetIndex, setUploadTargetIndex] = useState<number | null>(null);

  // Preview modal for enlarged photo
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  // 1. Subscribe to saved document for current batch
  useEffect(() => {
    if (!selectedBatch?.id) {
      setSavedDoc(null);
      return;
    }
    const unsub = subscribeBahanDocumentation(selectedBatch.id, (docData) => {
      setSavedDoc(docData);
    });
    return () => unsub();
  }, [selectedBatch?.id]);

  // 2. Subscribe to all saved documents (for archive view)
  useEffect(() => {
    const unsub = subscribeAllBahanDocumentation((list) => {
      setAllDocs(list);
    });
    return () => unsub();
  }, []);

  // 3. Populate items when batch, savedDoc, or dailyReport changes
  useEffect(() => {
    if (savedDoc) {
      setItems(savedDoc.items || []);
      setOfficerName(savedDoc.officerName || user?.displayName || 'Petugas Distribusi MBG');
      setGeneralNotes(savedDoc.notes || '');
      return;
    }

    if (selectedBatch) {
      // Extract from daily report
      const extracted = extractIngredientsFromDailyReport(dailyReport);
      if (extracted.length > 0) {
        const photoItems: MbgBahanPhotoItem[] = extracted.map((r, idx) => ({
          id: `item-${idx}-${Date.now()}`,
          namaBahan: r.jenisBahan,
          kuantitas: r.banyaknya,
          satuan: r.satuan,
          photoUrl: undefined,
          kondisi: r.isBaik ? 'baik' : 'rusak',
          catatan: r.notes || '',
        }));
        setItems(photoItems);
      } else {
        // Fallback standard ingredients
        setItems([
          { id: '1', namaBahan: 'Beras Medium / Premium', kuantitas: 250, satuan: 'kg', kondisi: 'baik' },
          { id: '2', namaBahan: 'Daging Ayam Broiler', kuantitas: 180, satuan: 'kg', kondisi: 'baik' },
          { id: '3', namaBahan: 'Telur Ayam Ras', kuantitas: 220, satuan: 'butir', kondisi: 'baik' },
          { id: '4', namaBahan: 'Wortel Segar', kuantitas: 35, satuan: 'kg', kondisi: 'baik' },
          { id: '5', namaBahan: 'Buncis', kuantitas: 25, satuan: 'kg', kondisi: 'baik' },
          { id: '6', namaBahan: 'Tempe Kedelai', kuantitas: 40, satuan: 'papan', kondisi: 'baik' },
        ]);
      }
    }
  }, [selectedBatch, savedDoc, dailyReport, user?.displayName]);

  // Update a single item
  const handleUpdateItem = (index: number, updates: Partial<MbgBahanPhotoItem>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  // Add custom ingredient
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        namaBahan: '',
        kuantitas: 1,
        satuan: 'kg',
        kondisi: 'baik',
        catatan: '',
      },
    ]);
  };

  // Delete ingredient
  const handleDeleteItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Handle Photo Upload from file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadTargetIndex === null) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawUrl = event.target?.result as string;
        // Compress to ~640x640 with 0.65 quality (well under 25KB)
        const compressed = await compressImageBase64(rawUrl, 640, 640, 0.65);
        handleUpdateItem(uploadTargetIndex, {
          photoUrl: compressed,
          waktuFoto: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        });
        showToast({ message: 'Foto bahan berhasil diunggah!', variant: 'success' });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File upload error:', err);
      showToast({ message: 'Gagal memproses file foto', variant: 'error' });
    } finally {
      e.target.value = '';
      setUploadTargetIndex(null);
    }
  };

  // Handle Camera Capture
  const handleCameraCapture = async (file: File) => {
    if (cameraActiveIndex === null) return;
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const compressed = await compressImageBase64(dataUrl, 640, 640, 0.65);
          handleUpdateItem(cameraActiveIndex, {
            photoUrl: compressed,
            waktuFoto: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          });
          showToast({ message: 'Foto bahan berhasil diambil!', variant: 'success' });
        } catch (compErr) {
          console.error('Compression error:', compErr);
        } finally {
          setCameraActiveIndex(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Camera capture error:', err);
      setCameraActiveIndex(null);
    }
  };

  // Statistics
  const stats = useMemo(() => {
    const total = items.length;
    const withPhoto = items.filter((i) => Boolean(i.photoUrl)).length;
    const percent = total > 0 ? Math.round((withPhoto / total) * 100) : 0;
    return { total, withPhoto, percent };
  }, [items]);

  // Build current documentation object
  const currentDocData: Omit<MbgBahanDocumentation, 'id'> = useMemo(() => {
    return {
      batchId: selectedBatch?.id || '',
      tanggal: selectedBatch?.tanggal || new Date().toISOString().split('T')[0],
      title: `Dokumentasi Foto Bahan MBG ${selectedBatch?.tanggal || ''}`,
      officerName: officerName || 'Petugas Distribusi MBG',
      officerRole: 'Distribusi MBG',
      items,
      notes: generalNotes,
      createdAt: savedDoc?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user?.uid || 'petugas',
    };
  }, [selectedBatch, officerName, generalNotes, items, savedDoc, user]);

  // Save to Firestore
  const handleSaveDocumentation = async (): Promise<string | null> => {
    if (!selectedBatch?.id) {
      showToast({ message: 'Pilih batch terlebih dahulu!', variant: 'error' });
      return null;
    }
    try {
      setIsSaving(true);
      const docId = await saveBahanDocumentation(currentDocData, savedDoc?.id);
      showToast({
        message: 'Dokumentasi bahan berhasil disimpan ke Arsip!',
        variant: 'success',
      });
      return docId;
    } catch (err) {
      console.error('Save documentation error:', err);
      showToast({ message: 'Gagal menyimpan dokumentasi bahan', variant: 'error' });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // Export PDF (also saves/updates document automatically)
  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      const docId = await handleSaveDocumentation();
      await exportBahanDocumentationPdf({
        ...currentDocData,
        id: docId || savedDoc?.id || 'temp',
      });
      showToast({
        message: 'Berhasil mengunduh Dokumentasi Bahan (PDF) & tersimpan ke Arsip!',
        variant: 'success',
      });
    } catch (err) {
      console.error('Export PDF error:', err);
      showToast({ message: 'Gagal mengunduh PDF', variant: 'error' });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Export DOCX (also saves/updates document automatically)
  const handleExportDocx = async () => {
    try {
      setIsExportingDocx(true);
      const docId = await handleSaveDocumentation();
      await exportBahanDocumentationDocx({
        ...currentDocData,
        id: docId || savedDoc?.id || 'temp',
      });
      showToast({
        message: 'Berhasil mengunduh Dokumentasi Bahan (Word DOCX) & tersimpan ke Arsip!',
        variant: 'success',
      });
    } catch (err) {
      console.error('Export DOCX error:', err);
      showToast({ message: 'Gagal mengunduh Word DOCX', variant: 'error' });
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Filtered archive records
  const filteredArchive = useMemo(() => {
    if (!archiveSearch.trim()) return allDocs;
    const q = archiveSearch.toLowerCase();
    return allDocs.filter(
      (d) =>
        d.tanggal.toLowerCase().includes(q) ||
        d.officerName.toLowerCase().includes(q) ||
        (d.items || []).some((i) => i.namaBahan.toLowerCase().includes(q))
    );
  }, [allDocs, archiveSearch]);

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Sub Tabs: Input / Foto Bahan vs Arsip Dokumentasi Bahan */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSubTab('capture')}
            className={`flex-1 sm:flex-none px-3.5 sm:px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
              subTab === 'capture'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Camera className="h-4 w-4" />
            <span>Foto & Dokumentasi Bahan</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('archive')}
            className={`flex-1 sm:flex-none px-3.5 sm:px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
              subTab === 'archive'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <History className="h-4 w-4" />
            <span>Arsip Dokumentasi ({allDocs.length})</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: CAPTURE FOTO BAHAN */}
      {subTab === 'capture' && (
        <div className="space-y-5">
          {/* Header Summary & Progress Banner */}
          <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-slate-900 text-white rounded-2xl p-5 shadow-sm border border-emerald-800/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-emerald-100">
                    Distribusi MBG
                  </span>
                  <span className="text-xs text-emerald-200">
                    Batch: <span className="font-extrabold text-white">{selectedBatch?.tanggal || '-'}</span>
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mt-1">
                  Dokumentasi Foto Penerimaan Bahan Makanan
                </h3>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  Foto setiap bahan makanan yang diterima dari tim Produksi MBG untuk arsip dan laporan resmi.
                </p>
              </div>

              {/* Progress metric */}
              <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3 border border-white/15 min-w-[200px]">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-100 mb-1">
                  <span>Progres Foto:</span>
                  <span className="text-white font-black">{stats.withPhoto} / {stats.total} ({stats.percent}%)</span>
                </div>
                <div className="w-full h-2.5 bg-black/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${stats.percent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Officer Name edit */}
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2 text-xs">
              <span className="text-emerald-200 font-medium">Petugas Dokumentasi:</span>
              <input
                type="text"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1 text-white text-xs font-bold outline-hidden focus:bg-white/20"
                placeholder="Nama Petugas"
              />
            </div>
          </div>

          {/* Cards Grid: Per Bahan */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item, idx) => {
              const hasPhoto = Boolean(item.photoUrl);
              return (
                <div
                  key={item.id || idx}
                  className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs hover:shadow-md ${
                    hasPhoto ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={item.namaBahan}
                        onChange={(e) => handleUpdateItem(idx, { namaBahan: e.target.value })}
                        placeholder="Nama Bahan..."
                        className="font-extrabold text-xs text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-800 outline-hidden w-full truncate"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteItem(idx)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      title="Hapus bahan"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Photo Display / Action Box */}
                  <div className="p-3">
                    {hasPhoto ? (
                      <div className="relative group rounded-xl overflow-hidden bg-slate-950 aspect-4/3 flex items-center justify-center border border-slate-200">
                        <img
                          src={item.photoUrl}
                          alt={item.namaBahan}
                          className="w-full h-full object-cover"
                        />
                        {/* Overlay Controls */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={() => setPreviewPhoto({ url: item.photoUrl!, title: item.namaBahan })}
                            className="p-2 rounded-xl bg-white/20 hover:bg-white/40 text-white backdrop-blur-xs transition-colors cursor-pointer"
                            title="Perbesar foto"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCameraActiveIndex(idx)}
                            className="p-2 rounded-xl bg-white/20 hover:bg-white/40 text-white backdrop-blur-xs transition-colors cursor-pointer"
                            title="Ambil ulang kamera"
                          >
                            <Camera className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadTargetIndex(idx);
                              fileInputRef.current?.click();
                            }}
                            className="p-2 rounded-xl bg-white/20 hover:bg-white/40 text-white backdrop-blur-xs transition-colors cursor-pointer"
                            title="Ganti foto dari file"
                          >
                            <Upload className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, { photoUrl: undefined, waktuFoto: undefined })}
                            className="p-2 rounded-xl bg-red-600/80 hover:bg-red-700 text-white backdrop-blur-xs transition-colors cursor-pointer"
                            title="Hapus foto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Verified badge top right */}
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white flex items-center gap-1 shadow-sm">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Difoto</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-400 bg-slate-50/60 p-4 aspect-4/3 flex flex-col items-center justify-center text-center transition-colors">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                          <Camera className="h-5 w-5" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 block">Belum ada foto</span>
                        <p className="text-[10px] text-slate-400 mb-3">Pilih metode pengambilan:</p>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCameraActiveIndex(idx)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            <span>Kamera</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadTargetIndex(idx);
                              fileInputRef.current?.click();
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Upload className="h-3.5 w-3.5 text-slate-500" />
                            <span>Upload</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Metadata & Controls */}
                    <div className="mt-3 space-y-2 text-xs">
                      {/* Volume & Satuan */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Jumlah</label>
                          <input
                            type="number"
                            value={item.kuantitas || ''}
                            onChange={(e) => handleUpdateItem(idx, { kuantitas: parseFloat(e.target.value) || 0 })}
                            placeholder="0"
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-hidden focus:border-emerald-500 focus:bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Satuan</label>
                          <input
                            type="text"
                            value={item.satuan || ''}
                            onChange={(e) => handleUpdateItem(idx, { satuan: e.target.value })}
                            placeholder="kg, ikat, butir..."
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 outline-hidden focus:border-emerald-500 focus:bg-white"
                          />
                        </div>
                      </div>

                      {/* Kondisi Selector */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Kondisi Bahan</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, { kondisi: 'baik' })}
                            className={`py-1 px-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                              item.kondisi !== 'rusak'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            Baik / Segar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, { kondisi: 'rusak' })}
                            className={`py-1 px-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                              item.kondisi === 'rusak'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            Rusak / Cacat
                          </button>
                        </div>
                      </div>

                      {/* Catatan */}
                      <div>
                        <input
                          type="text"
                          value={item.catatan || ''}
                          onChange={(e) => handleUpdateItem(idx, { catatan: e.target.value })}
                          placeholder="Catatan tambahan (opsional)..."
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-700 outline-hidden focus:border-emerald-500 focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add custom item button */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleAddItem}
              className="px-4 py-2 rounded-xl border border-dashed border-slate-300 hover:border-emerald-500 bg-white text-slate-700 hover:text-emerald-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <Plus className="h-4 w-4 text-emerald-600" />
              <span>Tambah Bahan Baku Lain</span>
            </button>
          </div>

          {/* Action Bar Paling Bawah (Simpan Arsip, Export PDF, Export DOCX) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm mt-6">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                  <Save className="h-4 w-4 text-emerald-600" />
                  Finalisasi Dokumentasi Bahan
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simpan hasil foto ke arsip sistem atau download laporan resmi PDF & Word.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveDocumentation}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-emerald-400" />}
                  <span>Simpan ke Arsip</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={handleExportPdf}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                  title="Export PDF Dokumentasi Bahan"
                >
                  {isExportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  <span>Export PDF</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingDocx}
                  onClick={handleExportDocx}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                  title="Export Word DOCX Dokumentasi Bahan"
                >
                  {isExportingDocx ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  <span>Export DOCX</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: ARSIP DOKUMENTASI BAHAN */}
      {subTab === 'archive' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">
                  Daftar Arsip Dokumentasi Foto Bahan Makanan
                </h3>
                <p className="text-xs text-slate-500">
                  Riwayat laporan dokumentasi bahan makanan MBG yang telah disimpan.
                </p>
              </div>

              <div className="relative min-w-[240px]">
                <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari tanggal, bahan, petugas..."
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredArchive.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs italic">
                  Belum ada arsip dokumentasi bahan yang tersimpan.
                </div>
              ) : (
                filteredArchive.map((docItem) => {
                  const total = docItem.items?.length || 0;
                  const photoCount = (docItem.items || []).filter((i) => Boolean(i.photoUrl)).length;
                  return (
                    <div
                      key={docItem.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 px-3 rounded-xl transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-900">{docItem.tanggal}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                            {photoCount} / {total} Foto
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Petugas: <span className="font-bold text-slate-700">{docItem.officerName}</span> • Total {total} bahan tercatat
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSavedDoc(docItem);
                            setSubTab('capture');
                            showToast({ message: `Membuka dokumentasi ${docItem.tanggal}`, variant: 'info' });
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Lihat / Edit Foto
                        </button>
                        <button
                          type="button"
                          onClick={() => exportBahanDocumentationPdf(docItem)}
                          className="px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                          title="Export PDF"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => exportBahanDocumentationDocx(docItem)}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                          title="Export Word DOCX"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Word</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`Hapus dokumentasi bahan tanggal ${docItem.tanggal}?`)) {
                              await deleteBahanDocumentation(docItem.id);
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
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Modal */}
      {cameraActiveIndex !== null && (
        <LiveCamera
          isOpen={cameraActiveIndex !== null}
          onCapture={handleCameraCapture}
          onClose={() => setCameraActiveIndex(null)}
          activityType="PRODUKSI"
          orderId={selectedBatch?.id || 'mbg-bahan'}
        />
      )}

      {/* Enlarged Photo Preview Modal */}
      <AnimatePresence>
        {previewPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
            onClick={() => setPreviewPhoto(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-2xl max-h-[85vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between text-white px-3 py-2 border-b border-white/10 mb-2">
                <span className="font-bold text-xs">{previewPhoto.title}</span>
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <img
                src={previewPhoto.url}
                alt={previewPhoto.title}
                className="max-h-[70vh] w-auto mx-auto rounded-xl object-contain"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
