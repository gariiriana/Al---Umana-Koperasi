import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useEscapeLayer } from "@/hooks/useEscapeLayer";

/** Panel samping (desktop) / layar penuh (HP). */
export function SidePanel({ open, onClose, title, subtitle, children, footer, wide = false }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
  /** Lebih lebar untuk isi berbentuk tabel */
  wide?: boolean;
}) {
  useEscapeLayer(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={title}
        className={`absolute inset-y-0 right-0 flex w-full ${wide ? "max-w-3xl" : "max-w-xl"} flex-col bg-white shadow-xl font-['Hanken_Grotesk',system-ui,sans-serif]`}>
        <header className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#111827]">{title}</h2>
            {subtitle && <p className="text-sm text-[#6B7280]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F4F6] cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-[#E5E7EB] px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}
