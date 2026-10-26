import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import App from "./App.tsx";
import { registerSW } from "virtual:pwa-register";
import { startFirestoreAutoResync } from "./services/firestoreResync";
import { captureInstallPrompt } from "./services/installPrompt";
import { watchAppUpdates } from "./services/appUpdate";

// Simpan event "pasang aplikasi" sedini mungkin untuk tombol Pasang di kartu notifikasi.
captureInstallPrompt();

// Daftarkan service worker; versi baru menunggu klik "Perbarui" (AppUpdatePrompt).
watchAppUpdates(registerSW);

// Sambungkan ulang listener Firestore saat aplikasi kembali dibuka / sinyal kembali,
// supaya data realtime (mis. submit job desk) tidak macet di cache.
startFirestoreAutoResync();

// Safari iOS mengabaikan user-scalable=no, jadi gesture pinch-zoom halaman diblok manual.
document.addEventListener("gesturestart", (event) => event.preventDefault());

// Auto-reload on stale Vite chunk after deployment
window.addEventListener("vite:preloadError", (event) => {
  console.warn("New version detected, reloading page...", event);
  window.location.reload();
});

// Reload when a new Service Worker takes control: after "Perbarui" here, or in another tab,
// so no tab keeps running the old bundle against the new worker.
if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      console.log("New Service Worker active! Reloading to load latest updates...");
      window.location.reload();
    }
  });
}

window.addEventListener("error", (event) => {
  if (
    event?.message &&
    (event.message.includes("Failed to fetch dynamically imported module") ||
      event.message.includes("Importing a module script failed"))
  ) {
    const lastReload = sessionStorage.getItem("chunk_reload_ts");
    const now = Date.now();
    // Prevent infinite reload loop: max once per 10 seconds
    if (!lastReload || now - Number(lastReload) > 10000) {
      sessionStorage.setItem("chunk_reload_ts", String(now));
      window.location.reload();
    }
  }
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element with id 'root' not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
