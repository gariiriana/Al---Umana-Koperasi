// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';

const fake = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), nextId: 0 }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'owner' } } }));
vi.mock('@/services/flowNotifications', () => ({ notifyTaskAssigned: vi.fn(), notifyTaskSubmitted: vi.fn() }));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
    doc: (_db: unknown, ...parts: string[]) => parts.length ? { path: parts.join('/') } : { id: String(++fake.nextId).padStart(20, 'a') },
    setDoc: async (ref: { path: string }, data: Record<string, unknown>) => { fake.docs.set(ref.path, data); },
    getDoc: async (ref: { path: string }) => ({ exists: () => fake.docs.has(ref.path), get: (key: string) => fake.docs.get(ref.path)?.[key] }),
    runTransaction: async (_db: unknown, callback: (tx: unknown) => unknown) => callback({
      get: async (ref: { path: string }) => ({ exists: () => fake.docs.has(ref.path), data: () => fake.docs.get(ref.path) }),
      update: (ref: { path: string }, data: Record<string, unknown>) => fake.docs.set(ref.path, { ...fake.docs.get(ref.path), ...data }),
    }),
  };
});

import { Bytes } from 'firebase/firestore';
import { loadEvidenceOriginal, submitAdHocTask, uploadEvidenceOriginal } from '@/services/performanceService';
import { EVIDENCE_CHUNK_BYTES } from '@/utils/evidencePhoto';

beforeEach(() => { fake.docs.clear(); fake.nextId = 0; });

it('keeps concurrent multi-chunk uploads separate and submits the selected original', async () => {
  const a = new Uint8Array(EVIDENCE_CHUNK_BYTES + 10).fill(17);
  const b = new Uint8Array(EVIDENCE_CHUNK_BYTES + 20).fill(29);
  const [first, second] = await Promise.all([
    uploadEvidenceOriginal('task', new File([a], 'a.jpg', { type: 'image/jpeg' })),
    uploadEvidenceOriginal('task', new File([b], 'b.jpg', { type: 'image/jpeg' })),
  ]);
  expect(first.uploadId).not.toBe(second.uploadId);
  for (const [original, bytes] of [[first, a], [second, b]] as const) {
    const blob = await loadEvidenceOriginal({ id: 'task', evidencePhotoChunks: original.chunks, evidencePhotoUploadId: original.uploadId });
    expect(Buffer.from(await blob.arrayBuffer()).equals(bytes)).toBe(true);
  }
  fake.docs.set('ad_hoc_tasks/task', { assigneeId: 'owner', title: 'Task' });
  await submitAdHocTask('task', 'Selesai', undefined, first);
  expect(fake.docs.get('ad_hoc_tasks/task')?.evidencePhotoUploadId).toBe(first.uploadId);
  await expect(submitAdHocTask('task', 'Lagi', undefined, second)).rejects.toThrow('sudah disubmit');
});

it('still reads originals saved with legacy numeric chunk IDs', async () => {
  fake.docs.set('ad_hoc_tasks/old/evidence_chunks/0', { data: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])) });
  const blob = await loadEvidenceOriginal({ id: 'old', evidencePhotoChunks: 1 });
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
});
