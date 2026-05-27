import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Trash2, Plus, Minus, FileText, ArrowRight, ShoppingBag } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeToCart,
  setLineQuantity,
  setLineNotes,
  removeLineItem,
  computeCartTotal,
  CartLineItem,
} from "@/services/cartService";
import { formatIDR } from "@/lib/format";

export function CartPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToCart(
      user.uid,
      (cartItems) => {
        setItems(cartItems);
        setLoading(false);
      },
      () => {
        setError("Gagal memuat keranjang. Silakan coba lagi.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleQtyChange = async (itemId: string, currentQty: number, delta: number) => {
    if (!user) return;
    const nextQty = currentQty + delta;
    try {
      await setLineQuantity(user.uid, itemId, nextQty);
    } catch {
      alert("Gagal memperbarui jumlah item.");
    }
  };

  const handleNotesChange = async (itemId: string, noteText: string) => {
    if (!user) return;
    try {
      await setLineNotes(user.uid, itemId, noteText);
    } catch (err) {
      console.error("Gagal menyimpan catatan:", err);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!user) return;
    if (confirm("Hapus item ini dari keranjang?")) {
      try {
        await removeLineItem(user.uid, itemId);
      } catch {
        alert("Gagal menghapus item.");
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] pb-20 flex flex-col">
        <div className="bg-white border-b border-[#E5E7EB] sticky top-0 px-4 py-3 flex items-center gap-3">
          <Link to="/" className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">Keranjang</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="h-16 w-16 bg-amber-50 rounded-full flex items-center justify-center text-[#FBBF24]">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">Belum Masuk Akun</h2>
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs">
              Silakan masuk ke akun koperasi Anda untuk melihat dan mengisi keranjang belanja.
            </p>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm cursor-pointer"
          >
            Masuk Sekarang
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280] bg-[#F3F4F6] min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">Memuat keranjang Anda…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] px-4 py-8 flex flex-col items-center justify-center text-center space-y-4">
        <p className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-2xl p-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => navigate(0)}
          className="inline-flex items-center gap-2 min-h-11 px-6 rounded-2xl bg-[#FBBF24] text-sm font-semibold text-[#111827] cursor-pointer"
        >
          Muat Ulang
        </button>
      </div>
    );
  }

  const grandTotal = computeCartTotal(items);

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-32">
      {/* Top Header */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827] focus:outline-none"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          Keranjang Belanja
        </h1>
        <span className="ml-auto text-xs font-semibold px-2 py-0.5 bg-[#F3F4F6] rounded-full text-[#6B7280]">
          {items.length} Item
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 py-20 text-center space-y-4">
          <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center text-[#9CA3AF] shadow-sm">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">Keranjang Kosong</h2>
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs">
              Belum ada produk yang Anda tambahkan. Yuk, intip katalog kami!
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm cursor-pointer"
          >
            Mulai Belanja
          </Link>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Cart Items List */}
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.itemId}
                className="bg-white rounded-3xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3"
              >
                {/* Title & Remove */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827] line-clamp-2">
                    {item.itemName}
                  </h3>
                  <button
                    onClick={() => handleRemoveItem(item.itemId)}
                    className="text-[#9CA3AF] hover:text-[#EF4444] p-1 rounded-full hover:bg-red-50 focus:outline-none transition-colors"
                    aria-label="Hapus produk"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Price, Controls & Notes */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">Harga Satuan</p>
                    <p className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827]">
                      {formatIDR(item.unitPrice)}
                    </p>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full p-1 border border-[#E5E7EB]">
                    <button
                      onClick={() => handleQtyChange(item.itemId, item.quantity, -1)}
                      className="h-8 w-8 flex items-center justify-center bg-white rounded-full shadow-sm text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={item.quantity <= 1}
                      aria-label="Kurangi jumlah"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[2rem] text-center font-['Manrope',system-ui,sans-serif] text-sm font-bold tabular-nums text-[#111827]">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => handleQtyChange(item.itemId, item.quantity, 1)}
                      className="h-8 w-8 flex items-center justify-center bg-white rounded-full shadow-sm text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={item.quantity >= 99}
                      aria-label="Tambah jumlah"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Subtotal */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#F3F4F6]">
                  <span className="text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">Subtotal</span>
                  <span className="font-['Manrope',system-ui,sans-serif] font-bold text-[#111827]">
                    {formatIDR(item.unitPrice * item.quantity)}
                  </span>
                </div>

                {/* Notes Input */}
                <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-[#FBBF24] focus-within:ring-offset-1 transition-all">
                  <FileText className="h-4 w-4 text-[#9CA3AF] shrink-0" />
                  <input
                    type="text"
                    maxLength={200}
                    placeholder="Catatan belanja (misal: bungkus plastik, pisah plastik)"
                    className="w-full bg-transparent border-none text-xs text-[#374151] placeholder-[#9CA3AF] focus:outline-none"
                    value={item.notes ?? ""}
                    onChange={(e) => handleNotesChange(item.itemId, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Sticky Summary & Checkout Footer */}
          <div className="bg-white border-t border-[#E5E7EB] fixed bottom-14 lg:bottom-0 left-0 right-0 p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] max-w-[480px] lg:max-w-7xl mx-auto z-10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">Total Pembayaran</p>
                <p className="font-['Manrope',system-ui,sans-serif] text-lg font-black text-[#111827]">
                  {formatIDR(grandTotal)}
                </p>
              </div>
              <button
                onClick={() => navigate("/checkout/address")}
                className="inline-flex items-center gap-2 min-h-12 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-extrabold text-[#111827] shadow-md transition-all cursor-pointer"
              >
                Lanjut ke Alamat
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CartPage;
