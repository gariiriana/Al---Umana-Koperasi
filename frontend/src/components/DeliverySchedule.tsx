import { CalendarDays, Clock } from "lucide-react";
import { formatDeliverySchedule } from "@/utils/date";

export function DeliverySchedule({ deliveryTime, eventDate }: {
  deliveryTime: string;
  eventDate: string;
}) {
  const schedule = formatDeliverySchedule(deliveryTime, eventDate);

  return (
    <section aria-label="Target tiba" className="mb-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <h3 className="mb-2 text-xs font-semibold text-[#4B5563]">Target tiba</h3>
      <dl className="space-y-2.5">
        <div className="flex items-start gap-2.5">
          <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7280]" />
          <div className="min-w-0">
            <dt className="text-xs text-[#4B5563]">Tanggal</dt>
            <dd className="text-sm sm:text-base font-bold leading-snug text-[#111827]">
              {schedule.date || "Belum ditentukan"}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2.5 border-t border-[#E5E7EB] pt-2.5">
          <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7280]" />
          <div className="min-w-0">
            <dt className="text-xs text-[#4B5563]">Jam</dt>
            <dd className="text-sm sm:text-base font-bold leading-snug text-[#111827] break-words">
              {schedule.time
                ? (/^\d/.test(schedule.time) ? `Pukul ${schedule.time}` : schedule.time)
                : "Belum ditentukan"}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}
