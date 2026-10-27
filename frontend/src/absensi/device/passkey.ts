import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialDescriptorJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { DeviceError } from "@/absensi/device/errors";

const PASSKEY_TIMEOUT_MS = 60000;

function requireWebAuthn() {
  if (!browserSupportsWebAuthn()) throw new DeviceError("PASSKEY_TIDAK_DIDUKUNG");
}

// Sheet sidik jari/Face ID ditutup atau waktunya habis → dianggap dibatalkan.
function mapPasskeyError(err: unknown): unknown {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "NotAllowedError" || name === "AbortError" ? new DeviceError("PASSKEY_DIBATALKAN") : err;
}

/** Daftarkan passkey HP ini (aktivasi). */
export async function createPasskey(optionsJSON: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON> {
  requireWebAuthn();
  try {
    return await startRegistration({
      optionsJSON: {
        ...optionsJSON,
        timeout: PASSKEY_TIMEOUT_MS,
        authenticatorSelection: { ...optionsJSON.authenticatorSelection, userVerification: "required" },
      },
    });
  } catch (err) {
    throw mapPasskeyError(err);
  }
}

export interface SignWithPasskeyInput {
  /** base64url payloadChallenge (shared/binding.js). */
  challenge: string;
  rpId: string;
  allowCredentials: { id: string; transports?: string[] }[];
}

/** Tanda tangan clock in/out dengan passkey terdaftar. */
export async function signWithPasskey({ challenge, rpId, allowCredentials }: SignWithPasskeyInput): Promise<AuthenticationResponseJSON> {
  requireWebAuthn();
  try {
    return await startAuthentication({
      optionsJSON: {
        challenge,
        rpId,
        allowCredentials: allowCredentials.map(({ id, transports }): PublicKeyCredentialDescriptorJSON => ({
          id,
          type: "public-key",
          transports: transports as PublicKeyCredentialDescriptorJSON["transports"],
        })),
        userVerification: "required",
        timeout: PASSKEY_TIMEOUT_MS,
      },
    });
  } catch (err) {
    throw mapPasskeyError(err);
  }
}
