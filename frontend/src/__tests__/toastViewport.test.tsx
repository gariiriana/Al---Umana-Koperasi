import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/contexts/ToastContext';

// Semua source komponen, untuk mencari z-index overlay/modal tertinggi di app.
const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function zIndexes(text: string): number[] {
  return [...text.matchAll(/\bz-(\d+|\[(\d+)\])/g)].map((m) => Number(m[2] ?? m[1]));
}

describe('toast', () => {
  it('selalu tampil di atas modal/overlay mana pun (pesan error tidak tertutup)', () => {
    const highestOverlay = Math.max(
      ...Object.entries(sources)
        .filter(([file]) => !file.endsWith('/contexts/ToastContext.tsx') && !file.includes('__tests__'))
        .flatMap(([, text]) => zIndexes(text)),
    );

    render(<ToastProvider><div /></ToastProvider>);
    const viewport = screen.getByRole('region').querySelector('ol');
    const [toastZ] = zIndexes(viewport?.className ?? '');

    expect(highestOverlay).toBeGreaterThanOrEqual(999); // modal Import di Produksi MBG
    expect(toastZ).toBeGreaterThan(highestOverlay);
  });
});
