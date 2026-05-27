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
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { getProduct } from "@/services/catalogService";
import { addToCart } from "@/services/cartService";
import { formatIDR } from "@/lib/format";
import type { InventoryItem } from "@/types/inventory";
import { useCartAnimation } from "@/contexts/useCartAnimation";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

function resolveProductImageURL(ref: string | undefined): string | null {
  if (!ref) return null;
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  const segments = ref.trim().split("/");
  if (segments.length === 0) return null;
  const fileId = segments[segments.length - 1];
  if (!fileId) return null;
  return `${API_BASE_URL}/api/files/product_images/${encodeURIComponent(fileId)}/download`;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; product: InventoryItem }
  | { status: "error"; message: string };

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { triggerFlyAnimation } = useCartAnimation();

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState(false);

  /** Ref on the "Tambah ke Keranjang" button — used as fly animation source */
  const addBtnRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    if (!id) {
      setState({ status: "error", message: "ID produk tidak valid." });
      return;
    }

    setState({ status: "loading" });

    getProduct(id)
      .then((product) => {
        setState({ status: "ready", product });
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
          message: "Gagal memuat detail produk. Periksa koneksi Anda.",
        });
      });
  }, [id, location.state]);

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
        { itemId: product.id, itemName: product.itemName, price: product.price },
        qty
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      alert("Gagal menambahkan ke keranjang. Silakan coba lagi.");
    } finally {
      setAdding(false);
    }
  };

  /* ─── Loading / Error states ──────────────────────────────────────── */

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" aria-hidden="true" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">
          Memuat detail produk…
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
          Coba Lagi
        </button>
      </div>
    );
  }

  const { product } = state;
  const imageHref = resolveProductImageURL(product.imageUrl);
  const inStock = product.available && product.quantity > 0;
  const totalPrice = product.price * qty;

  /* ─── Main Render ─────────────────────────────────────────────────── */

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-32">

      {/* ── STICKY HEADER (no cart icon here — it's in the global navbar) */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Link
          to={location.key !== "default" ? "/" : "/"}
          onClick={(e) => { e.preventDefault(); navigate(-1); }}
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827] focus:outline-none"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827] truncate">
          Detail Produk
        </h1>
      </div>

      {/* ── DESKTOP LAYOUT: two columns ──────────────────────────────── */}
      <div className="lg:max-w-6xl lg:mx-auto lg:px-6 lg:py-6 lg:grid lg:grid-cols-[1fr_1fr] lg:gap-8">

        {/* ── LEFT: Product Image ──────────────────────────────────── */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          {/* Main Image */}
          <div className="relative w-full aspect-square bg-white lg:rounded-2xl overflow-hidden shadow-sm border border-[#E5E7EB]">
            {imageHref ? (
              <img
                src={imageHref}
                alt={product.itemName}
                className="absolute inset-0 h-full w-full object-contain p-4"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[#9CA3AF]">
                <ImageOff className="h-20 w-20" />
                <span className="text-sm mt-2 font-['Hanken_Grotesk',system-ui,sans-serif]">
                  Foto tidak tersedia
                </span>
              </div>
            )}

            {/* Stock badge */}
            {inStock ? (
              <span className="absolute top-3 left-3 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">
                TERSEDIA
              </span>
            ) : (
              <span className="absolute top-3 left-3 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-bold text-[#DC2626]">
                STOK HABIS
              </span>
            )}
          </div>

          {/* Thumbnail placeholder row (single photo product) */}
          <div className="hidden lg:flex gap-2 mt-3 justify-center">
            <div
              className={`h-16 w-16 rounded-xl border-2 border-[#FBBF24] overflow-hidden bg-white flex items-center justify-center`}
            >
              {imageHref ? (
                <img src={imageHref} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                <ImageOff className="h-6 w-6 text-[#9CA3AF]" />
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Product Info ──────────────────────────────────── */}
        <div className="space-y-0">

          {/* Category + Name + Price — mobile: mx-4 mt-3 card; desktop: flat */}
          <div className="mx-4 mt-3 lg:mx-0 lg:mt-0 bg-white rounded-2xl lg:rounded-none lg:bg-transparent p-4 lg:p-0 space-y-2 lg:space-y-3">
            {/* Category badge */}
            <span className="inline-block text-[10px] uppercase font-bold tracking-wider text-[#B45309] bg-amber-50 border border-amber-200 rounded-full px-3 py-0.5">
              {product.category || "Produk Koperasi"}
            </span>

            {/* Product name */}
            <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-[#111827] leading-snug">
              {product.itemName}
            </h2>

            {/* Price block */}
            <div className="pt-1">
              <p className="font-['Manrope',system-ui,sans-serif] text-3xl font-black text-[#B45309]">
                {formatIDR(product.price)}
                <span className="text-sm font-semibold text-[#6B7280] ml-1">
                  / {product.unit}
                </span>
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-4 lg:mx-0 border-t border-[#F3F4F6] mt-3" />

          {/* Guarantees Row */}
          <div className="mx-4 mt-3 lg:mx-0 bg-white rounded-2xl lg:rounded-xl lg:border lg:border-[#E5E7EB] p-4 space-y-2">
            {[
              { icon: ShieldCheck, text: "Produk Halal & Higienis" },
              { icon: RotateCcw, text: "Garansi kualitas atau pengembalian" },
              { icon: Package, text: "Dikemas dengan aman oleh tim Koperasi" },
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
              Informasi Produk
            </h3>
            <p className="text-sm text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif] leading-relaxed">
              Produk segar berkualitas tinggi yang disediakan oleh Koperasi
              Al-Umana untuk memenuhi kebutuhan harian Anda secara higienis,
              bersih, dan halal. Dipilih langsung dari mitra terpercaya
              Koperasi.
            </p>
          </div>

          {/* Quantity + Action — only when in stock */}
          {inStock ? (
            <div className="mx-4 mt-3 lg:mx-0 bg-white rounded-2xl lg:rounded-xl lg:border lg:border-[#E5E7EB] p-4 space-y-4">
              {/* Quantity row */}
              <div className="flex items-center justify-between">
                <span className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                  Kuantitas
                </span>
                <div className="flex items-center gap-3 bg-[#F3F4F6] rounded-full p-1 border border-[#E5E7EB]">
                  <button
                    type="button"
                    aria-label="Kurangi jumlah"
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
                    aria-label="Tambah jumlah"
                    disabled={qty >= product.quantity}
                    onClick={() => setQty((q) => Math.min(product.quantity, q + 1))}
                    className="h-9 w-9 flex items-center justify-center bg-white rounded-full shadow-sm text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                  Stok: {product.quantity} {product.unit}
                </span>
              </div>

              {/* Subtotal */}
              <div className="flex items-center justify-between text-sm py-2 border-t border-[#F3F4F6]">
                <span className="text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">Subtotal</span>
                <span className="font-['Manrope',system-ui,sans-serif] font-black text-[#111827] text-lg">
                  {formatIDR(totalPrice)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-4 mt-3 lg:mx-0 bg-white rounded-2xl p-4 text-center">
              <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
                Produk ini sedang kosong. Dapatkan notifikasi ketika tersedia.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── STICKY BOTTOM ACTION BAR ─────────────────────────────────── */}
      <div className="fixed bottom-14 lg:bottom-0 left-0 right-0 bg-white border-t border-[#E5E7EB] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] z-20 px-4 py-3 max-w-[480px] lg:max-w-7xl mx-auto">
        {inStock ? (
          <button
            ref={addBtnRef}
            type="button"
            id="add-to-cart-btn"
            onClick={handleAddToCart}
            disabled={adding}
            className={
              "w-full flex items-center justify-center gap-2.5 min-h-12 rounded-2xl text-sm font-extrabold shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 " +
              (success
                ? "bg-emerald-600 text-white focus:ring-emerald-500"
                : "bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] focus:ring-[#FBBF24]")
            }
          >
            {success ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                Berhasil Ditambahkan ke Keranjang!
              </>
            ) : adding ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Menambahkan…
              </>
            ) : (
              <>
                Masukkan Keranjang — {formatIDR(totalPrice)}
              </>
            )}
          </button>
        ) : (
          <button
            disabled
            className="w-full flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-[#E5E7EB] text-sm font-bold text-[#9CA3AF] cursor-not-allowed"
          >
            Stok Habis
          </button>
        )}
      </div>
    </div>
  );
}

export default ProductDetailPage;
