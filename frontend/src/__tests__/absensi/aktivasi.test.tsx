import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const d = 0.0001; // ±11 m

const mocks = vi.hoisted(() => ({
  faceRequired: false,
  position: { lat: 0, lng: 0, accuracy: 8 },
  reloadMe: vi.fn(async () => {}),
  activateOptions: vi.fn(async () => ({ challengeId: "ch-1", optionsJSON: { challenge: "abc" } })),
  activate: vi.fn(async () => ({})),
  createPasskey: vi.fn(async () => ({ id: "cred-1" })),
}));

vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({
    user: { uid: "u1" },
    me: {
      uid: "u1",
      name: "Sari",
      faceRequired: mocks.faceRequired,
      activated: false,
      areas: [{
        id: "sppg",
        name: "SPPG",
        toleranceM: 15,
        active: true,
        polygon: [
          { lat: PIN.lat - d, lng: PIN.lng - d },
          { lat: PIN.lat - d, lng: PIN.lng + d },
          { lat: PIN.lat + d, lng: PIN.lng + d },
          { lat: PIN.lat + d, lng: PIN.lng - d },
        ],
      }],
    },
    reloadMe: mocks.reloadMe,
  }),
}));
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  activateOptions: mocks.activateOptions,
  activate: mocks.activate,
}));
vi.mock("@/absensi/device/gps", () => ({ getBestPosition: vi.fn(async () => mocks.position) }));
vi.mock("@/absensi/device/passkey", () => ({ createPasskey: mocks.createPasskey }));
vi.mock("@/absensi/device/selfie", () => ({ blobToBase64: vi.fn(async () => "anBlZw==") }));
vi.mock("@/absensi/components/SelfieCapture", () => ({
  SelfieCapture: ({ mode, onDone }: { mode: string; onDone: (r: unknown) => void }) => (
    <button type="button" onClick={() => onDone({ jpeg: new Blob(["jpeg"]), descriptor: null, distance: null })}>
      Kamera {mode}
    </button>
  ),
}));

import { AktivasiPage } from "@/absensi/pages/AktivasiPage";
import { messageFor } from "@/absensi/messages";

const CONSENT = "Foto wajah saya dipakai untuk absensi dan hanya bisa dilihat admin absensi.";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/absensi/aktivasi"]}>
      <Routes>
        <Route path="/absensi/aktivasi" element={<AktivasiPage />} />
        <Route path="/absensi" element={<p>Beranda</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.faceRequired = false;
  mocks.position = { lat: PIN.lat, lng: PIN.lng, accuracy: 8 };
  mocks.activateOptions.mockClear();
  mocks.activate.mockClear();
  mocks.reloadMe.mockClear();
  localStorage.clear();
});

describe("AktivasiPage", () => {
  it("Lanjut nonaktif sampai persetujuan dicentang", () => {
    renderPage();
    const next = screen.getByRole("button", { name: "Lanjut" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(CONSENT));
    expect(next.disabled).toBe(false);
  });

  it("alur sukses mode photo: activate dengan consent dan tanpa deskriptor, lalu ke beranda", async () => {
    renderPage();
    fireEvent.click(screen.getByLabelText(CONSENT));
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    fireEvent.click(await screen.findByRole("button", { name: "Kamera photo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Daftarkan sidik jari / Face ID" }));

    await screen.findByText("Beranda");
    expect(mocks.activate).toHaveBeenCalledWith({
      challengeId: "ch-1",
      consent: true,
      registration: { id: "cred-1" },
      location: { lat: PIN.lat, lng: PIN.lng, accuracy: 8 },
      reference: { jpegBase64: "anBlZw==", descriptor: null },
    });
    expect(localStorage.getItem("absensi:device:u1")).toBe("1");
    expect(mocks.reloadMe).toHaveBeenCalled();
  });

  it("wajib cek wajah memakai mode acuan", async () => {
    mocks.faceRequired = true;
    renderPage();
    fireEvent.click(screen.getByLabelText(CONSENT));
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(await screen.findByRole("button", { name: "Kamera acuan" })).toBeTruthy();
  });

  it("pra-cek di luar area: pesan jarak tampil dan passkey tidak diminta", async () => {
    mocks.position = { lat: PIN.lat + 0.001, lng: PIN.lng, accuracy: 8 }; // ±100 m ke utara
    renderPage();
    fireEvent.click(screen.getByLabelText(CONSENT));
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^Kamu di luar area absen \(sekitar \d+ m dari gedung\)\.$/);
    expect(alert.textContent).not.toBe(messageFor("DI_LUAR_AREA", { distanceM: 0 }));
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeTruthy();
    expect(mocks.activateOptions).not.toHaveBeenCalled();
  });
});
