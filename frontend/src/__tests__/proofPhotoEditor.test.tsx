import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProofPhotoEditor } from '@/components/mbg/ProofPhotoEditor';
import { rotatePhoto } from '@/utils/rotatePhoto';

vi.mock('@/utils/rotatePhoto', () => ({ rotatePhoto: vi.fn() }));
beforeEach(() => {
  vi.mocked(rotatePhoto).mockReset().mockImplementation(async (url, turns) => turns ? `${url}_${turns}` : url);
});
afterEach(cleanup);

describe('photo rotation editor', () => {
  it('rotates both ways from the original and resets without saving', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<ProofPhotoEditor photoUrl="original" label="Surat Jalan" onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Putar kiri 90°' }));
    await waitFor(() => expect((screen.getByAltText('Pratinjau Surat Jalan') as HTMLImageElement).src).toContain('original_3'));
    fireEvent.click(screen.getByRole('button', { name: 'Putar kanan 90°' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Simpan foto' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Putar kanan 90°' }));
    await waitFor(() => expect(rotatePhoto).toHaveBeenLastCalledWith('original', 1));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect((screen.getByAltText('Pratinjau Surat Jalan') as HTMLImageElement).getAttribute('src')).toBe('original'));
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the preview open on save failure and allows retry', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Gagal menyimpan foto')).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(<ProofPhotoEditor photoUrl="original" label="Surat Jalan" onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Putar kanan 90°' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Simpan foto' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan foto' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Gagal menyimpan foto');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan foto' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenLastCalledWith('original_1');
  });

  it('disables saving when the photo cannot be processed', async () => {
    vi.mocked(rotatePhoto).mockRejectedValue(new Error('Foto tidak bisa dibaca'));
    render(<ProofPhotoEditor photoUrl="broken" label="Surat Jalan" onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Putar kanan 90°' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Foto tidak bisa dibaca');
    expect((screen.getByRole('button', { name: 'Simpan foto' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
