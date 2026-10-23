import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, increment, query, setDoc, updateDoc, where } from 'firebase/firestore';

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('security boundaries', () => {
  let env: RulesTestEnvironment;
  const db = (uid: string) => env.authenticatedContext(uid).firestore();
  beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-courier-fixes', firestore: { rules: readFileSync(resolve('..', 'firestore.rules'), 'utf8') } }); });
  afterAll(async () => { await env?.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const store = ctx.firestore();
      await Promise.all([
        ...Object.entries({ buyer: 'pelanggan', other: 'pelanggan', watcher: 'monitoring', production: 'produksi_1', admin: 'admin', mo: 'mo_katering', mbg: 'produksi_mbg', courier: 'kurir' }).map(([uid, role]) => setDoc(doc(store, 'users', uid), { role })),
        setDoc(doc(store, 'inventory', 'food'), { quantity: 10 }),
        setDoc(doc(store, 'orders', 'pending'), { customerId: 'buyer', status: 'AWAITING_PAYMENT_PROOF', paymentStatus: 'awaiting_proof', totalPrice: 10000 }),
        setDoc(doc(store, 'orders', 'b2b'), { customerId: 'buyer', status: 'CONFIRMED', paymentStatus: 'BELUM_DIBAYAR', totalPrice: 50000 }),
        setDoc(doc(store, 'orders', 'done'), { customerId: 'buyer', status: 'COMPLETED' }),
        setDoc(doc(store, 'payment_proofs', 'proof'), { uploadedBy: 'buyer', orderId: 'pending', status: 'completed' }),
        setDoc(doc(store, 'payment_proofs', 'foreign'), { uploadedBy: 'other', orderId: 'pending', status: 'completed' }),
        setDoc(doc(store, 'payment_proofs', 'unfinished'), { uploadedBy: 'buyer', orderId: 'pending', status: 'uploading' }),
      ]);
    });
  });

  // Mirrors the document createOrder() writes from the storefront checkout.
  const checkout = (paymentMethod: string, extra: Record<string, unknown> = {}) => ({
    customerId: 'buyer', customerName: 'Buyer', deliveryAddress: 'Jl. Pesantren', deliveryTime: '2026-10-24 12:00',
    items: [{ itemId: 'food', itemName: 'Nasi', quantity: 1, price: 8000 }], paymentMethod, promoCode: '', discountAmount: 0,
    createdAt: new Date(), updatedAt: new Date(),
    ...(paymentMethod === 'cod' ? { status: 'CONFIRMED' } : { status: 'AWAITING_PAYMENT_PROOF', paymentStatus: 'awaiting_proof' }),
    ...extra,
  });

  it('accepts the storefront checkout document and rejects forged payment state', async () => {
    const place = (id: string, data: Record<string, unknown>, uid = 'buyer') => setDoc(doc(db(uid), 'orders', id), data);
    await assertSucceeds(place('cod', checkout('cod')));
    await assertSucceeds(place('transfer', checkout('bank_transfer')));
    await assertSucceeds(place('wallet', checkout('e_wallet')));
    await assertFails(place('forged', { customerId: 'buyer', status: 'CONFIRMED', paymentStatus: 'approved' }));
    await assertFails(place('paid-transfer', checkout('bank_transfer', { status: 'CONFIRMED' })));
    await assertFails(place('approved', checkout('bank_transfer', { paymentStatus: 'approved' })));
    await assertFails(place('cod-paid', checkout('cod', { paymentStatus: 'SUDAH_DIBAYAR' })));
    await assertFails(place('priced', checkout('cod', { totalPrice: 1 })));
    await assertFails(place('validated', checkout('cod', { manualValidation: { validatedBy: 'buyer' } })));
    await assertFails(place('invoice', checkout('cod', { invoiceToken: 'x' })));
    await assertFails(place('negative', checkout('cod', { discountAmount: -5000 })));
    await assertFails(place('empty', checkout('cod', { items: [] })));
    await assertFails(place('someone-else', checkout('cod', { customerId: 'other' })));
    await assertFails(place('by-production', checkout('cod'), 'production'));
  });

  it('denies forged payment approval and stock changes', async () => {
    await assertFails(updateDoc(doc(db('buyer'), 'inventory', 'food'), { quantity: increment(-1) }));
    await assertFails(updateDoc(doc(db('buyer'), 'orders', 'pending'), { paymentStatus: 'approved' }));
    await assertFails(updateDoc(doc(db('production'), 'orders', 'pending'), { paymentStatus: 'approved' }));
    await assertFails(updateDoc(doc(db('production'), 'orders', 'pending'), { status: 'CONFIRMED' }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'orders', 'pending'), { paymentStatus: 'approved' }));
  });

  it('leaves B2B payment status and manual validation to admins', async () => {
    await assertFails(updateDoc(doc(db('mo'), 'orders', 'b2b'), { paymentStatus: 'SUDAH_DIBAYAR' }));
    await assertFails(updateDoc(doc(db('mo'), 'orders', 'b2b'), { manualValidation: { validatedBy: 'mo' } }));
    await assertSucceeds(updateDoc(doc(db('mo'), 'orders', 'b2b'), { adminComplaintNotes: 'Komplain porsi' }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'orders', 'b2b'), { paymentStatus: 'SUDAH_DIBAYAR' }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'orders', 'b2b'), { manualValidation: { validatedBy: 'admin' } }));
  });

  it('keeps MBG roles out of catering orders', async () => {
    await assertFails(getDoc(doc(db('mbg'), 'orders', 'b2b')));
    await assertFails(getDocs(collection(db('mbg'), 'orders')));
    await assertFails(updateDoc(doc(db('mbg'), 'orders', 'b2b'), { adminComplaintNotes: 'x' }));
  });

  it('grants monitoring read-only access to orders and staff profiles only', async () => {
    await assertSucceeds(getDocs(collection(db('watcher'), 'orders')));
    await assertFails(updateDoc(doc(db('watcher'), 'orders', 'pending'), { status: 'COMPLETED' }));
    await assertFails(getDocs(collection(db('buyer'), 'orders')));
    await assertSucceeds(getDocs(query(collection(db('watcher'), 'users'), where('role', 'in', ['kurir', 'kurir_katering']))));
    await assertFails(getDocs(query(collection(db('watcher'), 'users'), where('role', '==', 'pelanggan'))));
    await assertFails(getDocs(collection(db('watcher'), 'users')));
  });

  it('allows only the owner of a completed order to post or edit its review', async () => {
    const review = { orderId: 'done', customerId: 'buyer', customerName: 'Buyer', rating: 5, review: 'Bagus', createdAt: new Date() };
    await assertSucceeds(updateDoc(doc(db('buyer'), 'orders', 'done'), { rating: 5, review: 'Bagus' }));
    await assertFails(setDoc(doc(db('buyer'), 'reviews', 'done'), { ...review, createdAt: new Date('2099-01-01') }));
    await assertSucceeds(setDoc(doc(db('buyer'), 'reviews', 'done'), review));
    await assertSucceeds(updateDoc(doc(db('buyer'), 'reviews', 'done'), { rating: 4, createdAt: new Date() }));
    await assertFails(updateDoc(doc(db('other'), 'reviews', 'done'), { rating: 1 }));
    await assertFails(setDoc(doc(db('other'), 'reviews', 'done'), { ...review, customerId: 'other' }));
    await assertFails(setDoc(doc(db('buyer'), 'reviews', 'pending'), { ...review, orderId: 'pending' }));
    await assertFails(updateDoc(doc(db('buyer'), 'reviews', 'done'), { rating: 99 }));
  });

  it('allows owned completed proofs, rejects foreign or unfinished proofs, and freezes evidence', async () => {
    const submit = (id: string) => updateDoc(doc(db('buyer'), 'orders', 'pending'), { status: 'AWAITING_PAYMENT_APPROVAL', paymentStatus: 'awaiting_approval', paymentProofFileId: `payment_proofs/${id}` });
    await assertFails(submit('foreign'));
    await assertFails(submit('unfinished'));
    await assertSucceeds(submit('proof'));
    await assertFails(updateDoc(doc(db('buyer'), 'payment_proofs', 'proof'), { status: 'uploading' }));
    await assertFails(setDoc(doc(db('buyer'), 'payment_proofs', 'proof', 'chunks', '0'), { data: 'changed' }));
    await assertFails(setDoc(doc(db('buyer'), 'payment_proofs', 'instant'), { uploadedBy: 'buyer', orderId: 'pending', status: 'completed' }));
    await assertSucceeds(setDoc(doc(db('buyer'), 'payment_proofs', 'fresh'), { uploadedBy: 'buyer', orderId: 'pending', status: 'uploading' }));
  });
});
