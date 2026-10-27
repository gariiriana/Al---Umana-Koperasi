import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registrationOptions, verifyRegistration } from "../src/passkey.js";

describe("passkey (real @simplewebauthn/server)", () => {
  it("uses the nonce bytes as the registration challenge, so the stored nonce is the expected challenge", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const options = await registrationOptions({ rpId: "localhost", userId: "u1", userName: "u1@absen.test", userDisplayName: "U", excludeIds: [], challenge: bytes });
    assert.equal(options.challenge, Buffer.from(bytes).toString("base64url"));
    assert.equal(options.rp.id, "localhost");
    assert.equal(options.authenticatorSelection.userVerification, "required");
  });
  it("returns null instead of throwing on a malformed response", async () => {
    assert.equal(await verifyRegistration({ response: { id: "x" }, expectedChallenge: "c", origin: "http://localhost:5174", rpId: "localhost" }), null);
  });
});
