import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src-tauri", "resources", "default-platforms");
const iconDir = path.join(outDir, "icons");
const assetsDir = path.join(root, "src", "assets");

const UNIVERSAL = new Set([
  "amp",
  "antigravity",
  "cline",
  "codex",
  "cursor",
  "deep-agents",
  "dexto",
  "firebender",
  "gemini-cli",
  "copilot",
  "kimi-code-cli",
  "opencode",
  "warp",
]);

const PNG_IDS = new Set([
  "autoclaw",
  "workbuddy",
  "cursor",
  "windsurf",
  "trae",
  "qclaw",
  "codebuddy",
  "kiro",
  "qoder",
  "factory-droid",
  "codex",
  "easyclaw",
  "openclaw",
  "hermes",
]);

const platforms = [
  ["claude-code", "Claude Code", "coding", "~/.claude/skills", ".claude/skills"],
  ["codex", "Codex CLI", "coding", "~/.codex/skills", ".agents/skills"],
  ["cursor", "Cursor", "coding", "~/.cursor/skills", null],
  ["antigravity", "Antigravity", "coding", "~/.agents/skills", null],
  ["cline", "Cline", "coding", "~/.agents/skills", null],
  ["deep-agents", "Deep Agents", "coding", "~/.agents/skills", null],
  ["dexto", "Dexto", "coding", "~/.agents/skills", null],
  ["firebender", "Firebender", "coding", "~/.agents/skills", null],
  ["gemini-cli", "Gemini CLI", "coding", "~/.gemini/skills", null],
  ["kimi-code-cli", "Kimi Code CLI", "coding", "~/.agents/skills", null],
  ["aider-desk", "AiderDesk", "coding", "~/.aider-desk/skills", ".aider-desk/skills"],
  ["trae", "Trae", "coding", "~/.trae/skills", ".trae/skills"],
  ["factory-droid", "Factory Droid", "coding", "~/.factory/skills", ".factory/skills"],
  ["junie", "Junie", "coding", "~/.junie/skills", ".junie/skills"],
  ["qwen", "Qwen Code", "coding", "~/.qwen/skills", ".qwen/skills"],
  ["trae-cn", "Trae CN", "coding", "~/.trae-cn/skills", ".trae/skills"],
  ["windsurf", "Windsurf", "coding", "~/.codeium/windsurf/skills", ".windsurf/skills"],
  ["qoder", "Qoder", "coding", "~/.qoder/skills", ".qoder/skills"],
  ["augment", "Augment", "coding", "~/.augment/skills", ".augment/skills"],
  ["opencode", "OpenCode", "coding", "~/.opencode/skills", null],
  ["kilocode", "Kilo Code", "coding", "~/.kilocode/skills", ".kilocode/skills"],
  ["ob1", "OB1", "coding", "~/.ob1/skills", null],
  ["amp", "Amp", "coding", "~/.amp/skills", null],
  ["kiro", "Kiro CLI", "coding", "~/.kiro/skills", ".kiro/skills"],
  ["codebuddy", "CodeBuddy", "coding", "~/.codebuddy/skills", ".codebuddy/skills"],
  ["bob", "IBM Bob", "coding", "~/.bob/skills", ".bob/skills"],
  ["codearts-agent", "CodeArts Agent", "coding", "~/.codeartsdoer/skills", ".codeartsdoer/skills"],
  ["codemaker", "Codemaker", "coding", "~/.codemaker/skills", ".codemaker/skills"],
  ["codestudio", "Code Studio", "coding", "~/.codestudio/skills", ".codestudio/skills"],
  ["command-code", "Command Code", "coding", "~/.commandcode/skills", ".commandcode/skills"],
  ["continue", "Continue", "coding", "~/.continue/skills", ".continue/skills"],
  ["cortex", "Cortex Code", "coding", "~/.snowflake/cortex/skills", ".cortex/skills"],
  ["crush", "Crush", "coding", "~/.config/crush/skills", ".crush/skills"],
  ["devin", "Devin for Terminal", "coding", "~/.config/devin/skills", ".devin/skills"],
  ["forgecode", "ForgeCode", "coding", "~/.forge/skills", ".forge/skills"],
  ["goose", "Goose", "coding", "~/.config/goose/skills", ".goose/skills"],
  ["iflow-cli", "iFlow CLI", "coding", "~/.iflow/skills", ".iflow/skills"],
  ["kode", "Kode", "coding", "~/.kode/skills", ".kode/skills"],
  ["mcpjam", "MCPJam", "coding", "~/.mcpjam/skills", ".mcpjam/skills"],
  ["mistral-vibe", "Mistral Vibe", "coding", "~/.vibe/skills", ".vibe/skills"],
  ["mux", "Mux", "coding", "~/.mux/skills", ".mux/skills"],
  ["openhands", "OpenHands", "coding", "~/.openhands/skills", ".openhands/skills"],
  ["pi", "Pi", "coding", "~/.pi/agent/skills", ".pi/skills"],
  ["rovodev", "Rovo Dev", "coding", "~/.rovodev/skills", ".rovodev/skills"],
  ["roo", "Roo Code", "coding", "~/.roo/skills", ".roo/skills"],
  ["tabnine-cli", "Tabnine CLI", "coding", "~/.tabnine/agent/skills", ".tabnine/agent/skills"],
  ["zencoder", "Zencoder", "coding", "~/.zencoder/skills", ".zencoder/skills"],
  ["neovate", "Neovate", "coding", "~/.neovate/skills", ".neovate/skills"],
  ["pochi", "Pochi", "coding", "~/.pochi/skills", ".pochi/skills"],
  ["adal", "AdaL", "coding", "~/.adal/skills", ".adal/skills"],
  ["copilot", "GitHub Copilot", "coding", "~/.copilot/skills", null],
  ["warp", "Warp", "coding", "~/.agents/skills", null],
  ["aider", "Aider", "coding", "~/.aider/skills", null],
  ["hermes", "Hermes", "lobster", "~/.hermes/skills", null],
  ["openclaw", "OpenClaw", "lobster", "~/.openclaw/skills", "skills"],
  ["qclaw", "QClaw", "lobster", "~/.qclaw/skills", null],
  ["easyclaw", "EasyClaw", "lobster", "~/.easyclaw/skills", null],
  ["autoclaw", "AutoClaw", "lobster", "~/.openclaw-autoclaw/skills", null],
  ["workbuddy", "WorkBuddy", "lobster", "~/.workbuddy/skills-marketplace/skills", null],
  ["central", "Central Skills", "central", "~/.agents/skills", null],
];

function iconName(id) {
  if (id === "trae-cn") return "trae.png";
  if (PNG_IDS.has(id)) return `${id}.png`;
  return `${id}.svg`;
}

fs.mkdirSync(iconDir, { recursive: true });

const defaults = platforms.map(([id, display_name, category, global_skills_dir, project_skills_dir]) => {
  const entry = {
    id,
    display_name,
    category,
    global_skills_dir,
    icon: iconName(id),
  };
  if (project_skills_dir) entry.project_skills_dir = project_skills_dir;
  if (UNIVERSAL.has(id)) entry.supports_universal_agents_skills = true;
  return entry;
});

fs.writeFileSync(path.join(outDir, "defaults.json"), `${JSON.stringify(defaults, null, 2)}\n`);

for (const id of PNG_IDS) {
  const src = path.join(assetsDir, `${id}.png`);
  fs.copyFileSync(src, path.join(iconDir, `${id}.png`));
}

console.log(`Wrote ${defaults.length} default platforms`);
