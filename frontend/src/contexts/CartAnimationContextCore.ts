import { createContext, type RefObject } from "react";

export interface FlyDot {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface CartAnimationContextValue {
  cartCount: number;
  cartIconRef: RefObject<HTMLAnchorElement>;
  triggerFlyAnimation: (sourceBoundingRect: DOMRect) => void;
  flyDots: FlyDot[];
  removeFlyDot: (id: number) => void;
}

export const CartAnimationContext = createContext<CartAnimationContextValue | null>(null);
