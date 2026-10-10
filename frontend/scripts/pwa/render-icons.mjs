// Renders the PWA / home-screen icons from kasma-logo.svg with headless Edge/Chrome
// (native SVG rasterisation at every target size = sharp, never upscaled).
//
//   node frontend/scripts/pwa/render-icons.mjs            → writes frontend/public/icons/*
//   node frontend/scripts/pwa/render-icons.mjs --preview out.png
//
// Logo on a white square; the logo colours themselves are untouched.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "public", "icons");
const logo = readFileSync(join(here, "kasma-logo.svg"), "utf8");
const badge = readFileSync(join(here, "kasma-badge.svg"), "utf8");

const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

// [file, size, logo height as fraction of the square, transparent background]
const ICONS = [
  ...[72, 96, 128, 144, 152, 192, 384, 512].map((s) => [`icon-${s}x${s}.png`, s, 0.86, false, logo]),
  // Android crops maskable icons to a circle/squircle: keep the hexagon in the 80% safe zone.
  ["maskable-192x192.png", 192, 0.74, false, logo],
  ["maskable-512x512.png", 512, 0.74, false, logo],
  ["apple-touch-icon.png", 180, 0.8, false, logo],
  ["favicon-32x32.png", 32, 0.94, false, logo],
  // Status-bar badge: white silhouette on transparent (Android tints it).
  ["badge-96x96.png", 96, 0.9, true, badge],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withBrowser(fn) {
  const exe = BROWSERS.find((p) => { try { readFileSync(p, { flag: "r" }); return true; } catch { return false; } });
  if (!exe) throw new Error("Edge/Chrome tidak ditemukan.");
  const profile = mkdtempSync(join(tmpdir(), "pwa-icons-"));
  const port = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  try {
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* starting */ }
    }
    if (!target) throw new Error("Browser headless tidak merespons.");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Page.enable");
    const result = await fn(send);
    ws.close();
    return result;
  } finally {
    proc.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
  }
}

async function render(send, svg, size, fill, transparent) {
  await send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: transparent ? { r: 0, g: 0, b: 0, a: 0 } : { r: 255, g: 255, b: 255, a: 1 } });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const html = `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${transparent ? "transparent" : "#fff"}">` +
    `<img src="${src}" style="height:${(fill * 100).toFixed(2)}%;width:auto;display:block"></body></html>`;
  await send("Page.navigate", { url: `data:text/html;base64,${Buffer.from(html).toString("base64")}` });
  await sleep(250);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  return Buffer.from(shot.result.data, "base64");
}

const previewIdx = process.argv.indexOf("--preview");
await withBrowser(async (send) => {
  if (previewIdx > 0) {
    writeFileSync(process.argv[previewIdx + 1], await render(send, logo, 512, 0.86, false));
    return;
  }
  for (const [file, size, fill, transparent, svg] of ICONS) {
    writeFileSync(join(outDir, file), await render(send, svg, size, fill, transparent));
    console.log("ok", file);
  }
});
