import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  disableNetwork: vi.fn(async () => {}),
  enableNetwork: vi.fn(async () => {}),
  visibility: "visible" as DocumentVisibilityState,
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({ disableNetwork: fake.disableNetwork, enableNetwork: fake.enableNetwork }));

import { startFirestoreAutoResync } from "@/services/firestoreResync";

const MINUTE = 60_000;
let stop: () => void = () => {};

async function setVisibility(state: DocumentVisibilityState) {
  fake.visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fake.visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => fake.visibility });
  stop = startFirestoreAutoResync();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

// Every reconnect re-runs every open listener's query and rules, so it costs reads.
describe("Firestore auto-resync timing", () => {
  it("keeps listeners as they are after a short switch to another app", async () => {
    await setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(4 * MINUTE);
    await setVisibility("visible");
    expect(fake.disableNetwork).not.toHaveBeenCalled();
  });

  it("reconnects when the app comes back after five minutes in the background", async () => {
    await setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    await setVisibility("visible");
    expect(fake.disableNetwork).toHaveBeenCalledTimes(1);
    expect(fake.enableNetwork).toHaveBeenCalledTimes(1);
  });

  it("reconnects an open app every thirty minutes, not every ten", async () => {
    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    expect(fake.disableNetwork).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1 * MINUTE);
    expect(fake.disableNetwork).toHaveBeenCalledTimes(1);
  });
});
