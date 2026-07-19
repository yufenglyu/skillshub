# Changelog

All notable changes to this project will be documented in this file.

## 0.11.1 - 2026-07-19

Maintenance release that makes Resource Library, Central Skills, and platform installation ownership explicit and consistent.

### Improvements

- Give SkillsHub a refreshed desktop icon with a high-contrast background and remove unused Android and iOS icon outputs.
- Always include all four backup domains: Resource Library files, Central Skills files, app configuration, and platform installation state.
- Store skill directories as files inside ZIP and WebDAV backups while keeping configuration and installation metadata in JSON.
- Distinguish Resource Library, Central Skills, and standalone platform installations in platform source labels.
- Exclude platform-native skills that SkillsHub did not install from managed platform lists and counts.
- Update the documentation and application screenshots for the current interface and behavior.

### Fixes

- Installing a Resource Library skill directly to a selected platform now affects only that platform and never creates a Central Skills copy.
- Promoting a Resource Library skill to Central Skills synchronizes it to enabled and detected platforms.
- Preserve Central Skills counts after promotion and scanning.
- Keep Codex CLI's own `~/.codex/skills/` directory separate from read-only Central Skills compatibility entries.
- Preserve managed installation ownership and source type across rescans, restarts, symlink resolution, and copy fallback.
- Persist WebDAV connection settings locally while continuing to exclude passwords, tokens, and API keys from backup archives.

## 0.11.0 - 2026-07-15

Feature and maintenance release focused on the Resource Library workflow, backup portability, WebDAV migration, and a cleaner desktop UI.

### Features

- Add ZIP-based local and WebDAV backups with selectable resource library, central library, app configuration, and platform installation state.
- Add WebDAV remote backup listing, upload/import actions, and locally persisted WebDAV connection settings while excluding secrets from backup archives.
- Add manual skill creation in the Skill Resource Library, with editable basic/source metadata for local skills.
- Add Resource Library sorting, folder view deletion, and safer folder-level delete previews.
- Add a top-bar theme toggle for system, light, and dark modes with refreshed VS Code-inspired themes.

### Improvements

- Move Resource Library management controls into a denser toolbar with GitHub import, manual creation, sorting, and view switching.
- Simplify Central Skills into a focused central-directory view.
- Rework skill detail pages with full-width content, separate notes and tags, and AI-generated notes from the metadata panel.
- Group Settings directory controls in Resource Library, Central Skills, and scan directory order.
- Rework the sidebar software platform section with a title, icon, and icon-only visibility toggle.

### Fixes

- Preserve saved WebDAV connection settings across application restarts.
- Store app data under `~/.skillshub/db.sqlite` while preserving first-run migration from `~/.skillsmanage/db.sqlite`.
- Keep GitHub-imported skill source metadata aligned with the repository name instead of generic resource-library labels.

## 0.10.0 - 2026-04-30

Feature release focused on broader platform coverage, Discover reliability, and denser Central Skills platform management.

### Features

- Add expanded built-in platform directory support for AI coding tools and project-level skill discovery.
- Add Obsidian vault discovery surfaces and sidebar navigation.
- Add Linux desktop bundle metadata and templates for Tauri packaging.
- Add a Central Skills platform manager drawer for searching and managing long-tail platform installs.

### Improvements

- Keep Lobster platforms directly visible on Central Skill cards while showing only high-frequency Coding platforms inline.
- Improve platform icon coverage with additional LobeHub mappings and distinct fallback monograms.
- Clarify shared/read-only platform availability in install and platform-management flows.
- Refine CI and desktop release workflow configuration for the expanded package matrix.

### Fixes

- Prefer explicit project skill directory mappings during Discover scans.
- Avoid falsely classifying shared `.agents/skills` folders as project-specific platform skills.
- Keep platform link toggles, rescans, and Central Skill deletion flows consistent after UI actions.

### Tests

- Add Rust and frontend coverage for expanded platform registry mappings, Discover project matching, platform icons, Central Skills platform management, and Obsidian surfaces.

## 0.9.1 - 2026-04-23

Maintenance release focused on full-path display consistency and small README polish.

### Fixes

- Show full absolute paths in Central, Platform, Settings, Global Search, and platform-edit flows instead of collapsing paths to `~`.
- Render Windows paths with drive letters and backslashes in display-oriented UI surfaces.
- Keep auto-generated custom platform paths aligned with the detected home-directory style on each platform.

### Improvements

- Add a `Star History` section to the English and Chinese READMEs.
- Extend path helper tests and affected UI assertions to cover the new display rules.

## 0.9.0 - 2026-04-23

Cross-platform release centered on Windows support, universal macOS packaging, and reliability fixes.

### Highlights

- Add Windows x64 desktop support with `.msi` installer and portable `.zip` package outputs.
- Upgrade macOS packaging to universal builds with `.dmg`, `.zip`, and `.tar.gz` release artifacts.

### Features

- Add Windows-aware home and path handling across backend commands, scan-directory settings, and frontend path displays.
- Add automatic install fallback from symlink to copy on Windows when symlink creation is blocked.
- Add GitHub Actions packaging and release automation for Windows x64 and macOS universal desktop builds.

### Fixes

- Preserve Claude source-specific platform rows, detail actions, and explanation content across reloads and rescans.
- Refresh central, platform, and discover surfaces more reliably after global rescans.
- Improve path labels, sidebar/detail continuity, and a set of small accessibility and interaction refinements across settings and skill views.

## 0.8.0 - 2026-04-20

First public release.

### Features

- Launch SkillsHub as a Tauri desktop app for managing AI agent skills across built-in and custom platforms from one place.
- Add platform and central skill views with install, uninstall, symlink-aware status, and canonical skill management.
- Add a full skill detail experience with markdown preview, in-place drawer navigation, install actions, and collection-aware workflows.
- Add collections management, custom platform settings, configurable scan roots, onboarding, toast feedback, and a responsive sidebar.
- Add Chinese and English UI support, a Catppuccin multi-flavor theme system, accent color controls, and a global command palette.
- Add project-level Discover scanning with recursive search, cached results, stop-scan controls, import to central, and improved navigation context.
- Add marketplace browsing, preview drawers, auto-centralized installs, and AI-generated skill explanations.
- Add GitHub repository import with preview, mirror fallback retries, optional authenticated requests, selection persistence, and post-import platform install flows.

### Performance

- Improve global search, central search, and project skill browsing with deferred queries, lazy indexing, lighter search result cards, and list virtualization for large datasets.

### Fixes

- Harden AI explanation generation by rejecting blank cached content and re-generating corrupted empty explanations.
- Improve frontmatter handling by extracting structured metadata such as `name`, `description`, and `version` instead of leaking raw YAML into markdown previews.
- Show existing collection membership in skill details and preselect already-added collections in add-to-collection flows.
- Refine detail drawer, marketplace preview, and GitHub import layouts to preserve context and reduce navigation friction.
