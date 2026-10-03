import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the build works from pywebview's local HTTP server and from file paths.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
