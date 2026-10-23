import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const fake = vi.hoisted(() => ({
  user: { uid: 'owner' },
  taskError: false,
  submit: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fake.user, profile: null }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: fake.toast }) }));
vi.mock('@/services/performanceService', () => ({
  subscribeMyAdHocTasks: (_uid: string, data: (items: unknown[]) => void, error: (e: Error) => void) => {
    if (fake.taskError) error(new Error('permission-denied'));
    else data([{ id: 'task', title: 'Test task', instructions: 'Kerjakan', deadline: '2027-12-31T17:00' }]);
    return () => {};
  },
  subscribeRoleAssignments: () => () => {},
  submitAdHocTask: fake.submit,
  uploadEvidenceOriginal: vi.fn(),
}));
vi.mock('@/components/kpi/TaskKpiWidgets', () => ({
  AssessmentPanel: () => null, StatusPill: () => null, SummaryStrip: () => null, TaskDetail: () => null,
}));
vi.mock('@/components/ui/SidePanel', () => ({ SidePanel: () => null }));
vi.mock('@/components/ui/PeriodSelect', () => ({ PeriodSelect: () => null }));

import { PerformancePage } from '@/pages/PerformancePage';

beforeEach(() => { vi.clearAllMocks(); fake.taskError = false; });
afterEach(cleanup);

it('shows a load failure instead of claiming there are no tasks', () => {
  fake.taskError = true;
  render(<PerformancePage />);
  expect(screen.getByRole('alert').textContent).toContain('Gagal memuat task');
  expect(screen.queryByText('Tidak ada task yang perlu dikerjakan.')).toBeNull();
});

it('blocks close/cancel/Escape during submit, then closes on success', async () => {
  let finish!: () => void;
  fake.submit.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<PerformancePage />);
  fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Selesai' } });
  const submit = within(dialog).getAllByRole('button').find((button) => button.textContent?.includes('Submit'))!;
  fireEvent.click(submit);
  const cancel = within(dialog).getByRole('button', { name: 'Batal' }) as HTMLButtonElement;
  const close = within(dialog).getByRole('button', { name: 'Tutup' }) as HTMLButtonElement;
  expect(cancel.disabled).toBe(true);
  expect(close.disabled).toBe(true);
  fireEvent.click(cancel); fireEvent.click(close);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(fake.submit).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  expect(screen.queryByRole('dialog')).toBeNull();
});
