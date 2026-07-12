import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Loader2,
  ArrowLeft,
  Minus,
  Plus,
  ImageOff,
  ShieldCheck,
  RotateCcw,
  Package,
  CheckCircle2,
  ShoppingCart,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { getProduct } from "@/services/catalogService";
import { addToCart, type CartLineItem } from "@/services/cartService";
import { ProductImage } from "@/components/ProductImage";
import type { InventoryItem } from "@/types/inventory";
import { useCartAnimation } from "@/contexts/useCartAnimation";
import { translateCategory } from "@/constants/categories";
import { formatIDR } from "@/lib/format";



const translateUnit = (unit: string, lang: string) => {
  if (lang !== "en") return unit;
  const u = unit.toLowerCase().trim();
  if (u === "botol") return "bottle(s)";
  if (u === "kotak") return "box(es)";
  if (u === "paket") return "pack(s)";
  if (u === "bungkus") return "pack(s)";
  return unit;
};

const DICTIONARY = {
  id: {
    invalidId: "ID produk tidak valid.",
    loadError: "Gagal memuat detail produk. Periksa koneksi Anda.",
    addError: "Gagal menambahkan ke keranjang. Silakan coba lagi.",
    loading: "Memuat detail produk…",
    retry: "Coba Lagi",
    back: "Kembali",
    detailTitle: "Detail Produk",
    noPhoto: "Foto tidak tersedia",
    inStock: "TERSEDIA",
    outOfStock: "STOK HABIS",
    defaultCategory: "Produk Koperasi",
    guaranteeHalal: "Produk Halal & Higienis",
    guaranteeReturn: "Garansi kualitas atau pengembalian",
    guaranteePack: "Dikemas dengan aman oleh tim Koperasi",
    productInfo: "Informasi Produk",
    productDesc: "Produk segar berkualitas tinggi yang disediakan oleh Koperasi Al-Umanaa untuk memenuhi kebutuhan harian Anda secara higienis, bersih, dan halal. Dipilih langsung dari mitra terpercaya Koperasi.",
    quantity: "Kuantitas",
    reduceQty: "Kurangi jumlah",
    increaseQty: "Tambah jumlah",
    stock: "Stok",
    subtotal: "Subtotal",
    outOfStockMsg: "Produk ini sedang kosong. Dapatkan notifikasi ketika tersedia.",
    addedSuccess: "Berhasil Ditambahkan!",
    adding: "Menambahkan…",
    addToCart: "Keranjang",
    buyNow: "Beli Sekarang",
  },
  en: {
    invalidId: "Invalid product ID.",
    loadError: "Failed to load product details. Check your connection.",
    addError: "Failed to add to cart. Please try again.",
    loading: "Loading product details...",
    retry: "Try Again",
    back: "Back",
    detailTitle: "Product Details",
    noPhoto: "Photo not available",
    inStock: "IN STOCK",
    outOfStock: "OUT OF STOCK",
    defaultCategory: "Cooperative Product",
    guaranteeHalal: "Halal & Hygienic Product",
    guaranteeReturn: "Quality guarantee or return",
    guaranteePack: "Securely packed by the Cooperative team",
    productInfo: "Product Information",
    productDesc: "Fresh, high-quality product provided by Al-Umanaa Cooperative to meet your daily needs in a hygienic, clean, and halal way. Selected directly from the Cooperative's trusted partners.",
    quantity: "Quantity",
    reduceQty: "Reduce quantity",
    increaseQty: "Increase quantity",
    stock: "Stock",
    subtotal: "Subtotal",
    outOfStockMsg: "This product is currently out of stock. Get notified when available.",
    addedSuccess: "Added Successfully!",
    adding: "Adding...",
    addToCart: "Add to Cart",
    buyNow: "Buy Now",
  }
} as const;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; product: InventoryItem }
  | { status: "error"; message: string };

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = DICTIONARY[lang];
  const { triggerFlyAnimation } = useCartAnimation();

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  /** Ref on the "Tambah ke Keranjang" button — used as fly animation source */
  const addBtnRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    if (!id) {
      setState({ status: "error", message: t.invalidId });
      return;
    }

    setState({ status: "loading" });

    getProduct(id)
      .then((product) => {
        setState({ status: "ready", product });
        setActiveImage(product.imageUrl || null);
        // Restore preserved quantity from login-redirect state
        const preservedState = location.state as { selectedQty?: number } | null;
        const preservedQty = preservedState?.selectedQty;
        if (typeof preservedQty === "number" && preservedQty > 0) {
          setQty(Math.min(preservedQty, product.quantity));
        }
      })
      .catch(() => {
        setState({
          status: "error",
          message: t.loadError,
        });
      });
  }, [id, location.state, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddToCart = async () => {
    if (state.status !== "ready") return;
    const { product } = state;

    if (!user) {
      navigate("/login", {
        state: { from: location, selectedQty: qty },
      });
      return;
    }

    setAdding(true);
    setSuccess(false);

    // Trigger fly-to-cart animation from button position
    if (addBtnRef.current) {
      triggerFlyAnimation(addBtnRef.current.getBoundingClientRect());
    }

    try {
      await addToCart(
        user.uid,
        {
          itemId: product.id,
          itemName: product.itemName,
          price: product.price,
          imageUrl: product.imageUrl,
        },
        qty
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      showToast({ message: t.addError, variant: "error" });
    } finally {
      setAdding(false);
    }
  };

  const handleBuyNow = async () => {
    if (state.status !== "ready") return;
    const { product } = state;

    if (!user) {
      navigate("/login", {
        state: { from: location, selectedQty: qty },
      });
      return;
    }

    setBuying(true);

    const directItem: CartLineItem = {
      itemId: product.id,
      itemName: product.itemName,
      unitPrice: product.price,
      quantity: qty,
      notes: "",
      imageUrl: product.imageUrl || ""
    };

    navigate("/checkout/address", {
      state: {
        directCheckoutItems: [directItem]
      }
    });
    setBuying(false);
  };

  /* ─── Loading / Error states ──────────────────────────────────────── */

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" aria-hidden="true" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">
          {t.loading}
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="px-4 py-8 space-y-4 text-center">
        <p className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-2xl p-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
          {state.message}
        </p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 min-h-11 px-6 rounded-2xl bg-[#FBBF24] text-sm font-semibold text-[#111827] cursor-pointer"
        >
          {t.retry}
        </button>
      </div>
    );
  }

  const { product } = state;
  const inStock = product.available && product.quantity > 0;


  const images: string[] = [];
  if (product.imageUrl) images.push(product.imageUrl);
  if (product.detailImageUrls && Array.isArray(product.detailImageUrls)) {
    images.push(...product.detailImageUrls);
  }

  /* ─── Main Render ─────────────────────────────────────────────────── */

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-32">

      {/* ── STICKY HEADER (no cart icon here — it's in the global navbar) */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Link
          to={location.key !== "default" ? "/" : "/"}
          onClick={(e) => { e.preventDefault(); navigate(-1); }}
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827] focus:outline-none"
          aria-label={t.back}
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827] truncate">
          {t.detailTitle}
        </h1>
      </div>

      {/* ── DESKTOP LAYOUT: two columns ──────────────────────────────── */}
      <div className="lg:max-w-6xl lg:mx-auto lg:px-6 lg:py-6 lg:grid lg:grid-cols-[1fr_1fr] lg:gap-8">

        {/* ── LEFT: Product Image ──────────────────────────────────── */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          {/* Main Image */}
          <div className="relative w-full aspect-square bg-white lg:rounded-2xl overflow-hidden shadow-sm border border-[#E5E7EB] flex items-center justify-center">
            {activeImage ? (
              <ProductImage
                imageUrl={activeImage}
                alt={product.itemName}
                className="absolute inset-0 h-full w-full object-contain p-4 transition-all duration-300"
                fallbackClassName="h-20 w-20 text-[#9CA3AF]"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[#9CA3AF]">
                <ImageOff className="h-20 w-20" />
                <span className="text-sm mt-2 font-['Hanken_Grotesk',system-ui,sans-serif]">
                  {t.noPhoto}
                </span>
              </div>
            )}

            {/* Stock badge */}
            {inStock ? (
              <span className="absolute top-3 left-3 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">
                {t.inStock}
              </span>
            ) : (
              <span className="absolute top-3 left-3 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-bold text-[#DC2626]">
                {t.outOfStock}
              </span>
            )}
          </div>

          {/* Interactive Thumbnails Selector Row */}
          {images.length > 1 && (
            <div className="flex gap-2.5 mt-3 overflow-x-auto py-1 px-4 lg:px-0 scrollbar-none justify-start lg:justify-center">
              {images.map((img, index) => {
                const isSelected = activeImage === img;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveImage(img)}
                    onMouseEnter={() => setActiveImage(img)}
                    title={lang === "id" ? `Lihat foto detail ${index + 1}` : `View detail photo ${index + 1}`}
                    className={
                      "h-16 w-16 rounded-xl border-2 overflow-hidden bg-white flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-2xs " +
                      (isSelected ? "border-[#B45309] ring-2 ring-[#FFE8D6]" : "border-[#E5E7EB] hover:border-[#B45309]/50")
                    }
                  >
                    <ProductImage imageUrl={img} alt="" className="h-full w-full object-contain p-1" fallbackClassName="h-6 w-6 text-[#9CA3AF]" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT: Product Info ──────────────────────────────────── */}
        <div className="space-y-0">

          {/* Category + Name + Price — mobile: mx-4 mt-3 card; desktop: flat */}
          <div className="mx-4 mt-3 lg:mx-0 lg:mt-0 bg-white rounded-2xl lg:rounded-none lg:bg-transparent p-4 lg:p-0 space-y-2 lg:space-y-3">
            {/* Category badge */}
            <span className="inline-block text-[10px] uppercase font-bold tracking-wider text-[#B45309] bg-amber-50 border border-amber-200 rounded-full px-3 py-0.5">
              {translateCategory(product.category, lang) || t.defaultCategory}
            </span>

            {/* Product name */}
            <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-[#111827] leading-snug">
              {product.itemName}
            </h2>

            {/* Price display */}
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-xl font-extrabold text-[#EE4D2D] font-['Manrope']">
                {formatIDR(product.price)}
              </span>
              {product.discountPercent && product.discountPercent > 0 ? (
                <>
                  <span className="text-xs text-neutral-400 line-through">
                    {formatIDR(Math.round(product.price / (1 - product.discountPercent / 100)))}
                  </span>
                  <span className="text-[10px] font-bold text-[#EE4D2D] bg-[#FFEAEB] border border-[#FEE2E2] px-1.5 py-0.5 rounded-sm">
                    -{product.discountPercent}%
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-4 lg:mx-0 border-t border-[#F3F4F6] mt-3" />

          {/* Guarantees Row */}
          <div className="mx-4 mt-3 lg:mx-0 bg-white rounded-2xl lg:rounded-xl lg:border lg:border-[#E5E7EB] p-4 space-y-2">
            {[
              { icon: ShieldCheck, text: t.guaranteeHalal },
              { icon: RotateCcw, text: t.guaranteeReturn },
              { icon: Package, text: t.guaranteePack },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-xs text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif]">
                <Icon className="h-4 w-4 text-[#F59E0B] shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="mx-4 mt-3 lg:mx-0 bg-white rounded-2xl lg:rounded-xl lg:border lg:border-[#E5E7EB] p-4 space-y-1">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
              {t.productInfo}
            </h3>
            <p className="text-sm text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif] leading-relaxed">
              {t.productDesc}
            </p>
          </div>

          {/* Quantity + Action — only when in stock */}
          {inStock ? (
            <div className="mx-4 mt-3 lg:mx-0 bg-white rounded-2xl lg:rounded-xl lg:border lg:border-[#E5E7EB] p-4 space-y-4">
              {/* Quantity row */}
              <div className="flex items-center justify-between">
                <span className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                  {t.quantity}
                </span>
                <div className="flex items-center gap-3 bg-[#F3F4F6] rounded-full p-1 border border-[#E5E7EB]">
                  <button
                    type="button"
                    aria-label={t.reduceQty}
                    disabled={qty <= 1}
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="h-9 w-9 flex items-center justify-center bg-white rounded-full shadow-sm text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[2.5rem] text-center font-['Manrope',system-ui,sans-serif] text-base font-bold tabular-nums text-[#111827]">
                    {qty}
                  </span>
                  <button
                    type="button"
                    aria-label={t.increaseQty}
                    disabled={qty >= product.quantity}
                    onClick={() => setQty((q) => Math.min(product.quantity, q + 1))}
                    className="h-9 w-9 flex items-center justify-center bg-white rounded-full shadow-sm text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                  {t.stock}: {product.quantity} {translateUnit(product.unit, lang)}
                </span>
              </div>

              {/* Subtotal row */}
              <div className="flex items-center justify-between pt-3 border-t border-[#F3F4F6]">
                <span className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                  {t.subtotal}
                </span>
                <span className="text-base font-extrabold text-[#EE4D2D] font-['Manrope']">
                  {formatIDR(product.price * qty)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-4 mt-3 lg:mx-0 bg-white rounded-2xl p-4 text-center">
              <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                {t.outOfStockMsg}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── STICKY BOTTOM ACTION BAR ─────────────────────────────────── */}
      <div className="fixed bottom-14 lg:bottom-0 left-0 right-0 bg-white border-t border-[#E5E7EB] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] z-20 px-4 py-3 max-w-[480px] lg:max-w-7xl mx-auto">
        {(() => {
          const isMbgItem = product?.category?.toLowerCase() === "mbg";
          const canOrderMbg = profile?.role === "admin_mbg" || profile?.role === "admin";
          const mbgOrderBlocked = isMbgItem && !canOrderMbg;

          if (mbgOrderBlocked) {
            return (
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-gray-100 border border-gray-200 text-sm font-extrabold text-gray-400 cursor-not-allowed select-none"
              >
                {lang === "en" ? "View Only (MBG Menu)" : "Hanya Lihat (Menu MBG)"}
              </button>
            );
          }

          if (inStock) {
            return (
              <div className="flex gap-3">
                {/* Button 1: Masukkan Keranjang */}
                <button
                  ref={addBtnRef}
                  type="button"
                  id="add-to-cart-btn"
                  onClick={handleAddToCart}
                  disabled={adding || buying}
                  className={
                    "flex-1 flex items-center justify-center gap-2 min-h-12 rounded-2xl text-sm font-extrabold border-2 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 " +
                    (success
                      ? "bg-emerald-50 border-emerald-500 text-emerald-700 focus:ring-emerald-500"
                      : "border-[#FBBF24] hover:bg-[#FBBF24]/10 text-[#B45309] focus:ring-[#FBBF24]")
                  }
                >
                  {success ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      {t.addedSuccess}
                    </>
                  ) : adding ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {t.adding}
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-5 w-5" />
                      {t.addToCart}
                    </>
                  )}
                </button>

                {/* Button 2: Beli Sekarang */}
                <button
                  type="button"
                  id="buy-now-btn"
                  onClick={handleBuyNow}
                  disabled={adding || buying}
                  className="flex-[1.5] flex items-center justify-center gap-2 min-h-12 rounded-2xl text-sm font-extrabold bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FBBF24] disabled:opacity-50"
                >
                  {buying ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {lang === "id" ? "Memproses…" : "Processing…"}
                    </>
                  ) : (
                    <>
                      {t.buyNow}
                    </>
                  )}
                </button>
              </div>
            );
          }

          return (
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-[#E5E7EB] text-sm font-bold text-[#9CA3AF] cursor-not-allowed"
            >
              {t.outOfStock}
            </button>
          );
        })()}
      </div>
    </div>
  );
}

export default ProductDetailPage;
