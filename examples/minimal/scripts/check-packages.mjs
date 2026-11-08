import assert from "node:assert/strict";
import { readFile, readdir, lstat } from "node:fs/promises";
import * as spagbol from "@pauloricca/spagbol";
for (const name of [
  "GraphEditor",
  "SpagbolCanvas",
  "defineNodeView",
  "SpagbolCanvasFlow",
  "SpagbolCanvasMenu",
  "SpagbolControlSlider",
  "SpagbolControlButton",
])
  assert.equal(typeof spagbol[name], "function");
assert.equal(typeof globalThis.window, "undefined");
const installedRoot = "node_modules/@pauloricca/spagbol";
assert.equal((await lstat(installedRoot)).isSymbolicLink(), false);
const manifest = JSON.parse(
  await readFile(`${installedRoot}/package.json`, "utf8"),
);
assert.equal(manifest.name, "@pauloricca/spagbol");
assert.ok(manifest.exports["."].types.endsWith(".d.ts"));
assert.equal(manifest.dependencies, undefined);
async function compare(from, to) {
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory())
      await compare(`${from}/${entry.name}`, `${to}/${entry.name}`);
    else
      assert.deepEqual(
        await readFile(`${from}/${entry.name}`),
        await readFile(`${to}/${entry.name}`),
        entry.name,
      );
  }
}
await compare("/workspace/spagbol/dist", `${installedRoot}/dist`);
assert.ok(
  (await readFile(`${installedRoot}/dist/styles.css`, "utf8")).includes(
    "--spagbol-bg",
  ),
);
console.log(
  "Single packed package: model/UI exports, declarations and CSS verified.",
);
