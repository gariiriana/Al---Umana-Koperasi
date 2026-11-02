import { beforeEach, describe, expect, it, vi } from 'vitest';

type Clause = { type: string; field: string; value?: unknown };
type Snap = { docs: Array<{ id: string; data: () => Record<string, unknown> }> };

const fake = vi.hoisted(() => ({
  listeners: [] as Array<{ q: { clauses: Clause[] }; next: (snap: Snap) => void; error?: (e: Error) => void }>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/flowNotifications', () => ({ notifyMbgBatchStatus: vi.fn(), notifyMbgDeliveryProgress: vi.fn() }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  collection: () => ({}),
  where: (field: string, _op: string, value: unknown) => ({ type: 'where', field, value }),
  orderBy: (field: string) => ({ type: 'orderBy', field }),
  query: (_c: unknown, ...clauses: Clause[]) => ({ clauses }),
  onSnapshot: (q: { clauses: Clause[] }, next: (snap: Snap) => void, error?: (e: Error) => void) => {
    fake.listeners.push({ q, next, error });
    return () => {};
  },
}));

import { subscribeBatchDeliveryDocuments } from '@/services/mbgDeliveryService';

const reportDoc = (id: string, createdAt: string) => ({ id, data: () => ({ batchId: 'batch', createdAt }) });

beforeEach(() => { fake.listeners = []; });

describe('batch delivery reports (Distribusi)', () => {
  it('asks only for the batch, so the query needs no composite index', () => {
    subscribeBatchDeliveryDocuments('batch', vi.fn());
    expect(fake.listeners[0].q.clauses).toEqual([{ type: 'where', field: 'batchId', value: 'batch' }]);
  });

  it('lists the newest report first', () => {
    const onData = vi.fn();
    subscribeBatchDeliveryDocuments('batch', onData);
    fake.listeners[0].next({ docs: [
      reportDoc('old', '2026-10-30T08:00:00.000Z'),
      reportDoc('new', '2026-11-01T09:00:00.000Z'),
      reportDoc('mid', '2026-10-31T07:00:00.000Z'),
    ] });
    expect((onData.mock.lastCall?.[0] as { id: string }[]).map((d) => d.id)).toEqual(['new', 'mid', 'old']);
  });

  it('passes listener errors to the caller instead of leaving the screen waiting', () => {
    const onError = vi.fn();
    subscribeBatchDeliveryDocuments('batch', vi.fn(), onError);
    fake.listeners[0].error?.(new Error('failed-precondition'));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'failed-precondition' }));
  });
});
