import type { CateringJobDesk } from "@/types/cateringJobDesk";

const PORSI: Array<[prefix: string, label: string, className: string]> = [
  ["porsi kecil:", "Porsi Kecil", "bg-sky-50 border-sky-200 text-sky-950 [&>strong]:text-sky-800"],
  ["porsi besar:", "Porsi Besar", "bg-indigo-50 border-indigo-200 text-indigo-950 [&>strong]:text-indigo-800"],
  ["porsi balita:", "Porsi Balita", "bg-rose-50 border-rose-200 text-rose-950 [&>strong]:text-rose-800"],
  ["porsi bumil/busui:", "Porsi Bumil/Busui", "bg-amber-50 border-amber-200 text-amber-950 [&>strong]:text-amber-800"],
  ["porsi bumil:", "Porsi Bumil/Busui", "bg-amber-50 border-amber-200 text-amber-950 [&>strong]:text-amber-800"],
];

/**
 * Keterangan job desk ("Menu: … | Jumlah: … | Porsi Kecil: …") sebagai label berwarna.
 * Dipakai di Job Desk Saya (PIC) dan Review CO_MO, di tabel desktop maupun kartu HP.
 */
export function JobDeskKeterangan({ jd }: { jd: Pick<CateringJobDesk, "keterangan" | "description"> }) {
  const text = jd.keterangan || jd.description || "";
  if (!text) return <span className="text-gray-400 italic text-xs">-</span>;
  return (
    <div className="text-xs leading-relaxed text-gray-800 space-y-1">
      {text.split(" | ").map((part, i) => {
        const trimmed = part.trim();
        if (!trimmed) return null;
        const lower = trimmed.toLowerCase();
        if (lower.startsWith("menu:")) {
          return <span key={i} className="inline-block font-semibold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 mr-1.5 mb-1">{trimmed}</span>;
        }
        if (lower.startsWith("jumlah:") || lower.startsWith("porsi:")) {
          return <span key={i} className="inline-block font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mr-1.5 mb-1">{trimmed}</span>;
        }
        const porsi = PORSI.find(([prefix]) => lower.startsWith(prefix));
        if (porsi) {
          return (
            <div key={i} className={`mt-1 p-1.5 rounded-lg border text-xs ${porsi[2]}`}>
              <strong className="font-extrabold">{porsi[1]}:</strong>{" "}
              <span className="text-slate-700">{trimmed.slice(porsi[0].length).trim()}</span>
            </div>
          );
        }
        return <div key={i} className="text-gray-600 text-xs">{trimmed}</div>;
      })}
    </div>
  );
}
