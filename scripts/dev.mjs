import { spawn, execFileSync } from "node:child_process";
import { watch, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
const processes = [
  spawn(
    "node",
    [
      "node_modules/typescript/bin/tsc",
      "-p",
      "tsconfig.json",
      "--watch",
      "--preserveWatchOutput",
    ],
    { cwd: root, stdio: "inherit" },
  ),
];
const watchers = ["styles.css", "controls.css", "link-controls.css"].map((file) =>
  watch(`${root}src/react/${file}`, () =>
    copyFileSync(`${root}src/react/${file}`, `${root}dist/${file}`),
  ),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const watcher of watchers) watcher.close();
  for (const child of processes) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of processes)
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
