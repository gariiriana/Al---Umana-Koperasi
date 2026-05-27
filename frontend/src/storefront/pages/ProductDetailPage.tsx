import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2, ArrowLeft, ShoppingCart, ImageOff, CheckCircle } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { getProduct } from "@/services/catalogService";
import { addToCart } from "@/services/cartService";
import { formatIDR } from "@/lib/format";
import type { InventoryItem } from "@/types/inventory";
import { QuantitySelector } from "@/storefront/components/QuantitySelector";

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

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState(false);

  const load = useCallback(() => {
    if (!id) {
      setState({ status: "error", message: "ID produk tidak valid." });
      return;
    }

    setState({ status: "loading" });

    getProduct(id)
      .then((product) => {
        setState({ status: "ready", product });
        // Check if redirect state from login preserved quantity
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
      // Redirect to login page and preserve target path & selected quantity
      navigate("/login", {
        state: {
          from: location,
          selectedQty: qty,
        },
      });
      return;
    }

    setAdding(true);
    setSuccess(false);

    try {
      await addToCart(user.uid, {
        itemId: product.id,
        itemName: product.itemName,
        price: product.price,
      }, qty);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      alert("Gagal menambahkan ke keranjang. Silakan coba lagi.");
    } finally {
      setAdding(false);
    }
  };

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280]">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
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

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-20">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <Link
          to="/"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827] focus:outline-none"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827] truncate max-w-[200px]">
          Detail Produk
        </h1>
        <Link
          to="/cart"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827] focus:outline-none relative"
          aria-label="Keranjang"
        >
          <ShoppingCart className="h-6 w-6" />
        </Link>
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        {/* Large Product Image */}
        <div className="relative w-full aspect-[4/3] bg-[#E5E7EB]">
          {imageHref ? (
            <img
              src={imageHref}
              alt={product.itemName}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#9CA3AF]">
              <ImageOff className="h-16 w-16" />
              <span className="text-xs mt-2 font-['Hanken_Grotesk',system-ui,sans-serif]">Foto tidak tersedia</span>
            </div>
          )}
          {inStock ? (
            <span className="absolute top-4 left-4 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
              Tersedia
            </span>
          ) : (
            <span className="absolute top-4 left-4 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-semibold text-[#DC2626] shadow-sm">
              Stok Habis
            </span>
          )}
        </div>

        {/* Product Details Section */}
        <div className="mx-4 bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
          <div className="space-y-1">
            <p className="text-xs uppercase font-semibold text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
              {product.category || "Tanpa Kategori"}
            </p>
            <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-[#111827] leading-tight">
              {product.itemName}
            </h2>
            <p className="font-['Manrope',system-ui,sans-serif] text-2xl font-black text-[#111827] pt-1">
              {formatIDR(product.price)}
              <span className="text-sm font-semibold text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]"> / {product.unit}</span>
            </p>
          </div>

          <hr className="border-[#F3F4F6]" />

          {/* Description / Information */}
          <div className="space-y-1">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
              Informasi Produk
            </h3>
            <p className="text-sm text-[#4B5563] font-['Hanken_Grotesk',system-ui,sans-serif] leading-relaxed">
              Produk segar berkualitas tinggi yang disediakan oleh Koperasi Al-Umana untuk memenuhi kebutuhan harian Anda secara higienis, bersih, dan halal.
            </p>
          </div>
        </div>

        {/* Quantity and Actions Bar */}
        {inStock && (
          <div className="mx-4 bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                Pilih Jumlah
              </span>
              <QuantitySelector
                value={qty}
                onChange={setQty}
                max={product.quantity}
                unit={product.unit}
              />
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              disabled={adding}
              className={
                "w-full flex items-center justify-center gap-2 min-h-12 rounded-2xl text-sm font-bold shadow-sm transition-all cursor-pointer " +
                (success
                  ? "bg-emerald-600 text-white"
                  : "bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:ring-offset-2")
              }
            >
              {success ? (
                <>
                  <CheckCircle className="h-5 w-5" />
                  Berhasil Ditambahkan!
                </>
              ) : adding ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Menambahkan…
                </>
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5" />
                  Tambah ke Keranjang
                </>
              )}
            </button>
          </div>
        )}

        {!inStock && (
          <div className="mx-4 bg-white rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-center space-y-2">
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
              Produk ini sedang kosong. Dapatkan notifikasi ketika produk kembali tersedia.
            </p>
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 min-h-12 rounded-2xl bg-[#E5E7EB] text-sm font-bold text-[#9CA3AF] cursor-not-allowed"
            >
              Stok Habis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductDetailPage;
