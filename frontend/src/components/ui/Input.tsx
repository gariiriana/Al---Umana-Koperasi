import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export type InputVariant = "rounded" | "pill";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: InputVariant;
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
}

const BASE_INPUT_CLASSES =
  "w-full bg-white text-[#111827] placeholder:text-[#9CA3AF] " +
  "px-4 py-3 text-sm " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] " +
  "border outline-none transition-shadow duration-150 " +
  "disabled:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-70";

const SHAPE_CLASSES: Record<InputVariant, string> = {
  rounded: "rounded-lg",
  pill: "rounded-full",
};

const STATE_CLASSES_NORMAL =
  "border-[#D1D5DB] focus:border-[#FBBF24] focus:ring-2 focus:ring-[#FBBF24]";

const STATE_CLASSES_ERROR =
  "border-[#EF4444] focus:border-[#EF4444] focus:ring-2 focus:ring-[#EF4444]";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    variant = "rounded",
    label,
    helperText,
    error,
    leftIcon,
    rightIcon,
    id,
    className,
    containerClassName,
    disabled,
    ...rest
  },
  ref
) {
  const reactId = useId();
  const inputId = id ?? `input-${reactId}`;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;

  const hasError = Boolean(error);

  const inputClasses = [
    BASE_INPUT_CLASSES,
    SHAPE_CLASSES[variant],
    hasError ? STATE_CLASSES_ERROR : STATE_CLASSES_NORMAL,
    leftIcon ? "pl-10" : "",
    rightIcon ? "pr-10" : "",
    className ?? "",
  ]
    .join(" ")
    .trim();

  return (
    <div className={["w-full", containerClassName ?? ""].join(" ").trim()}>
      {label && (
        <label
          htmlFor={inputId}
          className="block mb-1.5 text-xs font-medium text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#6B7280]"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={inputClasses}
          {...rest}
        />
        {rightIcon && (
          <span
            className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[#6B7280]"
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        )}
      </div>
      {error && (
        <p
          id={errorId}
          className="mt-1.5 text-xs text-[#EF4444] font-['Hanken_Grotesk',system-ui,sans-serif]"
          role="alert"
        >
          {error}
        </p>
      )}
      {!error && helperText && (
        <p
          id={helperId}
          className="mt-1.5 text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]"
        >
          {helperText}
        </p>
      )}
    </div>
  );
});
