import { describe, expect, it } from 'vitest';
import { formatDeliverySchedule } from '@/utils/date';

describe('delivery schedule display', () => {
  it('uses the target date when it differs from the event date', () => {
    expect(formatDeliverySchedule('2026-10-14T22:30', '2026-10-15')).toEqual({
      date: '14 Oktober 2026', time: '22.30',
    });
  });

  it('uses the event date for a legacy time-only target', () => {
    expect(formatDeliverySchedule('8:05 WIB', '2026-10-14')).toEqual({
      date: '14 Oktober 2026', time: '08.05',
    });
  });

  it('preserves legacy time ranges and descriptions', () => {
    expect(formatDeliverySchedule('08:00 - 10:00').time).toBe('08:00 - 10:00');
    expect(formatDeliverySchedule('Pagi').time).toBe('Pagi');
  });

  it('does not invent a time when only a date exists', () => {
    expect(formatDeliverySchedule('2026-10-14')).toEqual({
      date: '14 Oktober 2026', time: null,
    });
    expect(formatDeliverySchedule('', '2026-10-14')).toEqual({
      date: '14 Oktober 2026', time: null,
    });
  });

  it('converts explicit timestamps to Jakarta time across midnight', () => {
    expect(formatDeliverySchedule('2026-10-14T18:30:00Z')).toEqual({
      date: '15 Oktober 2026', time: '01.30',
    });
  });

  it('keeps local midnight and calendar dates independent of browser timezone', () => {
    expect(formatDeliverySchedule('2026-10-14T00:00')).toEqual({
      date: '14 Oktober 2026', time: '00.00',
    });
  });

  it('does not render invalid calendar dates or invalid clock values', () => {
    expect(formatDeliverySchedule('2026-02-30T25:90')).toEqual({ date: null, time: null });
    expect(formatDeliverySchedule()).toEqual({ date: null, time: null });
  });
});
