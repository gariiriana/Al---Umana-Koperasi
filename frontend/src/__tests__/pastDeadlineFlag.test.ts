import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Clause = { type: string; field?: string; op?: string; value?: unknown };
type Snap = { docs: Array<{ id: string; data: () => Record<string, unknown> }> };

const fake = vi.hoisted(() => ({
  subs: [] as Array<{ q: { clauses: Clause[] }; next: (snap: Snap) => void }>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/subscriptionManager', () => ({
  subscriptionManager: {
    subscribe: (q: { clauses: Clause[] }, next: (snap: Snap) => void) => { fake.subs.push({ q, next }); return () => {}; },
  },
}));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  collection: () => ({}),
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  limit: (value: number) => ({ type: 'limit', value }),
  query: (_c: unknown, ...clauses: Clause[]) => ({ clauses }),
}));

import { subscribePastDeadlineFlag } from '@/services/realtimeService';

const FINISHED = ['COMPLETED', 'DELIVERED', 'FAILED', 'DELIVERY_FAILED'];
const openOrder = (id: string, eventDate: string, deliveryTime = '') =>
  ({ id, data: () => ({ status: 'CONFIRMED', eventDate, deliveryTime }) });
const deliver = (index: number, docs: Snap['docs']) => fake.subs[index].next({ docs });

beforeEach(() => {
  fake.subs = [];
  vi.useFakeTimers();
  // Local noon, the same clock isOrderPastDeadline reads delivery times against.
  vi.setSystemTime(new Date('2026-11-02T12:00:00'));
});
afterEach(() => { vi.useRealTimers(); });

// 321 of 477 orders are open, so listening to all of them for one red dot cost hundreds of reads per phone.
describe('past-deadline dot (Sidebar)', () => {
  it('reads at most one open order from before today, plus today’s open orders', () => {
    subscribePastDeadlineFlag('2026-11-02', vi.fn());
    expect(fake.subs.map((s) => s.q.clauses)).toEqual([
      [
        { type: 'where', field: 'status', op: 'not-in', value: FINISHED },
        { type: 'where', field: 'eventDate', op: '<', value: '2026-11-02' },
        { type: 'limit', value: 1 },
      ],
      [
        { type: 'where', field: 'status', op: 'not-in', value: FINISHED },
        { type: 'where', field: 'eventDate', op: '>=', value: '2026-11-02' },
        { type: 'where', field: 'eventDate', op: '<', value: '2026-11-03' },
      ],
    ]);
  });

  it('shows the dot while an open order from an earlier day exists', () => {
    const onFlag = vi.fn();
    subscribePastDeadlineFlag('2026-11-02', onFlag);
    deliver(1, []);
    deliver(0, [openOrder('old', '2026-10-30')]);
    expect(onFlag).toHaveBeenLastCalledWith(true);
    deliver(0, []);
    expect(onFlag).toHaveBeenLastCalledWith(false);
  });

  it('shows the dot for today’s order only once its delivery time has passed', () => {
    const onFlag = vi.fn();
    subscribePastDeadlineFlag('2026-11-02', onFlag);
    deliver(0, []);
    deliver(1, [openOrder('later', '2026-11-02', '14:00')]);
    expect(onFlag).toHaveBeenLastCalledWith(false);
    deliver(1, [openOrder('later', '2026-11-02', '14:00'), openOrder('late', '2026-11-02', '10:00')]);
    expect(onFlag).toHaveBeenLastCalledWith(true);
  });
});
