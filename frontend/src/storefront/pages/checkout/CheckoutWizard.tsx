import { useEffect, useState, lazy, Suspense } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { doc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Wallet, CreditCard, ChevronRight, CheckCircle2, AlertTriangle, Navigation, Home, Briefcase, PenLine, FileText, ShoppingBag, Copy, ExternalLink, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { subscribeToCart, computeCartTotal, CartLineItem, removeLineItem, setLineNotes } from "@/services/cartService";
import { createOrder, createAdminOrder, PaymentMethod } from "@/services/orderService";
import type { OrderType } from "@/types/order";
import { formatIDR } from "@/lib/format";
import type { ReverseGeoResult } from "@/components/MapLocationPicker";
import { ProductImage } from "@/components/ProductImage";
import { listPromos, type Promo } from "@/services/promoService";
import { aggregateIngredients } from "@/lib/ingredientsParser";

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

  const getSavedField = <T,>(key: string, fallback: T): T => {
    try {
      const saved = localStorage.getItem("admin_checkout_form");
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        if (parsed[key] !== undefined) return parsed[key] as T;
      }
    } catch {
      // Ignored: silent fallback to parameter value
    }
    return fallback;
  };

  const [checkoutItems, setCheckoutItems] = useState<CartLineItem[]>([]);
  const [loadingCart, setLoadingCart] = useState(true);
  const step = location.pathname.endsWith("/payment") ? "payment" : "address";

  const selectedItemIds = (location.state as { selectedItemIds?: string[] } | null)?.selectedItemIds;
  const directCheckoutItems = (location.state as { directCheckoutItems?: CartLineItem[] } | null)?.directCheckoutItems;

  // Address Step Fields (step-by-step)
  const [customerName, setCustomerName] = useState(() => getSavedField("customerName", ""));
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
    if (isAdmin) {
      setDeliveryAddress(result.displayAddress);
      setAdminMapsUrl(result.mapsUrl);
    } else {
      setAddrKabupaten(result.kabupaten);
      setAddrKecamatan(result.kecamatan);
      setAddrDesa(result.desa);
      setAddrPostalCode(result.postalCode);
      setAddrMapsUrl(result.mapsUrl);
    }
  };

  // Payment Step Fields
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outOfStockItems, setOutOfStockItems] = useState<string[]>([]);

  // Admin Form Fields
  const [orderType, setOrderType] = useState<OrderType>(() => getSavedField("orderType", "event"));
  const [institutionName, setInstitutionName] = useState(() => getSavedField("institutionName", ""));
  const [recipientPhone, setRecipientPhone] = useState(() => getSavedField("recipientPhone", ""));
  const [recipientNotes, setRecipientNotes] = useState(() => getSavedField("recipientNotes", ""));
  const [eventDate, setEventDate] = useState(() => getSavedField("eventDate", ""));
  const [deliveryAddress, setDeliveryAddress] = useState(() => getSavedField("deliveryAddress", ""));
  const [deliveryTime, setDeliveryTime] = useState(() => getSavedField("deliveryTime", ""));
  const [foodDetails, setFoodDetails] = useState(() => getSavedField("foodDetails", ""));
  const [drinkDetails, setDrinkDetails] = useState(() => getSavedField("drinkDetails", ""));
  const [additionalNotes, setAdditionalNotes] = useState(() => getSavedField("additionalNotes", ""));
  const [additionalFee, setAdditionalFee] = useState<number>(() => getSavedField("additionalFee", 0));

  // Admin Success State
  const [createdAdminOrder, setCreatedAdminOrder] = useState<{ id: string; token: string; phone: string; name: string; totalPayment: number } | null>(null);
  const [adminCopied, setAdminCopied] = useState(false);

  const isAdmin = profile?.role === "admin";

  // Promo states
  const [appliedPromo, setAppliedPromo] = useState<Promo | null>(() => getSavedField("appliedPromo", null));
  const [promoDiscount, setPromoDiscount] = useState(0);

  // States & logic for promo selector modal
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [availablePromos, setAvailablePromos] = useState<Promo[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(false);
  const [adminMapsUrl, setAdminMapsUrl] = useState(() => getSavedField("adminMapsUrl", ""));

  const subtotal = computeCartTotal(checkoutItems);
  const grandTotal = Math.max(0, subtotal - promoDiscount) + DELIVERY_FEE + SERVICE_FEE;

  useEffect(() => {
    if (isAdmin) {
      const formState = {
        orderType,
        institutionName,
        customerName,
        recipientPhone,
        eventDate,
        deliveryTime,
        deliveryAddress,
        adminMapsUrl,
        recipientNotes,
        foodDetails,
        drinkDetails,
        additionalNotes,
        additionalFee,
        appliedPromo,
      };
      localStorage.setItem("admin_checkout_form", JSON.stringify(formState));
    }
  }, [
    isAdmin,
    orderType,
    institutionName,
    customerName,
    recipientPhone,
    eventDate,
    deliveryTime,
    deliveryAddress,
    adminMapsUrl,
    recipientNotes,
    foodDetails,
    drinkDetails,
    additionalNotes,
    additionalFee,
    appliedPromo,
  ]);

  useEffect(() => {
    if (showPromoModal) {
      const fetchPromos = async () => {
        setLoadingPromos(true);
        try {
          const data = await listPromos();
          setAvailablePromos(data.filter((p) => p.active));
        } catch (err) {
          console.error("Gagal memuat daftar promo:", err);
        } finally {
          setLoadingPromos(false);
        }
      };
      void fetchPromos();
    }
  }, [showPromoModal]);

  const handleSelectPromoFromModal = (promo: Promo) => {
    if (subtotal < promo.minPurchase) return;

    let discount = 0;
    if (promo.discountType === "percentage") {
      discount = Math.round((subtotal * promo.value) / 100);
      if (promo.maxDiscount && discount > promo.maxDiscount) {
        discount = promo.maxDiscount;
      }
    } else {
      discount = promo.value;
    }

    setAppliedPromo(promo);
    setPromoDiscount(discount);
    setShowPromoModal(false);
  };

  // Enriched items state (with ingredients/imageUrl from DB)
  const [enrichedCheckoutItems, setEnrichedCheckoutItems] = useState<(CartLineItem & { ingredients?: string })[]>([]);

  useEffect(() => {
    if (checkoutItems.length === 0) {
      setEnrichedCheckoutItems([]);
      return;
    }
    let active = true;
    const enrich = async () => {
      try {
        const { getProduct } = await import("@/services/catalogService");
        const enriched = await Promise.all(
          checkoutItems.map(async (item) => {
            try {
              const prod = await getProduct(item.itemId);
              return {
                ...item,
                ingredients: prod.ingredients || "",
                imageUrl: prod.imageUrl || item.imageUrl || "",
              };
            } catch (err) {
              console.warn("Failed to enrich checkout item:", item.itemId, err);
              return item;
            }
          })
        );
        if (active) {
          setEnrichedCheckoutItems(enriched);
        }
      } catch (err) {
        console.error("Enrichment error:", err);
      }
    };
    void enrich();
    return () => {
      active = false;
    };
  }, [checkoutItems]);

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoDiscount(0);
  };

  // Re-verify promo whenever subtotal changes
  useEffect(() => {
    if (appliedPromo) {
      if (subtotal < appliedPromo.minPurchase) {
        setAppliedPromo(null);
        setPromoDiscount(0);
      } else {
        let discount = 0;
        if (appliedPromo.discountType === "percentage") {
          discount = Math.round((subtotal * appliedPromo.value) / 100);
          if (appliedPromo.maxDiscount && discount > appliedPromo.maxDiscount) {
            discount = appliedPromo.maxDiscount;
          }
        } else {
          discount = appliedPromo.value;
        }
        setPromoDiscount(discount);
      }
    }
  }, [subtotal, appliedPromo, lang]);

  const renderPromoSection = () => (
    <div className="bg-white border border-[#E5E7EB] rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
      <h3 className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-1.5">
        <ShoppingBag className="h-4 w-4 text-[#FBBF24]" />
        {lang === "id" ? "Promo & Voucher Belanja" : "Promo & Voucher"}
      </h3>
      {appliedPromo ? (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
          <div className="space-y-0.5">
            <span className="font-mono text-xs font-extrabold text-emerald-800 bg-emerald-100 border border-emerald-300 rounded px-2 py-0.5">
              {appliedPromo.code}
            </span>
            <p className="text-[11px] font-semibold text-emerald-700 mt-1">
              {lang === "id" ? "Potongan" : "Discount"}: -{formatIDR(promoDiscount)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemovePromo}
            className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
          >
            {lang === "id" ? "Hapus" : "Remove"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPromoModal(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#FBBF24] hover:bg-[#F59E0B] text-xs font-bold text-[#111827] rounded-xl transition cursor-pointer shadow-sm hover:shadow"
        >
          {lang === "id" ? "Lihat Promo & Voucher Belanja" : "View Available Promos"}
        </button>
      )}
    </div>
  );

  const renderPromoModal = () => (
    <AnimatePresence>
      {showPromoModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPromoModal(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl border border-[#E5E7EB] font-['Hanken_Grotesk',system-ui,sans-serif] flex flex-col max-h-[85vh] z-10"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#F3F4F6] shrink-0">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-[#111827] flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-[#FBBF24]" />
                {lang === "id" ? "Promo & Voucher Tersedia" : "Available Promos & Vouchers"}
              </h3>
              <button
                type="button"
                onClick={() => setShowPromoModal(false)}
                aria-label={lang === "id" ? "Tutup" : "Close"}
                title={lang === "id" ? "Tutup" : "Close"}
                className="p-1 rounded-full text-[#9CA3AF] hover:text-[#4B5563] hover:bg-[#F3F4F6] transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Promo List (Scrollable) */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {loadingPromos ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
                  <p className="text-xs font-semibold text-[#6B7280]">
                    {lang === "id" ? "Memuat promo..." : "Loading promos..."}
                  </p>
                </div>
              ) : availablePromos.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-bold text-[#6B7280]">
                    {lang === "id" ? "Belum Ada Promo Aktif" : "No Active Promos Available"}
                  </p>
                  <p className="text-xs text-[#9CA3AF] mt-1">
                    {lang === "id" ? "Silakan hubungi admin untuk info diskon." : "Please contact admin for discount info."}
                  </p>
                </div>
              ) : (
                availablePromos.map((p) => {
                  const isEligible = subtotal >= p.minPurchase;
                  return (
                    <div
                      key={p.code}
                      className={`border rounded-2xl p-4 transition-all flex flex-col gap-3 relative overflow-hidden ${
                        isEligible
                          ? "bg-white border-[#E5E7EB] hover:border-amber-300 hover:shadow-md"
                          : "bg-neutral-50 border-[#E5E7EB] opacity-75"
                      }`}
                    >
                      {/* Decorative Tag Pattern */}
                      <div className="absolute right-0 top-0 w-8 h-8 flex items-center justify-center opacity-10">
                        <ShoppingBag className="w-12 h-12 rotate-12" />
                      </div>

                      {/* Top Info */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1">
                          <span className="font-mono text-xs font-extrabold text-[#D97706] bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                            {p.code}
                          </span>
                          <h4 className="font-bold text-[#111827] text-sm pt-1">
                            {p.discountType === "percentage"
                              ? `${p.value}% OFF`
                              : `${formatIDR(p.value)} OFF`}
                          </h4>
                        </div>
                        <div>
                          {isEligible ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              {lang === "id" ? "Memenuhi Syarat" : "Eligible"}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              {lang === "id" ? "Min. Belanja Belum Cukup" : "Min. Spend Not Met"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      {p.description && (
                        <p className="text-xs text-[#6B7280] leading-relaxed">
                          {p.description}
                        </p>
                      )}

                      {/* Limit Info */}
                      <div className="text-[10px] font-semibold text-[#9CA3AF] flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          {lang === "id" ? "Min. Belanja:" : "Min. Spend:"}{" "}
                          <span className="font-mono font-bold text-[#4B5563]">
                            {formatIDR(p.minPurchase)}
                          </span>
                        </span>
                        {p.maxDiscount && (
                          <span>
                            {lang === "id" ? "Maks. Potongan:" : "Max Discount:"}{" "}
                            <span className="font-mono font-bold text-[#4B5563]">
                              {formatIDR(p.maxDiscount)}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Action Button */}
                      <button
                        type="button"
                        disabled={!isEligible}
                        onClick={() => handleSelectPromoFromModal(p)}
                        className={`w-full py-2 px-4 rounded-xl text-xs font-bold transition-all text-center ${
                          isEligible
                            ? "bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] cursor-pointer shadow-sm hover:shadow"
                            : "bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed"
                        }`}
                      >
                        {lang === "id" ? "Gunakan Promo" : "Use Promo"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const handleAdminSubmitOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (checkoutItems.length === 0) {
      setSubmitError("Silakan pilih minimal 1 menu item");
      return;
    }

    setSubmittingOrder(true);
    setSubmitError(null);

    const itemsPayload = checkoutItems.map((item) => ({
      itemId: item.itemId,
      itemName: item.itemName,
      quantity: item.quantity,
    }));

    try {
      const order = await createAdminOrder({
        orderType,
        institutionName: institutionName.trim(),
        recipientName: customerName.trim(), // using customerName as recipientName
        recipientPhone: recipientPhone.trim(),
        recipientNotes: recipientNotes.trim(),
        eventDate,
        deliveryAddress: adminMapsUrl.trim()
          ? `${deliveryAddress.trim()} ${adminMapsUrl.trim()}`
          : deliveryAddress.trim(),
        deliveryTime: deliveryTime.trim(),
        foodDetails: foodDetails.trim() || checkoutItems.map(s => `${s.itemName} (${s.quantity})`).join(", "),
        drinkDetails: drinkDetails.trim(),
        items: itemsPayload,
        totalPrice: (subtotal - promoDiscount) + additionalFee,
        additionalFee: additionalFee,
        additionalNotes: additionalNotes.trim(),
        promoCode: appliedPromo?.code || undefined,
        discountAmount: promoDiscount || undefined,
      });

      // Clear checkout items from cart on success (in background)
      if (user) {
        const purchasedItemIds = checkoutItems.map((item) => item.itemId);
        Promise.all(purchasedItemIds.map((itemId) => removeLineItem(user.uid, itemId)))
          .catch((e) => console.error("Failed to clear cart:", e));
      }

      setCreatedAdminOrder({
        id: order.id,
        token: order.invoiceToken || "",
        phone: order.recipientPhone,
        name: order.recipientName,
        totalPayment: (subtotal - promoDiscount) + additionalFee,
      });

      localStorage.removeItem("admin_checkout_form");
    } catch (err: unknown) {
      console.error(err);
      const e = err as { message?: string };
      setSubmitError(e.message || "Gagal membuat pesanan");
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Initialize fields once profile loads
  useEffect(() => {
    if (profile) {
      if (profile.role === "admin") {
        const saved = localStorage.getItem("admin_checkout_form");
        if (!saved) {
          setCustomerName("");
        } else {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.customerName === undefined) {
              setCustomerName("");
            }
          } catch {
            setCustomerName("");
          }
        }
      } else {
        setCustomerName(profile.displayName || "");
      }
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
        if (!directCheckoutItems) {
          if (selectedItemIds) {
            setCheckoutItems(items.filter((item) => selectedItemIds.includes(item.itemId)));
          } else {
            setCheckoutItems(items);
          }
        }
        setLoadingCart(false);
      },
      (err) => {
        console.error("Gagal berlangganan keranjang:", err);
        setLoadingCart(false);
      }
    );
    return () => unsubscribe();
  }, [user, selectedItemIds, directCheckoutItems]);

  // Load direct checkout items directly
  useEffect(() => {
    if (directCheckoutItems) {
      setCheckoutItems(directCheckoutItems);
      setLoadingCart(false);
    }
  }, [directCheckoutItems]);

  // If unauthenticated or loading profile
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
      </div>
    );
  }

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
      navigate("/checkout/payment", {
        state: {
          directCheckoutItems,
          selectedItemIds,
        }
      });
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
      imageUrl: item.imageUrl || "",
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
      promoCode: appliedPromo?.code || undefined,
      discountAmount: promoDiscount || undefined,
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

      // Clean up the purchased items from the shopping cart on success (in background)
      const purchasedItemIds = checkoutItems.map((item) => item.itemId);
      Promise.all(purchasedItemIds.map((itemId) => removeLineItem(user.uid, itemId)))
        .catch((e) => console.error("Failed to clear cart:", e));

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

  if (isAdmin) {
    if (createdAdminOrder) {
      const invoiceUrl = `/invoice/${createdAdminOrder.token}`;
      return (
        <div className="bg-[#F3F4F6] min-h-screen pb-20">
          <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
            <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
              Pesanan Berhasil Dibuat
            </h1>
          </div>
          <div className="p-4 max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-3xl p-8 text-center space-y-6 border border-[#E5E7EB] shadow-lg animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-[#D1FAE5] text-[#10B981] rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <div className="space-y-2">
                <h2 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
                  Pesanan Berhasil Dibuat
                </h2>
                <p className="text-sm text-[#6B7280]">
                  ID Pesanan: <span className="font-mono font-bold text-[#111827]">{createdAdminOrder.id.slice(-6).toUpperCase()}</span>
                </p>
              </div>

              <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] space-y-3 text-left">
                <div className="text-sm text-[#374151]">
                  <span className="font-semibold">Penerima:</span> {createdAdminOrder.name} ({createdAdminOrder.phone})
                </div>
                <div className="text-sm text-[#374151]">
                  <span className="font-semibold">Total Tagihan:</span> {formatIDR(createdAdminOrder.totalPayment)}
                </div>
                <div className="pt-2 border-t border-[#E5E7EB]">
                  <label className="block text-xs font-semibold text-[#6B7280] mb-1">
                    Tautan Invoice Publik:
                  </label>
                  <div className="flex items-center gap-2 bg-white border border-[#D1D5DB] rounded-lg p-2 text-xs font-mono text-[#374151] break-all">
                    {window.location.origin}{invoiceUrl}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}${invoiceUrl}`;
                    navigator.clipboard.writeText(url);
                    setAdminCopied(true);
                    setTimeout(() => setAdminCopied(false), 2000);
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-neutral-300 hover:bg-neutral-50 transition-colors font-bold text-[#374151] text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                  {adminCopied ? "Tersalin!" : "Salin Link"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}${invoiceUrl}`;
                    const shortId = createdAdminOrder.id.slice(-6).toUpperCase();
                    const text = `Halo ${createdAdminOrder.name},\n\nPesanan Anda #${shortId} dari ${institutionName} telah berhasil dibuat!\nTotal Tagihan: Rp ${createdAdminOrder.totalPayment.toLocaleString()}\n\nSilakan konfirmasi pesanan dan lakukan tanda tangan digital melalui tautan invoice berikut:\n${url}`;
                    const waUrl = `https://wa.me/${createdAdminOrder.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
                    window.open(waUrl, "_blank");
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20BA5A] border-none text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  Kirim ke WhatsApp
                </button>
                <Link to={invoiceUrl} target="_blank" className="w-full sm:w-auto">
                  <button className="w-full px-6 py-2.5 rounded-xl border border-neutral-300 hover:bg-neutral-50 transition-colors font-bold text-[#374151] text-xs flex items-center justify-center gap-2 cursor-pointer">
                    <ExternalLink className="w-4 h-4" />
                    Lihat Invoice
                  </button>
                </Link>
              </div>

              <div className="pt-4 border-t border-[#E5E7EB]">
                <Link to="/">
                  <button className="px-6 py-2 rounded-xl border border-neutral-300 text-xs font-bold text-[#374151] hover:bg-neutral-50 cursor-pointer">
                    Belanja Lagi
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-[#F3F4F6] min-h-screen pb-20">
        {/* Sticky Header */}
        <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
          <button
            title={t.back}
            onClick={() => {
              navigate("/cart");
            }}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
            Informasi Pelanggan & Acara
          </h1>
        </div>

        <div className="p-4 max-w-4xl mx-auto">
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
            <form onSubmit={handleAdminSubmitOrder} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                    Informasi Pelanggan & Acara
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1">
                        Jenis Pesanan
                      </label>
                      <div className="flex gap-4 mt-2">
                        <label className="flex items-center gap-2 text-xs text-[#374151] cursor-pointer">
                          <input
                            type="radio"
                            name="orderType"
                            value="event"
                            checked={orderType === "event"}
                            onChange={() => setOrderType("event")}
                            className="accent-[#FBBF24] w-4 h-4 cursor-pointer"
                          />
                          Event (Jatuh tempo 7 hari)
                        </label>
                        <label className="flex items-center gap-2 text-xs text-[#374151] cursor-pointer">
                          <input
                            type="radio"
                            name="orderType"
                            value="rutin"
                            checked={orderType === "rutin"}
                            onChange={() => setOrderType("rutin")}
                            className="accent-[#FBBF24] w-4 h-4 cursor-pointer"
                          />
                          Rutin (Jatuh tempo 1 bulan)
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#4B5563]">Nama Instansi/Pelanggan</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Yayasan Pesantren Al-Mana"
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        value={institutionName}
                        onChange={(e) => setInstitutionName(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[#4B5563]">Nama Penerima</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Ustadz Ahmad"
                          className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[#4B5563]">Nomor Telepon Penerima</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 08123456789"
                          className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                          value={recipientPhone}
                          onChange={(e) => setRecipientPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[#4B5563]">Tanggal Acara</label>
                        <input
                          type="date"
                          required
                          title="Tanggal Acara"
                          placeholder="Pilih Tanggal Acara"
                          className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                          value={eventDate}
                          onChange={(e) => setEventDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[#4B5563]">Harus Sampai Kapan & Jam Berapa?</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: Harus sampai sebelum jam 10:00 WIB"
                          className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                          value={deliveryTime}
                          onChange={(e) => setDeliveryTime(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-[#4B5563]">Alamat Pengiriman</label>
                        <button
                          type="button"
                          onClick={() => setShowMapPicker(true)}
                          className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          Pilih di Peta
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Kampus 2 Pesantren Al-Mana, Sukabumi"
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#4B5563]">Link Google Maps (Pilihan)</label>
                      <input
                        type="text"
                        placeholder="e.g. https://maps.app.goo.gl/..."
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        value={adminMapsUrl}
                        onChange={(e) => setAdminMapsUrl(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#374151]">
                        Catatan Lokasi / Penerima (Opsional)
                      </label>
                      <textarea
                        placeholder="e.g. Gedung A Lantai 2, hubungi via WA jika sudah di gerbang"
                        rows={2}
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                        value={recipientNotes}
                        onChange={(e) => setRecipientNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-[#FBBF24]" />
                    <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                      Detail Menu Makanan & Minuman
                      <span className="text-[#9CA3AF] font-medium ml-1.5">({checkoutItems.length})</span>
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {checkoutItems.map((item) => (
                      <div key={item.itemId} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-3 space-y-2">
                        <div className="flex gap-3">
                          {item.imageUrl && (
                            <ProductImage
                              imageUrl={item.imageUrl}
                              alt={item.itemName}
                              className="h-12 w-12 rounded-xl object-cover bg-white border border-neutral-200 shrink-0"
                              fallbackClassName="h-5 w-5 text-[#9CA3AF]"
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
                        <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[#FBBF24] transition-all">
                          <FileText className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0" />
                          <input
                            type="text"
                            maxLength={200}
                            placeholder="Catatan porsi (misal: extra pedas, tanpa bawang)"
                            className="w-full bg-transparent border-none text-xs text-[#374151] placeholder-[#9CA3AF] focus:outline-none"
                            value={item.notes ?? ""}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setCheckoutItems((prev) =>
                                prev.map((it) =>
                                  it.itemId === item.itemId ? { ...it, notes: val } : it
                                )
                              );
                              if (!directCheckoutItems && user) {
                                try { await setLineNotes(user.uid, item.itemId, val); } catch { /* silent */ }
                              }
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                    <span className="text-xs font-semibold text-[#6B7280]">Total Kalkulasi Menu</span>
                    <span className="text-sm font-extrabold text-[#111827]">{formatIDR(subtotal)}</span>
                  </div>
                </div>

                {/* Total Ingredients Card */}
                {(() => {
                  const ingredients = aggregateIngredients(enrichedCheckoutItems);
                  if (ingredients.length === 0) return null;
                  return (
                    <div className="bg-white border border-[#E5E7EB] rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
                      <h3 className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-[#FBBF24]" />
                        {lang === "id" ? "Total Komposisi Bahan Produksi" : "Total Ingredients Composition"}
                      </h3>
                      <div className="divide-y divide-[#F3F4F6] text-xs font-semibold text-[#4B5563]">
                        {ingredients.map((ing, idx) => (
                          <div key={idx} className="py-2.5 flex justify-between items-center">
                            <span className="capitalize">{ing.name}</span>
                            <span className="font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                              {ing.amount} {ing.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-4">
                <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827] border-b border-[#F3F4F6] pb-3">
                    Detail Makanan & Minuman Tambahan
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#6B7280] mb-1">
                        Detail Makanan (Deskripsi tambahan)
                      </label>
                      <textarea
                        placeholder="e.g. Nasi Kotak Ayam Bakar sambal pisah"
                        rows={2}
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                        value={foodDetails}
                        onChange={(e) => setFoodDetails(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#6B7280] mb-1">
                        Detail Minuman (Deskripsi tambahan)
                      </label>
                      <textarea
                        placeholder="e.g. Air Mineral botol 330ml dingin"
                        rows={2}
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                        value={drinkDetails}
                        onChange={(e) => setDrinkDetails(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#6B7280] mb-1">
                        Catatan Tambahan Internal
                      </label>
                      <textarea
                        placeholder="e.g. Tagihan dikirim ke bendahara yayasan langsung"
                        rows={2}
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                        value={additionalNotes}
                        onChange={(e) => setAdditionalNotes(e.target.value)}
                      />
                    </div>
                    <hr className="border-[#F3F4F6] pt-1" />

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-[#6B7280]">
                          Biaya Tambahan / Tagihan Manual
                        </label>
                        {additionalFee > 0 && (
                          <button
                            type="button"
                            className="text-[10px] text-[#EF4444] hover:underline cursor-pointer focus:outline-none"
                            onClick={() => setAdditionalFee(0)}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        placeholder="e.g. 50000 (ongkir, charge, dll.)"
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        value={additionalFee === 0 ? "" : additionalFee}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAdditionalFee(val === "" ? 0 : Number(val));
                        }}
                      />
                    </div>

                    {renderPromoSection()}

                    {promoDiscount > 0 && (
                      <div className="flex justify-between items-center text-xs text-emerald-600 font-semibold mb-1">
                        <span>{lang === "id" ? "Diskon Promo:" : "Promo Discount:"}</span>
                        <span>-{formatIDR(promoDiscount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-3 border-t border-[#E5E7EB]">
                      <span className="text-xs font-bold text-[#111827]">Total Tagihan:</span>
                      <span className="text-sm font-extrabold text-[#D97706]">{formatIDR((subtotal - promoDiscount) + additionalFee)}</span>
                    </div>
                  </div>
                </div>

                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-2xl text-xs font-semibold font-['Hanken_Grotesk',system-ui,sans-serif]">
                    <p>{submitError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submittingOrder}
                  className="w-full flex items-center justify-center gap-2 min-h-12 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-extrabold text-[#111827] rounded-2xl shadow-md transition-all cursor-pointer disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed"
                >
                  {submittingOrder ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Memproses Pesanan…
                    </>
                  ) : (
                    <>
                      Buat Pesanan & Invoice ({formatIDR((subtotal - promoDiscount) + additionalFee)})
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
          {renderPromoModal()}
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
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-20">
      {/* Sticky Header */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <button
          title={t.back}
          onClick={() => {
            if (step === "payment") {
              navigate("/checkout/address", {
                state: {
                  directCheckoutItems,
                  selectedItemIds,
                }
              });
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
                                <ProductImage
                                  imageUrl={item.imageUrl}
                                  alt={item.itemName}
                                  className="h-12 w-12 rounded-xl object-cover bg-white border border-neutral-200 shrink-0"
                                  fallbackClassName="h-5 w-5 text-[#9CA3AF]"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-[#111827] leading-snug truncate">{item.itemName}</p>
                                <div className="flex items-center justify-between mt-0.5">
                                  {isAdmin ? (
                                    <>
                                      <span className="text-[11px] text-[#6B7280]">
                                        {formatIDR(item.unitPrice)} × {item.quantity}
                                      </span>
                                      <span className="text-xs font-bold text-[#111827]">
                                        {formatIDR(item.unitPrice * item.quantity)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-[11px] text-[#6B7280]">
                                      {item.quantity} {lang === "en" ? "item(s)" : "pcs"}
                                    </span>
                                  )}
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
                                  const val = e.target.value;
                                  setCheckoutItems((prev) =>
                                    prev.map((it) =>
                                      it.itemId === item.itemId ? { ...it, notes: val } : it
                                    )
                                  );
                                  if (!directCheckoutItems && user) {
                                    try { await setLineNotes(user.uid, item.itemId, val); } catch { /* silent */ }
                                  }
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {isAdmin && (
                        <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                          <span className="text-xs font-semibold text-[#6B7280]">{lang === "en" ? "Subtotal" : "Subtotal"}</span>
                          <span className="text-sm font-extrabold text-[#111827]">{formatIDR(subtotal)}</span>
                        </div>
                      )}
                    </div>

                    {/* Total Ingredients Card */}
                    {(() => {
                      const ingredients = aggregateIngredients(enrichedCheckoutItems);
                      if (ingredients.length === 0) return null;
                      return (
                        <div className="bg-white border border-[#E5E7EB] rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
                          <h3 className="font-['Manrope',system-ui,sans-serif] text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="h-4 w-4 text-[#FBBF24]" />
                            {lang === "id" ? "Total Komposisi Bahan Produksi" : "Total Ingredients Composition"}
                          </h3>
                          <div className="divide-y divide-[#F3F4F6] text-xs font-semibold text-[#4B5563]">
                            {ingredients.map((ing, idx) => (
                              <div key={idx} className="py-2.5 flex justify-between items-center">
                                <span className="capitalize">{ing.name}</span>
                                <span className="font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                                  {ing.amount} {ing.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

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
                          {lang === "en" ? "Please transfer the total payment of" : "Silakan transfer total pembayaran sebesar"} **{formatIDR(grandTotal)}** {lang === "en" ? "to the cooperative bank account:" : "ke rekening bank koperasi:"}
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
                      {!isAdmin && (
                        <p className="text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                          {t.instructionAlert}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Promo Code Entry */}
                {renderPromoSection()}

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
                    {promoDiscount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-semibold">
                        <span>{lang === "id" ? "Diskon Promo" : "Promo Discount"}</span>
                        <span>-{formatIDR(promoDiscount)}</span>
                      </div>
                    )}
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
                      {isAdmin ? `${t.placeOrder} (${formatIDR(grandTotal)})` : t.placeOrder}
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {renderPromoModal()}
      </div>
    </div>
  );
}

export default CheckoutWizard;
