# SkillsHub App Icon Design

## Goal

Create a simple, distinctive application icon that communicates SkillsHub's role as a central hub for organizing skills and distributing them to multiple software platforms.

## Visual Concept

Use a compact hub-and-nodes symbol. A central skill core connects to three surrounding platform nodes, and the overall silhouette subtly suggests the letter `H` without relying on text. The mark must remain recognizable at 16–32 px.

## Style

- Flat geometric construction with a strong, balanced silhouette.
- Monochrome cobalt blue (`#2563EB`) with transparent node-center cutouts.
- No text, letters rendered as typography, gradients, sparkles, shadows, gloss, or fine decorative detail.
- Rounded corners only where they improve legibility; avoid a soft toy-like appearance.
- A near-white (`#F5F7FA`) rounded-square background behind the cobalt mark, with transparent outer corners and sufficient padding for Windows, macOS, and Linux desktop presentation.

## Deliverables

- A 1024×1024 transparent PNG master.
- Tauri desktop icon assets: PNG sizes, `icon.ico`, and `icon.icns`.
- Windows Store icon sizes regenerated from the same master.

## Acceptance Criteria

- The icon reads as one coherent hub symbol rather than several unrelated blocks.
- The central-to-platform relationship remains visible at 32×32 px.
- The silhouette remains clear in both light and dark operating-system themes.
- The background remains visible against the application's blue Windows title bar at 16×16 px.
- All generated files use the same source artwork and preserve transparent corners.
- Tauri packaging configuration continues to resolve every referenced icon asset.
