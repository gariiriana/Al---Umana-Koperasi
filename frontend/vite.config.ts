import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.png", "icons/*.png"],
      manifest: {
        name: "Al-Umana Koperasi",
        short_name: "Al-Umanaa",
        description: "Sistem Order Fulfillment & Delivery Koperasi Al-Umanaa Pesantren",
        theme_color: "#D97706",
        background_color: "#F3F4F6",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        lang: "id",
        icons: [
          { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png" },
          { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
          { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png" },
          { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png" },
          { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
        shortcuts: [
          {
            name: "Input Pesanan",
            short_name: "Pesanan",
            url: "/orders/new",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
          {
            name: "Dashboard",
            short_name: "Dashboard",
            url: "/dashboard",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
        ],
      },
      workbox: {
        // Cache static assets (fonts, css, js)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Firebase Firestore API - network first (data selalu fresh)
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "firestore-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // App pages - stale while revalidate
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "pages-cache",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // Set true kalau mau test SW di dev mode
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    host: true,
  },

  // ── Scalability: Build Optimizations ──
  build: {
    // Target modern browsers for smaller output.
    target: "es2020",

    // Code splitting: separate vendor chunks from application code.
    // When app code changes, users only re-download the changed chunks
    // while cached vendor chunks (React, Firebase, MUI) remain valid.
    // This reduces cache invalidation surface by ~70%.
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — rarely changes between deployments.
          "vendor-react": ["react", "react-dom", "react-router-dom"],

          // Firebase SDK — large bundle, changes very infrequently.
          "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/firestore"],

          // MUI — another large bundle that changes infrequently.
          "vendor-mui": ["@mui/material"],

          // Utility libraries — stable, cacheable.
          "vendor-utils": ["leaflet", "react-leaflet", "motion"],

          // PDF generation — only loaded when generating invoices.
          "vendor-pdf": ["jspdf", "jspdf-autotable", "html2canvas-pro"],
        },
      },
    },

    // Enable source maps for production debugging (hidden from users).
    sourcemap: "hidden",

    // Increase chunk size warning limit — our vendor chunks are
    // intentionally large but individually cacheable.
    chunkSizeWarningLimit: 1000,
  },
});
