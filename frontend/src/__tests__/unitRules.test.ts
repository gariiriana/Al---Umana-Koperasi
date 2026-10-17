import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

// Run with `npm run test:rules` inside the Firebase emulator; ordinary unit tests skip this suite.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('unit usaha: Kepala Unit hanya mengelola timnya sendiri', () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'demo-courier-fixes',
      firestore: { rules: readFileSync(resolve('..', 'firestore.rules'), 'utf8') },
    });
  });
  afterAll(async () => { await environment?.cleanup(); });

  const deadline = '2026-12-31T17:00';
  const pending = (assigneeId: string, unitId: string | null, createdBy: string) => ({
    assigneeId, assigneeNameSnapshot: assigneeId, roleSnapshot: 'tim_unit', divisionSnapshot: unitId ? 'unit' : 'katering',
    ...(unitId ? { unitId } : {}), title: 'Rekap stok', instructions: 'Hitung stok', deadline, createdBy, status: 'pending',
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const users: Record<string, Record<string, unknown>> = {
        prianka: { role: 'kepala_unit', unitId: 'fish_n_kids', unitIds: [] },
        inas: { role: 'tim_unit', unitIds: ['fish_n_kids'] },
        mahdi: { role: 'kepala_unit', unitId: 'kasma_tani', unitIds: [] },
        fuza: { role: 'tim_unit', unitIds: ['kasma_tani'] },
        // Kepala Toko Santri sekaligus anggota Kasma Tailor.
        nabila: { role: 'kepala_unit', unitId: 'toko_santri', unitIds: ['kasma_tailor'] },
        indah: { role: 'kepala_unit', unitId: 'kasma_tailor', unitIds: [] },
        // Anggota dua unit.
        raipasha: { role: 'tim_unit', unitIds: ['toko_santri', 'kasma_tailor'] },
        boss: { role: 'super_admin' },
        joko: { role: 'produksi_1' },
        dev: { role: 'developer' },
        dok: { role: 'dokumentasi_produksiMBG' },
        budi: { role: 'pelanggan' },
      };
      await Promise.all(Object.entries(users).map(([uid, data]) => setDoc(doc(db, 'users', uid), data)));
      await Promise.all([
        setDoc(doc(db, 'ad_hoc_tasks', 't_inas'), pending('inas', 'fish_n_kids', 'prianka')),
        setDoc(doc(db, 'ad_hoc_tasks', 't_fuza'), pending('fuza', 'kasma_tani', 'mahdi')),
        setDoc(doc(db, 'ad_hoc_tasks', 't_rai_tailor'), pending('raipasha', 'kasma_tailor', 'indah')),
        setDoc(doc(db, 'ad_hoc_tasks', 't_rai_santri'), pending('raipasha', 'toko_santri', 'nabila')),
        setDoc(doc(db, 'ad_hoc_tasks', 't_nabila'), pending('nabila', 'kasma_tailor', 'indah')),
        setDoc(doc(db, 'ad_hoc_tasks', 't_joko'), pending('joko', null, 'boss')),
        setDoc(doc(db, 'ad_hoc_tasks', 't_inas', 'evidence_chunks', '0'), { index: 0, total: 1, uploadedBy: 'inas' }),
      ]);
    });
  });

  const dbAs = (uid: string) => environment.authenticatedContext(uid).firestore();
  const membersOf = (uid: string, unitId: string) =>
    getDocs(query(collection(dbAs(uid), 'users'), where('unitIds', 'array-contains', unitId)));
  const unitTasks = (uid: string, unitId: string) =>
    getDocs(query(collection(dbAs(uid), 'ad_hoc_tasks'), where('unitId', '==', unitId)));
  const giveTask = (uid: string, id: string, data: Record<string, unknown>) =>
    setDoc(doc(dbAs(uid), 'ad_hoc_tasks', id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const notify = (uid: string, recipientId: string) => setDoc(doc(collection(dbAs(uid), 'notifications')), {
    recipientId, type: 'task', title: 'T', titleEn: 'T', message: 'M', messageEn: 'M',
    actorRole: 'kepala_unit', actorUid: uid, read: false, pushStatus: 'pending', createdAt: serverTimestamp(),
  });

  it('Kepala Unit membaca profil anggota unitnya saja', async () => {
    await assertSucceeds(membersOf('prianka', 'fish_n_kids'));
    await assertSucceeds(membersOf('indah', 'kasma_tailor'));
    await assertFails(membersOf('prianka', 'kasma_tani'));
    await assertFails(getDocs(collection(dbAs('prianka'), 'users')));
    await assertSucceeds(getDoc(doc(dbAs('prianka'), 'users', 'inas')));
    await assertFails(getDoc(doc(dbAs('prianka'), 'users', 'fuza')));
    await assertFails(membersOf('inas', 'fish_n_kids'));
  });

  it('Kepala Unit hanya membaca task unit yang dipimpinnya', async () => {
    await assertSucceeds(unitTasks('prianka', 'fish_n_kids'));
    await assertFails(unitTasks('prianka', 'kasma_tani'));
    await assertFails(getDocs(collection(dbAs('prianka'), 'ad_hoc_tasks')));
    await assertSucceeds(getDoc(doc(dbAs('prianka'), 'ad_hoc_tasks', 't_inas')));
    await assertFails(getDoc(doc(dbAs('prianka'), 'ad_hoc_tasks', 't_fuza')));
    await assertFails(getDoc(doc(dbAs('prianka'), 'ad_hoc_tasks', 't_joko')));
    // Nabila memimpin Toko Santri; di Kasma Tailor ia hanya anggota.
    await assertSucceeds(unitTasks('nabila', 'toko_santri'));
    await assertFails(unitTasks('nabila', 'kasma_tailor'));
    await assertSucceeds(getDocs(query(collection(dbAs('nabila'), 'ad_hoc_tasks'), where('assigneeId', '==', 'nabila'))));
  });

  it('Kepala Unit memberi task hanya ke anggota unitnya, atas nama unitnya', async () => {
    await assertSucceeds(giveTask('prianka', 'n1', pending('inas', 'fish_n_kids', 'prianka')));
    await assertFails(giveTask('prianka', 'n2', pending('fuza', 'fish_n_kids', 'prianka')));
    await assertFails(giveTask('prianka', 'n3', pending('fuza', 'kasma_tani', 'prianka')));
    await assertFails(giveTask('prianka', 'n4', pending('inas', null, 'prianka')));
    await assertFails(giveTask('prianka', 'n5', pending('inas', 'fish_n_kids', 'boss')));
    await assertFails(giveTask('prianka', 'n6', { ...pending('inas', 'fish_n_kids', 'prianka'), submittedAt: serverTimestamp() }));
    // Anggota dua unit menerima task dari kedua Kepala Unit, masing-masing atas nama unitnya.
    await assertSucceeds(giveTask('indah', 'n7', pending('raipasha', 'kasma_tailor', 'indah')));
    await assertSucceeds(giveTask('nabila', 'n8', pending('raipasha', 'toko_santri', 'nabila')));
    await assertFails(giveTask('indah', 'n9', pending('raipasha', 'toko_santri', 'indah')));
    await assertSucceeds(giveTask('indah', 'n10', pending('nabila', 'kasma_tailor', 'indah')));
    await assertFails(giveTask('nabila', 'n11', pending('nabila', 'toko_santri', 'nabila')));
    await assertFails(giveTask('inas', 'n12', pending('inas', 'fish_n_kids', 'inas')));
    // Super Admin tetap bisa memberi task ke staf koperasi.
    await assertSucceeds(giveTask('boss', 'n13', pending('joko', null, 'boss')));
  });

  it('Tim Unit hanya membaca dan men-submit task miliknya', async () => {
    const submit = (uid: string, id: string) => updateDoc(doc(dbAs(uid), 'ad_hoc_tasks', id), {
      status: 'submitted', evidenceNote: 'Sudah', submittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await assertSucceeds(getDocs(query(collection(dbAs('inas'), 'ad_hoc_tasks'), where('assigneeId', '==', 'inas'))));
    await assertFails(getDoc(doc(dbAs('inas'), 'ad_hoc_tasks', 't_fuza')));
    await assertFails(submit('fuza', 't_inas'));
    await assertFails(updateDoc(doc(dbAs('prianka'), 'ad_hoc_tasks', 't_inas'), { deadline: '2027-01-01T17:00' }));
    await assertSucceeds(submit('inas', 't_inas'));
    await assertSucceeds(submit('nabila', 't_nabila'));
  });

  it('Kepala Unit melihat foto bukti task unitnya saja', async () => {
    await assertSucceeds(getDoc(doc(dbAs('prianka'), 'ad_hoc_tasks', 't_inas', 'evidence_chunks', '0')));
    await assertFails(getDoc(doc(dbAs('mahdi'), 'ad_hoc_tasks', 't_inas', 'evidence_chunks', '0')));
  });

  it('notifikasi task hanya antara Kepala Unit dan timnya', async () => {
    await assertSucceeds(notify('prianka', 'inas'));
    await assertSucceeds(notify('inas', 'prianka'));
    await assertSucceeds(notify('raipasha', 'indah'));
    await assertSucceeds(notify('raipasha', 'nabila'));
    await assertSucceeds(notify('nabila', 'indah'));
    await assertFails(notify('prianka', 'fuza'));
    await assertFails(notify('inas', 'mahdi'));
    await assertFails(notify('inas', 'fuza'));
    await assertFails(notify('inas', 'super_admin'));
    await assertFails(notify('prianka', 'mo_katering'));
  });

  // Rantai helper staf mahal; jalur terpanjang (developer, role MBG di ujung
  // rantai) harus tetap di bawah batas 1000 ekspresi rules.
  it('notifikasi staf, developer, dan pelanggan tetap seperti sebelumnya', async () => {
    await assertSucceeds(notify('joko', 'mo_katering'));
    await assertSucceeds(notify('boss', 'inas'));
    await assertSucceeds(notify('dev', 'mo_katering'));
    await assertSucceeds(notify('dok', 'admin_mbg'));
    await assertSucceeds(notify('budi', 'admin'));
    await assertSucceeds(notify('budi', 'budi'));
    await assertSucceeds(notify('inas', 'inas'));
    await assertFails(notify('budi', 'mo_katering'));
  });

  it('akun unit tidak mendapat akses staf koperasi', async () => {
    await assertFails(updateDoc(doc(dbAs('prianka'), 'users', 'inas'), { role: 'super_admin' }));
    await assertFails(updateDoc(doc(dbAs('prianka'), 'users', 'prianka'), { unitId: 'kasma_tani' }));
    await assertFails(getDocs(collection(dbAs('prianka'), 'orders')));
    await assertFails(getDocs(collection(dbAs('inas'), 'catering_jobdesks')));
  });

  it('pendaftar baru tidak bisa memasukkan diri ke unit', async () => {
    const register = (data: Record<string, unknown>) => setDoc(
      doc(environment.authenticatedContext('baru', { email: 'baru@mail.com' }).firestore(), 'users', 'baru'),
      { email: 'baru@mail.com', displayName: 'Baru', role: 'pelanggan', ...data });
    await assertFails(register({ unitIds: ['fish_n_kids'] }));
    await assertFails(register({ unitId: 'fish_n_kids' }));
    await assertFails(register({ unitPositions: { fish_n_kids: 'anggota_utama' } }));
    await assertSucceeds(register({}));
  });

  it('Super Admin tetap membaca semua task dan profil', async () => {
    await assertSucceeds(getDocs(collection(dbAs('boss'), 'ad_hoc_tasks')));
    await assertSucceeds(getDocs(collection(dbAs('boss'), 'users')));
  });
});
