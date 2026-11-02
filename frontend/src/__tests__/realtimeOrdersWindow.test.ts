import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { subscribeOrdersSince } from '@/services/realtimeService';

const orderDoc = (id: string, eventDate: string) => ({ id, data: () => ({ eventDate }) });

beforeEach(() => { fake.subs = []; });

describe('orders from a start date (MO job desk)', () => {
  it('asks for every order from the start date on, with no count cap that drops orders at random', () => {
    subscribeOrdersSince('2026-10-03', vi.fn());
    expect(fake.subs[0].q.clauses).toEqual([{ type: 'where', field: 'eventDate', op: '>=', value: '2026-10-03' }]);
  });

  it('lists the latest event date first', () => {
    const onData = vi.fn();
    subscribeOrdersSince('2026-10-03', onData);
    fake.subs[0].next({ docs: [orderDoc('a', '2026-10-05'), orderDoc('b', '2026-11-04'), orderDoc('c', '2026-10-20')] });
    expect((onData.mock.lastCall?.[0] as { id: string }[]).map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });
});
