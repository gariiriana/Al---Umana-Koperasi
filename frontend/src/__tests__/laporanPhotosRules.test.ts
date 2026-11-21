import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const photo = (extra: Record<string, unknown> = {}) => ({
  tanggal: '2026-11-09',
  section: 'pemorsian',
  url: `data:image/jpeg;base64,${'A'.repeat(1000)}`,
  order: 1,
  createdBy: 'Dwi',
  createdAt: '2026-11-21T00:00:00Z',
  ...extra,
});

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('mbg_laporan_photos (Laporan 2 Minggu)', () => {
  let env: RulesTestEnvironment;
  const as = (uid: string) => env.authenticatedContext(uid).firestore();

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
      await Promise.all(Object.entries({ dwi: 'distribusi_mbg', wandi: 'admin_mbg', produksi: 'produksi_mbg', kurir: 'kurir_mbg', buyer: 'pelanggan' })
        .map(([uid, role]) => setDoc(doc(store, 'users', uid), { role })));
      await setDoc(doc(store, 'mbg_laporan_photos', 'ada'), photo());
    });
  });

  it('Distribusi MBG dan Admin MBG boleh menambah foto ke bagian yang dikenal', async () => {
    await assertSucceeds(addDoc(collection(as('dwi'), 'mbg_laporan_photos'), photo()));
    await assertSucceeds(addDoc(collection(as('wandi'), 'mbg_laporan_photos'), photo({ section: 'penerima' })));
  });

  it('menolak bagian asing, tanggal salah, bukan gambar, terlalu besar, atau field tambahan', async () => {
    const db = as('dwi');
    const add = (data: Record<string, unknown>) => addDoc(collection(db, 'mbg_laporan_photos'), data);
    await assertFails(add(photo({ section: 'lainnya' })));
    await assertFails(add(photo({ tanggal: '9 Nov' })));
    await assertFails(add(photo({ url: 'https://contoh.com/a.jpg' })));
    await assertFails(add(photo({ url: `data:image/jpeg;base64,${'A'.repeat(900_001)}` })));
    await assertFails(add(photo({ isPublic: true })));
  });

  it('pelanggan dan kurir tidak bisa menambah; pelanggan tidak bisa membaca', async () => {
    await assertFails(addDoc(collection(as('buyer'), 'mbg_laporan_photos'), photo()));
    await assertFails(addDoc(collection(as('kurir'), 'mbg_laporan_photos'), photo()));
    await assertFails(getDocs(collection(as('buyer'), 'mbg_laporan_photos')));
    await assertSucceeds(getDocs(collection(as('kurir'), 'mbg_laporan_photos')));
  });

  it('foto tidak bisa diubah, hanya dihapus oleh pengelola', async () => {
    await assertFails(updateDoc(doc(as('dwi'), 'mbg_laporan_photos', 'ada'), { section: 'menu' }));
    await assertFails(deleteDoc(doc(as('kurir'), 'mbg_laporan_photos', 'ada')));
    await assertSucceeds(deleteDoc(doc(as('dwi'), 'mbg_laporan_photos', 'ada')));
  });
});
