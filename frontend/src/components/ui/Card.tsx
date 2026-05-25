import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  onClick?: () => void;
}

const BASE_CLASSES =
  "bg-white rounded-2xl p-6 " +
  "shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)]";

const INTERACTIVE_CLASSES =
  "cursor-pointer transition-shadow duration-150 hover:shadow-lg " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2";

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, onClick, className, ...rest },
  ref
) {
  const isInteractive = typeof onClick === "function";

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
  };

  const composed = [
    BASE_CLASSES,
    isInteractive ? INTERACTIVE_CLASSES : "",
    className ?? "",
  ]
    .join(" ")
    .trim();

  return (
    <div
      ref={ref}
      className={composed}
      onClick={onClick}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      {...rest}
    >
      {children}
    </div>
  );
});
