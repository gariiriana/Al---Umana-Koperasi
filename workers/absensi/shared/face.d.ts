// Types for face.js so the frontend can import the shared face helpers.
export const DESCRIPTOR_LENGTH: number;
export function isDescriptor(value: unknown): value is number[];
export function faceDistance(a: number[], b: number[]): number;
export function medianFaceDistance(frames: number[][], reference: number[]): number;
