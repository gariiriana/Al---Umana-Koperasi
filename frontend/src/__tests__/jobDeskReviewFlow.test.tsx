import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CateringJobDesk } from '@/types/cateringJobDesk';

// In-memory stand-in for the catering_jobdesks collection: every write updates
// the store and re-emits snapshots to the subscribed pages, like Firestore does.
const fake = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const store = {
    user: { uid: 'dwi-uid' },
    profile: { uid: 'dwi-uid', role: 'distribusi_1' },
    docs: [] as Record<string, unknown>[],
    listeners,
    emit: () => listeners.forEach((l) => l()),
    patch: (id: string, data: Record<string, unknown>) => {
      store.docs = store.docs.map((d) => (d.id === id ? { ...d, ...data } : d));
      store.emit();
    },
  };
  return {
    store,
    submit: vi.fn(async (id: string, status: string, uid: string, reason?: string) =>
      store.patch(id, { status, submittedBy: uid, reviewStatus: 'pending_review', incompleteReason: reason ?? null })),
    approve: vi.fn(async (id: string) => store.patch(id, { reviewStatus: 'approved' })),
    reject: vi.fn(async (id: string, _uid: string, remark: string) =>
      store.patch(id, { reviewStatus: 'rejected', rejectionRemark: remark, status: 'pending', submittedBy: null })),
  };
});

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fake.store.user, profile: fake.store.profile }) }));
vi.mock('@/services/cateringJobDeskService', () => {
  const subscribe = (pick: () => unknown[], cb: (data: unknown[]) => void) => {
    const listener = () => cb(pick());
    fake.store.listeners.add(listener);
    listener();
    return () => fake.store.listeners.delete(listener);
  };
  return {
    subscribeJobDesksByRole: (role: string, cb: (data: unknown[]) => void) =>
      subscribe(() => fake.store.docs.filter((d) => d.assignedRole === role), cb),
    subscribeAllJobDesks: (cb: (data: unknown[]) => void) => subscribe(() => fake.store.docs, cb),
    submitJobDeskStatus: fake.submit,
    approveJobDesk: fake.approve,
    rejectJobDesk: fake.reject,
  };
});

import { OperationalJobDeskPage } from '@/pages/katering/OperationalJobDeskPage';
import { CoMoReviewPage } from '@/pages/katering/CoMoReviewPage';

const jobDesk = (id: string, kegiatan: string): Partial<CateringJobDesk> => ({
  id, kegiatan, title: kegiatan, keyId: `MBG-20261005-${id}`, tanggal: '2026-10-05', hari: 'Senin', startTime: '19:00',
  pic: 'Dwi', assignedRole: 'distribusi_1', division: 'mbg', status: 'pending', reviewStatus: 'not_submitted',
});

const rowOf = (text: string) => within(screen.getByText(text).closest('tr') as HTMLElement);
const asDwi = () => { fake.store.profile = { uid: 'dwi-uid', role: 'distribusi_1' }; fake.store.user = { uid: 'dwi-uid' }; };
const asCoMo = () => { fake.store.profile = { uid: 'como-uid', role: 'CO_MO' }; fake.store.user = { uid: 'como-uid' }; };

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  fake.store.listeners.clear();
  fake.store.docs = [jobDesk('005', 'goreng tahu'), jobDesk('006', 'iris jahe')];
  asDwi();
});

describe('job desk Complete → CO_MO approve flow', () => {
  it('sends Complete to review on a single click, without a Submit step', async () => {
    render(<OperationalJobDeskPage />);
    expect(screen.queryByRole('button', { name: /^Submit/ })).toBeNull();

    fireEvent.click(rowOf('goreng tahu').getByRole('button', { name: /Complete/ }));

    await waitFor(() => expect(fake.submit).toHaveBeenCalledWith('005', 'complete', 'dwi-uid', undefined,
      expect.objectContaining({ kegiatan: expect.stringMatching(/goreng tahu/i) })));
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(await rowOf('goreng tahu').findByText('Menunggu Review')).toBeTruthy();
    expect(rowOf('goreng tahu').getByText('Terkirim ✓')).toBeTruthy();
    // The other row is untouched.
    expect(rowOf('iris jahe').getByText('Belum Submit')).toBeTruthy();
  });

  it('sends Incomplete only after a reason is written and Kirim is clicked', async () => {
    render(<OperationalJobDeskPage />);
    fireEvent.click(rowOf('iris jahe').getByRole('button', { name: /Incomplete/ }));
    expect(fake.submit).not.toHaveBeenCalled();

    const kirim = rowOf('iris jahe').getByRole('button', { name: /Kirim/ }) as HTMLButtonElement;
    expect(kirim.disabled).toBe(true);

    fireEvent.change(rowOf('iris jahe').getByPlaceholderText('Tulis alasan incomplete...'), { target: { value: 'jahe habis' } });
    fireEvent.click(kirim);

    await waitFor(() => expect(fake.submit).toHaveBeenCalledWith('006', 'incomplete', 'dwi-uid', 'jahe habis',
      expect.objectContaining({ kegiatan: expect.stringMatching(/iris jahe/i) })));
    expect(await rowOf('iris jahe').findByText('Menunggu Review')).toBeTruthy();
  });

  it('shows the completed task to CO_MO, approves it in one click, and Dwi sees Approved', async () => {
    // 1. Dwi marks the task complete.
    const dwi = render(<OperationalJobDeskPage />);
    fireEvent.click(rowOf('goreng tahu').getByRole('button', { name: /Complete/ }));
    await rowOf('goreng tahu').findByText('Menunggu Review');
    dwi.unmount();

    // 2. CO_MO sees it waiting for review and approves with a single click.
    asCoMo();
    const como = render(<CoMoReviewPage />);
    fireEvent.click(rowOf('goreng tahu').getByRole('button', { name: /^Approve$/ }));
    await waitFor(() => expect(fake.approve).toHaveBeenCalledWith('005', 'como-uid',
      expect.objectContaining({ kegiatan: expect.stringMatching(/goreng tahu/i), assignedRole: expect.any(String) })));
    expect(screen.queryByText(/Konfirmasi Persetujuan/)).toBeNull();
    expect(await rowOf('goreng tahu').findByText(/Disetujui \(Approved\)/)).toBeTruthy();
    como.unmount();

    // 3. Dwi's page now shows the task as approved and finished.
    asDwi();
    render(<OperationalJobDeskPage />);
    expect(rowOf('goreng tahu').getByText('Approved')).toBeTruthy();
    expect(rowOf('goreng tahu').getByText('Tuntas ✓')).toBeTruthy();
  });

  it('after a rejection, Complete is no longer shown as done and can be sent again', async () => {
    render(<OperationalJobDeskPage />);
    fireEvent.click(rowOf('goreng tahu').getByRole('button', { name: /Complete/ }));
    await rowOf('goreng tahu').findByText('Menunggu Review');

    // CO_MO rejects while Dwi's page stays open (live snapshot).
    await fake.reject('005', 'como-uid', 'foto kurang jelas');

    const complete = await rowOf('goreng tahu').findByRole('button', { name: /Complete/ });
    expect(complete.className).not.toContain('bg-emerald-500');
    expect(rowOf('goreng tahu').getByText('Rejected')).toBeTruthy();

    fireEvent.click(complete);
    await waitFor(() => expect(fake.submit).toHaveBeenCalledTimes(2));
    expect(await rowOf('goreng tahu').findByText('Menunggu Review')).toBeTruthy();
  });
});
