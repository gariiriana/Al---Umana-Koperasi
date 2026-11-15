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

type FakeWorker = EventTarget & { state: string; finish: (state: string) => void };

/** A service worker stand-in whose state changes like a real one (statechange event). */
function fakeWorker(state: string): FakeWorker {
  const worker = Object.assign(new EventTarget(), {
    state,
    finish(next: string) {
      worker.state = next;
      worker.dispatchEvent(new Event('statechange'));
    },
  });
  return worker;
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

  it('blocks the whole screen and cannot be skipped, so staff must press Perbarui', async () => {
    const { AppUpdatePrompt, updateServiceWorker, options } = await setup();
    vi.useFakeTimers();
    render(<><button type="button">Simpan</button><AppUpdatePrompt /></>);
    act(() => options().onNeedRefresh?.());

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Perbarui' }));


    
    // Tab must not move focus to the page behind (fireEvent returns false once it is prevented).
    expect(fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' })).toBe(false);
    expect(fireEvent.keyDown(document.activeElement as Element, { key: 'Tab', shiftKey: true })).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('app-update-backdrop'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(updateServiceWorker).not.toHaveBeenCalled();
    // Until Perbarui is pressed the only button is Perbarui; there is no close or "nanti" button.
    expect(Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Perbarui']);
  });

  it('does not reload into the same pop-up when the new version is held up', async () => {
    // The old service worker cannot hand over while it still serves an open request, so a
    // reload would only show the same pop-up again (the loop staff saw on some phones).
    const { AppUpdatePrompt, updateServiceWorker, options } = await setup();
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true });
    const registration = { installing: null, waiting: {}, update: vi.fn(async () => undefined) };
    options().onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration);
    render(<AppUpdatePrompt />);
    act(() => options().onNeedRefresh?.());

    fireEvent.click(screen.getByRole('button', { name: 'Perbarui' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText('Pembaruan tertunda')).toBeTruthy();
    expect(screen.getByText(/Tutup aplikasi sepenuhnya/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // asks the server for a newer version first
    expect(updateServiceWorker).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(reload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan dulu' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('reloads when the waiting version is gone but did not take over by itself', async () => {
    const { AppUpdatePrompt, options } = await setup();
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true });
    const registration = { installing: null, waiting: null, update: vi.fn(async () => undefined) };
    options().onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration);
    render(<AppUpdatePrompt />);
    act(() => options().onNeedRefresh?.());

    fireEvent.click(screen.getByRole('button', { name: 'Perbarui' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('installs the newest deploy, not an older waiting one, so the pop-up does not come back seconds later', async () => {
    // B waits since an earlier visit; C was deployed later and is still downloading when
    // Perbarui is pressed. Activating B would reload straight into a new pop-up for C.
    const { AppUpdatePrompt, updateServiceWorker, options } = await setup();
    vi.useFakeTimers();
    const versionB = fakeWorker('installed');
    const versionC = fakeWorker('installing');
    const registration = { installing: null as FakeWorker | null, waiting: versionB as FakeWorker | null, update: vi.fn(async () => {
      registration.installing = versionC; // the server has C; the browser starts installing it
    }) };
    options().onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration);
    render(<AppUpdatePrompt />);
    act(() => options().onNeedRefresh?.());

    fireEvent.click(screen.getByRole('button', { name: 'Perbarui' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(updateServiceWorker).not.toHaveBeenCalled(); // still waiting for C
    expect(screen.getByRole('button', { name: 'Memperbarui…' })).toBeTruthy();

    // C finishes installing and replaces B as the waiting version.
    registration.installing = null;
    registration.waiting = versionC;
    act(() => versionC.finish('installed'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('still installs the waiting version when the newest one is offline or very slow', async () => {
    const { AppUpdatePrompt, updateServiceWorker, options } = await setup();
    vi.useFakeTimers();
    const stalled = fakeWorker('installing');
    const registration = { installing: stalled, waiting: fakeWorker('installed'), update: vi.fn(() => new Promise<void>(() => {})) };
    options().onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration);
    render(<AppUpdatePrompt />);
    act(() => options().onNeedRefresh?.());

    fireEvent.click(screen.getByRole('button', { name: 'Perbarui' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(updateServiceWorker).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
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
