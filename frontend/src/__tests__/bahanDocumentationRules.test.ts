import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
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
      await Promise.all(Object.entries({ distribusi: 'distribusi_mbg', admin: 'admin_mbg', buyer: 'pelanggan', kurir: 'kurir_mbg', distributor: 'distribusi', distribusi2: 'distribusi_2' })
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
    expect(restored.items.map((i) => i.photos?.map((p) => p.url))).toEqual(bahan(24).map((i) => [i.photoUrl]));
  });

  // Isi form persis seperti yang dimuat UI dari arsip (foto sudah terpasang).
  const reload = async (db: Firestore, id: string) =>
    withBahanPhotos((await getDoc(doc(db, 'mbg_bahan_documentation', id))).data() as MbgBahanDocumentation);

  it('rewrites only changed photos and deletes removed ones', async () => {
    const db = signIn('distribusi');
    const id = await saveBahanDocumentation(docData(bahan(5)));
    const before = await getDoc(doc(db, 'mbg_bahan_photos', 'batch1_item-1-Bahan-1-kg-1'));

    const loaded = await reload(db, id);
    const edited = loaded.items.map((it, i) =>
      i === 0 ? { ...it, photos: [] } : i === 2 ? { ...it, photos: [{ ...it.photos![0], url: photo(99) }] } : it
    );
    expect(await saveBahanDocumentation(docData(edited), id)).toBe(id);

    const photos = await getDocs(collection(db, 'mbg_bahan_photos'));
    expect(photos.docs.map((d) => d.id).sort()).toEqual(['batch1_item-1-Bahan-1-kg-1', 'batch1_item-2-Bahan-2-kg-1', 'batch1_item-3-Bahan-3-kg-1', 'batch1_item-4-Bahan-4-kg-1']);
    expect(photos.docs.find((d) => d.id === 'batch1_item-2-Bahan-2-kg-1')?.data().photoUrl).toBe(photo(99));
    const after = await getDoc(doc(db, 'mbg_bahan_photos', 'batch1_item-1-Bahan-1-kg-1'));
    expect(after.data()?.updatedAt).toBe(before.data()?.updatedAt);
  });

  it('stores several photos for one bahan and keeps their order across edits', async () => {
    const db = signIn('distribusi');
    const item = { id: 'item-0-Beras', namaBahan: 'Beras', photos: [1, 2, 3].map((n) => ({ url: photo(n), waktu: `07.0${n}` })) };
    const id = await saveBahanDocumentation(docData([item]));

    const saved = (await getDoc(doc(db, 'mbg_bahan_documentation', id))).data() as MbgBahanDocumentation;
    expect(saved.items[0].photos).toEqual([
      { photoId: 'batch1_item-0-Beras-1', waktu: '07.01' },
      { photoId: 'batch1_item-0-Beras-2', waktu: '07.02' },
      { photoId: 'batch1_item-0-Beras-3', waktu: '07.03' },
    ]);

    // Hapus foto ke-2, tambah foto baru: ID yang dilepas boleh dipakai lagi, urutan tetap.
    const loaded = await reload(db, id);
    const [p1, , p3] = loaded.items[0].photos!;
    await saveBahanDocumentation(docData([{ ...loaded.items[0], photos: [p1, p3, { url: photo(4), waktu: '07.04' }] }]), id);

    const restored = await reload(db, id);
    expect(restored.items[0].photos?.map((p) => p.url)).toEqual([photo(1), photo(3), photo(4)]);
    expect(restored.items[0].photos?.map((p) => p.photoId)).toEqual(['batch1_item-0-Beras-1', 'batch1_item-0-Beras-3', 'batch1_item-0-Beras-2']);
    expect((await getDocs(collection(db, 'mbg_bahan_photos'))).size).toBe(3);
  });

  it('keeps photos whose image has not loaded yet instead of deleting them', async () => {
    const db = signIn('distribusi');
    const id = await saveBahanDocumentation(docData(bahan(2)));
    const raw = (await getDoc(doc(db, 'mbg_bahan_documentation', id))).data() as MbgBahanDocumentation;

    // Arsip tersimpan lagi sebelum langganan foto sempat mengisi url.
    await saveBahanDocumentation(docData(raw.items), id);
    expect((await getDocs(collection(db, 'mbg_bahan_photos'))).size).toBe(2);
    expect((await reload(db, id)).items.map((i) => i.photos?.[0]?.url)).toEqual([photo(0), photo(1)]);
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
    expect(saved.items.every((i) => !i.photoUrl && !i.photoId && i.photos?.length === 1 && i.photos[0].photoId)).toBe(true);
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

  // Cek List & Dokumentasi Bahan khusus distribusimbg@ (Ustadz Dwi), kurir tidak ikut menulis.
  it('lets distributor@ (role distribusi) fill the checklist and documentation, but not distribusi_2', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'mbg_daily_reports', 'r1'), { batchId: 'batch1', totalPorsi: 100 });
    });
    const distributor = signIn('distributor');
    await assertSucceeds(setDoc(doc(distributor, 'mbg_inspection_forms', 'f2'), { batchId: 'batch1' }));
    await assertSucceeds(setDoc(doc(distributor, 'mbg_bahan_documentation', 'batch1'), { batchId: 'batch1' }));
    await assertSucceeds(setDoc(doc(distributor, 'mbg_bahan_photos', 'batch1_p'), { batchId: 'batch1', photoUrl: 'x' }));
    await assertSucceeds(updateDoc(doc(distributor, 'mbg_daily_reports', 'r1'), { inspectionForm: { rows: [] }, updatedAt: 'now' }));
    await assertFails(updateDoc(doc(distributor, 'mbg_daily_reports', 'r1'), { totalPorsi: 1 }));
    await assertFails(setDoc(doc(distributor, 'mbg_daily_reports', 'r2'), { batchId: 'batch1' }));
    const distribusi2 = signIn('distribusi2');
    await assertFails(setDoc(doc(distribusi2, 'mbg_inspection_forms', 'f3'), { batchId: 'batch1' }));
  });

  it('blocks MBG couriers from writing bahan documentation and checklists', async () => {
    const kurir = signIn('kurir');
    await assertFails(setDoc(doc(kurir, 'mbg_bahan_photos', 'batch1_k'), { batchId: 'batch1', photoUrl: 'x' }));
    await assertFails(setDoc(doc(kurir, 'mbg_bahan_documentation', 'batch1'), { batchId: 'batch1' }));
    await assertFails(setDoc(doc(kurir, 'mbg_inspection_forms', 'f1'), { batchId: 'batch1' }));
    const dwi = signIn('distribusi');
    await assertSucceeds(setDoc(doc(dwi, 'mbg_inspection_forms', 'f1'), { batchId: 'batch1' }));
    await assertSucceeds(setDoc(doc(dwi, 'mbg_bahan_photos', 'batch1_d'), { batchId: 'batch1', photoUrl: 'x' }));
  });
});
