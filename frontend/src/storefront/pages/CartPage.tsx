import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Trash2, Plus, Minus, ArrowRight, ShoppingBag, ImageOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ProductImage } from "@/components/ProductImage";

import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import {
  subscribeToCart,
  setLineQuantity,
  removeLineItem,
  CartLineItem,
  formatIDR,
  MAX_LINE_QUANTITY,
} from "@/services/cartService";


const DICTIONARY = {
  id: {
    loadError: "Gagal memuat keranjang. Silakan coba lagi.",
    updateError: "Gagal memperbarui jumlah item.",
    deleteError: "Gagal menghapus item.",
    deleteConfirm: "Hapus item ini dari keranjang?",
    cart: "Keranjang",
    notLoggedIn: "Belum Masuk Akun",
    loginPrompt: "Silakan masuk ke akun koperasi Anda untuk melihat dan mengisi keranjang belanja.",
    logInNow: "Masuk Sekarang",
    loadingCart: "Memuat keranjang Anda…",
    reload: "Muat Ulang",
    shoppingCart: "Keranjang Belanja",
    itemCount: "Item",
    emptyCart: "Keranjang Kosong",
    emptyPrompt: "Belum ada produk yang Anda tambahkan. Yuk, intip katalog kami!",
    startShopping: "Mulai Belanja",
    removeProduct: "Hapus produk",
    unitPrice: "Harga Satuan",
    reduceQty: "Kurangi jumlah",
    increaseQty: "Tambah jumlah",
    subtotal: "Subtotal",
    notesPlaceholder: "Catatan belanja (misal: bungkus plastik, pisah plastik)",
    totalPayment: "Total Pembayaran",
    proceedToAddress: "Checkout",
    back: "Kembali",
  },
  en: {
    loadError: "Failed to load cart. Please try again.",
    updateError: "Failed to update item quantity.",
    deleteError: "Failed to remove item.",
    deleteConfirm: "Remove this item from the cart?",
    cart: "Cart",
    notLoggedIn: "Not Logged In",
    loginPrompt: "Please log in to your cooperative account to view and edit your shopping cart.",
    logInNow: "Log In Now",
    loadingCart: "Loading your cart...",
    reload: "Reload",
    shoppingCart: "Shopping Cart",
    itemCount: "Item(s)",
    emptyCart: "Empty Cart",
    emptyPrompt: "No products added yet. Let's explore our catalog!",
    startShopping: "Start Shopping",
    removeProduct: "Remove product",
    unitPrice: "Unit Price",
    reduceQty: "Reduce quantity",
    increaseQty: "Increase quantity",
    subtotal: "Subtotal",
    notesPlaceholder: "Shopping notes (e.g. plastic bag, separate packaging)",
    totalPayment: "Total Payment",
    proceedToAddress: "Checkout",
    back: "Back",
  }
} as const;

export function CartPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = DICTIONARY[lang];

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [localQuantities, setLocalQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (items.length > 0 && !hasInitializedSelection) {
      setSelectedItemIds(new Set(items.map((i) => i.itemId)));
      setHasInitializedSelection(true);
    }
  }, [items, hasInitializedSelection]);

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
        setError(t.loadError);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, t]);

  const handleQtyChange = async (itemId: string, currentQty: number, delta: number) => {
    if (!user) return;
    setLocalQuantities((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    const nextQty = currentQty + delta;
    try {
      await setLineQuantity(user.uid, itemId, nextQty);
    } catch {
      showToast({ message: t.updateError, variant: "error" });
    }
  };



  const handleRemoveItem = (itemId: string) => {
    setDeleteItemId(itemId);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] pb-20 flex flex-col">
        <div className="bg-white border-b border-[#E5E7EB] sticky top-0 px-4 py-3 flex items-center gap-3">
          <Link to="/" className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.cart}</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="h-16 w-16 bg-amber-50 rounded-full flex items-center justify-center text-[#FBBF24]">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.notLoggedIn}</h2>
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs">
              {t.loginPrompt}
            </p>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm cursor-pointer"
          >
            {t.logInNow}
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280] bg-[#F3F4F6] min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">{t.loadingCart}</p>
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
          {t.reload}
        </button>
      </div>
    );
  }



  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-32">
      {/* Top Header */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827] focus:outline-none"
          aria-label={t.back}
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          {t.shoppingCart}
        </h1>
        <span className="ml-auto text-xs font-semibold px-2 py-0.5 bg-[#F3F4F6] rounded-full text-[#6B7280]">
          {items.length} {t.itemCount}
        </span>
      </div>

      {/* Select All Checkbox Row */}
      {items.length > 0 && (
        <div className="max-w-[480px] lg:max-w-3xl mx-auto px-4 pt-4 flex items-center justify-between text-xs font-['Hanken_Grotesk'] text-[#4B5563]">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              title="Pilih semua item"
              aria-label="Pilih semua item"
              className="h-4.5 w-4.5 rounded-md border-[#D1D5DB] text-[#FBBF24] focus:ring-[#FBBF24] cursor-pointer"
              checked={items.length > 0 && selectedItemIds.size === items.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedItemIds(new Set(items.map((i) => i.itemId)));
                } else {
                  setSelectedItemIds(new Set());
                }
              }}
            />
            <span className="font-bold text-[#111827]">
              {lang === "en" ? "Select All" : "Pilih Semua"}
            </span>
          </label>
          <span className="font-semibold text-neutral-500">
            {lang === "en" ? `${selectedItemIds.size} selected` : `${selectedItemIds.size} terpilih`}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 py-20 text-center space-y-4">
          <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center text-[#9CA3AF] shadow-sm">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.emptyCart}</h2>
            <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs">
              {t.emptyPrompt}
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm cursor-pointer"
          >
            {t.startShopping}
          </Link>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Cart Items List */}
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.itemId}
                className="bg-white rounded-3xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex gap-4 items-center"
              >
                {/* Selection Checkbox */}
                <input
                  type="checkbox"
                  title="Pilih item untuk checkout"
                  aria-label="Pilih item untuk checkout"
                  className="h-4.5 w-4.5 rounded-md border-[#D1D5DB] text-[#FBBF24] focus:ring-[#FBBF24] cursor-pointer shrink-0"
                  checked={selectedItemIds.has(item.itemId)}
                  onChange={(e) => {
                    const next = new Set(selectedItemIds);
                    if (e.target.checked) {
                      next.add(item.itemId);
                    } else {
                      next.delete(item.itemId);
                    }
                    setSelectedItemIds(next);
                  }}
                />

                {/* Product Image */}
                <div className="w-20 h-20 bg-[#F3F4F6] rounded-2xl overflow-hidden border border-[#E5E7EB] shrink-0 relative flex items-center justify-center">
                  {item.imageUrl ? (
                    <ProductImage
                      imageUrl={item.imageUrl}
                      alt={item.itemName}
                      className="absolute inset-0 h-full w-full object-cover"
                      fallbackClassName="h-8 w-8 text-[#9CA3AF]"
                    />
                  ) : (
                    <ImageOff className="h-6 w-6 text-[#9CA3AF]" />
                  )}
                </div>

                {/* Details Column */}
                <div className="flex-1 min-w-0 space-y-3">
                  {/* Title & Remove */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-[#111827] line-clamp-2">
                      {item.itemName}
                    </h3>
                    <button
                      onClick={() => handleRemoveItem(item.itemId)}
                      className="text-[#9CA3AF] hover:text-[#EF4444] p-1 rounded-full hover:bg-red-50 focus:outline-none transition-colors shrink-0"
                      aria-label={t.removeProduct}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Price & Quantity Stepper */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex flex-col">
                      <span className="text-xs text-neutral-500 font-medium">
                        {t.unitPrice}: {formatIDR(item.unitPrice)}
                      </span>
                      <span className="text-sm font-extrabold text-[#EE4D2D] font-['Manrope']">
                        {formatIDR(item.unitPrice * item.quantity)}
                      </span>
                    </div>

                    {/* Quantity Stepper */}
                    <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full p-1 border border-[#E5E7EB]">
                      <button
                        onClick={() => handleQtyChange(item.itemId, item.quantity, -1)}
                        className="h-8 w-8 flex items-center justify-center bg-white rounded-full shadow-sm text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        disabled={item.quantity <= 1}
                        aria-label={t.reduceQty}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        title="Kuantitas"
                        placeholder="Qty"
                        value={
                          localQuantities[item.itemId] !== undefined
                            ? localQuantities[item.itemId]
                            : item.quantity
                        }
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, "");
                          setLocalQuantities((prev) => ({ ...prev, [item.itemId]: clean }));
                          
                          if (clean !== "") {
                            const val = parseInt(clean, 10);
                            if (!isNaN(val) && val >= 1) {
                              const nextQty = Math.min(MAX_LINE_QUANTITY, val);
                              if (nextQty !== item.quantity) {
                                setLineQuantity(user.uid, item.itemId, nextQty).catch(() => {
                                  showToast({ message: t.updateError, variant: "error" });
                                });
                              }
                            }
                          }
                        }}
                        onBlur={() => {
                          const currentVal = localQuantities[item.itemId];
                          if (currentVal === undefined) return;
                          if (currentVal === "") {
                            setLineQuantity(user.uid, item.itemId, 1).catch(() => {
                              showToast({ message: t.updateError, variant: "error" });
                            });
                          }
                          setLocalQuantities((prev) => {
                            const copy = { ...prev };
                            delete copy[item.itemId];
                            return copy;
                          });
                        }}
                        className="w-10 text-center font-['Manrope',system-ui,sans-serif] text-sm font-bold tabular-nums text-[#111827] bg-transparent focus:outline-none"
                      />
                      <button
                        onClick={() => handleQtyChange(item.itemId, item.quantity, 1)}
                        className="h-8 w-8 flex items-center justify-center bg-white rounded-full shadow-sm text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        disabled={item.quantity >= MAX_LINE_QUANTITY}
                        aria-label={t.increaseQty}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>




                </div>
              </div>
            ))}
          </div>

          {/* Sticky Summary & Checkout Footer */}
          <div className="bg-white border-t border-[#E5E7EB] fixed bottom-14 lg:bottom-0 left-0 right-0 p-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] max-w-[480px] lg:max-w-7xl mx-auto z-10 flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                {t.totalPayment}
              </span>
              <span className="text-base font-extrabold text-[#EE4D2D] font-['Manrope']">
                {formatIDR(
                  items
                    .filter((item) => selectedItemIds.has(item.itemId))
                    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
                )}
              </span>
            </div>

            <button
              onClick={() => {
                if (selectedItemIds.size === 0) return;
                navigate("/checkout/address", {
                  state: { selectedItemIds: Array.from(selectedItemIds) }
                });
              }}
              disabled={selectedItemIds.size === 0}
              className="inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-extrabold text-[#111827] shadow-md transition-all cursor-pointer disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed shrink-0"
            >
              {t.proceedToAddress}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Premium Confirm Modal */}
      <AnimatePresence>
        {deleteItemId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with modern glassmorphism blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteItemId(null)}
              className="absolute inset-0 bg-neutral-900/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full relative z-10 shadow-2xl border border-neutral-100 text-center space-y-4 font-['Hanken_Grotesk']"
            >
              <div className="h-12 w-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="h-5 w-5" />
              </div>

              <div className="space-y-1">
                <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-[#111827]">
                  {lang === "en" ? "Remove Item?" : "Hapus Barang?"}
                </h3>
                <p className="text-xs text-[#6B7280] leading-relaxed px-2">
                  {t.deleteConfirm}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteItemId(null)}
                  className="flex-1 min-h-10 text-xs font-bold text-[#4B5563] bg-[#F3F4F6] hover:bg-[#E5E7EB] rounded-xl transition cursor-pointer"
                >
                  {lang === "en" ? "Cancel" : "Batal"}
                </button>
                <button
                  onClick={async () => {
                    if (deleteItemId && user) {
                      const id = deleteItemId;
                      setDeleteItemId(null);
                      try {
                        await removeLineItem(user.uid, id);
                        showToast({ message: lang === "en" ? "Item removed successfully." : "Barang berhasil dihapus.", variant: "success" });
                      } catch {
                        showToast({ message: t.deleteError, variant: "error" });
                      }
                    }
                  }}
                  className="flex-1 min-h-10 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition shadow-sm cursor-pointer"
                >
                  {lang === "en" ? "Remove" : "Hapus"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CartPage;
