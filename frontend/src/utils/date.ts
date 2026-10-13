/** Returns YYYY-MM-DD in the operational timezone, never the browser's UTC date. */
export function getJakartaDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Display delivery targets without shifting local datetime-input values. */
export function formatDeliverySchedule(deliveryTime = '', eventDate = ''): {
  date: string | null;
  time: string | null;
} {
  const value = deliveryTime.trim();
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}(?=$|[T ])/);
  let datePart = isoDate?.[0] || eventDate.trim().slice(0, 10);
  const clock = value.match(/^(?:\d{4}-\d{2}-\d{2}[T ])?(\d{1,2})[:.](\d{2})(?=$|[:\sZ+-])/);
  let time: string | null = null;

  if (!isoDate && value && !/^\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*WIB)?$/i.test(value)) {
    // Preserve legacy time ranges and descriptions rather than dropping details.
    time = value;
  } else if (clock && Number(clock[1]) < 24 && Number(clock[2]) < 60) {
    time = `${clock[1].padStart(2, '0')}.${clock[2]}`;
  }

  if (isoDate && /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const instant = new Date(value);
    if (!Number.isNaN(instant.getTime())) {
      datePart = getJakartaDate(instant);
      time = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(instant);
    }
  }

  const calendarDate = new Date(`${datePart}T00:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(datePart)
    && !Number.isNaN(calendarDate.getTime())
    && calendarDate.toISOString().slice(0, 10) === datePart;

  return {
    date: validDate ? new Intl.DateTimeFormat('id-ID', {
      timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
    }).format(calendarDate) : null,
    time,
  };
}
