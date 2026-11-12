import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const firebaseAuth = vi.hoisted(() => ({
  reauthenticateWithCredential: vi.fn(),
  updatePassword: vi.fn(),
  credential: vi.fn((email: string, password: string) => ({ email, password })),
}));
vi.mock("firebase/auth", () => ({
  reauthenticateWithCredential: firebaseAuth.reauthenticateWithCredential,
  updatePassword: firebaseAuth.updatePassword,
  EmailAuthProvider: { credential: firebaseAuth.credential },
}));
const session = vi.hoisted(() => ({ user: { uid: "u1", email: "produksimbg@alumana.id" } as unknown }));
vi.mock("@/lib/firebase", () => ({ auth: { get currentUser() { return session.user; } } }));

import { ChangePasswordCard } from "@/components/settings/ChangePasswordCard";
import { CAN_CHANGE_OWN_PASSWORD_ROLES, changePasswordErrorMessage, validateNewPassword } from "@/components/settings/changePassword";

describe("validateNewPassword", () => {
  it("menolak password pendek, tidak sama, atau sama dengan yang lama", () => {
    expect(validateNewPassword("lama123456", "pendek1", "pendek1")).toMatch(/minimal 8/);
    expect(validateNewPassword("lama123456", "BaruSekali9", "BaruSekali8")).toMatch(/tidak sama/);
    expect(validateNewPassword("SamaSaja99", "SamaSaja99", "SamaSaja99")).toMatch(/berbeda/);
    expect(validateNewPassword("", "BaruSekali9", "BaruSekali9")).toMatch(/password lama/i);
    expect(validateNewPassword("lama123456", "BaruSekali9", "BaruSekali9")).toBeNull();
  });

  it("memetakan error Firebase ke pesan yang jelas", () => {
    expect(changePasswordErrorMessage({ code: "auth/invalid-credential" })).toMatch(/Password lama salah/);
    expect(changePasswordErrorMessage({ code: "auth/wrong-password" })).toMatch(/Password lama salah/);
    expect(changePasswordErrorMessage({ code: "auth/too-many-requests" })).toMatch(/Terlalu banyak/);
    expect(changePasswordErrorMessage({ code: "auth/network-request-failed" })).toMatch(/internet/);
    expect(changePasswordErrorMessage(new Error("x"))).toMatch(/Gagal/);
  });

  it("hanya akun produksi_mbg yang punya fitur ini", () => {
    expect(CAN_CHANGE_OWN_PASSWORD_ROLES).toEqual(["produksi_mbg"]);
  });
});

describe("ChangePasswordCard", () => {
  beforeEach(() => {
    firebaseAuth.reauthenticateWithCredential.mockReset().mockResolvedValue(undefined);
    firebaseAuth.updatePassword.mockReset().mockResolvedValue(undefined);
    firebaseAuth.credential.mockClear();
  });

  const fill = (current: string, next: string, confirm: string) => {
    fireEvent.change(screen.getByLabelText("Password lama"), { target: { value: current } });
    fireEvent.change(screen.getByLabelText("Password baru"), { target: { value: next } });
    fireEvent.change(screen.getByLabelText("Ulangi password baru"), { target: { value: confirm } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan password baru" }));
  };

  it("memverifikasi password lama dulu, lalu menyimpan password baru", async () => {
    render(<ChangePasswordCard />);
    fill("PasswordLama1", "PasswordBaru22", "PasswordBaru22");
    await screen.findByText(/Password berhasil diganti/);
    expect(firebaseAuth.credential).toHaveBeenCalledWith("produksimbg@alumana.id", "PasswordLama1");
    expect(firebaseAuth.updatePassword).toHaveBeenCalledWith(session.user, "PasswordBaru22");
    expect((screen.getByLabelText("Password baru") as HTMLInputElement).value).toBe("");
  });

  it("password lama salah: tidak mengganti apa pun dan memberi tahu", async () => {
    firebaseAuth.reauthenticateWithCredential.mockRejectedValue({ code: "auth/invalid-credential" });
    render(<ChangePasswordCard />);
    fill("Salah12345", "PasswordBaru22", "PasswordBaru22");
    await screen.findByText(/Password lama salah/);
    expect(firebaseAuth.updatePassword).not.toHaveBeenCalled();
  });

  it("isian tidak valid tidak dikirim ke Firebase", async () => {
    render(<ChangePasswordCard />);
    fill("PasswordLama1", "PasswordBaru22", "PasswordBaru2");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/tidak sama/));
    expect(firebaseAuth.reauthenticateWithCredential).not.toHaveBeenCalled();
  });
});
