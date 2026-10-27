// Types for binding.js (shared by the absensi Worker and frontend).
export interface PayloadChallengeInput {
  nonce: string;
  kind: "masuk" | "pulang";
  lat: number;
  lng: number;
  accuracy: number;
  selfieSha256Hex: string;
}

export function sha256Hex(bytes: Uint8Array): Promise<string>;
export function payloadChallenge(input: PayloadChallengeInput): Promise<string>;
