# SkillsHub

SkillsHub is a local-first Tauri desktop app for managing AI agent skills across a resource library, a central skill library, and many coding platforms.

[中文文档](README_CN.md)

> **Disclaimer**
>
> SkillsHub is an independent, unofficial desktop application for managing local skill directories and importing public skill metadata. It is not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, GitHub, MiniMax, or any other supported platform, publisher, or trademark owner.

## Overview

SkillsHub separates long-term skill storage from platform installation:

- **Skill Resource Library** is the default home for downloaded, imported, and source-backed skills. It can be any local directory and is organized by author or repository when source metadata is available.
- **Central Skills** is the compatibility directory, usually `~/.agents/skills/`, used when a skill should be shared with compatible tools or distributed to selected platforms.
- **Platform views** show what each coding agent can see and let you install, uninstall, or batch-uninstall skills without deleting the resource copy.

Application data is stored in `~/.skillshub/db.sqlite`. On first launch after upgrading, SkillsHub copies an existing `~/.skillsmanage/db.sqlite` database into the new directory if the new database does not exist yet.

## Highlights

- Resource library first workflow for GitHub imports, marketplace installs, and local skill storage.
- One-click promotion from the resource library to Central Skills while preserving source grouping such as `owner/repo/skill`.
- Manual platform selection for installs, with symlink, copy, and automatic fallback modes.
- Central Skills directory view with folder mode, bulk platform uninstall, source updates, and safe delete previews.
- Skill detail view with Markdown preview, raw source, AI explanation, source metadata, author/repo, creation/update timestamps, notes, and tags.
- Search across names, descriptions, notes, tags, and source metadata.
- Tag filtering and collection management for reusable skill sets.
- GitHub repository import with preview, rename/overwrite/skip conflict handling, and source metadata tracking.
- Marketplace browsing, source sync, and per-source updates.
- App backup import/export for skills, metadata, collections, settings, and resource/central storage layout.
- Project skill discovery, including Obsidian vault grouping and local project skill directories.
- Bilingual UI, Catppuccin themes, accent colors, responsive navigation, and compact shortcut buttons.

## Screenshots

### Skill Resource Library

![Skill resource library view](images/01.png)

### Review installed skills on a specific platform

![Platform skill view](images/06.png)

### Discover local project skill libraries

![Discover project skill libraries](images/03.png)

### Browse marketplace publishers and skills

![Marketplace view](images/04.png)

### Import skills from a GitHub repository

![GitHub repository import wizard](images/02.png)

### Organize reusable collections

![Skill collections view](images/05.png)

## Download

- Latest release: <https://github.com/yufenglyu/skillshub/releases/latest>
- Windows, macOS, and Linux packages can be built with `scripts/package-release.ps1`.
- If a platform package is not published yet, run from source.

### macOS Unsigned Build

If macOS reports that the app is damaged or cannot be verified, the unsigned build may be blocked by Gatekeeper quarantine.

After moving the app to `/Applications`, run:

```bash
xattr -dr com.apple.quarantine "/Applications/SkillsHub.app"
```

Then launch the app again from Finder. If your app is stored somewhere else, replace the path with the actual `.app` path.

## Supported Platforms

| Category | Platform | Skills Directory |
|----------|----------|-----------------|
| Coding | Claude Code | `~/.claude/skills/` |
| Coding | Codex CLI | `~/.agents/skills/` |
| Coding | Cursor | `~/.cursor/skills/` |
| Coding | Gemini CLI | `~/.gemini/skills/` |
| Coding | Trae | `~/.trae/skills/` |
| Coding | Factory Droid | `~/.factory/skills/` |
| Coding | Junie | `~/.junie/skills/` |
| Coding | Qwen | `~/.qwen/skills/` |
| Coding | Trae CN | `~/.trae-cn/skills/` |
| Coding | Windsurf | `~/.windsurf/skills/` |
| Coding | Qoder | `~/.qoder/skills/` |
| Coding | Augment | `~/.augment/skills/` |
| Coding | OpenCode | `~/.opencode/skills/` |
| Coding | KiloCode | `~/.kilocode/skills/` |
| Coding | OB1 | `~/.ob1/skills/` |
| Coding | Amp | `~/.amp/skills/` |
| Coding | Kiro | `~/.kiro/skills/` |
| Coding | CodeBuddy | `~/.codebuddy/skills/` |
| Coding | Hermes | `~/.hermes/skills/` |
| Coding | Copilot | `~/.copilot/skills/` |
| Coding | Aider | `~/.aider/skills/` |
| Lobster | OpenClaw | `~/.openclaw/skills/` |
| Lobster | QClaw | `~/.qclaw/skills/` |
| Lobster | EasyClaw | `~/.easyclaw/skills/` |
| Lobster | EasyClaw V2 | `~/.easyclaw-20260322-01/skills/` |
| Lobster | AutoClaw | `~/.openclaw-autoclaw/skills/` |
| Lobster | WorkBuddy | `~/.workbuddy/skills-marketplace/skills/` |
| Central | Central Skills | `~/.agents/skills/` |

Claude Code can also surface plugin and compatibility directories as read-only rows. Those entries are display-only and are not removed from platform views by uninstall actions.

Custom platforms can be added from Settings.

## Storage Model

SkillsHub keeps three concepts separate:

1. **Resource Library** stores imported or downloaded skills for long-term management.
2. **Central Skills** stores skills that should be shared through `~/.agents/skills/` or copied/symlinked to platforms.
3. **Platform Directories** contain symlinks or copies created only when you install a skill to selected tools.

Changing the Resource Library path does not move existing platform installs. Changing the Central Skills path keeps the old database and settings, but existing platform links may need to be reinstalled.

## Privacy & Security

- **Local-first storage**: metadata, collections, scan results, settings, and cached AI explanations stay in `~/.skillshub/db.sqlite` or the local skill directories you manage.
- **No telemetry**: the app does not include analytics, crash reporting, or usage tracking.
- **Network access is feature-driven**: outbound requests only happen when you use marketplace sync/download, GitHub import, source updates, or AI explanation generation.
- **Credentials are stored locally**: GitHub PAT and AI API keys are stored in the local SQLite settings table and are not encrypted at rest by the app.
- Never post real secrets in issues, pull requests, screenshots, or logs.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 |
| Frontend | React 18, TypeScript, Tailwind CSS 4 |
| UI components | shadcn/ui, Lucide icons |
| State management | Zustand |
| Markdown | react-markdown |
| i18n | react-i18next, i18next-browser-languagedetector |
| Theming | Catppuccin palette |
| Backend | Rust, serde, sqlx, chrono, uuid |
| Database | SQLite via sqlx, WAL mode |
| Routing | react-router-dom v7 |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) LTS
- [pnpm](https://pnpm.io/)
- [Rust toolchain](https://rustup.rs/) stable
- Tauri v2 system dependencies: <https://v2.tauri.app/start/prerequisites/>

### Install Dependencies

```bash
pnpm install
```

### Run in Development

```bash
pnpm tauri dev
```

The Vite dev server runs on port `24200`.

### Validation

```bash
pnpm test
pnpm typecheck
pnpm lint
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

### Package a Release

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1 -Version 0.10.7
```

The script updates version metadata, runs type and Rust compile checks unless skipped, builds Tauri packages, and writes release assets under `release-assets/`.

Target the current OS:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1 -Version 0.10.7 -Platforms auto
```

Target one or more platforms:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1 -Version 0.10.7 -Platforms windows
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1 -Version 0.10.7 -Platforms linux
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1 -Version 0.10.7 -Platforms macos
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1 -Version 0.10.7 -Platforms windows,linux,macos
```

`-Platforms all` expands to Windows, Linux, and macOS. The macOS target builds two packages: `macos_x64` for Intel Macs and `macos_arm64` for Apple Silicon / M-series Macs. Each target still requires the corresponding Tauri toolchain and OS packaging dependencies; macOS packages should be built on macOS, Linux bundles on Linux, and Windows MSI packages on Windows.

## Project Structure

```text
skillshub/
├── src/                        # React frontend
│   ├── components/             # UI components
│   ├── i18n/                   # Locale files and i18n setup
│   ├── lib/                    # Frontend helpers
│   ├── pages/                  # Route views
│   ├── stores/                 # Zustand stores
│   ├── test/                   # Vitest + RTL tests
│   └── types/                  # Shared TypeScript types
├── src-tauri/                  # Rust backend
│   └── src/
│       ├── commands/           # Tauri IPC handlers
│       ├── db.rs               # SQLite schema, migrations, queries
│       ├── lib.rs              # Tauri app setup
│       └── main.rs             # Desktop entry point
├── public/                     # Static assets
├── CHANGELOG.md                # English changelog
├── CHANGELOG.zh.md             # Chinese changelog
└── release-notes/              # GitHub release notes
```

## Database

The SQLite database lives at `~/.skillshub/db.sqlite`. Existing `~/.skillsmanage/db.sqlite` data is migrated automatically on first launch when no new database is present.

## Changelog

- English: [CHANGELOG.md](CHANGELOG.md)
- Chinese: [CHANGELOG.zh.md](CHANGELOG.zh.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, validation commands, and pull request expectations.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and data-handling notes.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
