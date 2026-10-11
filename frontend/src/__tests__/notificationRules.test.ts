import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

// Run with `npm run test:rules` inside the Firebase emulator; ordinary unit tests skip this suite.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('notification read marking', () => {
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
      await Promise.all(Object.entries({ boss: 'super_admin', shifa: 'produksi_mbg', risa: 'mo_katering' })
        .map(([uid, role]) => setDoc(doc(db, 'users', uid), { role })));
      const base = { type: 'task', title: 'T', titleEn: 'T', message: 'M', messageEn: 'M', actorRole: 'system', read: false };
      await Promise.all([
        setDoc(doc(db, 'notifications', 'toShifa'), { ...base, recipientId: 'shifa' }),
        setDoc(doc(db, 'notifications', 'toSuperAdmin'), { ...base, recipientId: 'super_admin' }),
        setDoc(doc(db, 'notifications', 'toMo'), { ...base, recipientId: 'mo_katering' }),
      ]);
    });
  });
  const markRead = (uid: string, id: string, extra: Record<string, unknown> = {}) =>
    updateDoc(doc(environment.authenticatedContext(uid).firestore(), 'notifications', id), { read: true, ...extra });

  it('lets a user mark their own notification read', async () => {
    await assertSucceeds(markRead('shifa', 'toShifa'));
  });
  it('lets a user mark a notification sent to their role read', async () => {
    await assertSucceeds(markRead('boss', 'toSuperAdmin'));
    await assertSucceeds(markRead('risa', 'toMo'));
  });
  it('blocks marking notifications of another user or role', async () => {
    await assertFails(markRead('shifa', 'toSuperAdmin'));
    await assertFails(markRead('boss', 'toMo'));
    await assertFails(markRead('risa', 'toShifa'));
  });
  it('blocks changing anything besides the read state', async () => {
    await assertFails(markRead('boss', 'toSuperAdmin', { title: 'diubah' }));
    await assertFails(markRead('shifa', 'toShifa', { recipientId: 'boss' }));
  });
});
