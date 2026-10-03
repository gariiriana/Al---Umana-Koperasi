import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

// Run with `npm run test:rules` inside the Firebase emulator; ordinary unit tests skip this suite.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('courier Firestore authorization', () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'demo-courier-fixes',
      firestore: { rules: readFileSync(resolve('..', 'firestore.rules'), 'utf8') },
    });
  });
  afterAll(async () => { await environment?.cleanup(); });
  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all(Object.entries({ courier: 'kurir', alias: 'kurir_katering', other: 'kurir', mbg: 'kurir_mbg', assistant: 'kurir_mbg', distribution: 'distribusi' })
        .map(([uid, role]) => setDoc(doc(db, 'users', uid), { role })));
      await Promise.all([
        setDoc(doc(db, 'orders', 'mine'), { assignedCourierId: 'courier', customerId: 'customer', status: 'READY_TO_DELIVER', totalAmount: 100 }),
        setDoc(doc(db, 'orders', 'other'), { assignedCourierId: 'other', customerId: 'customer', status: 'READY_TO_DELIVER', totalAmount: 100 }),
        setDoc(doc(db, 'orders', 'alias'), { assignedCourierId: 'alias', customerId: 'customer', status: 'READY_TO_DELIVER' }),
        setDoc(doc(db, 'mbg_pm_batches', 'batch'), { productionCookingStatus: 'cooked', status: 'DISTRIBUTED' }),
        setDoc(doc(db, 'mbg_delivery_tasks', 'task'), { batchId: 'batch', petugasId: 'mbg', kenekId: 'assistant', status: 'waiting', handoverPhotoId: '' }),
        setDoc(doc(db, 'mbg_daily_reports', 'report'), { batchId: 'batch', inspectionForm: {}, updatedAt: '', cookingStatus: 'cooked' }),
      ]);
    });
  });
  const dbFor = (uid: string) => environment.authenticatedContext(uid).firestore();

  it('allows only the courier-owned order query and rejects unfiltered reads', async () => {
    const db = dbFor('courier');
    await assertSucceeds(getDoc(doc(db, 'orders', 'mine')));
    await assertFails(getDoc(doc(db, 'orders', 'other')));
    await assertFails(getDocs(collection(db, 'orders')));
    const result = await assertSucceeds(getDocs(query(collection(db, 'orders'), where('assignedCourierId', '==', 'courier'))));
    expect(result.size).toBe(1);
  });
  it('blocks courier edits to financial fields or other couriers orders', async () => {
    const db = dbFor('courier');
    await assertFails(updateDoc(doc(db, 'orders', 'mine'), { totalAmount: 0 }));
    await assertFails(updateDoc(doc(db, 'orders', 'other'), { status: 'COMPLETED' }));
    await assertFails(setDoc(doc(db, 'orders', 'new'), { customerId: 'someone-else' }));
    await assertFails(updateDoc(doc(dbFor('mbg'), 'orders', 'mine'), { totalAmount: 0 }));
  });
  it('accepts legitimate dispatch and proof completion but rejects skipping evidence', async () => {
    const reference = doc(dbFor('courier'), 'orders', 'mine');
    await assertFails(updateDoc(reference, { status: 'COMPLETED' }));
    await assertSucceeds(updateDoc(reference, { status: 'OUT_FOR_DELIVERY', deliveryStartedAt: new Date(), kitchenSignatures: [{ staffName: 'Dapur', photoFileIds: ['a', 'b'] }], updatedAt: new Date() }));
    await assertFails(updateDoc(reference, { status: 'COMPLETED', proofFileIds: [] }));
    await assertSucceeds(updateDoc(reference, { status: 'COMPLETED', proofFileIds: ['photo', 'signature'], deliveryProofPhotos: [{ fileId: 'photo', description: '' }], deliveredAt: new Date(), updatedAt: new Date() }));
  });
  it('allows sick reports and distribution reassignment', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('courier'), 'orders', 'mine'), { assignedCourierId: '', courierSickReported: true, courierSickRemark: 'Sakit', updatedAt: new Date() }));
    await assertSucceeds(updateDoc(doc(dbFor('distribution'), 'orders', 'mine'), { assignedCourierId: 'other' }));
  });
  it('supports existing kurir_katering accounts', async () => {
    await assertSucceeds(getDoc(doc(dbFor('alias'), 'orders', 'alias')));
    await assertFails(getDoc(doc(dbFor('alias'), 'orders', 'mine')));
  });
  it('lets assistants write their own GPS identity and rejects impersonating the driver', async () => {
    await assertSucceeds(setDoc(doc(dbFor('assistant'), 'courier_locations', 'batch_assistant'), { courierId: 'assistant', orderId: 'batch', latitude: -6, longitude: 106 }));
    await assertFails(setDoc(doc(dbFor('assistant'), 'courier_locations', 'batch_mbg'), { courierId: 'mbg', orderId: 'batch', latitude: -6, longitude: 106 }));
  });
  it('allows courier checklist sync without permitting production edits', async () => {
    const reference = doc(dbFor('mbg'), 'mbg_daily_reports', 'report');
    await assertSucceeds(updateDoc(reference, { inspectionForm: { officerName: 'Kurir', rows: [] }, updatedAt: 'now' }));
    await assertFails(updateDoc(reference, { cookingStatus: 'cooking' }));
    await assertFails(setDoc(doc(dbFor('mbg'), 'mbg_daily_reports', 'new'), { batchId: 'batch' }));
  });
  it('enforces MBG task ownership and handover before departure', async () => {
    const reference = doc(dbFor('mbg'), 'mbg_delivery_tasks', 'task');
    await assertFails(updateDoc(doc(dbFor('other'), 'mbg_delivery_tasks', 'task'), { status: 'handover_done', handoverPhotoId: 'photo' }));
    await assertFails(updateDoc(reference, { status: 'delivering' }));
    await assertSucceeds(updateDoc(reference, { status: 'handover_done', handoverPhotoId: 'photo' }));
    await assertSucceeds(updateDoc(reference, { status: 'delivering' }));
  });
  it('requires finished production before the assigned courier can finalize an MBG task', async () => {
    const reference = doc(dbFor('mbg'), 'mbg_delivery_tasks', 'task');
    await assertFails(updateDoc(reference, { status: 'delivered', completedAt: 'now' }));
    await assertSucceeds(updateDoc(reference, { status: 'handover_done', handoverPhotoId: 'photo' }));
    await assertSucceeds(updateDoc(reference, { status: 'delivering' }));
    await environment.withSecurityRulesDisabled((context) => updateDoc(doc(context.firestore(), 'mbg_pm_batches', 'batch'), { productionCookingStatus: 'cooking' }));
    await assertFails(updateDoc(reference, { status: 'delivered', completedAt: 'now' }));
    await environment.withSecurityRulesDisabled((context) => updateDoc(doc(context.firestore(), 'mbg_pm_batches', 'batch'), { productionCookingStatus: 'cooked' }));
    await assertSucceeds(updateDoc(reference, { status: 'delivered', completedAt: 'now', updatedAt: 'now' }));
  });
});
