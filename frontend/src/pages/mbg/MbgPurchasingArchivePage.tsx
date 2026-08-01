// ============================================================================
// MBG Purchasing Archive Page — Arsip Data Handover Purchasing ke Tim Produksi
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import {
  FolderArchive,
  Search,
  FileDown,
  FileText,
  Building,
  Loader2,
  ShoppingBag,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgPurchaseOrder } from '@/types/mbg';
import { subscribeBatches } from '@/services/mbgAdminService';
import { subscribePurchaseOrders } from '@/services/mbgPurchasingService';
import { exportPurchasingToDocx } from '@/utils/docxExporter';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function MbgPurchasingArchivePage() {
  const { showToast } = useToast();
  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [orders, setOrders] = useState<MbgPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsub = subscribeBatches((data) => {
      setBatches(data);
      if (data.length > 0 && !selectedBatchId) {
        setSelectedBatchId(data[0].id);
      }
      setLoading(false);
    });
    return unsub;
  }, [selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) return;
    const unsub = subscribePurchaseOrders(selectedBatchId, setOrders);
    return unsub;
  }, [selectedBatchId]);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId),
    [batches, selectedBatchId]
  );

  const archivedOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !searchQuery ||
        o.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.items.some((it) => it.bahanName.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSearch;
    });
  }, [orders, searchQuery]);

  const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const handleExportPdf = async (order: MbgPurchaseOrder) => {
    try {
      showToast({ message: 'Menyiapkan Form Pemeriksaan PDF...', variant: 'info' });
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();

      const logoBase64 = await getBase64ImageFromUrl('/logo_badan_gizi.png');
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 14, 10, 16, 16);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('BADAN GIZI NASIONAL', 32, 18);

      doc.setFontSize(11);
      doc.text('FORM ARSIP PEMERIKSAAN BAHAN MAKANAN', pageW - 14, 16, { align: 'right' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Dari       : Koperasi Al Umanaa Sejahtera Mandiri', 14, 34);
      doc.text('Kepada : SPPG Sukabumi Gunungguruh Kebonmanggu', 14, 39);
      doc.text(`Waktu    : ${selectedBatch?.tanggal || '-'}`, 14, 44);

      const tableBody = order.items.map((it, idx) => [
        idx + 1,
        it.bahanName,
        it.jumlah,
        it.satuan,
        `Rp ${(it.hargaSatuan || 0).toLocaleString('id-ID')}`,
        `Rp ${(it.totalHarga || 0).toLocaleString('id-ID')}`,
        it.keterangan || '-',
      ]);

      autoTable(doc, {
        startY: 50,
        head: [['No', 'Jenis Bahan Makanan', 'Banyaknya', 'Satuan', 'Harga Satuan', 'Total Harga', 'Keterangan']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });

      doc.save(`Arsip_Purchasing_${order.supplierName}_${selectedBatch?.tanggal || 'export'}.pdf`);
      showToast({ message: 'Arsip PDF berhasil didownload!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal export PDF', variant: 'error' });
    }
  };

  const handleExportDocx = async (order: MbgPurchaseOrder) => {
    try {
      showToast({ message: 'Menyiapkan dokumen Word (DOCX)...', variant: 'info' });
      const logoBase64 = await getBase64ImageFromUrl('/logo_badan_gizi.png');
      await exportPurchasingToDocx(
        {
          title: 'FORM ARSIP HANDOVER PURCHASING',
          formNo: `NO : 01/ARSIP-PBM/${selectedBatch?.tanggal || '2026'}`,
          dari: 'Koperasi Al Umanaa Sejahtera Mandiri',
          kepada: 'SPPG Sukabumi Gunungguruh Kebonmanggu',
          waktu: selectedBatch?.tanggal || '',
          batchDate: selectedBatch?.tanggal || '',
          totalItems: order.items.length,
          totalAmount: order.totalPengeluaran,
          items: order.items.map((it) => ({
            name: it.bahanName,
            qty: it.jumlah,
            unit: it.satuan,
            pricePerUnit: it.hargaSatuan,
            totalPrice: it.totalHarga,
            keterangan: it.keterangan,
            photoUrl: it.photoUrl,
          })),
          logoBase64: logoBase64 || undefined,
        },
        `Arsip_Handover_Purchasing_${selectedBatch?.tanggal || 'export'}.docx`
      );
      showToast({ message: 'Dokumen DOCX berhasil di-export!', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal export DOCX', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 font-['Hanken_Grotesk',system-ui,sans-serif] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-600 rounded-2xl">
            <FolderArchive className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">
              Arsip Purchasing MBG
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Riwayat data handover belanja dari Purchasing ke Tim Produksi & Sub-Purchasing
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari bahan / supplier..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400 font-semibold"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <>
          {/* Batch Selector */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {batches.map((b) => {
              const isSelected = b.id === selectedBatchId;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBatchId(b.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  🗓️ Batch {b.tanggal} ({b.totalJumlah} porsi)
                </button>
              );
            })}
          </div>

          {/* Orders List */}
          {archivedOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-xs">
              <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-800">Belum ada arsip handover</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                Data handover akan otomatis muncul di halaman arsip ini setelah disubmit dari Purchasing.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {archivedOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs hover:shadow-md transition-all"
                >
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-gray-500" />
                        <h3 className="text-sm font-extrabold text-gray-900">
                          Kepada: {order.supplierName}
                        </h3>
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-extrabold">
                          Handover Selesai
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Target Date: {order.targetDate} · Total: Rp{' '}
                        {(order.totalPengeluaran || 0).toLocaleString('id-ID')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExportPdf(order)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
                      >
                        <FileDown className="h-3.5 w-3.5 text-amber-400" /> PDF
                      </button>
                      <button
                        onClick={() => handleExportDocx(order)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5" /> DOCX
                      </button>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left min-w-[650px]">
                      <thead className="bg-gray-100/60 text-gray-500 font-bold uppercase text-[9px] tracking-wider border-b border-gray-200">
                        <tr>
                          <th className="py-2.5 px-6">No</th>
                          <th className="py-2.5 px-4">Nama Bahan</th>
                          <th className="py-2.5 px-4 text-center">Jumlah</th>
                          <th className="py-2.5 px-4 text-center">Satuan</th>
                          <th className="py-2.5 px-4 text-right">Harga Satuan</th>
                          <th className="py-2.5 px-4 text-right">Total Harga</th>
                          <th className="py-2.5 px-6">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {order.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50 font-semibold text-gray-800">
                            <td className="py-2.5 px-6 text-gray-400">{idx + 1}</td>
                            <td className="py-2.5 px-4 font-bold text-gray-900">{item.bahanName}</td>
                            <td className="py-2.5 px-4 text-center">{item.jumlah}</td>
                            <td className="py-2.5 px-4 text-center">{item.satuan}</td>
                            <td className="py-2.5 px-4 text-right text-gray-600">
                              Rp {(item.hargaSatuan || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-gray-900">
                              Rp {(item.totalHarga || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-2.5 px-6 text-gray-500">{item.keterangan || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MbgPurchasingArchivePage;
