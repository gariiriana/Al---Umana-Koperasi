import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Wallet, CreditCard, ChevronRight, CheckCircle2, AlertTriangle, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { subscribeToCart, clearCart, computeCartTotal, CartLineItem } from "@/services/cartService";
import { createOrder, PaymentMethod } from "@/services/orderService";
import { formatIDR } from "@/lib/format";

const DELIVERY_FEE = 10000;
const SERVICE_FEE = 2000;

const DICTIONARY = {
  id: {
    back: "Kembali",
    shippingAddress: "Alamat Pengiriman",
    paymentMethod: "Metode Pembayaran",
    addressStep: "Alamat",
    paymentStep: "Pembayaran",
    emptyCart: "Keranjang Kosong",
    emptyPrompt: "Keranjang belanja Anda kosong. Silakan tambahkan barang sebelum checkout.",
    shopNow: "Belanja Sekarang",
    confirmTitle: "Konfirmasi Alamat Pengiriman",
    receiverName: "Nama Penerima",
    fullName: "Nama Lengkap",
    fullAddress: "Alamat Lengkap",
    detecting: "Mendeteksi…",
    detectLocation: "Deteksi Lokasi",
    detectSupportError: "Browser Anda tidak mendukung GPS.",
    detectGeocodeError: "Gagal mendapatkan alamat dari GPS. Isi manual ya.",
    detectAccessDenied: "Akses lokasi ditolak. Izinkan di pengaturan browser.",
    detectError: "Gagal mendapatkan lokasi. Pastikan GPS aktif.",
    gpsPlaceholder: "Masukkan alamat pengantaran lengkap Anda (contoh: nomor rumah, jalan, RT/RW, kelurahan, detail patokan)",
    deliveryTime: "Waktu Pengiriman",
    timeImmediate: "Segera (30 - 60 Menit)",
    timeLunch: "Makan Siang (12:00 - 13:00)",
    timeAfternoon: "Makan Sore (15:00 - 16:00)",
    timeDinner: "Makan Malam (18:00 - 19:00)",
    nameError: "Nama penerima tidak boleh kosong.",
    addressError: "Alamat pengiriman harus antara 10 dan 500 karakter.",
    saving: "Menyimpan…",
    proceedToPayment: "Lanjut ke Pembayaran",
    selectPayment: "Pilih Metode Pembayaran",
    codTitle: "Bayar di Tempat (COD)",
    codDesc: "Bayar langsung saat produk sampai",
    bankTitle: "Transfer Bank",
    bankDesc: "Kirim ke Bank Syariah Indonesia (BSI)",
    ewalletTitle: "E-Wallet",
    ewalletDesc: "Bayar dengan DANA / OVO / GoPay",
    instructionTitle: "Instruksi Pembayaran Non-COD",
    instructionBankTitle: "Bank Syariah Indonesia (BSI)",
    instructionEwalletTitle: "DANA / OVO / GoPay",
    bankName: "Koperasi Al-Umana",
    instructionAlert: "* Setelah transfer selesai, Anda diwajibkan **mengambil foto/screenshot bukti transfer** dan mengunggahnya pada langkah berikutnya agar pesanan disetujui oleh admin.",
    costSummary: "Rincian Biaya",
    productSubtotal: "Subtotal Produk",
    shippingFee: "Biaya Pengiriman (Ongkir)",
    serviceFee: "Biaya Layanan Koperasi",
    totalPayment: "Total Pembayaran",
    timeoutError: "Server tidak merespons. Silakan coba lagi.",
    outOfStockMsg: "Beberapa produk tidak tersedia. Silakan tinjau kembali keranjang Anda.",
    generalError: "Gagal membuat pesanan. Silakan coba lagi.",
    processing: "Memproses Pesanan…",
    placeOrder: "Pesan Sekarang",
    unknownItem: "Barang tidak dikenal",
    outOfStockSuffix: " (Habis)",
  },
  en: {
    back: "Back",
    shippingAddress: "Shipping Address",
    paymentMethod: "Payment Method",
    addressStep: "Address",
    paymentStep: "Payment",
    emptyCart: "Empty Cart",
    emptyPrompt: "Your shopping cart is empty. Please add items before checking out.",
    shopNow: "Shop Now",
    confirmTitle: "Confirm Shipping Address",
    receiverName: "Recipient Name",
    fullName: "Full Name",
    fullAddress: "Full Address",
    detecting: "Detecting...",
    detectLocation: "Detect Location",
    detectSupportError: "Your browser does not support GPS.",
    detectGeocodeError: "Failed to get address from GPS. Please fill in manually.",
    detectAccessDenied: "Location access denied. Please allow it in your browser settings.",
    detectError: "Failed to get location. Make sure GPS is enabled.",
    gpsPlaceholder: "Enter your full delivery address (e.g. house number, street, neighborhood, landmark details)",
    deliveryTime: "Delivery Time",
    timeImmediate: "Immediate (30 - 60 Minutes)",
    timeLunch: "Lunch (12:00 - 13:00)",
    timeAfternoon: "Afternoon (15:00 - 16:00)",
    timeDinner: "Dinner (18:00 - 19:00)",
    nameError: "Recipient name cannot be empty.",
    addressError: "Delivery address must be between 10 and 500 characters.",
    saving: "Saving...",
    proceedToPayment: "Proceed to Payment",
    selectPayment: "Select Payment Method",
    codTitle: "Cash on Delivery (COD)",
    codDesc: "Pay directly when the product arrives",
    bankTitle: "Bank Transfer",
    bankDesc: "Send to Bank Syariah Indonesia (BSI)",
    ewalletTitle: "E-Wallet",
    ewalletDesc: "Pay with DANA / OVO / GoPay",
    instructionTitle: "Non-COD Payment Instructions",
    instructionBankTitle: "Bank Syariah Indonesia (BSI)",
    instructionEwalletTitle: "DANA / OVO / GoPay",
    bankName: "Al-Umanaa Cooperative",
    instructionAlert: "* After transfer is complete, you are required to **take a photo/screenshot of the transfer proof** and upload it in the next step so the admin can approve your order.",
    costSummary: "Fee Details",
    productSubtotal: "Product Subtotal",
    shippingFee: "Shipping Fee",
    serviceFee: "Cooperative Service Fee",
    totalPayment: "Total Payment",
    timeoutError: "Server is not responding. Please try again.",
    outOfStockMsg: "Some products are out of stock. Please review your cart.",
    generalError: "Failed to create order. Please try again.",
    processing: "Processing Order...",
    placeOrder: "Order Now",
    unknownItem: "Unknown item",
    outOfStockSuffix: " (Out of stock)",
  }
} as const;

export function CheckoutWizard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  const [cartItems, setCartItems] = useState<CartLineItem[]>([]);
  const [loadingCart, setLoadingCart] = useState(true);
  const step = location.pathname.endsWith("/payment") ? "payment" : "address";

  // Address Step Fields
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("Segera (30 - 60 Menit)");
  const [addressError, setAddressError] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);

  // Geolocation state
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Payment Step Fields
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outOfStockItems, setOutOfStockItems] = useState<string[]>([]);

  // Initialize fields once profile loads
  useEffect(() => {
    if (profile) {
      setCustomerName(profile.displayName || "");
      if (profile.savedDeliveryAddress) {
        setAddress(profile.savedDeliveryAddress);
      }
    }
  }, [profile]);

  // Subscribe to Cart
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToCart(
      user.uid,
      (items) => {
        setCartItems(items);
        setLoadingCart(false);
      },
      (err) => {
        console.error("Gagal berlangganan keranjang:", err);
        setLoadingCart(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // If unauthenticated or loading profile
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
      </div>
    );
  }

  const subtotal = computeCartTotal(cartItems);
  const grandTotal = subtotal + DELIVERY_FEE + SERVICE_FEE;

  // Auto-detect location via device GPS + Nominatim reverse geocoding
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoError(t.detectSupportError);
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=id`,
            { headers: { "Accept-Language": "id" } }
          );
          if (!res.ok) throw new Error("Nominatim error");
          const data = await res.json() as {
            address?: {
              road?: string;
              village?: string;
              suburb?: string;
              city_district?: string;
              city?: string;
              county?: string;
              state?: string;
              postcode?: string;
              neighbourhood?: string;
            };
            display_name?: string;
          };
          const a = data.address || {};
          // Build a clean Indonesian-style address string
          const parts = [
            a.road,
            a.neighbourhood || a.village || a.suburb,
            a.city_district,
            a.city || a.county,
            a.state,
            a.postcode,
          ].filter(Boolean);
          const autoAddress = parts.length >= 2
            ? parts.join(", ")
            : (data.display_name ?? "").split(",").slice(0, 5).join(",").trim();
          setAddress(autoAddress);
        } catch {
          setGeoError(t.detectGeocodeError);
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === 1) {
          setGeoError(t.detectAccessDenied);
        } else {
          setGeoError(t.detectError);
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // Step 1 validation & save address
  const handleProceedToPayment = async () => {
    setAddressError("");
    const trimmedAddress = address.trim();
    const trimmedName = customerName.trim();

    if (!trimmedName) {
      setAddressError(t.nameError);
      return;
    }

    if (trimmedAddress.length < 10 || trimmedAddress.length > 500) {
      setAddressError(t.addressError);
      return;
    }

    setSavingAddress(true);

    try {
      // Save updated address to Firestore user profile for future orders (Requirement 4.4)
      // Use setDoc with merge:true to handle both new and existing user documents safely
      await setDoc(doc(db, "users", user.uid), {
        savedDeliveryAddress: trimmedAddress,
        displayName: trimmedName,
      }, { merge: true });
    } catch (err) {
      console.warn("Gagal menyimpan alamat ke profil pengguna. Melanjutkan checkout...", err);
      // Retain entered address and allow proceed anyway per Requirement 4.5
    } finally {
      setSavingAddress(false);
      navigate("/checkout/payment");
    }
  };

  // Submit Order
  const handleSubmitOrder = async () => {
    if (!paymentMethod) return;

    setSubmittingOrder(true);
    setSubmitError(null);
    setOutOfStockItems([]);

    const itemsPayload = cartItems.map((item) => ({
      itemId: item.itemId,
      itemName: item.itemName,
      quantity: item.quantity,
    }));

    const payload = {
      customerName: customerName.trim(),
      deliveryAddress: address.trim(),
      deliveryTime,
      items: itemsPayload,
      paymentMethod,
    };

    // Set 15-second timeout for the creation request per Requirement 6.2 / 6.8
    let requestCompleted = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        if (!requestCompleted) {
          reject(new Error("TIMEOUT"));
        }
      }, 15000);
    });

    try {
      const order = await Promise.race([
        createOrder(payload),
        timeoutPromise,
      ]);

      requestCompleted = true;

      // Clean up Cart upon success (Requirement 6.3 & 6.4)
      await clearCart(user.uid);

      if (paymentMethod === "cod") {
        // COD goes CONFIRMED immediately
        navigate(
          `/checkout/confirmation?orderId=${encodeURIComponent(order.id)}&name=${encodeURIComponent(customerName)}&address=${encodeURIComponent(address)}&time=${encodeURIComponent(deliveryTime)}&total=${grandTotal}`
        );
      } else {
        // Bank transfer / E-wallet goes AWAITING_PAYMENT_PROOF
        navigate(`/checkout/payment-proof/${encodeURIComponent(order.id)}`);
      }
    } catch (err: unknown) {
      requestCompleted = true;
      const e = err as { message?: string; status?: number; code?: string; outOfStockItems?: string[] };
      if (e.message === "TIMEOUT") {
        setSubmitError(t.timeoutError);
      } else if (e.status === 409 && e.code === "OUT_OF_STOCK") {
        // Out of stock returns to cart view per Requirement 6.5
        setOutOfStockItems(e.outOfStockItems || []);
        setSubmitError(t.outOfStockMsg);
      } else {
        setSubmitError(e.message || t.generalError);
      }
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-20">
      {/* Sticky Header */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <button
          title={t.back}
          onClick={() => {
            if (step === "payment") {
              navigate("/checkout/address");
            } else {
              navigate("/cart");
            }
          }}
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          {step === "address" ? t.shippingAddress : t.paymentMethod}
        </h1>
      </div>

      {/* Progress Wizard Steps Indicator */}
      <div className="bg-white px-4 py-3 flex items-center justify-center gap-2 border-b border-[#E5E7EB] text-xs font-semibold text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
        <span className={step === "address" ? "text-[#FBBF24]" : "text-[#111827]"}>{t.addressStep}</span>
        <ChevronRight className="h-3 w-3" />
        <span className={step === "payment" ? "text-[#FBBF24]" : ""}>{t.paymentStep}</span>
      </div>

      {/* Form Wizard Container */}
      <div className="p-4">
        {loadingCart ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
          </div>
        ) : cartItems.length === 0 ? (
          <div className="bg-white rounded-3xl p-6 shadow-sm text-center space-y-4">
            <AlertTriangle className="h-12 w-12 mx-auto text-[#F59E0B]" />
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.emptyCart}</h2>
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
              {t.emptyPrompt}
            </p>
            <Link to="/" className="inline-flex min-h-11 px-6 bg-[#FBBF24] rounded-2xl items-center font-bold text-[#111827]">
              {t.shopNow}
            </Link>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {step === "address" ? (
              <motion.div
                key="address-step"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {/* Step 1: Address */}
                <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
                  <div className="flex items-center gap-2 text-[#FBBF24]">
                     <MapPin className="h-5 w-5" />
                    <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                      {t.confirmTitle}
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {/* Receiver Name */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                        {t.receiverName}
                      </label>
                      <input
                        type="text"
                        placeholder={t.fullName}
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                    </div>

                    {/* Delivery Address */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                          {t.fullAddress}
                        </label>
                        <button
                          type="button"
                          onClick={handleDetectLocation}
                          disabled={geoLoading}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-[#B45309] bg-amber-50 border border-amber-200 rounded-full px-3 py-1 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {geoLoading ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> {t.detecting}</>
                          ) : (
                            <><Navigation className="h-3 w-3" /> {t.detectLocation}</>  
                          )}
                        </button>
                      </div>
                      {geoError && (
                        <p className="text-[11px] text-red-600 font-['Hanken_Grotesk',system-ui,sans-serif]">{geoError}</p>
                      )}
                      <textarea
                        rows={4}
                        placeholder={t.gpsPlaceholder}
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>

                    {/* Delivery Time Option */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                        {t.deliveryTime}
                      </label>
                      <div className="flex gap-2">
                        <select
                          title={t.deliveryTime}
                          className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                          value={deliveryTime}
                          onChange={(e) => setDeliveryTime(e.target.value)}
                        >
                          <option value="Segera (30 - 60 Menit)">{t.timeImmediate}</option>
                          <option value="Makan Siang (12:00 - 13:00)">{t.timeLunch}</option>
                          <option value="Makan Sore (15:00 - 16:00)">{t.timeAfternoon}</option>
                          <option value="Makan Malam (18:00 - 19:00)">{t.timeDinner}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {addressError && (
                    <p className="text-xs font-semibold text-[#EF4444] font-['Hanken_Grotesk',system-ui,sans-serif]">
                      {addressError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleProceedToPayment}
                    disabled={savingAddress}
                    className="w-full flex items-center justify-center gap-2 min-h-12 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-extrabold text-[#111827] rounded-2xl shadow-sm transition-all cursor-pointer"
                  >
                    {savingAddress ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        {t.saving}
                      </>
                    ) : (
                      <>
                        {t.proceedToPayment}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="payment-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {/* Step 2: Payment */}
                <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
                  <div className="flex items-center gap-2 text-[#FBBF24]">
                    <Wallet className="h-5 w-5" />
                    <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                      {t.selectPayment}
                    </h3>
                  </div>

                  {/* Payment List */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("cod")}
                      className={
                        "w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer " +
                        (paymentMethod === "cod"
                          ? "border-[#FBBF24] bg-amber-50/50 ring-2 ring-[#FBBF24]"
                          : "border-[#E5E7EB] hover:bg-[#F9FAFB]")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5 text-[#6B7280]" />
                        <div className="space-y-0.5">
                          <p className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                            {t.codTitle}
                          </p>
                          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            {t.codDesc}
                          </p>
                        </div>
                      </div>
                      {paymentMethod === "cod" && <CheckCircle2 className="h-5 w-5 text-[#FBBF24]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("bank_transfer")}
                      className={
                        "w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer " +
                        (paymentMethod === "bank_transfer"
                          ? "border-[#FBBF24] bg-amber-50/50 ring-2 ring-[#FBBF24]"
                          : "border-[#E5E7EB] hover:bg-[#F9FAFB]")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5 text-[#6B7280]" />
                        <div className="space-y-0.5">
                          <p className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                            {t.bankTitle}
                          </p>
                          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            {t.bankDesc}
                          </p>
                        </div>
                      </div>
                      {paymentMethod === "bank_transfer" && <CheckCircle2 className="h-5 w-5 text-[#FBBF24]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("e_wallet")}
                      className={
                        "w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer " +
                        (paymentMethod === "e_wallet"
                          ? "border-[#FBBF24] bg-amber-50/50 ring-2 ring-[#FBBF24]"
                          : "border-[#E5E7EB] hover:bg-[#F9FAFB]")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5 text-[#6B7280]" />
                        <div className="space-y-0.5">
                          <p className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                            {t.ewalletTitle}
                          </p>
                          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            {t.ewalletDesc}
                          </p>
                        </div>
                      </div>
                      {paymentMethod === "e_wallet" && <CheckCircle2 className="h-5 w-5 text-[#FBBF24]" />}
                    </button>
                  </div>
                </div>

                {/* Conditional Payment Instructions */}
                {(paymentMethod === "bank_transfer" || paymentMethod === "e_wallet") && (
                  <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3 border-l-4 border-[#FBBF24]">
                    <h4 className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-[#111827]">
                      {t.instructionTitle}
                    </h4>
                    <div className="text-xs text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif] space-y-2 leading-relaxed">
                      {paymentMethod === "bank_transfer" ? (
                        <p>
                          {lang === "en" ? "Please transfer the total payment of" : "Silakan transfer total pembayaran sebesar"} **{formatIDR(grandTotal)}** {lang === "en" ? "to the cooperative bank account:" : "ke rekening koperasi:"}
                          <br />
                          🏦 **{t.instructionBankTitle}**
                          <br />
                          {lang === "en" ? "Account:" : "Rekening:"} **123-456-7890**
                          <br />
                          {lang === "en" ? "Account Holder:" : "Atas Nama:"} **{t.bankName}**
                        </p>
                      ) : (
                        <p>
                          {lang === "en" ? "Please transfer the total payment of" : "Silakan transfer total pembayaran sebesar"} **{formatIDR(grandTotal)}** {lang === "en" ? "to the cooperative E-Wallet:" : "ke E-Wallet koperasi:"}
                          <br />
                          📱 **{t.instructionEwalletTitle}**
                          <br />
                          {lang === "en" ? "Number:" : "Nomor:"} **0812-3456-7890**
                          <br />
                          {lang === "en" ? "Account Holder:" : "Atas Nama:"} **{t.bankName}**
                        </p>
                      )}
                      <p className="text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                        {t.instructionAlert}
                      </p>
                    </div>
                  </div>
                )}

                {/* Billing Summary */}
                <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                    {t.costSummary}
                  </h3>
                  <div className="space-y-2 text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-[#6B7280]">
                    <div className="flex justify-between">
                      <span>{t.productSubtotal}</span>
                      <span className="font-semibold text-[#111827]">{formatIDR(subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t.shippingFee}</span>
                      <span className="font-semibold text-[#111827]">{formatIDR(DELIVERY_FEE)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t.serviceFee}</span>
                      <span className="font-semibold text-[#111827]">{formatIDR(SERVICE_FEE)}</span>
                    </div>
                    <hr className="border-[#F3F4F6] pt-1" />
                    <div className="flex justify-between text-sm font-bold text-[#111827] font-['Manrope',system-ui,sans-serif]">
                      <span>{t.totalPayment}</span>
                      <span className="text-base font-extrabold text-[#111827]">{formatIDR(grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-2xl text-xs space-y-2 font-['Hanken_Grotesk',system-ui,sans-serif]">
                    <p className="font-semibold">{submitError}</p>
                    {outOfStockItems.length > 0 && (
                      <ul className="list-disc pl-4 space-y-1">
                        {outOfStockItems.map((itemId) => {
                          const matched = cartItems.find((ci) => ci.itemId === itemId);
                          return <li key={itemId}>{matched?.itemName || t.unknownItem}{t.outOfStockSuffix}</li>;
                        })}
                      </ul>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmitOrder}
                  disabled={!paymentMethod || submittingOrder}
                  className="w-full flex items-center justify-center gap-2 min-h-12 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-extrabold text-[#111827] rounded-2xl shadow-md transition-all cursor-pointer disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed"
                >
                  {submittingOrder ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {t.processing}
                    </>
                  ) : (
                    <>
                      {t.placeOrder} ({formatIDR(grandTotal)})
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

export default CheckoutWizard;
