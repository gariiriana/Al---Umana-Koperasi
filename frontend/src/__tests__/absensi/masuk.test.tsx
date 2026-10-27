import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ profile: null as null | { displayName: string; role: string } }));
const absensi = vi.hoisted(() => ({ user: null as null | { displayName: string | null; email: string } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: auth.profile }) }));
vi.mock("@/absensi/authUser", () => ({ useAbsensiAuthUser: () => ({ user: absensi.user, loading: false }) }));

import { MasukPage } from "@/pages/MasukPage";
import { rootTarget } from "@/router/rootTarget";

const renderPage = () => render(<MemoryRouter><MasukPage /></MemoryRouter>);
const link = (name: RegExp) => screen.getByRole("link", { name });

beforeEach(() => {
  auth.profile = null;
  absensi.user = null;
});

describe("MasukPage", () => {
  it("tanpa sesi: dua pintu login dan tautan toko", () => {
    renderPage();
    expect(link(/KASMA JOB/).getAttribute("href")).toBe("/login");
    expect(link(/Absensi/).getAttribute("href")).toBe("/absensi/login");
    expect(link(/Belanja di toko/).getAttribute("href")).toBe("/");
  });

  it("sesi yang ada ditawarkan sebagai Lanjut sebagai …", () => {
    auth.profile = { displayName: "Budi", role: "mo_katering" };
    absensi.user = { displayName: null, email: "sari@absen.alumana.id" };
    renderPage();
    expect(link(/KASMA JOB/).getAttribute("href")).toBe("/katering/mo/jobdesk");
    expect(screen.getByText("Lanjut sebagai Budi")).toBeTruthy();
    expect(link(/Absensi/).getAttribute("href")).toBe("/absensi");
    expect(screen.getByText("Lanjut sebagai sari@absen.alumana.id")).toBeTruthy();
  });
});

describe("rootTarget", () => {
  it("browser biasa tetap seperti sekarang", () => {
    expect(rootTarget({ standalone: false, kasmaRole: null, absensiSignedIn: false })).toBeNull();
    expect(rootTarget({ standalone: false, kasmaRole: null, absensiSignedIn: true })).toBeNull();
    expect(rootTarget({ standalone: false, kasmaRole: "mo_katering", absensiSignedIn: false })).toBe("/katering/mo/jobdesk");
  });

  it("PWA: pilihan pintu kecuali tepat satu sesi", () => {
    expect(rootTarget({ standalone: true, kasmaRole: null, absensiSignedIn: false })).toBe("/masuk");
    expect(rootTarget({ standalone: true, kasmaRole: null, absensiSignedIn: true })).toBe("/absensi");
    expect(rootTarget({ standalone: true, kasmaRole: "kepala_unit", absensiSignedIn: false })).toBe("/unit/control-center");
    expect(rootTarget({ standalone: true, kasmaRole: "kepala_unit", absensiSignedIn: true })).toBe("/masuk");
    expect(rootTarget({ standalone: true, kasmaRole: "pelanggan", absensiSignedIn: false })).toBeNull();
  });
});
