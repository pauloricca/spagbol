import { copyFile } from "node:fs/promises";
for (const file of ["styles.css", "controls.css", "link-controls.css", "editors.css"])
  await copyFile(
    new URL(`../src/react/${file}`, import.meta.url),
    new URL(`../dist/${file}`, import.meta.url),
  );
