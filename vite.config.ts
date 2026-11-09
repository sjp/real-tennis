import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    react(),
    // A precaching service worker so the installed game launches and plays
    // offline after one visit (215). It updates itself on the next load after
    // a deploy. public/manifest.webmanifest stays the manifest.
    VitePWA({
      registerType: "autoUpdate",
      strategies: "generateSW",
      manifest: false,
      workbox: {
        // The built chunks plus the icons and manifest from public/.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        // The three chunk is about 950 kB, under the 2 MiB default, but leave
        // room for it to grow without silently dropping out of the precache.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  // Served from https://sjp.github.io/real-tennis/; the dev server stays at /.
  base: command === "build" || isPreview ? "/real-tennis/" : "/",
  test: {
    testTimeout: 10_000,
    // Node 25+ exposes a localStorage global that warns on first use unless
    // --localstorage-file is given. Turn it off: the stores already fall back
    // when storage is missing, and the warning is only noise.
    execArgv: ["--no-experimental-webstorage"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      reporter: ["text", "json-summary"],
    },
  },
  build: {
    // The three chunk (three.js, R3F and drei) is about 950 kB on its own and
    // can't be split further usefully; everything else is well under 500 kB.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // three, R3F and drei change far less often than the game, so they
          // get their own chunk that stays cached across deploys.
          groups: [
            // React would otherwise be pulled into the three chunk (R3F depends
            // on it), dragging three.js into the menu's first load.
            {
              name: "react",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 2,
            },
            {
              name: "three",
              test: /[\\/]node_modules[\\/](three|three-stdlib|@react-three[\\/](fiber|drei))[\\/]/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
}));
