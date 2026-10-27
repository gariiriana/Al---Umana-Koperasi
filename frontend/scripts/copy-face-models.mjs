// Copies the three face-api models absensi uses into public/models (git-ignored).
// Runs before `npm run dev` / `npm run build`; run it by hand before `npx vite`.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@vladmandic", "face-api", "model");
const target = join(root, "public", "models");
const PREFIXES = ["tiny_face_detector_model", "face_landmark_68_tiny_model", "face_recognition_model"];

const files = readdirSync(source);
mkdirSync(target, { recursive: true });
for (const prefix of PREFIXES) {
  const matches = files.filter((f) => f.startsWith(`${prefix}.`) || f.startsWith(`${prefix}-`));
  if (matches.length === 0) {
    console.error(`[copy-face-models] missing ${prefix} in ${source}`);
    process.exit(1);
  }
  for (const file of matches) copyFileSync(join(source, file), join(target, file));
}
console.log(`[copy-face-models] ${PREFIXES.length} models copied to public/models`);
