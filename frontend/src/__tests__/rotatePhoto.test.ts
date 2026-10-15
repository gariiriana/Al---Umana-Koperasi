import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotatePhoto } from '@/utils/rotatePhoto';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('photo pixel rotation', () => {
  it.each([[1, 240, 400], [2, 400, 240], [3, 240, 400], [-1, 240, 400]])('rotates %i quarters without cropping', async (turns, width, height) => {
    const ctx = { fillStyle: '', fillRect: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: vi.fn(() => 'rotated') };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
    vi.stubGlobal('Image', class {
      naturalWidth = 400;
      naturalHeight = 240;
      onload = () => {};
      set src(_value: string) { queueMicrotask(() => this.onload()); }
    });
    expect(await rotatePhoto('original', turns)).toBe('rotated');
    expect([canvas.width, canvas.height]).toEqual([width, height]);
    expect(ctx.translate).toHaveBeenCalledWith(width / 2, height / 2);
    expect(ctx.rotate).toHaveBeenCalledWith(((turns + 4) % 4) * Math.PI / 2);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), -200, -120, 400, 240);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8);
  });
  it('shrinks oversized photos to the upload size instead of growing the saved copy', async () => {
    const ctx = { fillStyle: '', fillRect: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: vi.fn(() => 'rotated') };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
    vi.stubGlobal('Image', class {
      naturalWidth = 1600;
      naturalHeight = 1200;
      onload = () => {};
      set src(_value: string) { queueMicrotask(() => this.onload()); }
    });
    await rotatePhoto('original', 1);
    expect([canvas.width, canvas.height]).toEqual([480, 640]);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), -320, -240, 640, 480);
  });
  it('returns the unmodified source after a full turn', async () => {
    expect(await rotatePhoto('original', 4)).toBe('original');
  });
  it('rejects unreadable photos', async () => {
    vi.stubGlobal('Image', class {
      onerror = () => {};
      set src(_value: string) { queueMicrotask(() => this.onerror()); }
    });
    await expect(rotatePhoto('broken', 1)).rejects.toThrow('Foto tidak bisa dibaca');
  });
});
