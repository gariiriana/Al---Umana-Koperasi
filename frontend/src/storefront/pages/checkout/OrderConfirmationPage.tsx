import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ArrowRight, ShoppingBag, MapPin, Clock, Calendar } from "lucide-react";
import { motion } from "motion/react";

import { formatIDR } from "@/lib/format";

export function OrderConfirmationPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId") || "";
  const name = searchParams.get("name") || "";
  const address = searchParams.get("address") || "";
  const time = searchParams.get("time") || "";
  const totalRaw = searchParams.get("total") || "0";
  const total = parseInt(totalRaw, 10);

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4,
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-20 pt-8 px-4 flex flex-col items-center justify-center">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-[480px] bg-white rounded-[32px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)] space-y-6 text-center"
      >
        {/* Animated Checkmark */}
        <motion.div
          variants={itemVariants}
          className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto"
        >
          <CheckCircle2 className="h-12 w-12" />
        </motion.div>

        {/* Title */}
        <motion.div variants={itemVariants} className="space-y-1">
          <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full uppercase tracking-wide">
            Pesanan Diterima
          </span>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-black text-[#111827] pt-2">
            Terima Kasih, {name}!
          </h1>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
            Pesanan Anda telah diterima oleh koperasi dan sedang disiapkan.
          </p>
        </motion.div>

        {/* Order Details Card */}
        <motion.div
          variants={itemVariants}
          className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-4 text-left space-y-3 text-xs text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]"
        >
          <div className="flex justify-between items-center pb-2 border-b border-[#E5E7EB]">
            <span className="font-bold text-[#111827]">Nomor Pesanan</span>
            <span className="font-mono font-bold text-[#111827] text-sm">{orderId}</span>
          </div>

          <div className="flex gap-2.5 items-start">
            <MapPin className="h-4 w-4 text-[#9CA3AF] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[#111827] mb-0.5">Alamat Pengantaran</span>
              <p className="leading-relaxed">{address}</p>
            </div>
          </div>

          <div className="flex gap-2.5 items-start">
            <Clock className="h-4 w-4 text-[#9CA3AF] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[#111827] mb-0.5">Waktu Pengantaran</span>
              <p>{time}</p>
            </div>
          </div>

          <div className="flex gap-2.5 items-start">
            <Calendar className="h-4 w-4 text-[#9CA3AF] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[#111827] mb-0.5">Metode Pembayaran</span>
              <p>Bayar di Tempat (COD)</p>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-[#E5E7EB] text-sm">
            <span className="font-bold text-[#111827]">Total Pembayaran</span>
            <span className="font-['Manrope',system-ui,sans-serif] font-black text-[#111827] text-base">
              {formatIDR(total)}
            </span>
          </div>
        </motion.div>

        {/* Actions Buttons */}
        <motion.div variants={itemVariants} className="space-y-3 pt-2">
          <Link
            to="/orders"
            className="w-full flex items-center justify-center gap-2 min-h-12 bg-[#111827] hover:bg-[#1F2937] text-sm font-bold text-white rounded-2xl shadow-sm transition-all"
          >
            Lihat Pesanan Saya
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/"
            className="w-full flex items-center justify-center gap-2 min-h-12 bg-white border border-[#E5E7EB] hover:bg-[#F3F4F6] text-sm font-bold text-[#111827] rounded-2xl transition-all"
          >
            <ShoppingBag className="h-4 w-4" />
            Kembali Belanja
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default OrderConfirmationPage;
