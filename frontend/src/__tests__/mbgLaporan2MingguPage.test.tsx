import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LaporanModel } from '@/lib/laporan2Minggu';

const m = vi.hoisted(() => ({
  loadDays: vi.fn(),
  subscribePhotos: vi.fn(),
  addPhotos: vi.fn(async () => ({ added: 1, rejected: [] as string[] })),
  deletePhoto: vi.fn(async () => {}),
  exportPdf: vi.fn<(model: unknown) => Promise<void>>(async () => {}),
  exportDocx: vi.fn<(model: unknown) => Promise<void>>(async () => {}),
}));

vi.mock('@/services/laporan2MingguService', () => ({
  loadLaporanDays: m.loadDays,
  subscribeLaporanPhotos: m.subscribePhotos,
  addLaporanPhotos: m.addPhotos,
  deleteLaporanPhoto: m.deletePhoto,
}));
vi.mock('@/utils/laporan2MingguPdf', () => ({ exportLaporanPdf: m.exportPdf }));
vi.mock('@/utils/laporan2MingguDocx', () => ({ exportLaporanDocx: m.exportDocx }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { displayName: 'Dwi' } }) }));
vi.mock('@/utils/date', () => ({ getJakartaDate: () => '2026-11-21' }));

import { MbgLaporan2MingguPage } from '@/pages/mbg/MbgLaporan2MingguPage';

const NOV = [
  '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
  '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  m.loadDays.mockImplementation(async (dates: string[]) =>
    dates.map((tanggal) => ({
      tanggal,
      batchId: tanggal === '2026-11-12' ? null : `b-${tanggal}`,
      entries: [{ institutionName: 'TK PADARAANG', institutionType: 'sekolah', qtSiswaBalita: 17, qtGuruKader: 3, jumlah: 22 }],
      menus: tanggal === '2026-11-10' ? null : { besar: ['Nasi Putih'] },
    })),
  );
  m.subscribePhotos.mockImplementation((_dates: string[], cb: (p: unknown[]) => void) => {
    cb([
      { id: 'f1', tanggal: '2026-11-09', section: 'menu', url: 'data:image/jpeg;base64,AA', order: 1, createdBy: 'Dwi', createdAt: '' },
      { id: 'f2', tanggal: '2026-11-09', section: 'persiapan', url: 'data:image/jpeg;base64,BB', order: 2, createdBy: 'Dwi', createdAt: '' },
    ]);
    return () => {};
  });
});

async function renderPage() {
  render(<MbgLaporan2MingguPage />);
  await waitFor(() => expect(m.loadDays).toHaveBeenCalledWith(NOV));
  await screen.findByTestId('checklist');
}

describe('Laporan 2 Minggu', () => {
  it('bawaannya periode dua minggu terakhir; panah pindah per minggu', async () => {
    await renderPage();
    expect(screen.getByTestId('periode').textContent).toBe('09 November s/d 20 November 2026');
    // Minggu ini (16-20 Nov sebagai minggu pertama) masih boleh, setelahnya tidak.
    fireEvent.click(screen.getByLabelText('Periode berikutnya'));
    await waitFor(() => expect(screen.getByTestId('periode').textContent).toBe('16 November s/d 27 November 2026'));
    expect((screen.getByLabelText('Periode berikutnya') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Periode sebelumnya'));
    fireEvent.click(screen.getByLabelText('Periode sebelumnya'));
    await waitFor(() => expect(screen.getByTestId('periode').textContent).toBe('02 November s/d 13 November 2026'));
  });

  it('tanggal mana pun dari kalender digeser ke Senin', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Pilih tanggal di minggu pertama'), { target: { value: '2026-10-15' } });
    await waitFor(() => expect(screen.getByTestId('periode').textContent).toBe('12 Oktober s/d 23 Oktober 2026'));
  });

  it('cek & download menandai hari tanpa data PM dan tanpa menu, tapi tetap bisa download', async () => {
    await renderPage();
    const checklist = screen.getByTestId('checklist');
    expect(within(checklist).getByText(/9 dari 10 hari/)).toBeTruthy();
    expect(within(checklist).getByText(/Hari tanpa data tidak masuk laporan: 12 Nov/)).toBeTruthy();
    expect(within(checklist).getByText(/Belum diisi: 10 Nov/)).toBeTruthy();
    expect(within(checklist).getByText(/2 foto di 1 hari/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Download Word/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('lima bagian foto per hari dengan jumlah foto masing-masing', async () => {
    await renderPage();
    expect(within(screen.getByTestId('section-persiapan')).getByText('1 foto')).toBeTruthy();
    expect(within(screen.getByTestId('section-pemorsian')).getByText('0 foto')).toBeTruthy();
    expect(within(screen.getByTestId('section-menu')).getByText('1 foto')).toBeTruthy();
    expect(screen.getByTestId('section-distribusi')).toBeTruthy();
    expect(screen.getByTestId('section-penerima')).toBeTruthy();
  });

  it('foto yang dipilih disimpan di hari + bagian yang aktif', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Rab.*18 Nov/ }));
    const file = new File(['x'], 'serah-terima.jpg', { type: 'image/jpeg' });
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-distribusi'), { target: { files: [file] } });
    });
    expect(m.addPhotos).toHaveBeenCalledWith('2026-11-18', 'distribusi', [file], 'Dwi', expect.any(Function));
    expect(await screen.findByText('1 foto tersimpan.')).toBeTruthy();
  });

  it('foto bisa ditarik ke kotak bagian', async () => {
    await renderPage();
    const file = new File(['x'], 'porsi.jpg', { type: 'image/jpeg' });
    await act(async () => {
      fireEvent.drop(screen.getByTestId('section-pemorsian'), { dataTransfer: { files: [file] } });
    });
    expect(m.addPhotos).toHaveBeenCalledWith('2026-11-09', 'pemorsian', [file], 'Dwi', expect.any(Function));
  });

  it('hapus foto minta konfirmasi', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderPage();
    fireEvent.click(screen.getByLabelText('Hapus foto 1 Menu'));
    expect(confirm).toHaveBeenCalled();
    expect(m.deletePhoto).toHaveBeenCalledWith('f1');
    confirm.mockRestore();
  });

  it('Download Word membuat laporan: 9 tabel menu, hari tanpa menu kosong, foto per bagian', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Download Word/ }));
    });
    await waitFor(() => expect(m.exportDocx).toHaveBeenCalledTimes(1));
    const model = m.exportDocx.mock.calls[0][0] as LaporanModel;
    expect(model.periodHeader).toBe('09 November s/d 20 November 2026');
    expect(model.menuDays).toHaveLength(9);
    expect(model.menuDays.find((d) => d.tanggal === '2026-11-10')?.menu).toEqual([]);
    expect(model.dokumentasi[0].sections.map((s) => s.label)).toEqual(['Persiapan', 'Menu']);
  });

  it('Download PDF juga tersedia', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    });
    await waitFor(() => expect(m.exportPdf).toHaveBeenCalledTimes(1));
  });
});
