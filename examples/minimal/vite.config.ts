import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cp, stat } from "node:fs/promises";
import { resolve } from "node:path";

// Only built package output is watched. Application code always imports the
// installed public packages; there are no source aliases into the library.
function refreshPackages(): Plugin {
  return {
    name: "spagbol-local-artifacts",
    configureServer(server) {
      const source = process.env.SPAGBOL_SOURCE;
      if (!source) return;
      const paths = [resolve(source, "dist")];
      server.watcher.add(paths);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const refresh = (file: string) => {
        if (!paths.some((path) => file.startsWith(`${path}/`))) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            const from = resolve(source, "dist");
            await stat(from);
            await cp(from, resolve("node_modules/@pauloricca/spagbol/dist"), {
              recursive: true,
            });
            server.moduleGraph.invalidateAll();
            server.ws.send({ type: "full-reload" });
          } catch (error) {
            server.config.logger.error(
              `Could not refresh Spagbol artifacts: ${String(error)}`,
            );
          }
        }, 250);
      };
      server.watcher.on("change", refresh);
      server.watcher.on("add", refresh);
      server.httpServer?.once("close", () => {
        clearTimeout(timer);
        server.watcher.off("change", refresh);
        server.watcher.off("add", refresh);
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), refreshPackages()],
  resolve: { dedupe: ["react", "react-dom", "@xyflow/react"] },
  optimizeDeps: {
    exclude: ["@pauloricca/spagbol"],
    // Keep editable Spagbol artifacts unbundled, but prebundle the canvas peer
    // and its CommonJS dependencies before serving browser-native modules.
    include: ["@xyflow/react"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: { usePolling: true },
    fs: { allow: ["/workspace/spagbol-client", "/workspace/spagbol"] },
  },
});
