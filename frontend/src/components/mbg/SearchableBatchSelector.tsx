import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Search } from 'lucide-react';
import type { MbgPmBatch } from '@/types/mbg';
import { MBG_BATCH_STATUS_CONFIG } from '@/constants/mbgConstants';

interface SearchableBatchSelectorProps {
  batches: MbgPmBatch[];
  selectedBatchId: string | null;
  onSelectBatch: (id: string) => void;
}

export function SearchableBatchSelector({
  batches,
  selectedBatchId,
  onSelectBatch,
}: SearchableBatchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);

  const filteredBatches = batches.filter((b) => {
    const dateMatch = b.tanggal.toLowerCase().includes(searchQuery.toLowerCase());
    const statusLabel = MBG_BATCH_STATUS_CONFIG[b.status]?.label || b.status;
    const statusMatch = statusLabel.toLowerCase().includes(searchQuery.toLowerCase());
    return dateMatch || statusMatch;
  });

  const selectedBatchCfg = selectedBatch
    ? MBG_BATCH_STATUS_CONFIG[selectedBatch.status] || MBG_BATCH_STATUS_CONFIG.DRAFT
    : null;

  return (
    <div className="relative inline-block text-left w-full max-w-md font-['Hanken_Grotesk',system-ui,sans-serif]" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-[#E5E7EB] rounded-2xl px-5 py-3.5 flex items-center justify-between gap-3 text-xs font-bold text-[#374151] hover:border-[#FBBF24] focus:outline-none transition-all shadow-sm cursor-pointer"
      >
        <div className="flex items-center gap-2.5 truncate">
          <Calendar className="h-4 w-4 text-[#FBBF24] shrink-0" />
          {selectedBatch ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-extrabold text-sm text-[#111827]">{selectedBatch.tanggal}</span>
              {selectedBatchCfg && (
                <span className={`text-[10px] font-extrabold rounded-full px-2.5 py-0.5 shrink-0 ${selectedBatchCfg.textClass} ${selectedBatchCfg.bgClass}`}>
                  {selectedBatchCfg.label}
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-400 font-bold">Pilih Batch Pengiriman...</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-full bg-white border border-[#E5E7EB] rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search bar inside dropdown */}
          <div className="p-3 border-b border-[#E5E7EB] bg-gray-50 flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Cari tanggal batch atau status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs font-semibold text-[#111827] placeholder-gray-400 focus:outline-none"
              autoFocus
            />
          </div>

          {/* List items */}
          <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
            {filteredBatches.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs font-bold text-gray-400">
                Tidak ada batch yang cocok
              </div>
            ) : (
              filteredBatches.map((b) => {
                const isSelected = b.id === selectedBatchId;
                const cfg = MBG_BATCH_STATUS_CONFIG[b.status] || MBG_BATCH_STATUS_CONFIG.DRAFT;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      onSelectBatch(b.id);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full px-5 py-3 text-left flex items-center justify-between gap-3 text-xs font-bold transition-colors cursor-pointer hover:bg-gray-50 ${
                      isSelected ? 'bg-amber-50/60' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-extrabold ${isSelected ? 'text-amber-800' : 'text-[#111827]'}`}>
                        {b.tanggal}
                      </span>
                      <span className={`text-[9px] font-extrabold rounded-full px-2 py-0.5 ${cfg.textClass} ${cfg.bgClass}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="text-amber-600 text-[10px] font-extrabold uppercase">Aktif</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
