import { useEffect, useState, lazy, Suspense } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Wallet, CreditCard, ChevronRight, CheckCircle2, AlertTriangle, Navigation, Home, Briefcase, PenLine, FileText, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { subscribeToCart, clearCart, computeCartTotal, CartLineItem, removeLineItem, setLineNotes } from "@/services/cartService";
import { createOrder, PaymentMethod } from "@/services/orderService";
import { formatIDR } from "@/lib/format";
import type { ReverseGeoResult } from "@/components/MapLocationPicker";

const MapLocationPicker = lazy(() =>
  import("@/components/MapLocationPicker").then((m) => ({ default: m.MapLocationPicker }))
);

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

interface SavedAddress {
  id: string;
  label: string;
  kabupaten: string;
  kecamatan: string;
  desa: string;
  rtRw: string;
  postalCode: string;
  mapsUrl: string;
  specificDetails: string;
}

export function CheckoutWizard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  const [cartItems, setCartItems] = useState<CartLineItem[]>([]);
  const [loadingCart, setLoadingCart] = useState(true);
  const step = location.pathname.endsWith("/payment") ? "payment" : "address";

  const selectedItemIds = (location.state as { selectedItemIds?: string[] } | null)?.selectedItemIds;
  const checkoutItems = selectedItemIds
    ? cartItems.filter((item) => selectedItemIds.includes(item.itemId))
    : cartItems;

  // Address Step Fields (step-by-step)
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [addrKabupaten, setAddrKabupaten] = useState("");
  const [addrKecamatan, setAddrKecamatan] = useState("");
  const [addrDesa, setAddrDesa] = useState("");
  const [addrRtRw, setAddrRtRw] = useState("");
  const [addrPostalCode, setAddrPostalCode] = useState("");
  const [addrMapsUrl, setAddrMapsUrl] = useState("");
  const [addrSpecificDetails, setAddrSpecificDetails] = useState("");
  const [addressError, setAddressError] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);

  // Template selection
  const [profileAddresses, setProfileAddresses] = useState<SavedAddress[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [addressMode, setAddressMode] = useState<"template" | "manual">("manual");
  const [saveToProfile, setSaveToProfile] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [showMapPicker, setShowMapPicker] = useState(false);

  const handleMapLocationSelected = (result: ReverseGeoResult) => {
    setAddrKabupaten(result.kabupaten);
    setAddrKecamatan(result.kecamatan);
    setAddrDesa(result.desa);
    setAddrPostalCode(result.postalCode);
    setAddrMapsUrl(result.mapsUrl);
  };

  // Payment Step Fields
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outOfStockItems, setOutOfStockItems] = useState<string[]>([]);

  // Initialize fields once profile loads
  useEffect(() => {
    if (profile) {
      setCustomerName(profile.displayName || "");
      const ext = profile as unknown as { savedAddresses?: SavedAddress[] };
      const addrs = ext.savedAddresses || [];
      setProfileAddresses(addrs);

      if (addrs.length > 0) {
        setAddressMode("template");
        // Auto-select first template
        const first = addrs[0];
        setSelectedTemplateId(first.id);
        setAddrKabupaten(first.kabupaten);
        setAddrKecamatan(first.kecamatan);
        setAddrDesa(first.desa);
        setAddrRtRw(first.rtRw);
        setAddrPostalCode(first.postalCode);
        setAddrMapsUrl(first.mapsUrl);
        setAddrSpecificDetails(first.specificDetails);
      } else if (profile.savedDeliveryAddress) {
        // Parse legacy formats
        const saved = profile.savedDeliveryAddress;
        setAddress(saved);
        const parts = saved.split(" | ");
        if (parts.length === 7) {
          setAddrKabupaten(parts[0]);
          setAddrKecamatan(parts[1]);
          setAddrDesa(parts[2]);
          setAddrRtRw(parts[3]);
          setAddrPostalCode(parts[4]);
          setAddrMapsUrl(parts[5]);
          setAddrSpecificDetails(parts[6]);
        } else if (parts.length === 3) {
          setAddrKabupaten(parts[0]);
          setAddrMapsUrl(parts[1]);
          setAddrSpecificDetails(parts[2]);
        }
      }
    }
  }, [profile]);

  // Handle template selection
  const handleSelectTemplate = (addr: SavedAddress) => {
    setSelectedTemplateId(addr.id);
    setAddrKabupaten(addr.kabupaten);
    setAddrKecamatan(addr.kecamatan);
    setAddrDesa(addr.desa);
    setAddrRtRw(addr.rtRw);
    setAddrPostalCode(addr.postalCode);
    setAddrMapsUrl(addr.mapsUrl);
    setAddrSpecificDetails(addr.specificDetails);
    setAddressError("");
  };

  // Switch to manual mode
  const handleSwitchToManual = () => {
    setAddressMode("manual");
    setSelectedTemplateId(null);
    setAddrKabupaten("");
    setAddrKecamatan("");
    setAddrDesa("");
    setAddrRtRw("");
    setAddrPostalCode("");
    setAddrMapsUrl("");
    setAddrSpecificDetails("");
    setAddressError("");
  };

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

  const subtotal = computeCartTotal(checkoutItems);
  const grandTotal = subtotal + DELIVERY_FEE + SERVICE_FEE;

  // Step 1 validation & save address (7-field step-by-step)
  const handleProceedToPayment = async () => {
    setAddressError("");
    const trimmedName = customerName.trim();
    const tKab = addrKabupaten.trim();
    const tKec = addrKecamatan.trim();
    const tDesa = addrDesa.trim();
    const tRtRw = addrRtRw.trim();
    const tPostal = addrPostalCode.trim();
    const tMaps = addrMapsUrl.trim();
    const tDetails = addrSpecificDetails.trim();

    if (!trimmedName) {
      setAddressError(t.nameError);
      return;
    }

    if (!tKab) {
      setAddressError(lang === "en" ? "District/City (Kabupaten) is required." : "Kabupaten/Kota wajib diisi.");
      return;
    }
    if (!tKec) {
      setAddressError(lang === "en" ? "Subdistrict (Kecamatan) is required." : "Kecamatan wajib diisi.");
      return;
    }
    if (!tDesa) {
      setAddressError(lang === "en" ? "Village (Desa/Kelurahan) is required." : "Desa/Kelurahan wajib diisi.");
      return;
    }
    if (!tRtRw) {
      setAddressError(lang === "en" ? "RT/RW is required." : "RT/RW wajib diisi.");
      return;
    }
    if (!tPostal) {
      setAddressError(lang === "en" ? "Postal code is required." : "Kode Pos wajib diisi.");
      return;
    }
    if (!tMaps || !tMaps.startsWith("http")) {
      setAddressError(lang === "en" ? "Please enter a valid Google Maps URL (must start with http/https)." : "Mohon masukkan link Google Maps yang valid (harus diawali http/https).");
      return;
    }
    if (tDetails.length < 5) {
      setAddressError(lang === "en" ? "Please provide specific address details (min. 5 characters)." : "Detail spesifik alamat minimal 5 karakter.");
      return;
    }

    const combinedAddress = `${tKab} | ${tKec} | ${tDesa} | ${tRtRw} | ${tPostal} | ${tMaps} | ${tDetails}`;
    setAddress(combinedAddress);

    setSavingAddress(true);

    try {
      // Save the combined address to profile
      await setDoc(doc(db, "users", user.uid), {
        savedDeliveryAddress: combinedAddress,
        displayName: trimmedName,
      }, { merge: true });

      // Auto-save as new profile template if checkbox is ticked
      if (saveToProfile && saveLabel.trim()) {
        const newAddr: SavedAddress = {
          id: Date.now().toString(),
          label: saveLabel.trim(),
          kabupaten: tKab,
          kecamatan: tKec,
          desa: tDesa,
          rtRw: tRtRw,
          postalCode: tPostal,
          mapsUrl: tMaps,
          specificDetails: tDetails,
        };
        await updateDoc(doc(db, "users", user.uid), {
          savedAddresses: arrayUnion(newAddr)
        });
      }
    } catch (err) {
      console.warn("Gagal menyimpan alamat ke profil. Melanjutkan checkout...", err);
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

    const itemsPayload = checkoutItems.map((item) => ({
      itemId: item.itemId,
      itemName: item.itemName,
      quantity: item.quantity,
      notes: item.notes || "",
    }));

    // Parse Google Maps URL coordinates if present
    const mapsUrlMatch = address.match(/https?:\/\/[^\s]+/);
    const mapsUrl = mapsUrlMatch ? mapsUrlMatch[0] : null;
    let parsedLat: number | undefined = undefined;
    let parsedLng: number | undefined = undefined;
    if (mapsUrl) {
      const coordMatch = mapsUrl.match(/[@=/\s](-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (coordMatch) {
        parsedLat = parseFloat(coordMatch[0].replace(/[@=/\s]/, ""));
        const parts = coordMatch[0].replace(/[@=/\s]/, "").split(",");
        if (parts.length === 2) {
          parsedLat = parseFloat(parts[0]);
          parsedLng = parseFloat(parts[1]);
        }
      }
    }

    const payload = {
      customerName: customerName.trim(),
      deliveryAddress: address.trim(),
      deliveryTime: "",
      items: itemsPayload,
      paymentMethod,
      deliveryLat: parsedLat,
      deliveryLng: parsedLng,
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

      // Clean up Cart upon success only for COD (Requirement 6.3 & 6.4)
      if (paymentMethod === "cod") {
        if (selectedItemIds) {
          await Promise.all(selectedItemIds.map((itemId) => removeLineItem(user.uid, itemId)));
        } else {
          await clearCart(user.uid);
        }
      }

      if (paymentMethod === "cod") {
        // COD goes CONFIRMED immediately
        navigate(
          `/checkout/confirmation?orderId=${encodeURIComponent(order.id)}&name=${encodeURIComponent(customerName)}&address=${encodeURIComponent(address)}&total=${grandTotal}`
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
        ) : checkoutItems.length === 0 ? (
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

                    {/* ── Template Selector (if user has saved addresses) ── */}
                    {profileAddresses.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                          {lang === "en" ? "Select Address" : "Pilih Alamat"}
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {profileAddresses.map((addr) => {
                            const isSelected = addressMode === "template" && selectedTemplateId === addr.id;
                            const labelLower = addr.label.toLowerCase();
                            const Icon = labelLower.includes("kantor") || labelLower.includes("office") ? Briefcase
                              : labelLower.includes("rumah") || labelLower.includes("home") ? Home
                              : MapPin;
                            return (
                              <button
                                key={addr.id}
                                type="button"
                                onClick={() => { setAddressMode("template"); handleSelectTemplate(addr); }}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center cursor-pointer ${
                                  isSelected
                                    ? "border-[#FBBF24] bg-amber-50/60 ring-1 ring-[#FBBF24]"
                                    : "border-[#E5E7EB] hover:border-amber-200 hover:bg-amber-50/30"
                                }`}
                              >
                                <Icon className={`h-5 w-5 ${isSelected ? "text-[#B45309]" : "text-[#9CA3AF]"}`} />
                                <span className={`text-[11px] font-bold leading-tight ${isSelected ? "text-[#B45309]" : "text-[#6B7280]"}`}>{addr.label}</span>
                                {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-[#FBBF24]" />}
                              </button>
                            );
                          })}
                          {/* Manual Entry Option */}
                          <button
                            type="button"
                            onClick={handleSwitchToManual}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center cursor-pointer ${
                              addressMode === "manual"
                                ? "border-[#FBBF24] bg-amber-50/60 ring-1 ring-[#FBBF24]"
                                : "border-dashed border-[#D1D5DB] hover:border-amber-300 hover:bg-amber-50/30"
                            }`}
                          >
                            <PenLine className={`h-5 w-5 ${addressMode === "manual" ? "text-[#B45309]" : "text-[#9CA3AF]"}`} />
                            <span className={`text-[11px] font-bold leading-tight ${addressMode === "manual" ? "text-[#B45309]" : "text-[#6B7280]"}`}>
                              {lang === "en" ? "New Address" : "Alamat Baru"}
                            </span>
                            {addressMode === "manual" && <CheckCircle2 className="h-3.5 w-3.5 text-[#FBBF24]" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Selected Template Preview ── */}
                    {addressMode === "template" && selectedTemplateId && (
                      <div className="bg-[#FFFBEB] border border-amber-200 rounded-2xl p-3 space-y-1 text-xs font-['Hanken_Grotesk'] text-[#374151]">
                        <p className="font-extrabold text-[#111827]">Desa/Kel. {addrDesa}, RT/RW {addrRtRw}</p>
                        <p className="font-semibold">Kec. {addrKecamatan}, {addrKabupaten}</p>
                        <p className="text-[11px] text-neutral-500">{lang === "en" ? "Postal Code" : "Kode Pos"}: {addrPostalCode}</p>
                        <div className="mt-1.5 bg-white/70 border border-amber-100 rounded-lg px-2.5 py-1.5 text-[11px]">
                          <span className="font-bold text-[#374151] block text-[9px] uppercase tracking-wide mb-0.5">Detail Patokan</span>
                          {addrSpecificDetails}
                        </div>
                        {addrMapsUrl && (
                          <a href={addrMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer mt-1">
                            <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
                            <span>{lang === "en" ? "Open Maps ↗" : "Buka Peta ↗"}</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* ── Step-by-Step Manual Inputs ── */}
                    {(addressMode === "manual" || profileAddresses.length === 0) && (
                      <div className="space-y-3">
                        {/* Pick from Map button */}
                        <button
                          type="button"
                          onClick={() => setShowMapPicker(true)}
                          className="w-full flex items-center justify-center gap-2 min-h-11 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                        >
                          <MapPin className="h-4 w-4" />
                          {lang === "en" ? "📍 Pick Location on Map" : "📍 Pilih Lokasi di Peta"}
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-neutral-200" />
                          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
                            {lang === "en" ? "or fill manually" : "atau isi manual"}
                          </span>
                          <div className="flex-1 h-px bg-neutral-200" />
                        </div>

                        {showMapPicker && (
                          <Suspense fallback={
                            <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center">
                              <div className="bg-white rounded-2xl p-6 flex items-center gap-3 shadow-2xl">
                                <div className="h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-sm font-semibold text-neutral-700">{lang === "en" ? "Loading map..." : "Memuat peta..."}</span>
                              </div>
                            </div>
                          }>
                            <MapLocationPicker
                              lang={lang}
                              onLocationSelected={handleMapLocationSelected}
                              onClose={() => setShowMapPicker(false)}
                            />
                          </Suspense>
                        )}

                        {/* Kabupaten */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            {lang === "en" ? "District / City" : "Kabupaten / Kota"} <span className="text-red-500">*</span>
                          </label>
                          <input type="text" placeholder={lang === "en" ? "e.g. Sukabumi Regency" : "contoh: Kabupaten Sukabumi"}
                            className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                            value={addrKabupaten} onChange={(e) => setAddrKabupaten(e.target.value)} />
                        </div>
                        {/* Kecamatan */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            {lang === "en" ? "Subdistrict" : "Kecamatan"} <span className="text-red-500">*</span>
                          </label>
                          <input type="text" placeholder={lang === "en" ? "e.g. Cisaat" : "contoh: Kecamatan Cisaat"}
                            className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                            value={addrKecamatan} onChange={(e) => setAddrKecamatan(e.target.value)} />
                        </div>
                        {/* Desa */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            {lang === "en" ? "Village" : "Desa / Kelurahan"} <span className="text-red-500">*</span>
                          </label>
                          <input type="text" placeholder={lang === "en" ? "e.g. Sukamanah" : "contoh: Desa Sukamanah"}
                            className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                            value={addrDesa} onChange={(e) => setAddrDesa(e.target.value)} />
                        </div>
                        {/* RT/RW */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            RT / RW <span className="text-red-500">*</span>
                          </label>
                          <input type="text" placeholder={lang === "en" ? "e.g. RT 03/RW 05" : "contoh: RT 03/RW 05"}
                            className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                            value={addrRtRw} onChange={(e) => setAddrRtRw(e.target.value)} />
                        </div>
                        {/* Kode Pos */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            {lang === "en" ? "Postal Code" : "Kode Pos"} <span className="text-red-500">*</span>
                          </label>
                          <input type="text" placeholder={lang === "en" ? "e.g. 43152" : "contoh: 43152"}
                            className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                            value={addrPostalCode} onChange={(e) => setAddrPostalCode(e.target.value)} />
                        </div>
                        {/* Google Maps Link */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            {lang === "en" ? "Google Maps Link" : "Link Google Maps"} <span className="text-red-500">*</span>
                          </label>
                          <input type="text" placeholder={lang === "en" ? "Paste your Google Maps link (https://maps.app.goo.gl/...)" : "Tempel link Google Maps (contoh: https://maps.app.goo.gl/...)"}
                            className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                            value={addrMapsUrl} onChange={(e) => setAddrMapsUrl(e.target.value)} />
                          {addrMapsUrl.trim().startsWith("http") && (
                            <div className="mt-1.5 flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                              <Navigation className="h-4 w-4 text-blue-500 shrink-0" />
                              <a href={addrMapsUrl.trim()} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:underline transition cursor-pointer">
                                {lang === "en" ? "Open Pasted Google Maps Link ↗" : "Buka Link Google Maps Terdeteksi ↗"}
                              </a>
                            </div>
                          )}
                        </div>
                        {/* Detail Spesifik */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            {lang === "en" ? "Specific Address Details & Landmarks" : "Detail Spesifik Alamat & Patokan"} <span className="text-red-500">*</span>
                          </label>
                          <textarea rows={2} placeholder={lang === "en" ? "e.g. Black gate, next to warung, house color..." : "contoh: Pagar hitam, samping warung kelontong, warna cat rumah..."}
                            className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                            value={addrSpecificDetails} onChange={(e) => setAddrSpecificDetails(e.target.value)} />
                        </div>

                        {/* Save to profile checkbox */}
                        <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-3 space-y-2">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" checked={saveToProfile} onChange={(e) => setSaveToProfile(e.target.checked)}
                              className="h-4 w-4 mt-0.5 text-[#B45309] border-neutral-300 rounded focus:ring-[#FBBF24] cursor-pointer" />
                            <span className="text-xs font-semibold text-[#374151] font-['Hanken_Grotesk'] leading-snug">
                              {lang === "en" ? "Save this address to my profile for future purchases" : "Simpan alamat ini ke profil untuk pembelian berikutnya"}
                            </span>
                          </label>
                          {saveToProfile && (
                            <input type="text" placeholder={lang === "en" ? "Address label (e.g. Home, Office)" : "Label alamat (contoh: Rumah, Kantor)"}
                              className="w-full bg-white border border-[#D1D5DB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                              value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Product List with Notes ── */}
                    <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-[#FBBF24]" />
                        <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                          {lang === "en" ? "Your Order" : "Pesanan Anda"}
                          <span className="text-[#9CA3AF] font-medium ml-1.5">({checkoutItems.length})</span>
                        </h3>
                      </div>

                      <div className="space-y-2">
                        {checkoutItems.map((item) => (
                          <div key={item.itemId} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-3 space-y-2">
                            <div className="flex gap-3">
                              {item.imageUrl && (
                                <img
                                  src={item.imageUrl}
                                  alt={item.itemName}
                                  className="h-12 w-12 rounded-xl object-cover bg-white border border-neutral-200 shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-[#111827] leading-snug truncate">{item.itemName}</p>
                                <div className="flex items-center justify-between mt-0.5">
                                  <span className="text-[11px] text-[#6B7280]">
                                    {formatIDR(item.unitPrice)} × {item.quantity}
                                  </span>
                                  <span className="text-xs font-bold text-[#111827]">
                                    {formatIDR(item.unitPrice * item.quantity)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {/* Per-product note */}
                            <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[#FBBF24] transition-all">
                              <FileText className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0" />
                              <input
                                type="text"
                                maxLength={200}
                                placeholder={lang === "en" ? "Note (e.g. extra spicy, no onion)" : "Catatan (misal: extra pedas, tanpa bawang)"}
                                className="w-full bg-transparent border-none text-xs text-[#374151] placeholder-[#9CA3AF] focus:outline-none"
                                value={item.notes ?? ""}
                                onChange={async (e) => {
                                  if (!user) return;
                                  try { await setLineNotes(user.uid, item.itemId, e.target.value); } catch { /* silent */ }
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                        <span className="text-xs font-semibold text-[#6B7280]">{lang === "en" ? "Subtotal" : "Subtotal"}</span>
                        <span className="text-sm font-extrabold text-[#111827]">{formatIDR(subtotal)}</span>
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
                          const matched = checkoutItems.find((ci) => ci.itemId === itemId);
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
