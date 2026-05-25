import { Loader2 } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "inverted"
  | "outlined"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[#FBBF24] text-[#111827] hover:bg-[#F59E0B] focus-visible:ring-[#FBBF24]",
  secondary:
    "bg-[#111827] text-white hover:bg-[#1F2937] focus-visible:ring-[#111827]",
  inverted:
    "bg-[#111827] text-white hover:bg-[#374151] focus-visible:ring-[#111827]",
  outlined:
    "bg-transparent text-[#111827] border border-[#111827] hover:bg-[#F3F4F6] focus-visible:ring-[#111827]",
  danger:
    "bg-[#EF4444] text-white hover:bg-[#DC2626] focus-visible:ring-[#EF4444]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-4 py-1.5 text-xs gap-1.5",
  md: "px-6 py-2 text-sm gap-2",
  lg: "px-7 py-3 text-base gap-2.5",
};

const SPINNER_SIZE: Record<ButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center rounded-full font-semibold " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] " +
  "transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      disabled,
      type = "button",
      className,
      children,
      ...rest
    },
    ref
  ) {
    const isDisabled = disabled || loading;
    const composed = [
      BASE_CLASSES,
      VARIANT_CLASSES[variant],
      SIZE_CLASSES[size],
      className ?? "",
    ]
      .join(" ")
      .trim();

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={composed}
        {...rest}
      >
        {loading ? (
          <Loader2
            className={`${SPINNER_SIZE[size]} animate-spin`}
            aria-hidden="true"
          />
        ) : leftIcon ? (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}
        {children != null && <span>{children}</span>}
        {!loading && rightIcon ? (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </button>
    );
  }
);
