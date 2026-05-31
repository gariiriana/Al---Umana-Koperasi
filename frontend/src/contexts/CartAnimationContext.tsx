/**
 * CartAnimationContext
 *
 * Provides:
 *  - `cartCount`           — realtime count of distinct line-items in cart
 *  - `triggerFlyAnimation` — call with the DOMRect of the "Add to Cart" button
 *                            to launch a flying-dot animation toward the cart icon.
 *  - `cartIconRef`         — attach to the cart icon element in the navbar so the
 *                            animation knows where to fly to.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { subscribeToCart, type CartLineItem } from "@/services/cartService";
import { useAuth } from "@/contexts/AuthContext";
import {
  CartAnimationContext,
  type FlyDot,
} from "./CartAnimationContextCore";

/* ─── Provider ────────────────────────────────────────────────────────── */

let nextDotId = 0;

export function CartAnimationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cartItems, setCartItems] = useState<CartLineItem[]>([]);
  const [flyDots, setFlyDots] = useState<FlyDot[]>([]);
  const cartIconRef = useRef<HTMLAnchorElement>(null);

  // Subscribe to cart changes for realtime badge count
  useEffect(() => {
    if (!user) {
      setCartItems([]);
      return;
    }
    const unsubscribe = subscribeToCart(
      user.uid,
      (items) => setCartItems(items),
      (err) => console.error("CartAnimationContext: cart subscription error:", err)
    );
    return () => unsubscribe();
  }, [user]);

  const triggerFlyAnimation = useCallback((sourceBoundingRect: DOMRect) => {
    // Determine target element: on mobile/tablet (< 1024px), target the bottom nav cart button
    let targetEl: HTMLElement | null = null;
    if (window.innerWidth < 1024) {
      targetEl = document.getElementById("mobile-cart-btn");
    }
    
    // Fall back to desktop cart ref
    if (!targetEl) {
      targetEl = cartIconRef.current;
    }
    
    if (!targetEl) return;

    const cartRect = targetEl.getBoundingClientRect();

    // Source: center of the Add-to-Cart button
    const startX = sourceBoundingRect.left + sourceBoundingRect.width / 2;
    const startY = sourceBoundingRect.top + sourceBoundingRect.height / 2;

    // Target: center of the cart icon
    const endX = cartRect.left + cartRect.width / 2;
    const endY = cartRect.top + cartRect.height / 2;

    const dot: FlyDot = { id: ++nextDotId, startX, startY, endX, endY };
    setFlyDots((prev) => [...prev, dot]);
  }, []);

  const removeFlyDot = useCallback((id: number) => {
    setFlyDots((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartAnimationContext.Provider
      value={{ cartCount, cartIconRef, triggerFlyAnimation, flyDots, removeFlyDot }}
    >
      {children}
    </CartAnimationContext.Provider>
  );
}

export default CartAnimationProvider;
