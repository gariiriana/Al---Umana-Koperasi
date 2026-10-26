import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

// appUpdate keeps module state, so each test loads it fresh and registers a fake service worker.
async function setup() {
  vi.resetModules();
  const updateServiceWorker = vi.fn(async () => {});
  let options: RegisterSWOptions = {};
  const service = await import('@/services/appUpdate');
  const { AppUpdatePrompt } = await import('@/components/ui/AppUpdatePrompt');
  service.watchAppUpdates((registered) => {
    options = registered;
    return updateServiceWorker;
  });
  return { AppUpdatePrompt, updateServiceWorker, options: () => options };
}

beforeEach(() => {
  cleanup();
  Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('app update prompt', () => {
  it('appears only once a new version waits, and updates only when Perbarui is pressed', async () => {
    const { AppUpdatePrompt, updateServiceWorker, options } = await setup();
    vi.useFakeTimers(); // the reload fallback must not fire in jsdom
    render(<AppUpdatePrompt />);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    act(() => options().onNeedRefresh?.());
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Versi baru aplikasi tersedia')).toBeTruthy();
    expect(updateServiceWorker).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Perbarui' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect((screen.getByRole('button', { name: 'Memperbarui…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('looks for a new version when the app returns to the screen and every 10 minutes', async () => {
    const { options } = await setup();
    vi.useFakeTimers();
    const registration = { installing: null, update: vi.fn(async () => undefined) };
    options().onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration);

    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10 * 60_000);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});
