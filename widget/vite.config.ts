import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

/**
 * Two outputs:
 *  - `vite build`            → ES module with code splitting; Chart.js and Socket.IO are
 *                              lazy chunks loaded only when a chart or socket transport is used.
 *  - `vite build --mode iife` → one self-contained classic script for a single <script> tag.
 */
export default defineConfig(({ mode }) => {
  const iife = mode === "iife";
  return {
    define: {
      __WIDGET_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: iife
      ? []
      : [dts({ rollupTypes: true, tsconfigPath: "./tsconfig.json", include: ["src"] })],
    build: {
      target: "es2020",
      sourcemap: true,
      emptyOutDir: !iife,
      lib: {
        entry: "src/index.ts",
        name: "ChatbotWidget",
        formats: iife ? ["iife"] : ["es"],
        fileName: (format) => `chatbot-widget.${format}.js`,
      },
      rollupOptions: {
        output: iife
          ? { inlineDynamicImports: true }
          : {
              chunkFileNames: "chunks/[name]-[hash].js",
              manualChunks: {
                chart: ["chart.js/auto"],
                socket: ["socket.io-client"],
              },
            },
      },
    },
    server: { port: 5173, strictPort: true },
  };
});
