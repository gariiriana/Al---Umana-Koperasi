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
  } catch (err) {
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

  // --------------------------------------------------------------------------
  // Langkah 1: Seed admin
  // --------------------------------------------------------------------------
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
      { stdio: "pipe", encoding: "utf8" }
    );
    console.log("   ✓ Akun admin siap");
  } catch (err) {
    console.error("Gagal seed admin:", err.message);
    process.exit(1);
  }

  // Launch browser with fake media stream and location permissions
  let browser;
  try {
    browser = await chromium.launch({
      channel: "msedge",
      headless: process.env.HEADLESS !== "false",
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    });
  } catch (edgeErr) {
    console.warn("   ⚠️ Gagal membuka Edge, mencoba default Chromium...", edgeErr.message);
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== "false",
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    });
  }

  const context = await browser.newContext({
    permissions: ["geolocation", "camera"],
    geolocation: { latitude: AREA_PIN.lat, longitude: AREA_PIN.lng, accuracy: 10 },
    viewport: { width: 440, height: 850 },
  });

  const page = await context.newPage();

  // Setup CDP Virtual Authenticator for WebAuthn passkey
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
    // ------------------------------------------------------------------------
    // Langkah 2: Login admin, konfigurasi area & buat karyawan
    // ------------------------------------------------------------------------
    console.log("Langkah 2: Login admin & konfigurasi area + karyawan...");
    await page.goto(`${BASE_URL}/absensi/login`);
    await page.waitForFunction(() => typeof window.__absensiEmulatorSignIn === "function");
    await page.evaluate(async (cred) => {
      await window.__absensiEmulatorSignIn(cred.email, cred.password);
    }, ADMIN);

    await page.waitForURL("**/absensi/admin**", { timeout: 10000 });

    // Simpan area persegi ±0.0002° di sekitar pin & buat karyawan via API
    await page.evaluate(
      async ({ pin, emp }) => {
        const token = await window.__absensiAuth?.currentUser?.getIdToken();
        const headers = {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        };

        const square = [
          { lat: pin.lat + 0.0002, lng: pin.lng - 0.0002 },
          { lat: pin.lat + 0.0002, lng: pin.lng + 0.0002 },
          { lat: pin.lat - 0.0002, lng: pin.lng + 0.0002 },
          { lat: pin.lat - 0.0002, lng: pin.lng - 0.0002 },
        ];

        // PUT Area
        await fetch("/api/absensi/admin/area", {
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

        // POST Karyawan (abaikan jika sudah pernah ada)
        await fetch("/api/absensi/admin/karyawan", {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: emp.name,
            email: emp.email,
            password: emp.password,
            role: emp.role,
            faceRequired: emp.faceRequired,
          }),
        }).catch(() => {});
      },
      { pin: AREA_PIN, emp: EMPLOYEE }
    );
    console.log("   ✓ Area & akun karyawan siap");

    // ------------------------------------------------------------------------
    // Langkah 3: Login karyawan & aktivasi (mode photo)
    // ------------------------------------------------------------------------
    console.log("Langkah 3: Login karyawan & aktivasi HP...");
    await page.goto(`${BASE_URL}/absensi/login`);
    await page.waitForFunction(() => typeof window.__absensiEmulatorSignIn === "function");
    await page.evaluate(async (cred) => {
      await window.__absensiEmulatorSignIn(cred.email, cred.password);
    }, EMPLOYEE);

    await page.waitForURL("**/absensi/aktivasi**", { timeout: 10000 });

    // Cek persetujuan
    const checkbox = page.locator('input[type="checkbox"]');
    await checkbox.check();
    await page.getByRole("button", { name: "Lanjut" }).click();

    // Mode foto: tunggu tombol ambil foto
    const ambilFotoBtn = page.getByRole("button", { name: "Ambil foto" });
    await ambilFotoBtn.waitFor({ state: "visible", timeout: 15000 });
    await ambilFotoBtn.click();

    // Mode passkey: daftarkan sidik jari
    const daftarPasskeyBtn = page.getByRole("button", {
      name: /Daftarkan sidik jari/i,
    });
    await daftarPasskeyBtn.waitFor({ state: "visible", timeout: 10000 });
    await daftarPasskeyBtn.click();

    // Tunggu redirect ke Beranda
    await page.waitForURL("**/absensi", { timeout: 15000 });
    console.log("   ✓ Aktivasi karyawan berhasil");

    // ------------------------------------------------------------------------
    // Langkah 4: Clock In
    // ------------------------------------------------------------------------
    console.log("Langkah 4: Melakukan Clock In...");
    const clockInBtn = page.getByRole("button", { name: "Clock In" });
    await clockInBtn.click();

    // Tunggu selfie
    const selfieClockInBtn = page.getByRole("button", { name: "Ambil foto" });
    await selfieClockInBtn.waitFor({ state: "visible", timeout: 15000 });
    await selfieClockInBtn.click();

    // Konfirmasi passkey
    const confirmPasskeyBtn = page.getByRole("button", {
      name: /Konfirmasi sidik jari/i,
    });
    await confirmPasskeyBtn.waitFor({ state: "visible", timeout: 10000 });
    await confirmPasskeyBtn.click();

    // Tunggu status tombol berubah menjadi "✓ Sudah clock in"
    const sudahClockInBtn = page.getByRole("button", { name: /Sudah clock in/i });
    await sudahClockInBtn.waitFor({ state: "visible", timeout: 15000 });
    console.log("   ✓ Clock In berhasil");

    // ------------------------------------------------------------------------
    // Langkah 5: Clock Out
    // ------------------------------------------------------------------------
    console.log("Langkah 5: Melakukan Clock Out...");
    const clockOutBtn = page.getByRole("button", { name: "Clock Out" });
    await clockOutBtn.click();

    const selfieClockOutBtn = page.getByRole("button", { name: "Ambil foto" });
    await selfieClockOutBtn.waitFor({ state: "visible", timeout: 15000 });
    await selfieClockOutBtn.click();

    const confirmPasskeyOutBtn = page.getByRole("button", {
      name: /Konfirmasi sidik jari/i,
    });
    await confirmPasskeyOutBtn.waitFor({ state: "visible", timeout: 10000 });
    await confirmPasskeyOutBtn.click();

    const sudahClockOutBtn = page.getByRole("button", {
      name: /Sudah clock out/i,
    });
    await sudahClockOutBtn.waitFor({ state: "visible", timeout: 15000 });
    console.log("   ✓ Clock Out berhasil");

    // ------------------------------------------------------------------------
    // Langkah 6: Verifikasi riwayat memuat "Lengkap"
    // ------------------------------------------------------------------------
    console.log("Langkah 6: Memeriksa riwayat absen...");
    const statusLengkap = page.getByText("Lengkap").first();
    await statusLengkap.waitFor({ state: "visible", timeout: 10000 });
    console.log("   ✓ Riwayat memuat status 'Lengkap'");

    // ------------------------------------------------------------------------
    // Langkah 7: Tombol Clock In tidak bisa ditekan
    // ------------------------------------------------------------------------
    console.log("Langkah 7: Memeriksa tombol Clock In nonaktif...");
    const isDisabled = await sudahClockInBtn.isDisabled();
    if (!isDisabled) {
      throw new Error("Tombol Clock In seharusnya nonaktif setelah clock out");
    }
    console.log("   ✓ Tombol Clock In terkunci dan tidak bisa ditekan lagi hari ini");

    // ------------------------------------------------------------------------
    // Langkah 8: Admin Rekap export Excel & Word
    // ------------------------------------------------------------------------
    console.log("Langkah 8: Memeriksa export rekap Excel & Word di akun Admin...");
    await page.goto(`${BASE_URL}/absensi/login`);
    await page.waitForFunction(() => typeof window.__absensiEmulatorSignIn === "function");
    await page.evaluate(async (cred) => {
      await window.__absensiEmulatorSignIn(cred.email, cred.password);
    }, ADMIN);

    await page.waitForURL("**/absensi/admin**", { timeout: 10000 });

    // Buka tab Rekap
    const tabRekap = page.getByRole("button", { name: "Rekap" });
    await tabRekap.click();

    // Klik tombol Tampilkan
    const tampilkanBtn = page.getByRole("button", { name: "Tampilkan" });
    await tampilkanBtn.click();

    // Unduh Excel
    const [downloadExcel] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.getByRole("button", { name: "Export Excel" }).click(),
    ]);
    const excelName = downloadExcel.suggestedFilename();
    console.log(`   ✓ File Excel berhasil diunduh: ${excelName}`);
    if (!excelName.endsWith(".xlsx")) throw new Error(`Nama file salah: ${excelName}`);

    // Unduh Word
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
