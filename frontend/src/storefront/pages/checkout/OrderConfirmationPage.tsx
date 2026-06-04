import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ShoppingBag, MapPin, Clock, Calendar, Navigation } from "lucide-react";
import { motion } from "motion/react";

import { formatIDR } from "@/lib/format";
import { useLanguage } from "@/contexts/LanguageContext";

const DICTIONARY = {
  id: {
    orderReceived: "Pesanan Diterima",
    thankYou: "Terima Kasih",
    receivedDesc: "Pesanan Anda telah diterima oleh koperasi dan sedang disiapkan.",
    orderNumber: "Nomor Pesanan",
    deliveryAddress: "Alamat Pengantaran",
    deliveryTime: "Waktu Pengantaran",
    paymentMethod: "Metode Pembayaran",
    cod: "Bayar di Tempat (COD)",
    totalPayment: "Total Pembayaran",
    viewOrders: "Lihat Pesanan Saya",
    backShopping: "Kembali Belanja",
  },
  en: {
    orderReceived: "Order Received",
    thankYou: "Thank You",
    receivedDesc: "Your order has been received by the cooperative and is being prepared.",
    orderNumber: "Order ID",
    deliveryAddress: "Delivery Address",
    deliveryTime: "Delivery Time",
    paymentMethod: "Payment Method",
    cod: "Cash on Delivery (COD)",
    totalPayment: "Total Payment",
    viewOrders: "View My Orders",
    backShopping: "Back to Shopping",
  }
} as const;

const renderFormattedAddress = (address: string) => {
  if (!address) return null;
  const parts = address.split(" | ");

  if (parts.length === 7) {
    const [kabupaten, kecamatan, desa, rtRw, postalCode, mapsUrl, specDetails] = parts;
    return (
      <div className="space-y-1 text-xs text-[#374151] font-['Hanken_Grotesk'] leading-relaxed">
        <p className="font-extrabold text-[#111827]">Desa/Kel. {desa}, RT/RW {rtRw}</p>
        <p className="font-semibold">Kec. {kecamatan}, {kabupaten}</p>
        <p className="text-[11px] font-medium text-neutral-500">Kode Pos: {postalCode}</p>
        <div className="text-[#6B7280] bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 mt-1 text-[11px] leading-relaxed">
          <span className="font-bold text-[#374151] block text-[9px] uppercase tracking-wide mb-0.5">Detail Patokan</span>
          {specDetails}
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
            onClick={(e) => e.stopPropagation()}>
            <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
            <span>Buka Link Peta ↗</span>
          </a>
        )}
      </div>
    );
  }

  if (parts.length === 3) {
    const [fullAddr, mapsUrl, specAddr] = parts;
    return (
      <div className="space-y-1 text-xs text-[#374151] font-['Hanken_Grotesk'] leading-relaxed">
        <p className="font-semibold text-[#111827]">{fullAddr}</p>
        <div className="text-[#6B7280] bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 mt-1 text-[11px] leading-relaxed">
          <span className="font-bold text-[#374151] block text-[9px] uppercase tracking-wide mb-0.5">Detail Patokan</span>
          {specAddr}
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
            onClick={(e) => e.stopPropagation()}>
            <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
            <span>Buka Link Peta ↗</span>
          </a>
        )}
      </div>
    );
  }

  const mapsUrlMatch = address.match(/https?:\/\/[^\s]+/);
  const mapsUrl = mapsUrlMatch ? mapsUrlMatch[0] : null;
  const cleanAddress = mapsUrl ? address.replace(mapsUrl, "").replace(/\s+/g, " ").trim() : address;

  return (
    <div className="space-y-0.5">
      {cleanAddress && <p className="text-xs text-[#374151] leading-relaxed font-medium">{cleanAddress}</p>}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer font-['Hanken_Grotesk']"
          onClick={(e) => e.stopPropagation()}>
          <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
          <span>Buka Link Peta ↗</span>
        </a>
      )}
    </div>
  );
};

const translateTime = (time: string, lang: string) => {
  if (lang === "id") return time;
  switch (time) {
    case "Segera (30 - 60 Menit)":
      return "Immediate (30 - 60 Minutes)";
    case "Makan Siang (12:00 - 13:00)":
      return "Lunch (12:00 - 13:00)";
    case "Makan Sore (15:00 - 16:00)":
      return "Afternoon (15:00 - 16:00)";
    case "Makan Malam (18:00 - 19:00)":
      return "Dinner (18:00 - 19:00)";
    default:
      return time;
  }
};

export function OrderConfirmationPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId") || "";
  const name = searchParams.get("name") || "";
  const address = searchParams.get("address") || "";
  const time = searchParams.get("time") || "";
  const totalRaw = searchParams.get("total") || "0";
  const total = parseInt(totalRaw, 10);
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

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
            {t.orderReceived}
          </span>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-black text-[#111827] pt-2">
            {t.thankYou}, {name}!
          </h1>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
            {t.receivedDesc}
          </p>
        </motion.div>

        {/* Order Details Card */}
        <motion.div
          variants={itemVariants}
          className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-4 text-left space-y-3 text-xs text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]"
        >
          <div className="flex justify-between items-center pb-2 border-b border-[#E5E7EB]">
            <span className="font-bold text-[#111827]">{t.orderNumber}</span>
            <span className="font-mono font-bold text-[#111827] text-sm">{orderId}</span>
          </div>

          <div className="flex gap-2.5 items-start">
            <MapPin className="h-4 w-4 text-[#9CA3AF] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[#111827] mb-0.5">{t.deliveryAddress}</span>
              {renderFormattedAddress(address)}
            </div>
          </div>

          <div className="flex gap-2.5 items-start">
            <Clock className="h-4 w-4 text-[#9CA3AF] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[#111827] mb-0.5">{t.deliveryTime}</span>
              <p>{translateTime(time, lang)}</p>
            </div>
          </div>

          <div className="flex gap-2.5 items-start">
            <Calendar className="h-4 w-4 text-[#9CA3AF] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[#111827] mb-0.5">{t.paymentMethod}</span>
              <p>{t.cod}</p>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-[#E5E7EB] text-sm">
            <span className="font-bold text-[#111827]">{t.totalPayment}</span>
            <span className="font-['Manrope',system-ui,sans-serif] font-black text-[#111827] text-base">
              {formatIDR(total)}
            </span>
          </div>
        </motion.div>

        {/* Actions Buttons */}
        <motion.div variants={itemVariants} className="space-y-3 pt-2">
          <Link
            to="/"
            className="w-full flex items-center justify-center gap-2 min-h-12 bg-[#111827] hover:bg-[#1F2937] text-sm font-bold text-white rounded-2xl shadow-sm transition-all"
          >
            <ShoppingBag className="h-4 w-4" />
            {t.backShopping}
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default OrderConfirmationPage;
