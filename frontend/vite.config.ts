/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Text from the internet (titles, file names) is shown in the window, which can call Python. The
// policy refuses inline and remote scripts, so such text could never run. 'unsafe-eval' stays
// because pywebview builds its bridge with new Function and its DOM helpers with eval; Griffel
// injects styles at runtime. Build only: the dev server needs an inline React Refresh script.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY }, injectTo: "head-prepend" },
    ],
  };
}

// base "./" so the build works from pywebview's local HTTP server and from file paths.
export default defineConfig({
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  server: {
    port: 5173,
    strictPort: true,
    // The in-app "What's new" dialog bundles the changelogs from the repository root.
    fs: { allow: [".", "../CHANGELOG.md", "../CHANGELOG.pl.md"] },
  },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
