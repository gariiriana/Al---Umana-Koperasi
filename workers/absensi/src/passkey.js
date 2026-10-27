// Passkey (WebAuthn) lewat @simplewebauthn/server v14. Menjadi deps.webauthn di produksi.
import {
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

const toBase64Url = (bytes) => Buffer.from(bytes).toString("base64url");
const fromBase64Url = (value) => new Uint8Array(Buffer.from(value, "base64url"));

export function registrationOptions({ rpId, userId, userName, userDisplayName, excludeIds, challenge }) {
  return generateRegistrationOptions({
    rpName: "Absensi Al-Umanaa",
    rpID: rpId,
    userID: new TextEncoder().encode(userId),
    userName,
    userDisplayName,
    challenge,
    attestationType: "none",
    excludeCredentials: excludeIds.map((id) => ({ id })),
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
  });
}

/** Returns the new credential, or null when the response does not verify. */
export async function verifyRegistration({ response, expectedChallenge, origin, rpId }) {
  try {
    const result = await verifyRegistrationResponse({
      response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpId, requireUserVerification: true,
    });
    if (!result.verified) return null;
    const { credential } = result.registrationInfo;
    return {
      credentialId: credential.id,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? response?.response?.transports ?? [],
    };
  } catch {
    return null;
  }
}

/** Returns {newCounter}, or null when the signature does not verify. */
export async function verifyAuthentication({ response, expectedChallenge, origin, rpId, credential }) {
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: true,
      credential: { id: credential.id, publicKey: fromBase64Url(credential.publicKey), counter: credential.counter, transports: credential.transports },
    });
    return result.verified ? { newCounter: result.authenticationInfo.newCounter } : null;
  } catch {
    return null;
  }
}
