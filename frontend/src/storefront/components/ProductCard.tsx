import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ImageOff, ShoppingCart } from "lucide-react";

import { useLanguage } from "@/contexts/LanguageContext";
import { formatIDR, truncate } from "@/lib/format";
import type { InventoryItem } from "@/types/inventory";
import { ProductImage } from "@/components/ProductImage";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useCartAnimation } from "@/contexts/useCartAnimation";
import { addToCart, type CartLineItem } from "@/services/cartService";

/**
 * Mobile-first product card redesigned to look like modern premium e-commerce (Shopee).
 * Tapping the card navigates to the product detail page at `/product/{id}`.
 *
 * Implements:
 *   - Proportional square aspect-ratio image container.
 *   - Error boundary (onError) handling on images to prevent layouts collapsing on broken URLs.
 *   - Premium brand overlays (Mall / Star+ badges).
 *   - Original strikethrough price and red-orange formatted price.
 *   - Dynamic stok progress bars ("Stok Terbatas") for low inventory.
 *   - Direct Beli (Buy Now) checkout button.
 *   - Inline ShoppingCart button triggering jumping fly animations to the navbar cart.
 */

const translateUnit = (unit: string, lang: string) => {
  if (lang !== "en") return unit;
  const u = unit.toLowerCase().trim();
  if (u === "botol") return "bottle(s)";
  if (u === "kotak") return "box(es)";
  if (u === "paket") return "pack(s)";
  if (u === "bungkus") return "pack(s)";
  return unit;
};

export interface ProductCardProps {
  item: InventoryItem;
  className?: string;
}

export function ProductCard({ item, className }: ProductCardProps) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { triggerFlyAnimation } = useCartAnimation();

  const [addingToCart, setAddingToCart] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);

  const cartBtnRef = useRef<HTMLButtonElement | null>(null);

  const inStock = item.available && item.quantity > 0;
  const discountPercent = item.discountPercent ?? 0;
  const baseSales = (item.price % 97) + 5;
  const salesText = lang === "en" ? `${baseSales} sold` : `${baseSales} terjual`;

  // Determine badge type: even prices get Mall, odd prices get Star+
  const isMall = item.price % 2 === 0;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!inStock) return;

    if (!user) {
      navigate("/login", { state: { from: { pathname: "/" } } });
      return;
    }

    setAddingToCart(true);

    // Trigger fly animation
    if (cartBtnRef.current) {
      triggerFlyAnimation(cartBtnRef.current.getBoundingClientRect());
    }

    try {
      await addToCart(
        user.uid,
        {
          itemId: item.id,
          itemName: item.itemName,
          price: item.price,
          imageUrl: item.imageUrl,
        },
        1
      );
    } catch (err) {
      console.error(err);
      showToast({
        message: lang === "id" 
          ? "Gagal menambahkan produk ke keranjang." 
          : "Failed to add product to cart.",
        variant: "error",
      });
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!inStock) return;

    if (!user) {
      // Redirect to login, and then direct to the product detail page
      navigate("/login", { state: { from: { pathname: `/product/${encodeURIComponent(item.id)}` } } });
      return;
    }

    setBuyingNow(true);

    const directItem: CartLineItem = {
      itemId: item.id,
      itemName: item.itemName,
      unitPrice: item.price,
      quantity: 1,
      notes: "",
      imageUrl: item.imageUrl || ""
    };

    navigate("/checkout/address", {
      state: {
        directCheckoutItems: [directItem]
      }
    });
    setBuyingNow(false);
  };

  return (
    <div
      onClick={() => navigate(`/product/${encodeURIComponent(item.id)}`)}
      className={
        "group block overflow-hidden bg-white rounded-2xl border border-neutral-200 cursor-pointer " +
        "hover:border-[#EE4D2D] hover:shadow-md transition-all duration-200 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2 " +
        (className ?? "")
      }
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/product/${encodeURIComponent(item.id)}`);
        }
      }}
      aria-label={item.itemName}
    >
      {/* Product Image Wrapper */}
      <div className="relative w-full aspect-square bg-[#F3F4F6] overflow-hidden">
        {item.imageUrl ? (
          <ProductImage
            imageUrl={item.imageUrl}
            alt={item.itemName}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            fallbackClassName="h-10 w-10 text-[#9CA3AF]"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-[#9CA3AF] bg-[#F3F4F6]"
          >
            <ImageOff className="h-10 w-10 text-[#9CA3AF]" />
          </div>
        )}
        
        {/* Mall / Star Badge Overlay */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
          {isMall ? (
            <span className="bg-[#D0011B] text-white text-[8px] font-black px-1.5 py-0.5 rounded-xs uppercase tracking-wide shadow-sm">
              Mall
            </span>
          ) : (
            <span className="bg-[#EE4D2D] text-white text-[8px] font-black px-1.5 py-0.5 rounded-xs uppercase tracking-wide shadow-sm">
              Star+
            </span>
          )}
          
          {!inStock && (
            <span className="bg-neutral-800/85 text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded-xs uppercase tracking-wide shadow-sm">
              {lang === "en" ? "Sold Out" : "Habis"}
            </span>
          )}
        </div>

        {/* Discount Badge Overlay */}
        {discountPercent > 0 && (
          <span className="absolute top-0 right-0 bg-[#FFEAEB] text-[#EE4D2D] text-[10px] font-black px-2 py-1 rounded-bl-xl border-l border-b border-[#FEE2E2] z-10">
            -{discountPercent}%
          </span>
        )}

        {/* Promo Xtra Yellow Tag Overlay */}
        {discountPercent > 0 && (
          <span className="bg-[#FFD400] text-[#D0011B] text-[8px] font-black px-1.5 py-0.5 rounded-tr-md absolute bottom-0 left-0 shadow-sm uppercase tracking-wider z-10">
            Promo Xtra
          </span>
        )}
      </div>

      {/* Product Details */}
      <div className="p-3 space-y-2 flex flex-col justify-between">
        <div className="space-y-1">
          <h3
            className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-semibold text-[#222222] leading-relaxed line-clamp-2 h-9"
            title={item.itemName}
          >
            {truncate(item.itemName, 80)}
          </h3>
        </div>

        {/* Price Block (Standalone row to prevent truncation) */}
        <div className="flex flex-col min-w-0 pt-0.5">
          {discountPercent > 0 && (
            <span className="text-[10px] text-neutral-400 line-through leading-tight">
              {formatIDR(Math.round(item.price / (1 - discountPercent / 100)))}
            </span>
          )}
          <span className="text-sm font-extrabold text-[#EE4D2D] leading-tight">
            {formatIDR(item.price)}
          </span>
        </div>

        {/* Action Buttons (Full-width row) */}
        {inStock && (
          <div className="flex items-center gap-1.5 pt-1">
            {/* Cart Icon Button */}
            <button
              ref={cartBtnRef}
              type="button"
              disabled={addingToCart || buyingNow}
              onClick={handleAddToCart}
              className="flex-1 flex items-center justify-center bg-amber-50 border border-amber-200 hover:bg-amber-100/70 text-[#EE4D2D] h-7.5 rounded-lg transition-all duration-150 shadow-2xs cursor-pointer focus:outline-none shrink-0"
              title={lang === "id" ? "Tambah ke Keranjang" : "Add to Cart"}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
            </button>
            
            {/* Beli (Buy Now) Button */}
            <button
              type="button"
              disabled={buyingNow || addingToCart}
              onClick={handleBuyNow}
              className="flex-[2] bg-[#EE4D2D] hover:bg-[#D33E20] text-white text-[10px] font-bold h-7.5 rounded-lg transition-all duration-150 shadow-xs cursor-pointer focus:outline-none flex items-center justify-center shrink-0"
            >
              {lang === "en" ? "Buy" : "Beli"}
            </button>
          </div>
        )}

        {/* Stock status or sales progress bar */}
        <div className="pt-2 border-t border-neutral-100">
          {item.quantity <= 15 ? (
            <div className="w-full bg-[#FFEAEB] h-3.5 rounded-full relative flex items-center justify-center overflow-hidden shadow-inner">
              <div 
                ref={(el) => {
                  if (el) {
                    el.style.setProperty("--stock-pct", `${Math.max(15, (item.quantity / 15) * 100)}%`);
                  }
                }}
                className="stock-bar-fill bg-gradient-to-r from-[#FF7337] to-[#EE4D2D] h-full absolute left-0 top-0 rounded-full"
              />
              <span className="relative z-10 text-[8px] font-black text-[#EE4D2D] tracking-wider uppercase">
                {lang === "en" ? `Limited Stock (${item.quantity})` : `Stok Terbatas (${item.quantity})`}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[9px] text-neutral-500 font-bold font-['Hanken_Grotesk'] leading-none">
              <span className="truncate">{lang === "en" ? "Stock" : "Stok"}: {item.quantity} {translateUnit(item.unit, lang)}</span>
              <span className="shrink-0">{salesText}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
