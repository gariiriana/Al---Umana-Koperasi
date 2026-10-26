/* Al-Umanaa — serah terima versi, diimpor ke service worker Workbox (vite.config.ts → workbox.importScripts).
 *
 * Sejak versi ini, worker baru menunggu sampai pengguna menekan "Perbarui"
 * (src/components/ui/AppUpdatePrompt.tsx), lalu aktif lewat pesan SKIP_WAITING.
 * Versi sebelumnya belum punya popup itu, tapi memuat ulang sendiri saat worker baru
 * mengambil alih (main.tsx, controllerchange). Worker yang menggantikan versi lama itu
 * karena itu langsung mengambil alih. Cache penanda membedakan keduanya: ia dibuat oleh
 * worker yang sudah mengenal popup.
 */

const UPDATE_PROMPT_MARKER = "al-umana-update-prompt-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.has(UPDATE_PROMPT_MARKER).then((promptReady) => (promptReady ? undefined : self.skipWaiting())),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.open(UPDATE_PROMPT_MARKER));
});
