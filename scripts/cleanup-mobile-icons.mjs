import { rmSync } from "node:fs";
import { resolve } from "node:path";

const iconsDir = resolve("src-tauri", "icons");

for (const platform of ["ios", "android"]) {
  rmSync(resolve(iconsDir, platform), { recursive: true, force: true });
}

console.log("Removed generated iOS and Android icon assets.");
