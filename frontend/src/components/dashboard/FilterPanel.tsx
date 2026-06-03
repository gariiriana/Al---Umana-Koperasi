import { useState } from "react";
import { Calendar, Filter, RotateCcw, User } from "lucide-react";
import type { OrderStatus } from "@/types/order";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

const STATUS_OPTIONS: Array<{ value: "" | OrderStatus; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "IN_PRODUCTION", label: "In Production" },
  { value: "QC", label: "QC" },
  { value: "READY_TO_DELIVER", label: "Ready to Deliver" },
  { value: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DELIVERY_FAILED", label: "Delivery Failed" },
];

export interface FilterState {
  status: "" | OrderStatus;
  courierId: string;
  startDate: string;
  endDate: string;
}

export interface FilterPanelProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onReset?: () => void;
}

export function FilterPanel({ value, onChange, onReset }: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const update = <K extends keyof FilterState>(
    key: K,
    next: FilterState[K]
  ) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Filter className="h-4 w-4 text-[#6B7280]" />
        <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-semibold text-[#111827]">
          Filters
        </h3>
        <Button
          type="button"
          variant="outlined"
          size="sm"
          className="md:hidden ml-2 text-xs font-semibold"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Hide Panel" : "Show Panel"}
        </Button>
        {onReset && (
          <Button
            type="button"
            variant="outlined"
            size="sm"
            className="ml-auto"
            onClick={onReset}
            leftIcon={<RotateCcw className="h-3 w-3" />}
          >
            Reset
          </Button>
        )}
      </div>
      <div className={`${isExpanded ? "grid" : "hidden"} md:grid grid-cols-1 md:grid-cols-4 gap-3`}>
        <div>
          <label
            htmlFor="filter-status"
            className="block mb-1.5 text-xs font-medium text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]"
          >
            Status
          </label>
          <select
            id="filter-status"
            value={value.status}
            onChange={(e) => update("status", e.target.value as FilterState["status"])}
            className="w-full rounded-lg border border-[#D1D5DB] bg-white px-4 py-3 text-sm font-['Hanken_Grotesk',system-ui,sans-serif] text-[#111827] focus:border-[#FBBF24] focus:ring-2 focus:ring-[#FBBF24] focus:outline-none"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Courier ID"
          leftIcon={<User className="h-4 w-4" />}
          value={value.courierId}
          onChange={(e) => update("courierId", e.target.value)}
          placeholder="Optional"
        />

        <Input
          label="Start date"
          type="date"
          leftIcon={<Calendar className="h-4 w-4" />}
          value={value.startDate}
          onChange={(e) => update("startDate", e.target.value)}
        />

        <Input
          label="End date"
          type="date"
          leftIcon={<Calendar className="h-4 w-4" />}
          value={value.endDate}
          onChange={(e) => update("endDate", e.target.value)}
        />
      </div>
    </Card>
  );
}

export default FilterPanel;
