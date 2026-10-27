import { beforeEach, describe, expect, it, vi } from "vitest";

const webauthn = vi.hoisted(() => ({
  supported: true,
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => webauthn.supported,
  startAuthentication: webauthn.startAuthentication,
  startRegistration: webauthn.startRegistration,
}));

import { DeviceError } from "@/absensi/device/errors";
import { signWithPasskey } from "@/absensi/device/passkey";

const request = { challenge: "Y2hhbGxlbmdl", rpId: "localhost", allowCredentials: [{ id: "cred-1", transports: ["internal"] }] };

beforeEach(() => {
  webauthn.supported = true;
  webauthn.startAuthentication.mockReset();
});

describe("signWithPasskey", () => {
  it("meminta verifikasi pengguna untuk kredensial yang terdaftar", async () => {
    webauthn.startAuthentication.mockResolvedValue({ id: "cred-1" });
    await expect(signWithPasskey(request)).resolves.toEqual({ id: "cred-1" });
    expect(webauthn.startAuthentication).toHaveBeenCalledWith({
      optionsJSON: {
        challenge: "Y2hhbGxlbmdl",
        rpId: "localhost",
        allowCredentials: [{ id: "cred-1", type: "public-key", transports: ["internal"] }],
        userVerification: "required",
        timeout: 60000,
      },
    });
  });

  it("dibatalkan pengguna (NotAllowedError) → PASSKEY_DIBATALKAN", async () => {
    webauthn.startAuthentication.mockRejectedValue(new DOMException("x", "NotAllowedError"));
    const err = await signWithPasskey(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeviceError);
    expect((err as DeviceError).code).toBe("PASSKEY_DIBATALKAN");
  });

  it("browser tanpa WebAuthn → PASSKEY_TIDAK_DIDUKUNG", async () => {
    webauthn.supported = false;
    await expect(signWithPasskey(request)).rejects.toMatchObject({ code: "PASSKEY_TIDAK_DIDUKUNG" });
    expect(webauthn.startAuthentication).not.toHaveBeenCalled();
  });
});
