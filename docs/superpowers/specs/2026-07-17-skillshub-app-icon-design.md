# SkillsHub App Icon Design

## Goal

Create a simple, distinctive application icon that communicates SkillsHub's role as a central hub for organizing skills and distributing them to multiple software platforms.

## Visual Concept

Use a compact hub-and-nodes symbol. A central skill core connects to three surrounding platform nodes, and the overall silhouette subtly suggests the letter `H` without relying on text. The mark must remain recognizable at 16–32 px.

## Style

- Flat geometric construction with a strong, balanced silhouette.
- VS Code-inspired blue as the primary color with a restrained cyan accent.
- No text, letters rendered as typography, gradients, sparkles, shadows, gloss, or fine decorative detail.
- Rounded corners only where they improve legibility; avoid a soft toy-like appearance.
- Transparent outer background with sufficient padding for Windows, macOS, Linux, iOS, and Android masks.

## Deliverables

- A 1024×1024 transparent PNG master.
- Tauri desktop icon assets: PNG sizes, `icon.ico`, and `icon.icns`.
- Existing mobile and Windows Store icon sizes regenerated from the same master.

## Acceptance Criteria

- The icon reads as one coherent hub symbol rather than several unrelated blocks.
- The central-to-platform relationship remains visible at 32×32 px.
- The silhouette remains clear in both light and dark operating-system themes.
- All generated files use the same source artwork and preserve transparent corners.
- Tauri packaging configuration continues to resolve every referenced icon asset.
