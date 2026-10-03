import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal in-memory Firestore: enough for the batch/entry flows under test.
type Ref = { col: string; id: string; path: string };
type Data = Record<string, unknown>;

const fake = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  autoId: 0,
  failNextCommit: false,
  beforeTransaction: null as null | (() => void),
}));

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } } }));
vi.mock('@/services/subscriptionManager', () => ({ subscriptionManager: { subscribe: vi.fn() } }));

vi.mock('@/services/developerRecycleBinService', () => ({
  archiveAndDelete: vi.fn(async (ref: Ref) => fake.store.delete(ref.path)),
  archiveSnapshotsAndDelete: vi.fn(async (snaps: { ref: Ref }[]) => {
    snaps.forEach((s) => fake.store.delete(s.ref.path));
    return snaps.length;
  }),
  stageArchiveAndDelete: vi.fn(async (batch: { delete: (ref: Ref) => void }, snaps: { ref: Ref }[]) => {
    snaps.forEach((s) => batch.delete(s.ref));
    return snaps.length;
  }),
}));

vi.mock('firebase/firestore', () => {
  const ref = (col: string, id: string): Ref => ({ col, id, path: `${col}/${id}` });
  const snap = (r: Ref) => ({
    id: r.id,
    ref: r,
    exists: () => fake.store.has(r.path),
    data: () => fake.store.get(r.path),
  });
  let txChain: Promise<unknown> = Promise.resolve();
  return {
    collection: (_db: unknown, col: string) => ({ col }),
    doc: (parent: { col?: string }, col?: string, id?: string) =>
      typeof col === 'string' ? ref(col, id as string) : ref(parent.col as string, `auto${++fake.autoId}`),
    query: (c: { col: string }, ...clauses: { field: string; value: unknown }[]) => ({ col: c.col, clauses }),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    getDocs: async (q: { col: string; clauses: { field: string; value: unknown }[] }) => {
      const docs = [...fake.store.entries()]
        .filter(([path, data]) => path.startsWith(`${q.col}/`) && q.clauses.every((c) => data[c.field] === c.value))
        .map(([path]) => snap(ref(q.col, path.slice(q.col.length + 1))));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    getDoc: async (r: Ref) => snap(r),
    updateDoc: async (r: Ref, data: Data) => {
      fake.store.set(r.path, { ...fake.store.get(r.path), ...data });
    },
    addDoc: async (c: { col: string }, data: Data) => {
      const r = ref(c.col, `auto${++fake.autoId}`);
      fake.store.set(r.path, data);
      return r;
    },
    setDoc: async (r: Ref, data: Data) => fake.store.set(r.path, data),
    deleteDoc: async (r: Ref) => fake.store.delete(r.path),
    deleteField: () => undefined,
    onSnapshot: vi.fn(),
    writeBatch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (r: Ref, data: Data) => ops.push(() => fake.store.set(r.path, data)),
        update: (r: Ref, data: Data) => ops.push(() => fake.store.set(r.path, { ...fake.store.get(r.path), ...data })),
        delete: (r: Ref) => ops.push(() => fake.store.delete(r.path)),
        commit: async () => {
          if (fake.failNextCommit) {
            fake.failNextCommit = false;
            throw new Error('offline');
          }
          ops.forEach((op) => op());
        },
      };
    },
    // Transactions run one at a time, which is the outcome Firestore's
    // contention retries guarantee.
    runTransaction: (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const run = txChain.then(() => {
        fake.beforeTransaction?.();
        fake.beforeTransaction = null;
        return fn({
          get: async (r: Ref) => snap(r),
          set: (r: Ref, data: Data) => fake.store.set(r.path, data),
        });
      });
      txChain = run.catch(() => undefined);
      return run;
    },
  };
});

const {
  createBatch,
  restoreBatchFromBackup,
  restoreMultipleBatchesFromBackup,
  replaceBatchEntries,
  copyFromBatch,
} = await import('@/services/mbgAdminService');

const batchPaths = () => [...fake.store.keys()].filter((p) => p.startsWith('mbg_pm_batches/'));
const entryPaths = () => [...fake.store.keys()].filter((p) => p.startsWith('mbg_pm_entries/'));
const putBatch = (id: string, data: Data) => fake.store.set(`mbg_pm_batches/${id}`, { status: 'DRAFT', ...data });
const putEntry = (id: string, batchId: string) =>
  fake.store.set(`mbg_pm_entries/${id}`, { batchId, institutionName: id, jumlah: 10 });

beforeEach(() => {
  fake.store.clear();
  fake.autoId = 0;
  fake.failNextCommit = false;
  fake.beforeTransaction = null;
});

describe('createBatch', () => {
  it('creates a single batch when called concurrently for the same date', async () => {
    const ids = await Promise.all([
      createBatch('2026-10-03', 'u1'),
      createBatch('2026-10-03', 'u1'),
      createBatch('2026-10-03', 'u1'),
    ]);
    expect(new Set(ids).size).toBe(1);
    expect(batchPaths()).toHaveLength(1);
  });

  it('reuses the batch another user created after this one checked', async () => {
    fake.beforeTransaction = () => {
      putBatch('other', { tanggal: '2026-10-03' });
      fake.store.set('mbg_pm_batch_date_locks/2026-10-03', { batchId: 'other' });
    };
    expect(await createBatch('2026-10-03', 'u1')).toBe('other');
    expect(batchPaths()).toEqual(['mbg_pm_batches/other']);
  });

  it('creates a new batch when the date lock points at a backed-up batch', async () => {
    putBatch('old', { tanggal: '2026-10-03', isBackup: true });
    fake.store.set('mbg_pm_batch_date_locks/2026-10-03', { batchId: 'old' });
    const id = await createBatch('2026-10-03', 'u1');
    expect(id).not.toBe('old');
    expect(fake.store.get('mbg_pm_batch_date_locks/2026-10-03')).toMatchObject({ batchId: id });
  });
});

describe('restoreBatchFromBackup', () => {
  it('replaces an empty draft batch that took the date', async () => {
    putBatch('backup', { tanggal: '2026-10-03', isBackup: true, status: 'PM_SUBMITTED' });
    putEntry('e1', 'backup');
    putBatch('placeholder', { tanggal: '2026-10-03' });

    await restoreBatchFromBackup('backup');

    expect(fake.store.get('mbg_pm_batches/backup')).toMatchObject({ isBackup: false });
    expect(fake.store.has('mbg_pm_batches/placeholder')).toBe(false);
  });

  it('refuses when the date already has an active batch with data', async () => {
    putBatch('backup', { tanggal: '2026-10-03', isBackup: true });
    putBatch('active', { tanggal: '2026-10-03', status: 'PM_SUBMITTED' });
    putEntry('e1', 'active');

    await expect(restoreBatchFromBackup('backup')).rejects.toThrow(/sudah punya batch aktif/);
    expect(fake.store.get('mbg_pm_batches/backup')).toMatchObject({ isBackup: true });
    expect(fake.store.has('mbg_pm_batches/active')).toBe(true);
  });

  it('bulk restore lets only one of two same-date backups become active', async () => {
    putBatch('b1', { tanggal: '2026-10-03', isBackup: true, status: 'PM_SUBMITTED' });
    putBatch('b2', { tanggal: '2026-10-03', isBackup: true, status: 'PM_SUBMITTED' });

    const failed = await restoreMultipleBatchesFromBackup(['b1', 'b2']);

    expect(failed.map((f) => f.batchId)).toEqual(['b2']);
    expect(fake.store.get('mbg_pm_batches/b1')).toMatchObject({ isBackup: false });
    expect(fake.store.get('mbg_pm_batches/b2')).toMatchObject({ isBackup: true });
  });
});

describe('replaceBatchEntries', () => {
  it('keeps the old entries when the write fails', async () => {
    putBatch('b1', { tanggal: '2026-10-03' });
    putEntry('old1', 'b1');
    putEntry('old2', 'b1');
    fake.failNextCommit = true;

    await expect(
      replaceBatchEntries('b1', [{ batchId: 'b1', institutionName: 'Baru' } as never])
    ).rejects.toThrow('offline');
    expect(entryPaths().sort()).toEqual(['mbg_pm_entries/old1', 'mbg_pm_entries/old2']);
  });

  it('swaps old entries for new ones in one commit', async () => {
    putBatch('b1', { tanggal: '2026-10-03' });
    putEntry('old1', 'b1');

    await replaceBatchEntries('b1', [{ batchId: 'b1', institutionName: 'Baru', jumlah: 5 } as never]);

    expect(fake.store.has('mbg_pm_entries/old1')).toBe(false);
    expect(entryPaths()).toHaveLength(1);
    expect(fake.store.get('mbg_pm_batches/b1')).toMatchObject({ totalJumlah: 5, totalInstitusi: 1 });
  });
});

describe('copyFromBatch', () => {
  it('refuses to copy into a batch that already has entries', async () => {
    putBatch('src', { tanggal: '2026-10-02' });
    putEntry('s1', 'src');
    putBatch('dst', { tanggal: '2026-10-03' });
    putEntry('d1', 'dst');

    await expect(copyFromBatch('src', 'dst', 'u1')).rejects.toThrow(/sudah berisi data PM/);
    expect(entryPaths()).toHaveLength(2);
  });
});
