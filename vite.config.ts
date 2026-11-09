import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // Served from https://sjp.github.io/real-tennis/; the dev server stays at /.
  base: command === "build" || isPreview ? "/real-tennis/" : "/",
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
