import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import App from "./App.tsx";

// Auto-reload on stale Vite chunk after deployment
window.addEventListener("vite:preloadError", (event) => {
  console.warn("New version detected, reloading page...", event);
  window.location.reload();
});

// Auto-reload when a new Service Worker takes control (PWA update)
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
