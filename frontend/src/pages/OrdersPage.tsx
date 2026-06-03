import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Calendar, Copy, ExternalLink, AlertTriangle, ShieldCheck, CheckCircle2, User, Phone } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { subscribeOrders } from "@/services/realtimeService";
import { transitionOrder, updatePaymentStatus, manuallyValidateOrder, type TransitionAction } from "@/services/orderService";
import type { Order, OrderStatus, PaymentStatus } from "@/types/order";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ManualValidationModal } from "@/admin/pages/ManualValidationModal";
import { formatIDR } from "@/lib/format";

export function OrdersPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "ALL">("ALL");
  
  // Modal states
  const [validationTargetId, setValidationTargetId] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeOrders(setOrders, (err) => {
      console.error(err);
      showToast({ message: "Gagal menyambung ke Firestore", variant: "error" });
    });
  }, [showToast]);

  const handleCopyLink = (order: Order) => {
    if (!order.invoiceToken) {
      showToast({ message: "Invoice token tidak ditemukan untuk pesanan ini.", variant: "error" });
      return;
    }
    const url = `${window.location.origin}/invoice/${order.invoiceToken}`;
    navigator.clipboard.writeText(url);
    setCopiedOrderId(order.id);
    showToast({ message: "Link invoice disalin ke clipboard", variant: "success" });
    setTimeout(() => setCopiedOrderId(null), 2000);
  };

  const handleUpdatePaymentStatus = async (orderId: string, status: PaymentStatus) => {
    try {
      await updatePaymentStatus(orderId, status);
      showToast({ message: `Status pembayaran diperbarui ke ${status}`, variant: "success" });
    } catch (err) {
      console.error(err);
      showToast({ message: "Gagal memperbarui status pembayaran", variant: "error" });
    }
  };

  const handleTransition = async (orderId: string, action: TransitionAction, reason?: string) => {
    setTransitioningId(orderId);
    try {
      await transitionOrder(orderId, { action, reason });
      showToast({ message: `Aksi ${action} sukses diproses`, variant: "success" });
    } catch (err) {
      console.error(err);
      showToast({ message: err instanceof Error ? err.message : "Gagal memproses aksi status", variant: "error" });
    } finally {
      setTransitioningId(null);
    }
  };

  const handleManualValidationConfirm = async (data: { contactPhone: string; screenshotFileIds: string[]; notes: string }) => {
    if (!validationTargetId) return;
    try {
      await manuallyValidateOrder(validationTargetId, data);
      showToast({ message: "Verifikasi manual berhasil disimpan!", variant: "success" });
    } catch (err) {
      console.error(err);
      showToast({ message: "Gagal menyimpan verifikasi manual", variant: "error" });
    }
  };

  // Due date warnings logic
  const getDueDateInfo = (order: Order) => {
    if (order.paymentStatus === "SUDAH_DIBAYAR") return { isOverdue: false, isWarning: false, label: "Lunas" };
    const dueDate = new Date(order.paymentDueDate);
    const now = new Date();
    const isOverdue = dueDate < now;
    
    // Warning if less than 24 hours away
    const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isWarning = !isOverdue && diffHours <= 24;

    return {
      isOverdue,
      isWarning,
      label: isOverdue ? "Terlambat" : isWarning ? "Jatuh tempo segera" : "Belum Dibayar"
    };
  };

  // Filter logic
  const filteredOrders = orders.filter((o) => {
    const query = search.toLowerCase();
    const matchSearch =
      o.institutionName.toLowerCase().includes(query) ||
      o.recipientName.toLowerCase().includes(query) ||
      o.recipientPhone.includes(query) ||
      o.id.toLowerCase().includes(query);

    const matchStatus = statusFilter === "ALL" ? true : o.status === statusFilter;
    const matchPayment = paymentFilter === "ALL" ? true : o.paymentStatus === paymentFilter;

    return matchSearch && matchStatus && matchPayment;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Daftar Pesanan & Invoice
          </h1>
          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk'] mt-1">
            Pantau status operasional pesanan, jatuh tempo invoice, dan verifikasi tanda tangan digital.
          </p>
        </div>
        <Link to="/admin/orders/new">
          <Button variant="primary" className="bg-[#D97706] hover:bg-[#B45309] text-white border-none rounded-xl font-bold flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Input Pesanan Baru
          </Button>
        </Link>
      </div>

      {/* Filters & Search */}
      <Card className="p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-xs">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-[#9CA3AF]" />
            <input
              type="text"
              placeholder="Cari berdasarkan instansi, penerima, nomor telepon, atau ID..."
              className="pl-10 w-full rounded-xl border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full md:w-auto">
            <div className="flex-1 sm:flex-initial">
              <select
                className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs font-semibold text-[#374151] focus:border-[#FBBF24] focus:outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "ALL")}
                aria-label="Filter Status Operasional"
              >
                <option value="ALL">Semua Status Operasional</option>
                <option value="PENDING">Pending</option>
                <option value="IN_PRODUCTION">Dalam Produksi</option>
                <option value="QC">QC</option>
                <option value="READY_TO_DELIVER">Siap Dikirim</option>
                <option value="OUT_FOR_DELIVERY">Dalam Pengiriman</option>
                <option value="COMPLETED">Selesai</option>
                <option value="DELIVERY_FAILED">Gagal Kirim</option>
              </select>
            </div>

            <div className="flex-1 sm:flex-initial">
              <select
                className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs font-semibold text-[#374151] focus:border-[#FBBF24] focus:outline-none"
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value as PaymentStatus | "ALL")}
                aria-label="Filter Status Pembayaran"
              >
                <option value="ALL">Semua Status Pembayaran</option>
                <option value="BELUM_DIBAYAR">Belum Dibayar</option>
                <option value="SUDAH_DIBAYAR">Sudah Dibayar</option>
                <option value="JATUH_TEMPO">Jatuh Tempo</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Orders Table */}
      <Card className="!p-0 overflow-hidden border border-[#E5E7EB] rounded-2xl shadow-sm bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                <th className="py-4 px-6">ID / Tipe</th>
                <th className="py-4 px-6">Instansi & Penerima</th>
                <th className="py-4 px-6">Detail Pesanan & Harga</th>
                <th className="py-4 px-6">Tanggal Acara / Jatuh Tempo</th>
                <th className="py-4 px-6">Status Operasional</th>
                <th className="py-4 px-6">Status Pembayaran</th>
                <th className="py-4 px-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] text-sm text-[#374151]">
              {filteredOrders.map((o) => {
                const dueInfo = getDueDateInfo(o);
                const isSigned = !!o.invoiceSignedAt;
                const isManuallyValidated = !!o.manualValidation;
                const shortId = o.id.slice(-6).toUpperCase();

                return (
                  <tr key={o.id} className="hover:bg-neutral-50/50 transition-colors">
                    {/* ID / Tipe */}
                    <td className="py-4 px-6 font-['Hanken_Grotesk']">
                      <div className="font-mono font-bold text-[#111827]">#{shortId}</div>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        o.orderType === "event" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"
                      }`}>
                        {o.orderType}
                      </span>
                    </td>

                    {/* Instansi & Penerima */}
                    <td className="py-4 px-6">
                      <div className="font-bold text-[#111827]">{o.institutionName}</div>
                      <div className="text-xs text-[#6B7280] flex items-center gap-1.5 mt-1 font-medium">
                        <User className="w-3.5 h-3.5 text-[#9CA3AF]" />
                        {o.recipientName}
                      </div>
                      <div className="text-xs text-[#6B7280] flex items-center gap-1.5 mt-0.5 font-mono">
                        <Phone className="w-3.5 h-3.5 text-[#9CA3AF]" />
                        {o.recipientPhone}
                      </div>
                    </td>

                    {/* Detail Pesanan & Harga */}
                    <td className="py-4 px-6">
                      <div className="text-xs max-w-xs truncate text-[#4B5563]" title={o.foodDetails}>
                        {o.foodDetails}
                      </div>
                      {o.drinkDetails && (
                        <div className="text-[11px] text-[#6B7280] italic truncate mt-0.5" title={o.drinkDetails}>
                          Minuman: {o.drinkDetails}
                        </div>
                      )}
                      <div className="font-extrabold text-[#B45309] mt-1.5">
                        {formatIDR(o.totalPrice)}
                      </div>
                    </td>

                    {/* Tanggal Acara / Jatuh Tempo */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1 text-xs text-[#374151]">
                        <Calendar className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                        Acara: {new Date(o.eventDate).toLocaleDateString("id-ID")}
                      </div>
                      <div className={`flex items-center gap-1 text-xs font-semibold mt-1.5 ${
                        dueInfo.isOverdue ? "text-[#EF4444]" : dueInfo.isWarning ? "text-[#F59E0B]" : "text-[#6B7280]"
                      }`}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Tempo: {new Date(o.paymentDueDate).toLocaleDateString("id-ID")}
                        {dueInfo.isOverdue && <span className="text-[9px] font-extrabold bg-red-100 text-red-700 px-1.5 py-0.5 rounded ml-1 uppercase">Overdue</span>}
                      </div>
                    </td>

                    {/* Status Operasional */}
                    <td className="py-4 px-6">
                      <StatusBadge status={o.status} />
                    </td>

                    {/* Status Pembayaran */}
                    <td className="py-4 px-6">
                      <select
                        className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border focus:outline-none cursor-pointer ${
                          o.paymentStatus === "SUDAH_DIBAYAR"
                            ? "bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]"
                            : o.paymentStatus === "JATUH_TEMPO"
                            ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
                            : "bg-[#FEF3C7] text-[#92400E] border-[#FDE047]"
                        }`}
                        value={o.paymentStatus}
                        onChange={(e) => handleUpdatePaymentStatus(o.id, e.target.value as PaymentStatus)}
                        aria-label="Ubah Status Pembayaran"
                      >
                        <option value="BELUM_DIBAYAR">Belum Dibayar</option>
                        <option value="SUDAH_DIBAYAR">Sudah Dibayar</option>
                        <option value="JATUH_TEMPO">Jatuh Tempo</option>
                      </select>

                      {/* Digital signature / manual validation badge */}
                      <div className="mt-2">
                        {isSigned ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#10B981] bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5">
                            <ShieldCheck className="w-3 h-3" /> TTD Digital
                          </span>
                        ) : isManuallyValidated ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Validasi Manual
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#6B7280] bg-neutral-100 rounded-md px-1.5 py-0.5">
                            Belum Valid
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Aksi */}
                    <td className="py-4 px-6 text-center">
                      <div className="flex flex-col gap-1.5 items-center justify-center">
                        {/* Status Transition buttons */}
                        {o.status === "PENDING" && (
                          <Button
                            size="sm"
                            className="bg-[#D97706] hover:bg-[#B45309] text-white border-none w-28 h-8 rounded-lg text-xs"
                            onClick={() => handleTransition(o.id, "start-production")}
                            disabled={transitioningId === o.id}
                          >
                            Mulai Masak
                          </Button>
                        )}
                        {o.status === "IN_PRODUCTION" && (
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white border-none w-28 h-8 rounded-lg text-xs"
                            onClick={() => handleTransition(o.id, "complete-production")}
                            disabled={transitioningId === o.id}
                          >
                            Kirim ke QC
                          </Button>
                        )}
                        {o.status === "QC" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white border-none h-8 px-2 rounded-lg text-xs"
                              onClick={() => handleTransition(o.id, "qc-pass")}
                              disabled={transitioningId === o.id}
                            >
                              Pass
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white border-none h-8 px-2 rounded-lg text-xs"
                              onClick={() => {
                                const reason = prompt("Masukkan alasan kegagalan QC:");
                                if (reason) handleTransition(o.id, "qc-fail", reason);
                              }}
                              disabled={transitioningId === o.id}
                            >
                              Fail
                            </Button>
                          </div>
                        )}

                        {/* Invoice & Validation actions */}
                        <div className="flex gap-1.5 items-center">
                          <button
                            onClick={() => handleCopyLink(o)}
                            className="text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 border border-[#D1D5DB] rounded-lg p-1.5 transition-all text-xs font-semibold flex items-center gap-1"
                            title="Salin Link Invoice"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {copiedOrderId === o.id ? "Tersalin!" : "Link"}
                          </button>

                          {!isSigned && !isManuallyValidated && (
                            <button
                              onClick={() => setValidationTargetId(o.id)}
                              className="text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg p-1.5 transition-all text-xs font-bold"
                              title="Validasi Bukti Manual"
                            >
                              Validasi
                            </button>
                          )}

                          {o.invoiceToken && (
                            <Link
                              to={`/invoice/${o.invoiceToken}`}
                              target="_blank"
                              className="text-neutral-600 hover:text-[#D97706] hover:bg-amber-50 border border-[#D1D5DB] rounded-lg p-1.5 transition-all"
                              title="Buka Invoice"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-[#6B7280] font-['Hanken_Grotesk']">
                    Tidak ada pesanan ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Manual Validation Modal */}
      <ManualValidationModal
        isOpen={validationTargetId !== null}
        onClose={() => setValidationTargetId(null)}
        orderId={validationTargetId || ""}
        onConfirm={handleManualValidationConfirm}
      />
    </div>
  );
}

export default OrdersPage;
