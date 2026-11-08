import { execFileSync } from "node:child_process";
import { mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
const library = "/workspace/spagbol",
  client = "/workspace/spagbol-client";
const { name, version } = JSON.parse(await readFile(`${library}/package.json`, "utf8"));
const tarball = `${name.replace("@", "").replace("/", "-")}-${version}.tgz`;
const run = (cwd, args) => execFileSync("npm", args, { cwd, stdio: "inherit" });
run(library, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
run(library, ["run", "build"]);
run(library, ["run", "pack:local"]);
await mkdir(`${client}/vendor`, { recursive: true });
await copyFile(
  `${library}/artifacts/${tarball}`,
  `${client}/vendor/${tarball}`,
);
const manifestPath = `${client}/package.json`;
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.dependencies[name] = `file:vendor/${tarball}`;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
// Refresh only the same-version local package, preserving unrelated pins.
try {
  const lock = JSON.parse(
    await readFile(`${client}/package-lock.json`, "utf8"),
  );
  delete lock.packages["node_modules/@pauloricca/spagbol"];
  await writeFile(
    `${client}/package-lock.json`,
    `${JSON.stringify(lock, null, 2)}\n`,
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await rm(`${client}/node_modules/@pauloricca/spagbol`, {
  recursive: true,
  force: true,
});
run(client, ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
console.log("Spagbol packed and installed in the minimal example.");
