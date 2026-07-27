import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, X, Loader2, ChefHat, Check } from 'lucide-react';
import type { MbgDayMenu } from '@/types/mbg';

function getCategoryItems(day: MbgDayMenu, keyStr: keyof MbgDayMenu, keyArr: keyof MbgDayMenu): string[] {
  const arrVal = day[keyArr];
  if (Array.isArray(arrVal) && arrVal.length > 0) {
    return arrVal;
  }
  const strVal = day[keyStr];
  if (typeof strVal === 'string' && strVal.trim()) {
    return strVal.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** Clean Tag Input — Unified Neutral Design, zero rainbow colors */
function CleanTagInput({
  label,
  icon,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  icon: string;
  items: string[];
  placeholder: string;
  onChange: (newItems: string[]) => void;
}) {
  const [inputText, setInputText] = useState('');

  const handleAdd = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    if (!items.includes(trimmed)) {
      onChange([...items, trimmed]);
    }
    setInputText('');
  };

  const handleRemove = (indexToRemove: number) => {
    onChange(items.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-extrabold text-[#111827] flex items-center gap-1.5">
          <span>{icon}</span> {label}
          <span className="text-[10px] font-bold text-[#6B7280] bg-gray-100 px-1.5 py-0.5 rounded">
            {items.length} menu
          </span>
        </label>
      </div>

      {/* Unified Input Box with Chips */}
      <div className="min-h-[44px] p-2 bg-gray-50 border border-[#E5E7EB] rounded-xl focus-within:bg-white focus-within:border-[#059669] focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all flex flex-wrap items-center gap-1.5">
        {items.map((item, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-[#111827] bg-white border border-[#D1D5DB] shadow-2xs group"
          >
            <span>{item}</span>
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              title={`Hapus ${item}`}
              className="text-gray-400 hover:text-red-600 cursor-pointer transition-colors p-0.5 rounded-full"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <div className="flex-1 flex items-center min-w-[140px] gap-1">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={items.length === 0 ? placeholder : 'Ketik & Enter...'}
            className="w-full bg-transparent text-xs font-semibold text-[#111827] placeholder:text-gray-400 placeholder:font-normal focus:outline-none px-1 py-0.5"
          />
          {inputText.trim() && (
            <button
              type="button"
              onClick={handleAdd}
              className="p-1 text-[#059669] hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors shrink-0"
              title="Tambah Menu"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function WeeklyScheduleModal({
  isOpen,
  onClose,
  scheduleDays,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  scheduleDays: MbgDayMenu[];
  onSave: (updatedDays: MbgDayMenu[]) => Promise<void>;
}) {
  const [days, setDays] = useState<MbgDayMenu[]>(scheduleDays);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<number | 'all'>(1); // Default to Monday (1)

  useEffect(() => {
    setDays(scheduleDays);
  }, [scheduleDays]);

  if (!isOpen) return null;

  const updateCategory = (
    dayIdx: number,
    keyStr: keyof MbgDayMenu,
    keyArr: keyof MbgDayMenu,
    newItems: string[]
  ) => {
    setDays((prev) => {
      const next = [...prev];
      next[dayIdx] = {
        ...next[dayIdx],
        [keyStr]: newItems.join(', '),
        [keyArr]: newItems,
      };
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(days);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-[#E5E7EB]"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-[#E5E7EB] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 rounded-xl text-[#059669]">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">
                  Master Jadwal Menu Mingguan
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Atur klasifikasi menu (Hewani, Sayur, Buah, Nabati, Karbo, Keringan) per hari.
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Tutup Modal"
            aria-label="Tutup Modal"
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Clean Day Tabs Navigation */}
        <div className="px-6 py-3 bg-gray-50 border-b border-[#E5E7EB] flex items-center gap-1.5 overflow-x-auto">
          {days.map((d) => {
            const isActive = activeTab === d.dayOfWeek;
            return (
              <button
                key={d.dayOfWeek}
                type="button"
                onClick={() => setActiveTab(d.dayOfWeek)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#111827] text-white shadow-sm'
                    : 'bg-white text-[#4B5563] hover:bg-gray-200 border border-[#E5E7EB]'
                }`}
              >
                <span>🗓️</span>
                <span>{d.dayName}</span>
              </button>
            );
          })}
          <div className="h-5 w-[1px] bg-gray-300 mx-1 shrink-0" />
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-[#111827] text-white shadow-sm'
                : 'bg-white text-[#4B5563] hover:bg-gray-200 border border-[#E5E7EB]'
            }`}
          >
            📊 Ringkasan 7 Hari
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#FAFAFA]">
          {activeTab === 'all' ? (
            /* All Days Grid Overview */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {days.map((day) => (
                <div
                  key={day.dayOfWeek}
                  className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="font-extrabold text-sm text-[#111827]">
                      🗓️ {day.dayName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab(day.dayOfWeek)}
                      className="text-[11px] font-bold text-[#059669] hover:underline cursor-pointer"
                    >
                      Edit Hari Ini →
                    </button>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-bold text-gray-500 text-[11px] block">🍗 Hewani:</span>
                      <span className="font-semibold text-gray-800">{day.hewani || '-'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-500 text-[11px] block">🥦 Sayur:</span>
                      <span className="font-semibold text-gray-800">{day.sayur || '-'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-500 text-[11px] block">🍌 Buah & 🫘 Nabati:</span>
                      <span className="font-semibold text-gray-800">{day.buah || '-'} | {day.nabati || '-'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-500 text-[11px] block">🍚 Karbo & 🍪 Keringan:</span>
                      <span className="font-semibold text-gray-800">{day.karbohidrat || 'Nasi Putih'} | {day.menuKeringan || '-'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Single Active Day Editor */
            (() => {
              const dayIdx = days.findIndex((d) => d.dayOfWeek === activeTab);
              if (dayIdx === -1) return null;
              const day = days[dayIdx];

              const hewaniItems = getCategoryItems(day, 'hewani', 'hewaniItems');
              const sayurItems = getCategoryItems(day, 'sayur', 'sayurItems');
              const buahItems = getCategoryItems(day, 'buah', 'buahItems');
              const nabatiItems = getCategoryItems(day, 'nabati', 'nabatiItems');
              const karboItems = getCategoryItems(day, 'karbohidrat', 'karbohidratItems');
              const keringanItems = getCategoryItems(day, 'menuKeringan', 'menuKeringanItems');

              return (
                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <div>
                      <h4 className="text-base font-extrabold text-[#111827] flex items-center gap-2">
                        <span>🗓️</span> Menu Hari {day.dayName}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Ketik nama menu lalu tekan <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-[10px] font-mono">Enter</kbd> untuk menambah ke klasifikasi.
                      </p>
                    </div>
                    <span className="text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1 rounded-xl">
                      Hari ke-{day.dayOfWeek === 0 ? 7 : day.dayOfWeek}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <CleanTagInput
                      label="Hewani"
                      icon="🍗"
                      items={hewaniItems}
                      placeholder="Contoh: Ayam Goreng, Semur Daging"
                      onChange={(newItems) => updateCategory(dayIdx, 'hewani', 'hewaniItems', newItems)}
                    />
                    <CleanTagInput
                      label="Sayur"
                      icon="🥦"
                      items={sayurItems}
                      placeholder="Contoh: Sayur Sop, Capcay Kuah"
                      onChange={(newItems) => updateCategory(dayIdx, 'sayur', 'sayurItems', newItems)}
                    />
                    <CleanTagInput
                      label="Buah"
                      icon="🍌"
                      items={buahItems}
                      placeholder="Contoh: Pisang Ambon, Jeruk Medan"
                      onChange={(newItems) => updateCategory(dayIdx, 'buah', 'buahItems', newItems)}
                    />
                    <CleanTagInput
                      label="Nabati"
                      icon="🫘"
                      items={nabatiItems}
                      placeholder="Contoh: Tempe Goreng, Tahu Bacem"
                      onChange={(newItems) => updateCategory(dayIdx, 'nabati', 'nabatiItems', newItems)}
                    />
                    <CleanTagInput
                      label="Karbohidrat"
                      icon="🍚"
                      items={karboItems}
                      placeholder="Contoh: Nasi Putih, Nasi Uduk"
                      onChange={(newItems) => updateCategory(dayIdx, 'karbohidrat', 'karbohidratItems', newItems)}
                    />
                    <CleanTagInput
                      label="Keringan / Pobia Nasi (Opsional)"
                      icon="🍪"
                      items={keringanItems}
                      placeholder="Contoh: Roti Abon, Biskuit Kelapa"
                      onChange={(newItems) => updateCategory(dayIdx, 'menuKeringan', 'menuKeringanItems', newItems)}
                    />
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-[#E5E7EB] flex items-center justify-between">
          <button
            type="button"
            onClick={() => setActiveTab((prev) => (typeof prev === 'number' && prev < 6 ? prev + 1 : 1))}
            className="text-xs font-bold text-gray-500 hover:text-gray-900 cursor-pointer"
          >
            {typeof activeTab === 'number' ? `Hari Berikutnya →` : ''}
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-[#4B5563] hover:bg-gray-100 rounded-xl cursor-pointer transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-[#059669] hover:bg-[#047857] text-white font-extrabold text-xs px-6 py-2.5 rounded-xl cursor-pointer shadow-md shadow-emerald-500/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChefHat className="h-4 w-4" />}
              <span>Simpan Jadwal Menu</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
