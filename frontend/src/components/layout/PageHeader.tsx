import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  const composed = ["mb-6 flex items-start justify-between gap-4", className ?? ""]
    .join(" ")
    .trim();

  return (
    <header className={composed}>
      <div className="min-w-0">
        <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl md:text-3xl font-bold text-[#111827] tracking-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}

export default PageHeader;
