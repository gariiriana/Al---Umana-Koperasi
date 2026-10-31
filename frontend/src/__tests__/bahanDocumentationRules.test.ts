import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import type { MbgBahanDocumentation, MbgBahanPhotoItem } from '@/types/mbg';

// The service talks to whichever Firestore the test points it at, signed in as `uid`.
const current = vi.hoisted(() => ({ db: null as unknown as Firestore, uid: '' }));
vi.mock('@/lib/firebase', () => ({
  get db() { return current.db; },
  auth: { get currentUser() { return { uid: current.uid, email: `${current.uid}@test` }; } },
}));

const { saveBahanDocumentation, deleteBahanDocumentation, withBahanPhotos } = await import('@/services/mbgBahanService');

// ~58 KB, the average photo size found in live data on 2026-10-31.
const photo = (seed: number) => `data:image/jpeg;base64,${String(seed).padStart(4, '0')}${'A'.repeat(58 * 1024)}`;

function docData(items: MbgBahanPhotoItem[]): Omit<MbgBahanDocumentation, 'id'> {
  return {
    batchId: 'batch1', tanggal: '2026-10-31', title: 'Dokumentasi', officerName: 'Petugas',
    officerRole: 'Distribusi MBG', items, notes: '', createdAt: '2026-10-31T00:00:00Z',
    updatedAt: '2026-10-31T00:00:00Z', createdBy: 'distribusi',
  };
}

const bahan = (n: number, withPhoto = true): MbgBahanPhotoItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `item-${i}-Bahan ${i}/kg`, namaBahan: `Bahan ${i}`, kuantitas: 1, satuan: 'kg',
    ...(withPhoto ? { photoUrl: photo(i) } : {}),
  }));

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('dokumentasi bahan: simpan ke arsip', () => {
  let env: RulesTestEnvironment;
  const signIn = (uid: string) => {
    current.uid = uid;
    current.db = env.authenticatedContext(uid).firestore() as unknown as Firestore;
    return current.db;
  };

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-courier-fixes',
      firestore: { rules: readFileSync(resolve('..', 'firestore.rules'), 'utf8') },
    });
  });
  afterAll(async () => { await env?.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const store = ctx.firestore();
      await Promise.all(Object.entries({ distribusi: 'distribusi_mbg', admin: 'admin_mbg', buyer: 'pelanggan' })
        .map(([uid, role]) => setDoc(doc(store, 'users', uid), { role })));
    });
  });

  it('reproduces the bug: the old single-document layout is rejected past 1 MiB', async () => {
    const db = signIn('distribusi');
    await expect(setDoc(doc(db, 'mbg_bahan_documentation', 'old'), docData(bahan(24))))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('saves a 24-bahan batch whose photos together exceed 1 MiB', async () => {
    const db = signIn('distribusi');
    const id = await saveBahanDocumentation(docData(bahan(24)));

    const main = await getDoc(doc(db, 'mbg_bahan_documentation', id));
    expect(main.exists()).toBe(true);
    expect(JSON.stringify(main.data()).length).toBeLessThan(20_000);
    expect((await getDocs(collection(db, 'mbg_bahan_photos'))).size).toBe(24);

    const restored = await withBahanPhotos(main.data() as MbgBahanDocumentation);
    expect(restored.items.map((i) => i.photoUrl)).toEqual(bahan(24).map((i) => i.photoUrl));
  });

  it('rewrites only changed photos and deletes removed ones', async () => {
    const db = signIn('distribusi');
    const items = bahan(5);
    const id = await saveBahanDocumentation(docData(items));
    const before = await getDoc(doc(db, 'mbg_bahan_photos', 'batch1_item-1-Bahan-1-kg'));

    const edited = items.map((it, i) => (i === 0 ? { ...it, photoUrl: undefined } : i === 2 ? { ...it, photoUrl: photo(99) } : it));
    expect(await saveBahanDocumentation(docData(edited), id)).toBe(id);

    const photos = await getDocs(collection(db, 'mbg_bahan_photos'));
    expect(photos.docs.map((d) => d.id).sort()).toEqual(['batch1_item-1-Bahan-1-kg', 'batch1_item-2-Bahan-2-kg', 'batch1_item-3-Bahan-3-kg', 'batch1_item-4-Bahan-4-kg']);
    expect(photos.docs.find((d) => d.id === 'batch1_item-2-Bahan-2-kg')?.data().photoUrl).toBe(photo(99));
    const after = await getDoc(doc(db, 'mbg_bahan_photos', 'batch1_item-1-Bahan-1-kg'));
    expect(after.data()?.updatedAt).toBe(before.data()?.updatedAt);
  });

  it('moves inline photos of an old archive into the photo collection on the next save', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'mbg_bahan_documentation', 'legacy'), docData(bahan(3)));
    });
    const db = signIn('distribusi');
    const legacy = (await getDoc(doc(db, 'mbg_bahan_documentation', 'legacy'))).data() as MbgBahanDocumentation;
    const extra = { id: 'item-3-Bahan 3/kg', namaBahan: 'Bahan 3', photoUrl: photo(3) };

    expect(await saveBahanDocumentation(docData([...legacy.items, extra]), 'legacy')).toBe('legacy');
    const saved = (await getDoc(doc(db, 'mbg_bahan_documentation', 'legacy'))).data() as MbgBahanDocumentation;
    expect(saved.items.every((i) => !i.photoUrl && i.photoId)).toBe(true);
    expect((await getDocs(collection(db, 'mbg_bahan_photos'))).size).toBe(4);
  });

  it('archives the photos together with the documentation when it is deleted', async () => {
    const db = signIn('distribusi');
    const id = await saveBahanDocumentation(docData(bahan(3)));
    await deleteBahanDocumentation(id);
    expect((await getDoc(doc(db, 'mbg_bahan_documentation', id))).exists()).toBe(false);
    expect((await getDocs(collection(db, 'mbg_bahan_photos'))).size).toBe(0);
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDocs(collection(ctx.firestore(), 'developer_recycle_bin'))).size).toBe(4);
    });
  });

  it('keeps non-MBG accounts out of the photo collection', async () => {
    signIn('distribusi');
    await saveBahanDocumentation(docData(bahan(1)));
    const buyer = signIn('buyer');
    await assertFails(getDocs(collection(buyer, 'mbg_bahan_photos')));
    await assertFails(setDoc(doc(buyer, 'mbg_bahan_photos', 'batch1_x'), { batchId: 'batch1', photoUrl: 'x' }));
  });
});
