import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultsPath = path.join(root, "src-tauri", "resources", "default-platforms", "defaults.json");
const iconDir = path.join(root, "src-tauri", "resources", "default-platforms", "icons");
const defaults = JSON.parse(fs.readFileSync(defaultsPath, "utf8"));

function initials(name) {
  const parts = name.replace(/CLI/g, "").split(/[\s-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0].toUpperCase());
  return (letters.join("") || name.slice(0, 2).toUpperCase()).slice(0, 2);
}

function monogramSvg(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
  <rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor" opacity="0.18"/>
  <text x="8" y="8.45" text-anchor="middle" dominant-baseline="middle" font-size="5" font-weight="700" fill="currentColor">${label}</text>
</svg>
`;
}

for (const platform of defaults) {
  const icon = platform.icon;
  const dest = path.join(iconDir, icon);
  if (fs.existsSync(dest)) continue;
  if (!icon.endsWith(".svg")) continue;
  fs.writeFileSync(dest, monogramSvg(initials(platform.display_name)));
}

const files = fs.readdirSync(iconDir).sort();
const arms = files.map((file) => {
  const rel = `../resources/default-platforms/icons/${file}`.replaceAll("\\", "/");
  return `        "${file}" => Some(include_bytes!("${rel}").as_slice()),`;
});

const rust = `/// Embedded factory-default platform icons. Copied into \`.skillshub/platform\` on first seed.
pub fn default_icon_bytes(file_name: &str) -> Option<&'static [u8]> {
    match file_name {
${arms.join("\n")}
        _ => None,
    }
}
`;

fs.writeFileSync(path.join(root, "src-tauri", "src", "default_platform_icons.rs"), rust);
console.log(`Wrote ${files.length} default icons and embed map`);
