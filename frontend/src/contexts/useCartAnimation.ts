/**
 * useCartAnimation hook.
 *
 * Kept in a dedicated file so that CartAnimationContext.tsx only exports
 * React components, satisfying Vite Fast Refresh requirements.
 */

import { useContext } from "react";
import { CartAnimationContext } from "@/contexts/CartAnimationContext";

export function useCartAnimation() {
  const ctx = useContext(CartAnimationContext);
  if (!ctx) {
    throw new Error("useCartAnimation must be used inside CartAnimationProvider");
  }
  return ctx;
}
