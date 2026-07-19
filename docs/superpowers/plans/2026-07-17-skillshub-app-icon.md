# SkillsHub App Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing SkillsHub application icon with the approved hub-and-nodes design and regenerate every platform-specific icon from one transparent master.

**Architecture:** Generate one square raster master using the built-in image generation tool on a removable chroma-key background. Convert it to transparent PNG, verify the mark at desktop and taskbar sizes, then use the Tauri CLI as the single source of truth for PNG, ICO, ICNS, and Windows Store outputs while removing unused mobile assets.

**Tech Stack:** Built-in image generation, Pillow-compatible chroma-key removal helper, Tauri CLI icon generator, React/Tauri build verification.

## Global Constraints

- Use the approved central hub with three connected platform nodes and a subtle `H` silhouette.
- Use one flat cobalt blue (`#2563EB`) with transparent node-center cutouts.
- Place the mark on a near-white (`#F5F7FA`) rounded-square background with transparent outer corners.
- Use no text, gradients, sparkles, shadows, gloss, or fine decorative detail.
- Preserve transparent outer corners and legibility at 16–32 px.
- Do not modify or stage the unrelated `src-tauri/src/commands/linker.rs` changes.

---

### Task 1: Generate and validate the transparent master

**Files:**
- Replace: `src-tauri/icons/icon-source.png`
- Create temporarily: `tmp/imagegen/skillshub-icon-chroma.png`

**Interfaces:**
- Consumes: approved icon design in `docs/superpowers/specs/2026-07-17-skillshub-app-icon-design.md`
- Produces: `src-tauri/icons/icon-source.png`, a 1024×1024 RGBA PNG

- [ ] **Step 1: Generate the chroma-key source**

Use the built-in image generation tool with this prompt:

```text
Use case: logo-brand
Asset type: cross-platform desktop application icon master
Primary request: Create a minimal geometric icon for an app named SkillsHub. Show one central skill core connected to three surrounding software-platform nodes. The unified silhouette should subtly suggest the letter H without drawing a literal typographic letter.
Style/medium: flat vector-friendly geometric logo, crisp solid fills, balanced optical spacing
Composition/framing: centered square icon, one coherent symbol, generous and even outer padding, strong silhouette readable at 16 px
Color palette: one uniform flat cobalt blue #2563EB mark on a near-white #F5F7FA rounded-square background; the four node centers reveal the background; no secondary hue
Constraints: no text, no letters rendered as typography, no gradients, no shadows, no glow, no sparkle, no gloss, no thin lines, no tiny details, no watermark
Backdrop: perfectly flat solid #00ff00 chroma-key background with no texture, lighting variation, floor, reflection, or cast shadow; do not use #00ff00 in the symbol
```

- [ ] **Step 2: Remove the chroma-key background**

Run the desktop-only wrapper:

```powershell
python "$HOME/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py" --input tmp/imagegen/skillshub-icon-chroma.png --out src-tauri/icons/icon-source.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

Expected: `icon-source.png` is an RGBA PNG with transparent corners and no green fringe.

- [ ] **Step 3: Inspect full and reduced sizes**

Render the 1024×1024 master and locally generated 32×32 and 16×16 previews. Expected: the central core, three nodes, and connections remain distinguishable without muddy antialiasing.

### Task 2: Regenerate all platform icon assets

**Files:**
- Modify: `src-tauri/icons/**`

**Interfaces:**
- Consumes: validated `src-tauri/icons/icon-source.png`
- Produces: all platform-specific assets expected by `src-tauri/tauri.conf.json`

- [ ] **Step 1: Run the Tauri icon generator**

Run:

```powershell
pnpm icon:desktop
```

Expected: the command exits successfully, rewrites the PNG, ICO, ICNS, and Windows Store assets, then removes generated iOS and Android directories.

- [ ] **Step 2: Validate generated files**

Check that every icon path referenced by `src-tauri/tauri.conf.json` exists, the master and desktop PNGs have alpha channels, and generated raster dimensions match their filenames or platform conventions.

- [ ] **Step 3: Verify the application build**

Run:

```powershell
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

Expected: all commands exit with code 0, and the only non-icon working-tree change remains the pre-existing linker fix.
