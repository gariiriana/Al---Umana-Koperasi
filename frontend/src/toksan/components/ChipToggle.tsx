// Pilihan satu-dari-beberapa sebagai tombol chip (Sesi, Pihak). Ketuk chip yang aktif tidak mengosongkannya.
interface ChipToggleProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  invalid?: boolean;
  size?: "sm" | "md";
}

export function ChipToggle<T extends string>({ label, options, value, onChange, invalid = false, size = "md" }: ChipToggleProps<T>) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex flex-wrap gap-1.5 rounded-full ${invalid ? "ring-2 ring-red-400 ring-offset-2" : ""}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-full border font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] ${pad} ${
              active
                ? "border-[#F59E0B] bg-[#FBBF24] text-[#111827]"
                : "border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#FBBF24]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
