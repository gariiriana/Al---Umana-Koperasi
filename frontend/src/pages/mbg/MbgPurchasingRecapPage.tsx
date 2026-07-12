// ============================================================================
// MBG Purchasing Recap Page — Laporan Belanja & Submit to QC
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Calendar,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Send,
  FileText,
  User,
  ShoppingBag,
  Download
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgPurchaseOrder } from '@/types/mbg';
import { subscribeBatches, updateBatchStatus } from '@/services/mbgAdminService';
import { subscribePurchaseOrders } from '@/services/mbgPurchasingService';
import { MBG_BATCH_STATUS_CONFIG, MBG_PURCHASE_STATUS_CONFIG } from '@/constants/mbgConstants';
import { SearchableBatchSelector } from '@/components/mbg/SearchableBatchSelector';

export function MbgPurchasingRecapPage() {
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [orders, setOrders] = useState<MbgPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'ordered' | 'shipped' | 'received'>('all');
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  } | null>(null);

  // Export PDF Range States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [exportLoading, setExportLoading] = useState(false);

  // Helper to load logo image
  const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("Error loading logo for PDF:", err);
      return null;
    }
  };

  const formatIndoDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleExportPdfRange = async () => {
    const targetBatches = batches.filter(
      (b) => b.tanggal >= exportStartDate && b.tanggal <= exportEndDate
    );

    if (targetBatches.length === 0) {
      showToast({
        message: 'Tidak ada data batch pengiriman pada rentang tanggal tersebut!',
        variant: 'error',
      });
      return;
    }

    setExportLoading(true);
    try {
      const batchIds = targetBatches.map((b) => b.id);
      const poPromises = batchIds.map(async (bId) => {
        const q = query(
          collection(db, 'mbg_purchase_orders'),
          where('batchId', '==', bId),
          where('submittedToRecap', '==', true)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgPurchaseOrder));
      });

      const results = await Promise.all(poPromises);
      const allOrders = results.flat();

      if (allOrders.length === 0) {
        showToast({
          message: 'Tidak ada data belanja final pada rentang tanggal tersebut!',
          variant: 'error',
        });
        setExportLoading(false);
        return;
      }

      const batchMap = new Map(targetBatches.map((b) => [b.id, b]));
      allOrders.sort((a, b) => {
        const dateA = batchMap.get(a.batchId)?.tanggal || '';
        const dateB = batchMap.get(b.batchId)?.tanggal || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.supplierName || '').localeCompare(b.supplierName || '');
      });

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();

      const brandAmberDark: [number, number, number] = [146, 64, 14];
      const brandYellow: [number, number, number] = [251, 191, 36];
      const slateDark: [number, number, number] = [17, 24, 39];
      const slateLight: [number, number, number] = [107, 114, 128];

      const logoBase64 = await getBase64ImageFromUrl('/logo_badan_gizi.png');
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', (pageW / 2) - 9, 8, 18, 18);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...brandAmberDark);
      doc.text('YAYASAN LEMBAGA WAKAF AL UMANAA', pageW / 2, 31, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...slateDark);
      doc.text('SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU', pageW / 2, 36.5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      doc.text('Jl. Pelabuhan II Km. 9 Cibolang, Sukabumi | SIMOL MBG', pageW / 2, 41, { align: 'center' });

      doc.setDrawColor(229, 231, 235);
      doc.line(14, 44, pageW - 14, 44);

      doc.setFillColor(...brandYellow);
      doc.rect(14, 48, pageW - 28, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text(
        'LAPORAN REKAPITULASI BELANJA BAHAN BAKU MBG',
        pageW / 2,
        53,
        { align: 'center' }
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...slateDark);
      doc.text(
        `PERIODE: ${formatIndoDate(exportStartDate).toUpperCase()} S.D. ${formatIndoDate(exportEndDate).toUpperCase()}`,
        14,
        61
      );

      const tableRows = allOrders.map((order, index) => {
        const batchTanggal = batchMap.get(order.batchId)?.tanggal || '';
        return [
          (index + 1).toString(),
          formatIndoDate(batchTanggal),
          order.supplierName || '-',
          order.groupLabel || '-',
          order.type === 'harian' ? 'Harian' : 'Supplier',
          MBG_PURCHASE_STATUS_CONFIG[order.status]?.label || order.status,
          `Rp ${(order.totalPengeluaran || 0).toLocaleString('id-ID')}`
        ];
      });

      const grandTotalPengeluaran = allOrders.reduce((sum, o) => sum + (o.totalPengeluaran || 0), 0);

      tableRows.push([
        '',
        '',
        '',
        '',
        '',
        'GRAND TOTAL',
        `Rp ${grandTotalPengeluaran.toLocaleString('id-ID')}`
      ]);

      autoTable(doc, {
        startY: 65,
        head: [['No', 'Tanggal Pengiriman', 'Nama Supplier', 'Grup/Pesanan', 'Tipe PO', 'Status Belanja', 'Total Pengeluaran']],
        body: tableRows,
        theme: 'grid',
        headStyles: {
          fillColor: slateDark,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          valign: 'middle'
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: [50, 50, 50]
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 34, halign: 'left' },
          2: { cellWidth: 42, halign: 'left' },
          3: { cellWidth: 25, halign: 'center' },
          4: { cellWidth: 22, halign: 'center' },
          5: { cellWidth: 25, halign: 'center' },
          6: { cellWidth: 28, halign: 'right' }
        },
        didParseCell: (data) => {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = brandAmberDark;
            if (data.column.index === 5) {
              data.cell.styles.halign = 'right';
            }
          }
        }
      });

      const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
      let finalY = (docWithTable.lastAutoTable?.finalY ?? 65) + 12;
      const pageHeight = doc.internal.pageSize.getHeight();

      if (finalY + 30 > pageHeight) {
        doc.addPage();
        finalY = 20;
      }

      const sigWidth = 60;
      const leftSigX = 25;
      const rightSigX = pageW - 25 - sigWidth;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...slateDark);

      doc.text('Dibuat Oleh,', leftSigX + sigWidth / 2, finalY, { align: 'center' });
      doc.text('Petugas Purchasing MBG', leftSigX + sigWidth / 2, finalY + 4, { align: 'center' });
      doc.line(leftSigX, finalY + 22, leftSigX + sigWidth, finalY + 22);
      doc.text('( _____________________ )', leftSigX + sigWidth / 2, finalY + 26, { align: 'center' });

      doc.text('Diperiksa Oleh,', rightSigX + sigWidth / 2, finalY, { align: 'center' });
      doc.text('Tim QC Distribusi', rightSigX + sigWidth / 2, finalY + 4, { align: 'center' });
      doc.line(rightSigX, finalY + 22, rightSigX + sigWidth, finalY + 22);
      doc.text('( _____________________ )', rightSigX + sigWidth / 2, finalY + 26, { align: 'center' });

      doc.save(`Laporan_Rekap_Belanja_${exportStartDate}_s.d_${exportEndDate}.pdf`);
      showToast({ message: 'Laporan rekap belanja PDF berhasil diunduh!', variant: 'success' });
      setIsExportModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal mengekspor laporan PDF', variant: 'error' });
    } finally {
      setExportLoading(false);
    }
  };

  // Subscribe to operational batches
  useEffect(() => {
    const unsub = subscribeBatches((data) => {
      // Filter out draft batches
      const activeBatches = data.filter((b) => b.status !== 'DRAFT');
      setBatches(activeBatches);
      if (activeBatches.length > 0) {
        setSelectedBatchId((current) => current || activeBatches[0].id);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Subscribe to POs when batch changes
  useEffect(() => {
    if (!selectedBatchId) return;
    const unsub = subscribePurchaseOrders(selectedBatchId, setOrders, () => {
      showToast({ message: 'Gagal memuat purchase orders', variant: 'error' });
    });
    return unsub;
  }, [selectedBatchId, showToast]);

  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId);
  }, [batches, selectedBatchId]);

  // Display only finalized/submitted POs
  const finalizedOrders = useMemo(() => {
    return orders.filter((o) => o.submittedToRecap === true);
  }, [orders]);

  // Filter finalized POs by status
  const filteredFinalizedOrders = useMemo(() => {
    if (statusFilter === 'all') return finalizedOrders;
    return finalizedOrders.filter((o) => o.status === statusFilter);
  }, [finalizedOrders, statusFilter]);

  const grandTotal = useMemo(() => {
    return finalizedOrders.reduce((sum, order) => sum + (order.totalPengeluaran || 0), 0);
  }, [finalizedOrders]);

  const canSendToQc = useMemo(() => {
    return finalizedOrders.length > 0 && finalizedOrders.every((o) => o.status === 'received');
  }, [finalizedOrders]);

  const handleSendToQc = async () => {
    if (!selectedBatchId || finalizedOrders.length === 0) return;
    if (!canSendToQc) {
      showToast({ message: 'Semua belanja harus berstatus "Sudah Diterima" sebelum dikirim ke QC!', variant: 'error' });
      return;
    }
    setConfirmState({
      title: 'Kirim Laporan Belanja',
      message: 'Kirim rekap laporan belanja ini ke QC Distribusi untuk dilakukan pengecekan barang masuk?',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          // Update batch status to QC_PENDING (Menunggu QC)
          await updateBatchStatus(selectedBatchId, 'QC_PENDING');
          showToast({ message: 'Laporan belanja berhasil dikirim ke QC Distribusi!', variant: 'success' });
        } catch (err) {
          console.error(err);
          showToast({ message: 'Gagal mengirim laporan ke QC', variant: 'error' });
        } finally {
          setIsSubmitting(false);
          setConfirmState(null);
        }
      }
    });
  };

  const toggleExpandPo = (id: string) => {
    setExpandedPoId(expandedPoId === id ? null : id);
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Laporan Belanja (Rekap)</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Verifikasi rekap belanja bahan baku dan kirim laporan pemberitahuan ke QC Distribusi
          </p>
        </div>
        <div>
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 bg-[#111827] hover:bg-black text-white font-extrabold text-xs px-4 py-3 rounded-xl cursor-pointer shadow-md active:scale-95 transition-all w-full sm:w-auto justify-center"
          >
            <Download className="h-4 w-4 text-[#FBBF24]" />
            Ekspor Laporan PDF
          </button>
        </div>
      </div>

      {/* Batch Selection tabs */}
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
            <div className="space-y-6">
              {/* Batch QC Status Header */}
              {selectedBatch && (
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                  ['QC_PENDING', 'QC_PASSED', 'QC_FAILED', 'COOKING', 'COOKED', 'DELIVERING', 'DELIVERED'].includes(selectedBatch.status)
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <div className="flex items-center gap-3">
                    {['QC_PENDING', 'QC_PASSED', 'QC_FAILED', 'COOKING', 'COOKED', 'DELIVERING', 'DELIVERED'].includes(selectedBatch.status) ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider">Status Laporan Batch</p>
                      <p className="text-sm font-extrabold mt-0.5">
                        {['QC_PENDING', 'QC_PASSED', 'QC_FAILED', 'COOKING', 'COOKED', 'DELIVERING', 'DELIVERED'].includes(selectedBatch.status)
                          ? '✓ Laporan belanja sudah dikirim ke QC Distribusi'
                          : 'Belum dikirim ke QC Distribusi (Menunggu penyelesaian Purchasing)'}
                      </p>
                    </div>
                  </div>
                  
                  <span className={`text-xs font-extrabold rounded-full px-3 py-1 bg-white border ${
                    ['QC_PENDING', 'QC_PASSED', 'QC_FAILED', 'COOKING', 'COOKED', 'DELIVERING', 'DELIVERED'].includes(selectedBatch.status)
                      ? 'border-emerald-300 text-emerald-800'
                      : 'border-amber-300 text-amber-800'
                  }`}>
                    Status Batch: {MBG_BATCH_STATUS_CONFIG[selectedBatch.status]?.label || selectedBatch.status}
                  </span>
                </div>
              )}

              {/* Statistics Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">
                      Total Supplier Final
                    </span>
                    <span className="text-lg font-extrabold text-gray-800">
                      {finalizedOrders.length} / {orders.length} PO
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">
                      Total Belanja Final
                    </span>
                    <span className="text-lg font-extrabold text-gray-800">
                      Rp {grandTotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">
                      Pemeriksa Logistik
                    </span>
                    <span className="text-sm font-extrabold text-gray-800">
                      Tim QC Distribusi
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex flex-wrap gap-2 mb-4 bg-gray-100 p-1.5 rounded-2xl max-w-2xl border border-gray-200 shadow-xs">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-[#111827] text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                  }`}
                >
                  Semua Belanja
                </button>
                {(['pending', 'ordered', 'shipped', 'received'] as const).map((key) => {
                  const cfg = MBG_PURCHASE_STATUS_CONFIG[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setStatusFilter(key)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        statusFilter === key
                          ? 'bg-[#111827] text-white shadow-xs'
                          : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* Finalized PO List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-extrabold text-[#111827] uppercase tracking-wider">Daftar Belanja Supplier Final</h3>
                  <span className="text-xs text-gray-500 font-bold bg-[#E5E7EB] px-2 py-0.5 rounded-md">
                    {filteredFinalizedOrders.length} PO
                  </span>
                </div>
                {finalizedOrders.length === 0 ? (
                  <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center shadow-sm">
                    <AlertCircle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <h4 className="text-md font-bold text-[#111827]">Belum ada data belanja yang disimpan</h4>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                      Silakan masuk ke halaman **Purchasing MBG** dan klik tombol **"Simpan & Kirim ke Rekap"** di masing-masing PO supplier.
                    </p>
                  </div>
                ) : filteredFinalizedOrders.length === 0 ? (
                  <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center shadow-sm">
                    <AlertCircle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <h4 className="text-md font-bold text-[#111827]">Tidak ada data belanja dengan status ini</h4>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                      Semua data belanja yang tersimpan memiliki status yang berbeda untuk tanggal batch ini.
                    </p>
                  </div>
                ) : (
                  filteredFinalizedOrders.map((order) => {
                    const isExpanded = expandedPoId === order.id;
                    return (
                      <div
                        key={order.id}
                        className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm transition-all"
                      >
                        {/* Header PO Accordion */}
                        <div
                          onClick={() => toggleExpandPo(order.id)}
                          className="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-gray-50/50"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-extrabold text-[#111827]">
                              SUPPLIER: {order.supplierName}
                            </span>
                            <span className="text-xs text-gray-500 font-bold bg-[#E5E7EB] px-2.5 py-0.5 rounded-lg">
                              {order.groupLabel}
                            </span>
                            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-lg font-bold">
                              Belanja Final
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-extrabold text-[#111827]">
                              Rp {(order.totalPengeluaran || 0).toLocaleString('id-ID')}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                        </div>

                        {/* Items List (Expanded) */}
                        {isExpanded && (
                          <div className="border-t border-[#E5E7EB] overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase">
                                  <th className="py-2.5 px-6">Nama Bahan Baku</th>
                                  <th className="py-2.5 px-4 text-center">Jumlah</th>
                                  <th className="py-2.5 px-4 text-center">Satuan</th>
                                  <th className="py-2.5 px-4 text-right">Harga Satuan</th>
                                  <th className="py-2.5 px-6 text-right">Total Harga</th>
                                  <th className="py-2.5 px-6">Keterangan</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {order.items.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50/30">
                                    <td className="py-2 px-6 font-bold text-[#111827]">
                                      {item.bahanName}
                                    </td>
                                    <td className="py-2 px-4 text-center font-semibold">
                                      {item.jumlah}
                                    </td>
                                    <td className="py-2 px-4 text-center text-gray-600 font-semibold">
                                      {item.satuan}
                                    </td>
                                    <td className="py-2 px-4 text-right text-gray-600 font-medium">
                                      Rp {(item.hargaSatuan || 0).toLocaleString('id-ID')}
                                    </td>
                                    <td className="py-2 px-6 text-right font-bold text-[#111827]">
                                      Rp {(item.totalHarga || 0).toLocaleString('id-ID')}
                                    </td>
                                    <td className="py-2 px-6 text-gray-500 font-medium">
                                      {item.keterangan || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Submit CTA Button Section */}
              {finalizedOrders.length > 0 && (
                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                  <div>
                    <h4 className="text-sm font-extrabold text-[#111827]">Kirim Rekap Belanja ke QC</h4>
                    <p className="text-xs text-[#6B7280] mt-0.5">
                      Kirim daftar rekap belanja di atas agar Tim QC Distribusi dapat melakukan verifikasi barang masuk.
                    </p>
                    {!canSendToQc && (
                      <p className="text-[10px] text-red-500 font-extrabold mt-2 animate-in fade-in duration-200">
                        * Semua belanjaan harus berstatus "Sudah Diterima" sebelum rekap dikirim ke QC.
                      </p>
                    )}
                  </div>
                  
                  {selectedBatch && !['QC_PENDING', 'QC_PASSED', 'QC_FAILED', 'COOKING', 'COOKED', 'DELIVERING', 'DELIVERED'].includes(selectedBatch.status) ? (
                    <button
                      onClick={handleSendToQc}
                      disabled={isSubmitting || !canSendToQc}
                      className={`inline-flex items-center gap-2 font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-md ${
                        !canSendToQc
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none active:scale-100'
                          : 'bg-[#059669] hover:bg-[#047857] text-white active:scale-95 cursor-pointer'
                      }`}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 text-[#FBBF24]" />
                      )}
                      <span>Kirim ke QC Distribusi</span>
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold rounded-xl shadow-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Rekap Telah Dikirim ke QC</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-lg font-bold text-[#111827]">Pilih batch pengiriman</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                Silakan pilih batch pengiriman di atas untuk melihat Laporan Belanja.
              </p>
            </div>
          )}
        </>
      )}

      {confirmState && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in scale-in duration-200 font-['Hanken_Grotesk']">
            <h3 className="text-base font-extrabold text-gray-900 mb-2">
              {confirmState.title}
            </h3>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
              {confirmState.message}
            </p>
            <div className="flex justify-end gap-3 font-bold text-xs">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmState.onConfirm();
                }}
                className={`px-4 py-2.5 rounded-xl text-white cursor-pointer shadow-md transition-all active:scale-95 bg-[#111827] hover:bg-black`}
              >
                Kirim Laporan
              </button>
            </div>
          </div>
        </div>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in scale-in duration-200 font-['Hanken_Grotesk']">
            <h3 className="text-base font-extrabold text-gray-900 mb-2">
              Ekspor Rekap Laporan Belanja
            </h3>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
              Tentukan rentang tanggal pengiriman untuk mengunduh rekapitulasi data belanja bahan baku dalam format PDF.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                  Mulai Tanggal
                </label>
                <input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className="w-full text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className="w-full text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 font-bold text-xs">
              <button
                type="button"
                disabled={exportLoading}
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={exportLoading}
                onClick={handleExportPdfRange}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white cursor-pointer shadow-md transition-all active:scale-95 bg-[#111827] hover:bg-black disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {exportLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-[#FBBF24]" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 text-[#FBBF24]" />
                    <span>Unduh PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
