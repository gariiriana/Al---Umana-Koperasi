import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, ClipboardCheck, AlertCircle, Clock, Loader2 } from "lucide-react";

import { ApiError } from "@/services/apiClient";
import { transitionOrder } from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order } from "@/types/order";

const MAX_REASON = 500;

export function QCReviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFail, setExpandedFail] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<Record<string, { rasa: boolean; ukuran: boolean; jenis: boolean; kesesuaian: boolean }>>({});

  useEffect(() => subscribeOrders(setOrders, console.error), []);

  const queue = useMemo(
    () =>
      orders
        .filter((o) => o.status === "QC")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [orders]
  );

  const toggleCheck = (orderId: string, field: "rasa" | "ukuran" | "jenis" | "kesesuaian") => {
    setChecklists((prev) => {
      const current = prev[orderId] || { rasa: false, ukuran: false, jenis: false, kesesuaian: false };
      return {
        ...prev,
        [orderId]: {
          ...current,
          [field]: !current[field],
        },
      };
    });
  };

  const pass = async (o: Order) => {
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "qc-pass" });
      setChecklists((prev) => {
        const updated = { ...prev };
        delete updated[o.id];
        return updated;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const fail = async (o: Order) => {
    const reason = (reasons[o.id] ?? "").trim();
    if (!reason) { setError("Alasan gagal QC wajib diisi."); return; }
    if (reason.length > MAX_REASON) { setError(`Maksimal ${MAX_REASON} karakter.`); return; }
    setBusyId(o.id);
    setError(null);
    try {
      await transitionOrder(o.id, { action: "qc-fail", reason });
      setReasons((s) => ({ ...s, [o.id]: "" }));
      setExpandedFail(null);
      setChecklists((prev) => {
        const updated = { ...prev };
        delete updated[o.id];
        return updated;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-xl sm:text-2xl font-extrabold text-[#111827]">
            Quality Control
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
            Periksa hasil produksi sebelum dikirim ke distribusi
          </p>
        </div>
        <div className="flex flex-col items-center bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 sm:py-2 self-start sm:self-center">
          <span className="text-base sm:text-lg font-extrabold text-purple-700 font-['Manrope',system-ui,sans-serif]">{queue.length}</span>
          <span className="text-[9px] font-bold text-purple-600 uppercase tracking-wide">Review</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-['Hanken_Grotesk',system-ui,sans-serif]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Cards */}
      {queue.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center space-y-3">
          <ClipboardCheck className="h-14 w-14 mx-auto text-purple-400 bg-purple-50 rounded-full p-3" />
          <p className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">Semua Bersih!</p>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
            Tidak ada produk yang menunggu pemeriksaan QC.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {queue.map((o) => {
              const reason = reasons[o.id] ?? "";
              const remaining = MAX_REASON - reason.length;
              const isExpanded = expandedFail === o.id;
              const isBusy = busyId === o.id;
              const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);

              return (
                <motion.div
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-xs overflow-hidden">
                    {/* Purple top bar */}
                    <div className="h-1.5 bg-gradient-to-r from-purple-500 to-indigo-400" />

                    <div className="p-4 sm:p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="min-w-0">
                          <p className="font-['Manrope',system-ui,sans-serif] font-extrabold text-[#111827] text-base truncate">
                            {o.customerName}
                          </p>
                          <p className="font-mono text-[10px] text-[#9CA3AF] mt-0.5">
                            #{o.id.slice(0, 10)}…
                          </p>
                        </div>
                        <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-700">
                          <ClipboardCheck className="h-3 w-3" />
                          Siap QC
                        </span>
                      </div>

                      {/* Delivery time */}
                      <div className="flex items-center gap-2 mb-4 bg-[#F9FAFB] rounded-lg px-3 py-2 border border-[#E5E7EB]">
                        <Clock className="h-3.5 w-3.5 text-[#6B7280] shrink-0" />
                        <span className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">Target:</span>
                        <span className="text-xs font-bold text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif]">{o.deliveryTime}</span>
                      </div>

                      {/* Items */}
                      <div className="mb-5 rounded-lg border border-[#E5E7EB] overflow-hidden">
                        <div className="bg-[#F9FAFB] px-3 py-1.5 border-b border-[#E5E7EB] flex justify-between">
                          <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wide font-['Manrope',system-ui,sans-serif]">Item</span>
                          <span className="text-[10px] font-bold text-[#6B7280] font-['Manrope',system-ui,sans-serif]">{totalQty} unit</span>
                        </div>
                        <ul className="divide-y divide-[#F3F4F6]">
                          {o.items.map((it) => (
                            <li key={it.itemId} className="flex items-center justify-between px-3 py-2">
                              <span className="text-sm font-['Hanken_Grotesk',system-ui,sans-serif] text-[#374151]">{it.itemName}</span>
                              <span className="ml-3 shrink-0 inline-flex items-center justify-center h-6 w-8 rounded bg-[#F3F4F6] text-xs font-bold text-[#111827]">
                                ×{it.quantity}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Fail textarea (expandable) */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden mb-4"
                          >
                            <label
                              htmlFor={`reason-${o.id}`}
                              className="block mb-1.5 text-xs font-bold text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]"
                            >
                              Alasan Gagal QC <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              id={`reason-${o.id}`}
                              rows={3}
                              maxLength={MAX_REASON}
                              value={reason}
                              autoFocus
                              onChange={(e) => setReasons((s) => ({ ...s, [o.id]: e.target.value }))}
                              className="w-full rounded-lg border border-[#D1D5DB] bg-[#F9FAFB] px-4 py-3 text-sm font-['Hanken_Grotesk',system-ui,sans-serif] text-[#111827] focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:outline-none resize-none"
                              placeholder="Jelaskan masalah yang ditemukan (misal: produk tidak matang, kemasan rusak)…"
                            />
                            <div className="flex justify-between mt-1">
                              <span className="text-[10px] text-[#9CA3AF] font-['Hanken_Grotesk',system-ui,sans-serif]">Wajib diisi untuk gagalkan</span>
                              <span className="text-[10px] text-[#9CA3AF] font-['Hanken_Grotesk',system-ui,sans-serif]">{remaining}/{MAX_REASON}</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* QC Checklist */}
                      <div className="mb-5 p-4 bg-purple-50/40 rounded-lg border border-purple-100/60 text-xs font-['Hanken_Grotesk'] space-y-3">
                        <p className="font-bold text-purple-950 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                          <ClipboardCheck className="h-4 w-4 text-purple-700" />
                          Checklist Verifikasi Kualitas (QC)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#374151] font-semibold">
                          <label className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-neutral-200 hover:border-purple-200 cursor-pointer transition">
                            <input
                              type="checkbox"
                              checked={!!checklists[o.id]?.rasa}
                              onChange={() => toggleCheck(o.id, "rasa")}
                              className="text-purple-600 focus:ring-purple-400 rounded"
                            />
                            <span>Rasa</span>
                          </label>
                          <label className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-neutral-200 hover:border-purple-200 cursor-pointer transition">
                            <input
                              type="checkbox"
                              checked={!!checklists[o.id]?.ukuran}
                              onChange={() => toggleCheck(o.id, "ukuran")}
                              className="text-purple-600 focus:ring-purple-400 rounded"
                            />
                            <span>Ukuran</span>
                          </label>
                          <label className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-neutral-200 hover:border-purple-200 cursor-pointer transition">
                            <input
                              type="checkbox"
                              checked={!!checklists[o.id]?.jenis}
                              onChange={() => toggleCheck(o.id, "jenis")}
                              className="text-purple-600 focus:ring-purple-400 rounded"
                            />
                            <span>Jenis Produk</span>
                          </label>
                          <label className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-neutral-200 hover:border-purple-200 cursor-pointer transition">
                            <input
                              type="checkbox"
                              checked={!!checklists[o.id]?.kesesuaian}
                              onChange={() => toggleCheck(o.id, "kesesuaian")}
                              className="text-purple-600 focus:ring-purple-400 rounded"
                            />
                            <span>Kesesuaian Produk</span>
                          </label>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        {!isExpanded ? (
                          <>
                            {/* Pass */}
                            <button
                              onClick={() => pass(o)}
                              disabled={isBusy || !(checklists[o.id]?.rasa && checklists[o.id]?.ukuran && checklists[o.id]?.jenis && checklists[o.id]?.kesesuaian)}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-sm font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
                            >
                              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              Lulus QC
                            </button>
                            {/* Expand fail */}
                            <button
                              onClick={() => setExpandedFail(o.id)}
                              disabled={isBusy}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold text-sm font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
                            >
                              <XCircle className="h-4 w-4" />
                              Gagal QC
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Cancel */}
                            <button
                              onClick={() => setExpandedFail(null)}
                              disabled={isBusy}
                              className="flex-1 py-2.5 border border-[#E5E7EB] hover:bg-[#F3F4F6] text-[#374151] font-bold text-sm font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition-colors cursor-pointer"
                            >
                              Batal
                            </button>
                            {/* Confirm fail */}
                            <button
                              onClick={() => fail(o)}
                              disabled={isBusy || reason.trim().length === 0}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm font-['Hanken_Grotesk',system-ui,sans-serif] rounded-lg transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
                            >
                              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                              Konfirmasi Gagal
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default QCReviewPage;
