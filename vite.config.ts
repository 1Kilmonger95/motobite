import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  // En GitHub Pages el sitio vive en /<nombre-del-repo>/
  const base = env.VITE_BASE_PATH || "/";

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        includeAssets: ["icon-192.png", "icon-512.png"],
        manifest: {
          id: base,
          lang: "es",
          categories: ["productivity", "utilities"],
          name: "MotoBite",
          short_name: "MotoBite",
          description: "Tus documentos PDF, siempre disponibles sin conexión.",
          theme_color: "#0f172a",
          background_color: "#ffffff",
          display: "standalone",
          orientation: "portrait",
          start_url: base,
          scope: base,
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" }
          ]
        },
        workbox: {
          // Solo se precachea el shell de la app. Los PDF viven en IndexedDB.
          globPatterns: ["**/*.{js,mjs,css,html,png,svg,ico,webmanifest}"],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true
        }
      })
    ]
  };
});
