// ============================================================================
// MBG Persiapan Page — Cek List Bahan & Dokumentasi Bahan
// Satu pemilih batch dipakai bersama oleh kedua tab
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { ClipboardList } from 'lucide-react';
import { SearchableBatchSelector } from '@/components/mbg/SearchableBatchSelector';
import { MbgBahanChecklistSection } from '@/components/mbg/MbgBahanChecklistSection';
import { MbgBahanDocumentationSection } from '@/components/mbg/MbgBahanDocumentationSection';
import type {
  MbgPmBatch,
  MbgBahanChecklistForm,
  MbgProductionDailyReport,
} from '@/types/mbg';
import { subscribeBatches } from '@/services/mbgAdminService';
import { subscribeAllDailyReports } from '@/services/mbgProductionService';
import { subscribeAllBahanChecklist } from '@/services/mbgBahanService';
import { getJakartaDate } from '@/utils/date';

type PersiapanTab = 'checklist' | 'dokumentasi';

export function MbgPersiapanPage() {
  const [activeTab, setActiveTab] = useState<PersiapanTab>('checklist');
  const [rawBatches, setRawBatches] = useState<MbgPmBatch[]>([]);
  const [allDailyReports, setAllDailyReports] = useState<MbgProductionDailyReport[]>([]);
  const [allForms, setAllForms] = useState<MbgBahanChecklistForm[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  useEffect(() => subscribeBatches(setRawBatches), []);
  useEffect(() => subscribeAllDailyReports(setAllDailyReports), []);
  useEffect(() => subscribeAllBahanChecklist(setAllForms), []);

  const dailyReportBatchIds = useMemo(
    () => new Set(allDailyReports.map((r) => r.batchId)),
    [allDailyReports]
  );
  const savedFormBatchIds = useMemo(
    () => new Set(allForms.map((f) => f.batchId)),
    [allForms]
  );

  // Filter batches: ONLY show batches that have been submitted from Produksi MBG
  // or have a production daily report / inspection form
  const batches = useMemo(() => {
    return rawBatches.filter((b) => {
      if (b.isBackup) return false;
      // 1. Explicitly submitted to distribution by Produksi MBG
      if (b.submittedToDistribution === true) return true;
      // 2. Status indicates batch has progressed through / past production
      if (['DELIVERING', 'DELIVERED', 'COOKING', 'PURCHASING'].includes(b.status)) return true;
      // 3. Has a saved daily report with ingredient / PO data from Produksi MBG
      if (dailyReportBatchIds.has(b.id)) return true;
      // 4. Has an existing saved checklist inspection form
      if (savedFormBatchIds.has(b.id)) return true;
      return false;
    });
  }, [rawBatches, dailyReportBatchIds, savedFormBatchIds]);

  // Synchronize selected batch from the submitted batches list
  useEffect(() => {
    setSelectedBatchId((prev) => {
      if (batches.length === 0) return null;
      if (prev && batches.some((b) => b.id === prev)) return prev;
      const todayStr = getJakartaDate();
      const active = batches.find((b) => b.tanggal === todayStr) || batches[0];
      return active ? active.id : null;
    });
  }, [batches]);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId),
    [batches, selectedBatchId]
  );

  // Laporan harian terbaru untuk batch terpilih (sama seperti subscribeDailyReport)
  const dailyReport = useMemo(() => {
    if (!selectedBatchId) return null;
    const matches = allDailyReports.filter((r) => r.batchId === selectedBatchId);
    if (matches.length === 0) return null;
    return [...matches].sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    )[0];
  }, [allDailyReports, selectedBatchId]);

  return (
    <div className="min-h-screen bg-slate-50 font-['Hanken_Grotesk',system-ui,sans-serif] px-1 sm:px-4 pt-2 sm:pt-4">
      {/* Header: judul + pemilih batch bersama */}
      <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-xs px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 shadow-xs">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 leading-tight">Persiapan MBG</h1>
            <p className="text-xs text-slate-500">Cek list & dokumentasi bahan baku harian sebelum produksi</p>
          </div>
        </div>
        <div className="min-w-[200px]">
          <SearchableBatchSelector
            batches={batches}
            selectedBatchId={selectedBatchId}
            onSelectBatch={(id) => setSelectedBatchId(id)}
            importedBatchIds={dailyReportBatchIds}
          />
        </div>
      </div>

      {/* Tab Controller */}
      <div className="max-w-4xl mx-auto flex gap-1 sm:gap-1.5 mb-4 bg-[#F3F4F6] rounded-xl p-1">
        {(['checklist', 'dokumentasi'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 sm:py-2.5 px-1.5 sm:px-3 rounded-lg text-xs font-bold cursor-pointer transition-all text-center whitespace-nowrap ${
              activeTab === tab
                ? 'bg-white text-[#111827] shadow-sm font-black'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            {tab === 'checklist' ? '✅ Cek List Bahan' : '📷 Dokumentasi Bahan'}
          </button>
        ))}
      </div>

      {batches.length === 0 && (
        <div className="max-w-4xl mx-auto bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-900 font-bold mb-4 flex items-center gap-2 shadow-xs">
          <span>⚠️ Belum ada batch yang disubmit dari Produksi MBG. Pastikan batch sudah diproduksi & disubmit dari Produksi MBG agar data bahan otomatis terisi.</span>
        </div>
      )}

      {activeTab === 'checklist' ? (
        <MbgBahanChecklistSection
          selectedBatch={selectedBatch}
          dailyReport={dailyReport}
          allForms={allForms}
          onSelectBatch={setSelectedBatchId}
        />
      ) : (
        <div className="max-w-4xl mx-auto pb-16">
          <MbgBahanDocumentationSection selectedBatch={selectedBatch} dailyReport={dailyReport} />
        </div>
      )}
    </div>
  );
}
