import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../artifacts/", import.meta.url));
await mkdir(output, { recursive: true });
execFileSync(
  "npm",
  ["pack", "--ignore-scripts", "--pack-destination", output],
  { cwd: root, stdio: "inherit" },
);
