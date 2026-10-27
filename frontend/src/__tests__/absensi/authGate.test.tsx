import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authCallback: null as null | ((user: unknown) => void),
  signOut: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  setDoc: vi.fn(async () => {}),
}));

vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/auth", () => ({ getRedirectResult: vi.fn(() => Promise.resolve(null)) }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(() => ({})), onSnapshot: mocks.onSnapshot, setDoc: mocks.setDoc }));
vi.mock("@/services/authService", () => ({
  onAuthStateChanged: (cb: (user: unknown) => void) => {
    mocks.authCallback = cb;
    return () => {};
  },
  signIn: vi.fn(),
  sendPasswordReset: vi.fn(),
  signOut: mocks.signOut,
  signInWithGoogle: vi.fn(),
}));
vi.mock("@/services/absensiAccount", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/absensiAccount")>()),
  isAbsensiAccount: vi.fn(async () => true),
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function Notice() {
  const { accountNotice, user } = useAuth();
  return <p>{accountNotice ?? "-"}|{user ? "user" : "none"}</p>;
}

describe("akun Absensi di pintu KASMA JOB", () => {
  it("no setDoc: logout, tanpa profil pelanggan, dan tampilkan pemberitahuan", async () => {
    render(<MemoryRouter><AuthProvider><Notice /></AuthProvider></MemoryRouter>);
    mocks.authCallback?.({ uid: "absen-1", email: "sari@absen.alumana.id" });
    await waitFor(() => expect(screen.getByText("Akun ini khusus Absensi. Silakan masuk lewat pintu Absensi.|none")).toBeTruthy());
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
