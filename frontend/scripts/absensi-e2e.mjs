#!/usr/bin/env node
/**
 * Uji E2E Absensi di localhost menggunakan Microsoft Edge & CDP Virtual Authenticator.
 * Prasyarat (stack lokal harus sudah berjalan):
 * 1. Firebase Emulator: firebase emulators:start --only auth,firestore --project demo-alumana
 * 2. Worker absensi:    cd workers/absensi && npm run dev
 * 3. Frontend:          cd frontend && npx vite --mode emulator
 *
 * Jalankan:
 * npm run e2e:absensi
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const WORKER_DIR = join(ROOT, "workers/absensi");
const BASE_URL = process.env.BASE_URL || "http://localhost:5174";

const ADMIN = {
  email: "admin@absensi.test",
  password: "password123",
  name: "Admin Absensi",
};

const EMPLOYEE = {
  email: "karyawan-e2e@absen.alumana.id",
  password: "password123",
  name: "Karyawan E2E",
  role: "absen_karyawan",
  faceRequired: false,
};

const AREA_PIN = { lat: -6.9735229, lng: 106.8651559 };

async function checkStackAlive() {
  try {
    const res = await fetch(`${BASE_URL}/masuk`, { method: "HEAD" });
    if (!res.ok && res.status !== 404 && res.status !== 200) {
      throw new Error(`Frontend status: ${res.status}`);
    }
  } catch {
    console.error("\n❌ Stack lokal belum aktif!");
    console.error("Pastikan 3 layanan berikut sudah berjalan:");
    console.error("  1. Terminal 1: firebase emulators:start --only auth,firestore --project demo-alumana");
    console.error("  2. Terminal 2: cd workers/absensi && npm run dev");
    console.error("  3. Terminal 3: cd frontend && npx vite --mode emulator\n");
    process.exit(1);
  }
}

async function main() {
  console.log("=== Mulai Uji E2E Absensi Karyawan ===\n");

  await checkStackAlive();

  console.log("Langkah 1: Seed akun admin...");
  try {
    execFileSync(
      process.execPath,
      [
        join(WORKER_DIR, "scripts/seed-admin.mjs"),
        "--email",
        ADMIN.email,
        "--password",
        ADMIN.password,
        "--name",
        ADMIN.name,
      ],
      { stdio: "pipe", encoding: "utf8" },
    );
    console.log("   ✓ Akun admin siap");
  } catch (err) {
    console.error("Gagal seed admin:", err.message);
    process.exit(1);
  }

  const launchArgs = [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--disable-blink-features=AutomationControlled",
  ];
  let browser;
  try {
    browser = await chromium.launch({
      channel: "msedge",
      headless: process.env.HEADLESS !== "false",
      args: launchArgs,
    });
  } catch (edgeErr) {
    console.warn("   ⚠️ Gagal membuka Edge, mencoba default Chromium...", edgeErr.message);
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== "false",
      args: launchArgs,
    });
  }

  const context = await browser.newContext({
    permissions: ["geolocation", "camera"],
    geolocation: { latitude: AREA_PIN.lat, longitude: AREA_PIN.lng, accuracy: 10 },
    viewport: { width: 440, height: 850 },
  });

  await context.addInitScript(({ lat, lng }) => {
    try {
      localStorage.setItem("absensi:devGps", `${lat},${lng},10`);
    } catch {
      // ignore
    }
  }, AREA_PIN);

  const page = await context.newPage();

  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });

  try {
    console.log("Langkah 2: Login admin & konfigurasi area + karyawan...");
    await page.goto(`${BASE_URL}/absensi/login`);
    await page.waitForFunction(() => typeof window.__absensiEmulatorSignIn === "function");
    await page.evaluate(async (cred) => {
      await window.__absensiEmulatorSignIn(cred.email, cred.password);
    }, ADMIN);

    await page.waitForURL("**/absensi/admin**", { timeout: 10000 });

    await page.evaluate(
      async ({ pin, emp }) => {
        const token = await window.__absensiAuth?.currentUser?.getIdToken();
        if (!token) throw new Error("Token admin tidak ditemukan di window.__absensiAuth");
        const headers = {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        };

        const square = [
          { lat: pin.lat + 0.0002, lng: pin.lng - 0.0002 },
          { lat: pin.lat + 0.0002, lng: pin.lng + 0.0002 },
          { lat: pin.lat - 0.0002, lng: pin.lng + 0.0002 },
          { lat: pin.lat - 0.0002, lng: pin.lng - 0.0002 },
        ];

        const areaRes = await fetch("/api/absensi/admin/area", {
          method: "PUT",
          headers,
          body: JSON.stringify({
            areas: [
              {
                name: "Gedung SPPG",
                toleranceM: 15,
                active: true,
                polygon: square,
              },
            ],
          }),
        });
        if (!areaRes.ok) throw new Error(`Gagal PUT /admin/area: ${areaRes.status}`);

        const empRes = await fetch("/api/absensi/admin/karyawan", {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: emp.name,
            email: emp.email,
            password: emp.password,
            role: emp.role,
            faceRequired: emp.faceRequired,
          }),
        });
        if (!empRes.ok && empRes.status !== 409) {
          throw new Error(`Gagal POST /admin/karyawan: ${empRes.status}`);
        }
      },
      { pin: AREA_PIN, emp: EMPLOYEE },
    );
    console.log("   ✓ Area & akun karyawan siap");

    console.log("Langkah 3: Login karyawan & aktivasi HP...");
    await page.goto(`${BASE_URL}/absensi/login`);
    await page.waitForFunction(() => typeof window.__absensiEmulatorSignIn === "function");
    await page.evaluate(async (cred) => {
      await window.__absensiEmulatorSignIn(cred.email, cred.password);
    }, EMPLOYEE);

    await page.waitForURL("**/absensi/aktivasi**", { timeout: 10000 });

    const checkbox = page.locator('input[type="checkbox"]');
    await checkbox.check();
    await page.getByRole("button", { name: "Lanjut" }).click();

    const ambilFotoBtn = page.getByRole("button", { name: "Ambil foto" });
    await ambilFotoBtn.waitFor({ state: "visible", timeout: 15000 });
    await ambilFotoBtn.click();

    const daftarPasskeyBtn = page.getByRole("button", { name: /Daftarkan sidik jari/i });
    await daftarPasskeyBtn.waitFor({ state: "visible", timeout: 10000 });
    await daftarPasskeyBtn.click();

    await page.waitForURL("**/absensi", { timeout: 15000 });
    console.log("   ✓ Aktivasi karyawan berhasil");

    console.log("Langkah 4: Melakukan Clock In (Peta Google Maps -> Selfie -> Passkey)...");
    await page.getByRole("button", { name: "Clock In" }).click();

    const lanjutClockInBtn = page.getByRole("button", { name: "Lanjutkan Clock In" });
    await lanjutClockInBtn.waitFor({ state: "visible", timeout: 10000 });
    await page.getByText(/Di Dalam Zona/i).waitFor({ state: "visible", timeout: 10000 });
    await lanjutClockInBtn.click();

    const selfieClockInBtn = page.getByRole("button", { name: "Ambil foto" });
    await selfieClockInBtn.waitFor({ state: "visible", timeout: 15000 });
    await selfieClockInBtn.click();

    const confirmPasskeyBtn = page.getByRole("button", { name: /Konfirmasi sidik jari/i });
    await confirmPasskeyBtn.waitFor({ state: "visible", timeout: 10000 });
    await confirmPasskeyBtn.click();

    const sudahClockInBtn = page.getByRole("button", { name: /Sudah clock in/i });
    await sudahClockInBtn.waitFor({ state: "visible", timeout: 15000 });
    console.log("   ✓ Clock In berhasil");

    console.log("Langkah 5: Melakukan Clock Out (Peta Google Maps -> Selfie -> Passkey)...");
    await page.getByRole("button", { name: "Clock Out" }).click();

    const lanjutClockOutBtn = page.getByRole("button", { name: "Lanjutkan Clock Out" });
    await lanjutClockOutBtn.waitFor({ state: "visible", timeout: 10000 });
    await lanjutClockOutBtn.click();

    const selfieClockOutBtn = page.getByRole("button", { name: "Ambil foto" });
    await selfieClockOutBtn.waitFor({ state: "visible", timeout: 15000 });
    await selfieClockOutBtn.click();

    const confirmPasskeyOutBtn = page.getByRole("button", { name: /Konfirmasi sidik jari/i });
    await confirmPasskeyOutBtn.waitFor({ state: "visible", timeout: 10000 });
    await confirmPasskeyOutBtn.click();

    const sudahClockOutBtn = page.getByRole("button", { name: /Sudah clock out/i });
    await sudahClockOutBtn.waitFor({ state: "visible", timeout: 15000 });
    console.log("   ✓ Clock Out berhasil");

    console.log("Langkah 6: Memeriksa halaman kedua 'Lihat Selengkapnya' (Kalender & Ringkasan)...");
    await page.getByRole("link", { name: /Lihat Selengkapnya/i }).click();
    await page.waitForURL("**/absensi/riwayat", { timeout: 10000 });
    await page.getByText("Kalender Absensi").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Ringkasan Kehadiran").waitFor({ state: "visible", timeout: 10000 });
    console.log("   ✓ Halaman Kalender Absensi & Ringkasan Kehadiran tampil");

    console.log("Langkah 7: Memeriksa tombol Clock In nonaktif...");
    await page.getByRole("button", { name: "Kembali ke Beranda" }).click();
    await page.waitForURL("**/absensi", { timeout: 10000 });
    const isDisabled = await sudahClockInBtn.isDisabled();
    if (!isDisabled) {
      throw new Error("Tombol Clock In seharusnya nonaktif setelah clock out");
    }
    console.log("   ✓ Tombol Clock In terkunci dan tidak bisa ditekan lagi hari ini");

    console.log("Langkah 8: Memeriksa export rekap Excel & Word di akun Admin...");
    await page.goto(`${BASE_URL}/absensi/login`);
    await page.waitForFunction(() => typeof window.__absensiEmulatorSignIn === "function");
    await page.evaluate(async (cred) => {
      await window.__absensiEmulatorSignIn(cred.email, cred.password);
    }, ADMIN);

    await page.waitForURL("**/absensi/admin**", { timeout: 10000 });

    const tabRekap = page.getByRole("link", { name: "Rekap" });
    await tabRekap.click();

    const tampilkanBtn = page.getByRole("button", { name: "Tampilkan" });
    await tampilkanBtn.click();

    const [downloadExcel] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.getByRole("button", { name: "Export Excel" }).click(),
    ]);
    const excelName = downloadExcel.suggestedFilename();
    console.log(`   ✓ File Excel berhasil diunduh: ${excelName}`);
    if (!excelName.endsWith(".xlsx")) throw new Error(`Nama file salah: ${excelName}`);

    const [downloadWord] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.getByRole("button", { name: "Export Word" }).click(),
    ]);
    const wordName = downloadWord.suggestedFilename();
    console.log(`   ✓ File Word berhasil diunduh: ${wordName}`);
    if (!wordName.endsWith(".docx")) throw new Error(`Nama file salah: ${wordName}`);

    console.log("\n🎉 SELURUH 8 LANGKAH UJI E2E SELESAI DENGAN SUKSES! 🎉");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\n❌ Uji E2E Gagal:", err);
  process.exit(1);
});
