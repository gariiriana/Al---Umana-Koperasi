// ============================================================================
// MBG Orders Page — Pelacakan & Status Pesanan MBG
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, Clock, ShoppingCart, Truck, ChefHat, Building,
  Activity, Image as ImageIcon, AlertTriangle, Users
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useToast } from '@/contexts/ToastContext';
import type {
  MbgPmBatch, MbgPmEntry, MbgPurchaseOrder, MbgQcCheck,
  MbgDeliveryTask, MbgCookingSession, MbgNutritionEntry
} from '@/types/mbg';
import type { CourierGPS } from '@/types/courier-gps';
import { subscribeBatches, subscribeEntries } from '@/services/mbgAdminService';
import { subscribePurchaseOrders } from '@/services/mbgPurchasingService';
import { subscribeQcChecks, subscribeDeliveryTasks } from '@/services/mbgDistributionService';
import { subscribeCookingSessions, subscribeNutrition } from '@/services/mbgProductionService';
import { subscribeCourierLocations } from '@/services/realtimeService';
import { MBG_BATCH_STATUS_CONFIG, NUTRIENTS_LIST } from '@/constants/mbgConstants';

// Custom Leaflet icons for couriers
const courierIcon = new L.DivIcon({
  className: "courier-marker",
  html: `<div style="width:32px;height:32px;border-radius:9999px;background:#FBBF24;border:3px solid #FFF;box-shadow:0 3px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:16px;animation: pulse-glow 2s infinite;">🛵</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const schoolIcon = new L.DivIcon({
  className: "school-marker",
  html: `<div style="width:28px;height:28px;border-radius:9999px;background:#1E293B;border:2.5px solid #FFF;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:12px;">🏫</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function MbgOrdersPage() {
  const { showToast } = useToast();

  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Batch details
  const [entries, setEntries] = useState<MbgPmEntry[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<MbgPurchaseOrder[]>([]);
  const [qcChecks, setQcChecks] = useState<MbgQcCheck[]>([]);
  const [cookingSessions, setCookingSessions] = useState<MbgCookingSession[]>([]);
  const [nutritionData, setNutritionData] = useState<MbgNutritionEntry[]>([]);
  const [deliveryTasks, setDeliveryTasks] = useState<MbgDeliveryTask[]>([]);
  const [courierLocations, setCourierLocations] = useState<CourierGPS[]>([]);

  const [activeTab, setActiveTab] = useState<'timeline' | 'institusi' | 'nutrition' | 'purchasing' | 'dapur' | 'tracking'>('timeline');

  // Subscribe to batches list
  useEffect(() => {
    const unsub = subscribeBatches(
      (data) => {
        // Show batches (from draft to delivered)
        setBatches(data);
        if (data.length > 0 && !selectedBatchId) {
          setSelectedBatchId(data[0].id);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load batches:', err);
        showToast({ message: 'Gagal memuat batch MBG', variant: 'error' });
        setLoading(false);
      }
    );
    return unsub;
  }, [selectedBatchId, showToast]);

  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId) || null;
  }, [batches, selectedBatchId]);

  // Subscribe to details of the selected batch
  useEffect(() => {
    if (!selectedBatchId) return;

    const unsubEntries = subscribeEntries(selectedBatchId, setEntries);
    const unsubPOs = subscribePurchaseOrders(selectedBatchId, setPurchaseOrders);
    const unsubQCs = subscribeQcChecks(selectedBatchId, setQcChecks);
    const unsubCooking = subscribeCookingSessions(selectedBatchId, setCookingSessions);
    const unsubNutrition = subscribeNutrition(selectedBatchId, setNutritionData);
    const unsubTasks = subscribeDeliveryTasks(selectedBatchId, setDeliveryTasks);

    return () => {
      unsubEntries();
      unsubPOs();
      unsubQCs();
      unsubCooking();
      unsubNutrition();
      unsubTasks();
    };
  }, [selectedBatchId]);

  // Subscribe to real-time courier GPS coordinates
  useEffect(() => {
    if (!selectedBatchId || selectedBatch?.status !== 'DELIVERING') {
      setCourierLocations([]);
      return;
    }

    const unsubLocations = subscribeCourierLocations(
      (locs) => {
        // Filter coordinates belonging to this batch
        setCourierLocations(locs.filter((l) => l.orderId === selectedBatchId));
      },
      (err) => console.error('Courier locations subscription error:', err)
    );

    return unsubLocations;
  }, [selectedBatchId, selectedBatch?.status]);

  // Recalculate totals
  const totalSiswa = useMemo(() => entries.reduce((s, e) => s + (e.qtSiswaBalita || 0), 0), [entries]);
  const totalIbu = useMemo(() => entries.reduce((s, e) => s + (e.qtBumilBusui || 0), 0), [entries]);
  const totalGuru = useMemo(() => entries.reduce((s, e) => s + (e.qtGuruKader || 0), 0), [entries]);
  const totalJumlah = useMemo(() => entries.reduce((s, e) => s + (e.jumlah || 0), 0), [entries]);
  const totalPobia = useMemo(() => entries.reduce((s, e) => s + (e.qtPobiaNasi || 0), 0), [entries]);

  // Map status to steps
  const steps = [
    { key: 'DRAFT', label: 'Draft', desc: 'Pembuatan data awal oleh Admin', statusKey: 'DRAFT' },
    { key: 'PM_SUBMITTED', label: 'PM Siap', desc: 'Data PM selesai diinput', statusKey: 'PM_SUBMITTED' },
    { key: 'NUTRITION_DONE', label: 'Kadar Gizi', desc: 'Kadar gizi dihitung oleh Gizi', statusKey: 'NUTRITION_DONE' },
    { key: 'PURCHASING', label: 'Belanja', desc: 'Proses PO & Pembelian Bahan', statusKey: 'PURCHASING' },
    { key: 'QC_PENDING', label: 'QC Penerimaan', desc: 'Pemeriksaan kualitas oleh Distribusi', statusKey: 'QC_PENDING' },
    { key: 'COOKING', label: 'Pengolahan Dapur', desc: 'Proses masak oleh tim produksi', statusKey: 'COOKING' },
    { key: 'DELIVERING', label: 'Pengantaran', desc: 'Kurir sedang mengantar ke institusi', statusKey: 'DELIVERING' },
    { key: 'DELIVERED', label: 'Selesai', desc: 'Makanan telah diterima & didokumentasikan', statusKey: 'DELIVERED' }
  ];

  // Helper to determine status step completion
  const getStepStatus = (stepKey: string, currentStatus: string) => {
    const statusOrder = [
      'DRAFT',
      'PM_SUBMITTED',
      'NUTRITION_DONE',
      'PDF_EXPORTED', // maps to nutrition done
      'PURCHASING',
      'PURCHASED', // maps to purchasing
      'QC_PENDING',
      'QC_FAILED', // maps to QC
      'QC_PASSED', // maps to QC passed
      'COOKING',
      'COOKED', // maps to cooking done
      'DELIVERING',
      'DELIVERED'
    ];

    const currentIdx = statusOrder.indexOf(currentStatus);

    let stepIdx = 0;
    if (stepKey === 'DRAFT') stepIdx = 0;
    else if (stepKey === 'PM_SUBMITTED') stepIdx = 1;
    else if (stepKey === 'NUTRITION_DONE') stepIdx = 2;
    else if (stepKey === 'PURCHASING') stepIdx = 4; // covers purchasing & purchased
    else if (stepKey === 'QC_PENDING') stepIdx = 8; // covers QC passed / failed / pending
    else if (stepKey === 'COOKING') stepIdx = 10; // covers cooking & cooked
    else if (stepKey === 'DELIVERING') stepIdx = 11;
    else if (stepKey === 'DELIVERED') stepIdx = 12;

    if (currentStatus === 'QC_FAILED' && stepKey === 'QC_PENDING') return 'failed';

    if (currentIdx >= stepIdx) {
      if (currentIdx === stepIdx || (stepKey === 'PURCHASING' && currentStatus === 'PURCHASING') || (stepKey === 'QC_PENDING' && currentStatus === 'QC_PENDING') || (stepKey === 'COOKING' && currentStatus === 'COOKING')) {
        return 'current';
      }
      return 'completed';
    }
    return 'pending';
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">Pesanan MBG</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Pantau status pemrosesan makanan bergizi gratis secara real-time
          </p>
        </div>

        {/* Date Selector */}
        {batches.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">Pilih Batch:</span>
            <select
              title="Pilih Batch"
              value={selectedBatchId || ''}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-xs font-extrabold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all cursor-pointer shadow-sm"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  Batch: {b.tanggal} ({b.totalJumlah} porsi)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Clock className="h-8 w-8 animate-spin text-[#FBBF24]" />
        </div>
      ) : !selectedBatch ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
          <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-gray-500">Belum Ada Batch MBG</h3>
          <p className="text-xs text-gray-400 mt-1">Gunakan halaman Admin MBG untuk membuat batch baru.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Banner Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-50 text-amber-500">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Tanggal</span>
                <span className="text-sm font-extrabold text-[#111827]">{selectedBatch.tanggal}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-50 text-blue-500">
                <Building className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Institusi</span>
                <span className="text-sm font-extrabold text-[#111827]">{entries.length} sekolah / posyandu</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-50 text-green-500">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Total Porsi</span>
                <span className="text-sm font-extrabold text-[#111827]">{totalJumlah} Porsi</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs flex items-center gap-4">
              <div className="p-3 rounded-xl bg-orange-50 text-orange-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Pobia Nasi</span>
                <span className="text-sm font-extrabold text-[#111827]">{totalPobia} Porsi Keringan</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-50 text-purple-500">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Status Batch</span>
                <span className={`inline-block text-[10px] font-extrabold px-2.5 py-0.5 rounded-full mt-0.5 ${MBG_BATCH_STATUS_CONFIG[selectedBatch.status]?.bgClass} ${MBG_BATCH_STATUS_CONFIG[selectedBatch.status]?.textClass}`}>
                  {MBG_BATCH_STATUS_CONFIG[selectedBatch.status]?.label}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-[#E5E7EB] gap-4 overflow-x-auto pb-px">
            <button onClick={() => setActiveTab('timeline')}
              className={`pb-3 text-xs font-bold shrink-0 border-b-2 cursor-pointer transition-all ${activeTab === 'timeline' ? 'border-[#FBBF24] text-[#111827]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              📍 Linimasa Status
            </button>
            <button onClick={() => setActiveTab('institusi')}
              className={`pb-3 text-xs font-bold shrink-0 border-b-2 cursor-pointer transition-all ${activeTab === 'institusi' ? 'border-[#FBBF24] text-[#111827]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              🏫 Sekolah & Porsi
            </button>
            {selectedBatch.status !== 'DRAFT' && selectedBatch.status !== 'PM_SUBMITTED' && (
              <button onClick={() => setActiveTab('nutrition')}
                className={`pb-3 text-xs font-bold shrink-0 border-b-2 cursor-pointer transition-all ${activeTab === 'nutrition' ? 'border-[#FBBF24] text-[#111827]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                🥦 Kadar Gizi
              </button>
            )}
            {!['DRAFT', 'PM_SUBMITTED', 'NUTRITION_DONE', 'PDF_EXPORTED'].includes(selectedBatch.status) && (
              <>
                <button onClick={() => setActiveTab('purchasing')}
                  className={`pb-3 text-xs font-bold shrink-0 border-b-2 cursor-pointer transition-all ${activeTab === 'purchasing' ? 'border-[#FBBF24] text-[#111827]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  🛒 Pembelian & QC
                </button>
                <button onClick={() => setActiveTab('dapur')}
                  className={`pb-3 text-xs font-bold shrink-0 border-b-2 cursor-pointer transition-all ${activeTab === 'dapur' ? 'border-[#FBBF24] text-[#111827]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  🍳 Dokumentasi Dapur
                </button>
              </>
            )}
            {selectedBatch.status === 'DELIVERING' && (
              <button onClick={() => setActiveTab('tracking')}
                className={`pb-3 text-xs font-bold shrink-0 border-b-2 cursor-pointer transition-all ${activeTab === 'tracking' ? 'border-[#FBBF24] text-[#111827]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                🗺️ Live Tracking Kurir
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="min-h-[300px]">
            <AnimatePresence mode="wait">
              {/* Tab 1: Timeline */}
              {activeTab === 'timeline' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
                  <h3 className="text-sm font-extrabold text-[#111827] mb-6">Linimasa Alur Kerja</h3>
                  <div className="relative border-l-2 border-gray-100 ml-4 pl-8 space-y-8">
                    {steps.map((step) => {
                      const stepStatus = getStepStatus(step.key, selectedBatch.status);
                      return (
                        <div key={step.key} className="relative">
                          {/* Indicator Dot */}
                          <div className={`absolute -left-[41px] top-1 h-6 w-6 rounded-full border-4 flex items-center justify-center transition-all ${
                            stepStatus === 'completed' ? 'bg-[#059669] border-[#D1FAE5]' :
                            stepStatus === 'current' ? 'bg-[#FBBF24] border-[#FEF3C7] animate-pulse' :
                            stepStatus === 'failed' ? 'bg-[#DC2626] border-[#FEE2E2]' :
                            'bg-gray-100 border-gray-200'
                          }`}>
                            {stepStatus === 'completed' && <span className="text-[10px] text-white font-bold">✓</span>}
                            {stepStatus === 'current' && <span className="h-1.5 w-1.5 rounded-full bg-[#111827]"></span>}
                            {stepStatus === 'failed' && <span className="text-[10px] text-white font-bold">✗</span>}
                          </div>

                          {/* Content */}
                          <div>
                            <h4 className={`text-xs font-extrabold ${stepStatus === 'pending' ? 'text-gray-400' : 'text-[#111827]'}`}>
                              {step.label}
                            </h4>
                            <p className="text-[11px] text-[#6B7280] mt-0.5">{step.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Tab 2: Schools & Portions */}
              {activeTab === 'institusi' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                  <div className="px-6 py-4 bg-gray-50 border-b border-[#E5E7EB]">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Rincian Sekolah & Posyandu</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-gray-100 text-gray-500 border-b border-gray-200 font-bold uppercase text-[9px] tracking-wider">
                          <th className="py-3 px-6">Institusi</th>
                          <th className="py-3 px-6 text-center">Tipe</th>
                          <th className="py-3 px-6 text-center">Siswa / Balita</th>
                          <th className="py-3 px-6 text-center">Bumil / Busui</th>
                          <th className="py-3 px-6 text-center">Guru / Kader</th>
                          <th className="py-3 px-6 text-center">Keringan Nasi</th>
                          <th className="py-3 px-6 text-center">Total</th>
                          <th className="py-3 px-6">Petugas Kurir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {entries.map((e) => (
                          <tr key={e.id} className={`hover:bg-gray-50/50 ${e.isSekolahLibur ? 'bg-red-50/50 opacity-60' : ''}`}>
                            <td className="py-3.5 px-6 font-bold flex items-center gap-2">
                              <Building className="h-4 w-4 text-gray-400" />
                              <div>
                                <span>{e.institutionName}</span>
                                {e.isSekolahLibur && <span className="ml-2 text-[8px] font-extrabold uppercase px-1.5 py-0.5 bg-red-100 text-red-600 rounded">Libur</span>}
                              </div>
                            </td>
                            <td className="py-3.5 px-6 text-center font-semibold capitalize text-gray-500">{e.institutionType}</td>
                            <td className="py-3.5 px-6 text-center font-bold">{e.qtSiswaBalita}</td>
                            <td className="py-3.5 px-6 text-center font-bold">{e.qtBumilBusui}</td>
                            <td className="py-3.5 px-6 text-center font-bold">{e.qtGuruKader}</td>
                            <td className="py-3.5 px-6 text-center font-bold text-amber-600">{e.qtPobiaNasi}</td>
                            <td className="py-3.5 px-6 text-center">
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-extrabold text-[10px]">
                                {e.jumlah}
                              </span>
                            </td>
                            <td className="py-3.5 px-6 font-semibold text-gray-600">{e.assignedPetugasName || 'Belum Ditunjuk'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Footer Row */}
                  <div className="bg-[#111827] text-white px-6 py-4 flex flex-wrap gap-x-8 gap-y-2 text-xs font-bold">
                    <span className="uppercase tracking-wider text-gray-400">Total Aktif:</span>
                    <span>Siswa: <strong className="text-[#FBBF24]">{totalSiswa}</strong></span>
                    <span>Bumil: <strong className="text-[#FBBF24]">{totalIbu}</strong></span>
                    <span>Guru: <strong className="text-[#FBBF24]">{totalGuru}</strong></span>
                    <span>Keringan: <strong className="text-[#FBBF24]">{totalPobia}</strong></span>
                    <span>Porsi: <strong className="text-[#FBBF24]">{totalJumlah}</strong></span>
                  </div>
                </motion.div>
              )}

              {/* Tab 3: Nutrition */}
              {activeTab === 'nutrition' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                  <div className="px-6 py-4 bg-gray-50 border-b border-[#E5E7EB] flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Kandungan Gizi Menu Makanan</span>
                  </div>
                  {nutritionData.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs font-bold">
                      Kadar gizi untuk batch ini belum dihitung oleh tim gizi.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left min-w-[1000px]">
                        <thead>
                          <tr className="bg-gray-100 text-gray-500 border-b border-gray-200 font-bold uppercase text-[9px] tracking-wider">
                            <th className="py-3 px-6">Nama Menu</th>
                            <th className="py-3 px-6 text-center">Porsi</th>
                            <th className="py-3 px-6 text-center">Berat (g)</th>
                            {NUTRIENTS_LIST.slice(0, 7).map((nut) => (
                              <th key={nut.key} className="py-3 px-4 text-center">{nut.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {nutritionData.map((n) => (
                            <tr key={n.id} className="hover:bg-gray-50/50 font-semibold">
                              <td className="py-3.5 px-6 font-bold text-gray-800">{n.menuItemName}</td>
                              <td className="py-3.5 px-6 text-center">{n.quantity}</td>
                              <td className="py-3.5 px-6 text-center">{n.berat} g</td>
                              {NUTRIENTS_LIST.slice(0, 7).map((nut) => {
                                const val = n[nut.key as keyof MbgNutritionEntry];
                                return (
                                  <td key={nut.key} className="py-3.5 px-4 text-center text-gray-700">
                                    {val !== undefined && val !== null ? Number(val).toFixed(1) : '0.0'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Tab 4: Purchasing & QC */}
              {activeTab === 'purchasing' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="space-y-6">
                  {/* Purchase Orders List */}
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                    <div className="px-6 py-4 bg-gray-50 border-b border-[#E5E7EB]">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status Belanja Bahan Baku</span>
                    </div>
                    {purchaseOrders.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-xs font-bold">
                        Belum ada data Purchase Order (PO) untuk batch ini.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-gray-100 text-gray-500 border-b border-gray-200 font-bold uppercase text-[9px] tracking-wider">
                              <th className="py-3 px-6">Supplier</th>
                              <th className="py-3 px-6 text-center">Tipe</th>
                              <th className="py-3 px-6 text-center">Jumlah Item</th>
                              <th className="py-3 px-6 text-center">Total Pengeluaran</th>
                              <th className="py-3 px-6 text-center">Jadwal Tiba</th>
                              <th className="py-3 px-6 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {purchaseOrders.map((po) => (
                              <tr key={po.id} className="hover:bg-gray-50/50">
                                <td className="py-3.5 px-6 font-bold text-gray-800">{po.supplierName}</td>
                                <td className="py-3.5 px-6 text-center font-bold capitalize text-gray-500">{po.type}</td>
                                <td className="py-3.5 px-6 text-center font-bold">{po.items.length} item</td>
                                <td className="py-3.5 px-6 text-center font-bold text-green-600">
                                  Rp {po.totalPengeluaran.toLocaleString('id-ID')}
                                </td>
                                <td className="py-3.5 px-6 text-center font-bold text-gray-600">{po.targetDate}</td>
                                <td className="py-3.5 px-6 text-center">
                                  <span className={`inline-block text-[9px] font-extrabold px-2 py-0.5 rounded-md ${
                                    po.status === 'received' ? 'bg-green-100 text-green-700' :
                                    po.status === 'shipped' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-gray-100 text-gray-500'
                                  }`}>
                                    {po.status === 'received' ? 'Diterima' : po.status === 'shipped' ? 'Dikirim' : 'Pending'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* QC Checks List */}
                  {qcChecks.length > 0 && (
                    <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                      <div className="px-6 py-4 bg-gray-50 border-b border-[#E5E7EB]">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hasil Quality Control (QC)</span>
                      </div>
                      <div className="p-6 space-y-4">
                        {qcChecks.map((qc) => (
                          <div key={qc.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-extrabold text-[#111827]">{qc.supplierName}</span>
                              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                                qc.overallStatus === 'passed' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                              }`}>
                                QC: {qc.overallStatus === 'passed' ? 'LOLOS' : 'GAGAL'}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Catatan QC: <strong>{qc.notes || '-'}</strong>
                            </div>

                            {/* QC Items Checklist Summary */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {qc.items.map((item, idx) => (
                                <div key={idx} className="bg-gray-50 border border-gray-100 rounded-lg p-2 flex items-center justify-between text-[10px]">
                                  <span className="font-bold truncate max-w-[120px]">{item.bahanName}</span>
                                  <span className={`font-extrabold ${item.status === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                                    {item.status === 'ok' ? '✓ OK' : '✗ Ditolak'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Tab 5: Cooking Documentation */}
              {activeTab === 'dapur' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
                  <h3 className="text-sm font-extrabold text-[#111827] mb-4">Dokumentasi Aktivitas Dapur</h3>
                  {cookingSessions.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs font-bold">
                      Belum ada sesi masak atau foto dokumentasi yang diupload untuk batch ini.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {cookingSessions.map((session) => (
                        <div key={session.id} className="space-y-4">
                          <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                            <span className="text-xs font-bold text-gray-500 flex items-center gap-2">
                              <ChefHat className="h-4.5 w-4.5 text-[#EA580C]" />
                              Diproses oleh: <strong>{session.cookedBy || 'Tim Produksi'}</strong>
                            </span>
                            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-600">
                              Masak: {session.status === 'done' ? 'Selesai' : 'Sedang Berlangsung'}
                            </span>
                          </div>

                          {session.photos.length === 0 ? (
                            <p className="text-xs text-gray-400">Belum ada foto yang diunggah.</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                              {session.photos.map((photo, i) => (
                                <div key={i} className="bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] p-3 text-center transition-all hover:shadow-xs">
                                  <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
                                    <ImageIcon className="h-10 w-10 text-gray-400 animate-pulse" />
                                  </div>
                                  <p className="text-[10px] font-extrabold text-[#111827] line-clamp-1">{photo.description}</p>
                                  <p className="text-[9px] text-[#9CA3AF] mt-0.5">
                                    {new Date(photo.capturedAt).toLocaleTimeString('id-ID')}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Tab 6: Courier Map Tracking */}
              {activeTab === 'tracking' && selectedBatch.status === 'DELIVERING' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Map */}
                  <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm h-[450px]">
                    <MapContainer
                      center={[-6.9175, 106.8456]} // Default coordinates in Sukabumi / West Java region
                      zoom={13}
                      scrollWheelZoom={false}
                      className="w-full h-full"
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />

                      {/* Render markers for couriers */}
                      {courierLocations.map((loc) => {
                        const task = deliveryTasks.find((t) => t.petugasId === loc.courierId);
                        return (
                          <Marker key={loc.courierId} position={[loc.latitude, loc.longitude]} icon={courierIcon}>
                            <Popup>
                              <div className="text-xs font-['Hanken_Grotesk'] font-bold">
                                <p className="font-extrabold text-[#111827]">{task?.petugasName || 'Kurir MBG'}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">Sedang mengantar {task?.totalPorsi} porsi</p>
                                <p className="text-[9px] text-gray-400 mt-1">Terakhir update: {new Date(loc.timestamp).toLocaleTimeString('id-ID')}</p>
                              </div>
                            </Popup>
                          </Marker>
                        );
                      })}

                      {/* Render school placeholders for visual layout */}
                      {entries.map((e, idx) => (
                        <Marker key={idx} position={[-6.9175 + (idx * 0.005), 106.8456 + (idx * 0.003)]} icon={schoolIcon}>
                          <Popup>
                            <div className="text-xs font-['Hanken_Grotesk'] font-bold">
                              <p className="font-extrabold text-[#111827]">{e.institutionName}</p>
                              <p className="text-[10px] text-amber-600 mt-0.5">{e.jumlah} Porsi</p>
                            </div>
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </div>

                  {/* Right: Courier Delivery Tasks List */}
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-extrabold text-[#111827] flex items-center gap-2">
                      <Truck className="h-4.5 w-4.5 text-[#FBBF24]" />
                      Status Petugas Kurir
                    </h3>

                    {deliveryTasks.length === 0 ? (
                      <p className="text-xs text-gray-400 font-bold">Belum ada penugasan kurir aktif.</p>
                    ) : (
                      <div className="space-y-3 overflow-y-auto max-h-[360px] pr-1">
                        {deliveryTasks.map((task) => {
                          const location = courierLocations.find((l) => l.courierId === task.petugasId);
                          return (
                            <div key={task.id} className="border border-gray-100 rounded-xl p-3.5 space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-extrabold text-[#111827]">{task.petugasName}</span>
                                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                                  task.status === 'delivered' ? 'bg-green-100 text-green-700' :
                                  task.status === 'delivering' ? 'bg-yellow-100 text-yellow-700 animate-pulse' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {task.status === 'delivered' ? 'Sampai' : task.status === 'delivering' ? 'OTW' : 'Menunggu'}
                                </span>
                              </div>
                              <div className="text-[10px] text-gray-500 font-bold flex justify-between">
                                <span>Total Porsi: <strong>{task.totalPorsi}</strong></span>
                                {location ? (
                                  <span className="text-green-600 flex items-center gap-1">🟢 GPS Aktif</span>
                                ) : (
                                  <span className="text-gray-400">⚪ Offline</span>
                                )}
                              </div>

                              {/* Progress of institutions under this courier */}
                              <div className="border-t border-gray-100 pt-2 space-y-1">
                                {task.deliveryPhotos.map((photo, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-[9px] font-bold text-green-600 bg-green-50/50 px-2 py-1 rounded">
                                    <span className="truncate max-w-[130px]">✓ {photo.institutionName}</span>
                                    <span>Tiba</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
