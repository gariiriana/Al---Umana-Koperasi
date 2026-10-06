import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

// Run with `npm run test:rules` inside the Firebase emulator; ordinary unit tests skip this suite.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('catering job desk submit authorization', () => {
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
      await Promise.all(Object.entries({ joko: 'produksi_1', mbg2: 'MBG2', legacy: 'tim_produksi', shifa: 'produksi_mbg', wandi: 'distribusi_mbg_2', dwi: 'distribusi_1' })
        .map(([uid, role]) => setDoc(doc(db, 'users', uid), { role })));
      await Promise.all([
        setDoc(doc(db, 'catering_jobdesks', 'p1'), { assignedRole: 'produksi_1', status: 'pending', reviewStatus: 'not_submitted' }),
        setDoc(doc(db, 'catering_jobdesks', 'p1alias'), { assignedRole: 'MBG2', status: 'pending', reviewStatus: 'not_submitted' }),
        setDoc(doc(db, 'catering_jobdesks', 'p2'), { assignedRole: 'produksi_2', status: 'pending', reviewStatus: 'not_submitted' }),
        setDoc(doc(db, 'catering_jobdesks', 'd2'), { assignedRole: 'distribusi_2', status: 'pending', reviewStatus: 'not_submitted' }),
      ]);
    });
  });
  const submit = (uid: string, id: string) => updateDoc(doc(environment.authenticatedContext(uid).firestore(), 'catering_jobdesks', id), {
    status: 'complete', submittedBy: uid, submittedAt: serverTimestamp(), reviewStatus: 'pending_review', incompleteReason: null, updatedAt: serverTimestamp(),
  });

  it('lets canonical and alias roles submit their own job desks', async () => {
    await assertSucceeds(submit('joko', 'p1'));
    await assertSucceeds(submit('joko', 'p1alias'));
    await assertSucceeds(submit('mbg2', 'p1'));
    await assertSucceeds(submit('legacy', 'p1'));
    await assertSucceeds(submit('shifa', 'p2'));
    await assertSucceeds(submit('wandi', 'd2'));
  });
  it('still blocks submitting job desks assigned to another role', async () => {
    await assertFails(submit('mbg2', 'p2'));
    await assertFails(submit('dwi', 'p1'));
    await assertFails(submit('shifa', 'd2'));
  });
});
