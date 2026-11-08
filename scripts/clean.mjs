import { rm } from "node:fs/promises";

// Renamed modules must not survive in a later package archive.
await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
