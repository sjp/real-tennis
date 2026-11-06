import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // Served from https://sjp.github.io/real-tennis/; the dev server stays at /.
  base: command === "build" || isPreview ? "/real-tennis/" : "/",
}));
