// Types for logic.js so the frontend test suite can cross-check role aliases.
export const ROLE_ALIASES: Record<string, string[]>;
export function resolveRecipient(recipientId: string): { kind: "role"; roles: string[] } | { kind: "uid"; uid: string };
