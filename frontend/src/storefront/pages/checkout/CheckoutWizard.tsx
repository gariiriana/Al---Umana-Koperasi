import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Wallet, CreditCard, ChevronRight, CheckCircle2, AlertTriangle, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToCart, clearCart, computeCartTotal, CartLineItem } from "@/services/cartService";
import { createOrder, PaymentMethod } from "@/services/orderService";
import { formatIDR } from "@/lib/format";

const DELIVERY_FEE = 10000;
const SERVICE_FEE = 2000;

export function CheckoutWizard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
      setGeoError("Browser Anda tidak mendukung GPS.");
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
          setGeoError("Gagal mendapatkan alamat dari GPS. Isi manual ya.");
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === 1) {
          setGeoError("Akses lokasi ditolak. Izinkan di pengaturan browser.");
        } else {
          setGeoError("Gagal mendapatkan lokasi. Pastikan GPS aktif.");
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
      setAddressError("Nama penerima tidak boleh kosong.");
      return;
    }

    if (trimmedAddress.length < 10 || trimmedAddress.length > 500) {
      setAddressError("Alamat pengiriman harus antara 10 dan 500 karakter.");
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
        setSubmitError("Server tidak merespons. Silakan coba lagi.");
      } else if (e.status === 409 && e.code === "OUT_OF_STOCK") {
        // Out of stock returns to cart view per Requirement 6.5
        setOutOfStockItems(e.outOfStockItems || []);
        setSubmitError("Beberapa produk tidak tersedia. Silakan tinjau kembali keranjang Anda.");
      } else {
        setSubmitError(e.message || "Gagal membuat pesanan. Silakan coba lagi.");
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
          title="Kembali"
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
          {step === "address" ? "Alamat Pengiriman" : "Metode Pembayaran"}
        </h1>
      </div>

      {/* Progress Wizard Steps Indicator */}
      <div className="bg-white px-4 py-3 flex items-center justify-center gap-2 border-b border-[#E5E7EB] text-xs font-semibold text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
        <span className={step === "address" ? "text-[#FBBF24]" : "text-[#111827]"}>Alamat</span>
        <ChevronRight className="h-3 w-3" />
        <span className={step === "payment" ? "text-[#FBBF24]" : ""}>Pembayaran</span>
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
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">Keranjang Kosong</h2>
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
              Keranjang belanja Anda kosong. Silakan tambahkan barang sebelum checkout.
            </p>
            <Link to="/" className="inline-flex min-h-11 px-6 bg-[#FBBF24] rounded-2xl items-center font-bold text-[#111827]">
              Belanja Sekarang
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
                      Konfirmasi Alamat Pengiriman
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {/* Receiver Name */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                        Nama Penerima
                      </label>
                      <input
                        type="text"
                        placeholder="Nama Lengkap"
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                    </div>

                    {/* Delivery Address */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                          Alamat Lengkap
                        </label>
                        <button
                          type="button"
                          onClick={handleDetectLocation}
                          disabled={geoLoading}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-[#B45309] bg-amber-50 border border-amber-200 rounded-full px-3 py-1 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {geoLoading ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Mendeteksi…</>
                          ) : (
                            <><Navigation className="h-3 w-3" /> Deteksi Lokasi</>  
                          )}
                        </button>
                      </div>
                      {geoError && (
                        <p className="text-[11px] text-red-600 font-['Hanken_Grotesk',system-ui,sans-serif]">{geoError}</p>
                      )}
                      <textarea
                        rows={4}
                        placeholder="Masukkan alamat pengantaran lengkap Anda (contoh: nomor rumah, jalan, RT/RW, kelurahan, detail patokan)"
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>

                    {/* Delivery Time Option */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                        Waktu Pengiriman
                      </label>
                      <div className="flex gap-2">
                        <select
                          title="Pilih Waktu Pengiriman"
                          className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                          value={deliveryTime}
                          onChange={(e) => setDeliveryTime(e.target.value)}
                        >
                          <option value="Segera (30 - 60 Menit)">Segera (30 - 60 Menit)</option>
                          <option value="Makan Siang (12:00 - 13:00)">Makan Siang (12:00 - 13:00)</option>
                          <option value="Makan Sore (15:00 - 16:00)">Makan Sore (15:00 - 16:00)</option>
                          <option value="Makan Malam (18:00 - 19:00)">Makan Malam (18:00 - 19:00)</option>
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
                        Menyimpan…
                      </>
                    ) : (
                      <>
                        Lanjut ke Pembayaran
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
                      Pilih Metode Pembayaran
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
                            Bayar di Tempat (COD)
                          </p>
                          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            Bayar langsung saat produk sampai
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
                            Transfer Bank
                          </p>
                          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            Kirim ke Bank Syariah Indonesia (BSI)
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
                            E-Wallet
                          </p>
                          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                            Bayar dengan DANA / OVO / GoPay
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
                      Instruksi Pembayaran Non-COD
                    </h4>
                    <div className="text-xs text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif] space-y-2 leading-relaxed">
                      {paymentMethod === "bank_transfer" ? (
                        <p>
                          Silakan transfer total pembayaran sebesar **{formatIDR(grandTotal)}** ke rekening koperasi:
                          <br />
                          🏦 **Bank Syariah Indonesia (BSI)**
                          <br />
                          Rekening: **123-456-7890**
                          <br />
                          Atas Nama: **Koperasi Al-Umana**
                        </p>
                      ) : (
                        <p>
                          Silakan transfer total pembayaran sebesar **{formatIDR(grandTotal)}** ke E-Wallet koperasi:
                          <br />
                          📱 **DANA / OVO / GoPay**
                          <br />
                          Nomor: **0812-3456-7890**
                          <br />
                          Atas Nama: **Koperasi Al-Umana**
                        </p>
                      )}
                      <p className="text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                        * Setelah transfer selesai, Anda diwajibkan **mengambil foto/screenshot bukti transfer** dan mengunggahnya pada langkah berikutnya agar pesanan disetujui oleh admin.
                      </p>
                    </div>
                  </div>
                )}

                {/* Billing Summary */}
                <div className="bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                    Rincian Biaya
                  </h3>
                  <div className="space-y-2 text-xs font-['Hanken_Grotesk',system-ui,sans-serif] text-[#6B7280]">
                    <div className="flex justify-between">
                      <span>Subtotal Produk</span>
                      <span className="font-semibold text-[#111827]">{formatIDR(subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Biaya Pengiriman (Ongkir)</span>
                      <span className="font-semibold text-[#111827]">{formatIDR(DELIVERY_FEE)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Biaya Layanan Koperasi</span>
                      <span className="font-semibold text-[#111827]">{formatIDR(SERVICE_FEE)}</span>
                    </div>
                    <hr className="border-[#F3F4F6] pt-1" />
                    <div className="flex justify-between text-sm font-bold text-[#111827] font-['Manrope',system-ui,sans-serif]">
                      <span>Total Pembayaran</span>
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
                          return <li key={itemId}>{matched?.itemName || "Barang tidak dikenal"} (Habis)</li>;
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
                      Memproses Pesanan…
                    </>
                  ) : (
                    <>
                      Pesan Sekarang ({formatIDR(grandTotal)})
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
