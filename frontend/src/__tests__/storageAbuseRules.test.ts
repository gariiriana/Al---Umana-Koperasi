import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

// A self-registered customer account must not be able to fill the database
// (Spark plan, 1 GiB), while every normal staff and customer flow keeps working.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('storage abuse limits', () => {
  let env: RulesTestEnvironment;
  const db = (uid: string) => env.authenticatedContext(uid).firestore();
  const piece = (size: number) => 'A'.repeat(size);

  beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-courier-fixes', firestore: { rules: readFileSync(resolve('..', 'firestore.rules'), 'utf8') } }); });
  afterAll(async () => { await env?.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const store = ctx.firestore();
      await Promise.all([
        ...Object.entries({ buyer: 'pelanggan', other: 'pelanggan', courier: 'kurir', admin: 'admin', production: 'produksi_1', watcher: 'monitoring' })
          .map(([uid, role]) => setDoc(doc(store, 'users', uid), { role })),
        setDoc(doc(store, 'orders', 'waiting'), { customerId: 'buyer', status: 'AWAITING_PAYMENT_PROOF' }),
        setDoc(doc(store, 'orders', 'paid'), { customerId: 'buyer', status: 'CONFIRMED' }),
        setDoc(doc(store, 'delivery_files', 'courierFile'), { uploadedBy: 'courier', status: 'uploading', totalChunks: 2 }),
        setDoc(doc(store, 'payment_proofs', 'proof'), { uploadedBy: 'buyer', orderId: 'waiting', status: 'uploading' }),
        setDoc(doc(store, 'carts', 'buyer', 'items', 'old'), { itemName: 'Lama', quantity: 1, price: 5000 }),
      ]);
    });
  });

  const notification = (recipientId: string, extra: Record<string, unknown> = {}) => ({
    recipientId, type: 'info', title: 'Pesanan', message: 'Ada pesanan', read: false, ...extra,
  });

  it('keeps the staff photo upload working and blocks customers from it', async () => {
    const meta = (uid: string) => ({ uploadedBy: uid, status: 'uploading', totalChunks: 3, fileName: 'a.jpg' });
    await assertSucceeds(setDoc(doc(db('courier'), 'delivery_files', 'f1'), meta('courier')));
    await assertSucceeds(setDoc(doc(db('production'), 'delivery_files', 'f2'), meta('production')));
    await assertFails(setDoc(doc(db('buyer'), 'delivery_files', 'f3'), meta('buyer')));
    await assertFails(setDoc(doc(db('courier'), 'delivery_files', 'f4'), { ...meta('courier'), totalChunks: 500 }));
  });

  it('accepts full-size chunks and rejects oversized or out-of-range ones', async () => {
    const chunk = (data: string) => ({ fileId: 'courierFile', index: 0, data });
    await assertSucceeds(setDoc(doc(db('courier'), 'delivery_files', 'courierFile', 'chunks', '0'), chunk(`data:image/jpeg;base64,${piece(699052)}`)));
    await assertSucceeds(setDoc(doc(db('courier'), 'delivery_files', 'courierFile', 'chunks', '29'), chunk(piece(10))));
    await assertFails(setDoc(doc(db('courier'), 'delivery_files', 'courierFile', 'chunks', '30'), chunk(piece(10))));
    await assertFails(setDoc(doc(db('courier'), 'delivery_files', 'courierFile', 'chunks', '1'), chunk(piece(900000))));
  });

  it('allows a payment proof only for the customer\'s own order waiting for one', async () => {
    const proof = (uid: string, orderId: string) => ({ uploadedBy: uid, orderId, status: 'uploading' });
    await assertSucceeds(setDoc(doc(db('buyer'), 'payment_proofs', 'p1'), proof('buyer', 'waiting')));
    await assertFails(setDoc(doc(db('buyer'), 'payment_proofs', 'p2'), proof('buyer', 'paid')));
    await assertFails(setDoc(doc(db('other'), 'payment_proofs', 'p3'), proof('other', 'waiting')));
    await assertFails(setDoc(doc(db('buyer'), 'payment_proofs', 'p4'), proof('buyer', 'missing')));
    await assertSucceeds(setDoc(doc(db('buyer'), 'payment_proofs', 'proof', 'chunks', '0'), { fileId: 'proof', index: 0, data: piece(1000) }));
    await assertFails(setDoc(doc(db('buyer'), 'payment_proofs', 'proof', 'chunks', '0'), { fileId: 'proof', index: 0, data: piece(900000) }));
  });

  it('keeps the cart flow working and refuses oversized or unknown fields', async () => {
    const line = { itemId: 'nasi', itemName: 'Nasi', unitPrice: 5000, quantity: 2, imageUrl: '', notes: '' };
    await assertSucceeds(setDoc(doc(db('buyer'), 'carts', 'buyer', 'items', 'nasi'), line));
    await assertSucceeds(updateDoc(doc(db('buyer'), 'carts', 'buyer', 'items', 'nasi'), { quantity: 3, notes: 'pedas' }));
    await assertSucceeds(updateDoc(doc(db('buyer'), 'carts', 'buyer', 'items', 'old'), { quantity: 2 }));
    await assertSucceeds(deleteDoc(doc(db('buyer'), 'carts', 'buyer', 'items', 'old')));
    await assertFails(setDoc(doc(db('buyer'), 'carts', 'buyer', 'items', 'big'), { ...line, notes: piece(5000) }));
    await assertFails(setDoc(doc(db('buyer'), 'carts', 'buyer', 'items', 'junk'), { ...line, blob: piece(100) }));
    await assertFails(setDoc(doc(db('other'), 'carts', 'buyer', 'items', 'x'), line));
  });

  it('lets customers archive only their own cart lines in the recycle bin', async () => {
    const archive = (uid: string, sourcePath: string) => ({ sourcePath, deletedBy: uid, originalData: { a: 1 } });
    await assertSucceeds(setDoc(doc(db('buyer'), 'developer_recycle_bin', 'r1'), archive('buyer', 'carts/buyer/items/nasi')));
    await assertFails(setDoc(doc(db('buyer'), 'developer_recycle_bin', 'r2'), archive('buyer', 'carts/other/items/nasi')));
    await assertFails(setDoc(doc(db('buyer'), 'developer_recycle_bin', 'r3'), archive('buyer', 'orders/waiting')));
    await assertSucceeds(setDoc(doc(db('admin'), 'developer_recycle_bin', 'r4'), archive('admin', 'orders/waiting')));
    await assertSucceeds(setDoc(doc(db('courier'), 'developer_recycle_bin', 'r5'), archive('courier', 'delivery_files/x')));
  });

  it('lets customers notify the admin only about their own orders; staff are unchanged', async () => {
    await assertSucceeds(setDoc(doc(db('buyer'), 'notifications', 'n1'), notification('admin', { orderId: 'waiting' })));
    await assertSucceeds(setDoc(doc(db('buyer'), 'notifications', 'n2'), notification('buyer')));
    await assertFails(setDoc(doc(db('other'), 'notifications', 'n3'), notification('admin', { orderId: 'waiting' })));
    await assertFails(setDoc(doc(db('buyer'), 'notifications', 'n4'), notification('admin')));
    await assertSucceeds(setDoc(doc(db('courier'), 'notifications', 'n5'), notification('admin', { orderId: 'waiting' })));
    await assertSucceeds(setDoc(doc(db('watcher'), 'notifications', 'n6'), notification('admin')));
    await assertSucceeds(setDoc(doc(db('admin'), 'notifications', 'n7'), notification('buyer', { orderId: 'paid' })));
  });
});
