<div align="center">

[简体中文](README_CN.md) | [English](README.md)

# SkillsHub

### A local-first desktop manager for AI agent skills

Collect, update, group, and install `SKILL.md` skills across coding tools and project directories with one shared workflow.

![Release](https://img.shields.io/github/v/release/yufenglyu/skillshub?style=for-the-badge&label=RELEASE&color=5865f2)
![Downloads](https://img.shields.io/github/downloads/yufenglyu/skillshub/total?style=for-the-badge&label=DOWNLOADS&color=56b6c2)
![License](https://img.shields.io/github/license/yufenglyu/skillshub?style=for-the-badge&label=LICENSE&color=57c778)
![Tauri](https://img.shields.io/badge/TAURI-2-24c8db?style=for-the-badge)
![Windows](https://img.shields.io/badge/WINDOWS-10%20%7C%2011-3b82f6?style=for-the-badge)

[Download Latest](https://github.com/yufenglyu/skillshub/releases) · [Features](#core-capabilities) · [Local Development](#local-development) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/yufenglyu/skillshub/issues)

**Current document: English | App languages: English · Simplified Chinese**

</div>

> **Disclaimer**
> SkillsHub is an independent, unofficial application. It is not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, GitHub, skills.sh, MiniMax, or any other supported platform, publisher, or trademark owner.

---

## What Is SkillsHub?

SkillsHub is built for developers who use tools such as Claude Code, Codex CLI, Cursor, Gemini CLI, GitHub Copilot, Warp, Windsurf, or OpenClaw and want one place to manage reusable AI skills.

It separates three concerns:

- **Skill Repository** stores the skills you import or add locally.
- **Skill Bundles** group repository skills for repeatable installation.
- **Shared Hub** exposes selected repository skills through `~/.agents/skills`.

```text
Skill Repository ── install ──► software platforms / project directories
       │
       └── add to Shared Hub ──► ~/.agents/skills
```

---

## Core Capabilities

### Import And Maintain Skills

- Import a GitHub repository with `owner/repo` or a repository URL; SkillsHub reads the GitHub repository snapshot and copies detected `SKILL.md` skills into the repository.
- Add prepared local skill folders or skill packs.
- Check source-backed skills for updates, update one skill, update a folder in directory view, or review update statistics by status.

### Install Across Tools

- Install repository skills directly to enabled software platforms or named project directories.
- Add a skill to Shared Hub with a symlink into the repository, then remove only the link when you take it out.
- Keep flat and folder views consistent across Skill Repository, Shared Hub, platforms, projects, and bundles.

- Installation statistics follow Shared Hub membership: members show detected and enabled software platform and project directory counts, irrespective of paths or compatibility; other skills show manually installed platform/project counts. Platform and project views display source names only; mixed folders show both Shared Hub and independent installation without counts.
- Search aligns with the table content edge. Resize columns without horizontal overflow and drag headers to reorder them.

### Organize And Automate

- Create Skill Bundles, then batch-install a bundle to multiple targets.
- Configure keyboard shortcuts for the command palette, sidebar toggle, flat/folder view toggle, and page navigation.
- Manage projects from sidebar context menus; manage platform definitions, paths, GitHub PAT, AI notes, update checks, local ZIP backup, and WebDAV backup in Settings.
- Update checks continue in the background after navigating away and always stop at a reviewable preview. Applying updates stages and validates every skill first, then restores previous files if a file swap or database write fails.
- WebDAV sync transfers only Skill Repository files and Skill Bundles. Restore uses this device's library path and preserves local settings and installation targets. Update previews and their options survive app restarts and can be reopened from the status bar until the next successful check.

---

## Concepts

| Concept | Purpose | Default location |
|---------|---------|------------------|
| **Skill Repository** | Primary store for imported and local skills | `~/.skillshub/library` |
| **Skill Bundles** | Reusable groups of repository skills | App database |
| **Shared Hub** | Shared compatibility folder backed by repository symlinks | `~/.agents/skills` |
| **Software platforms** | Tool-specific skill folders | Platform config |
| **Project directories** | Named project-scoped install targets | `<project>/.agents/skills` |
| **Config folder** | Database, repository, platform manifest, and settings | `~/.skillshub` or portable `.skillshub` |

Configuration is separate from business data: `config.json` stores general preferences, AI/GitHub/WebDAV settings, project directories, and software platform definitions in its `platforms` field. Icons remain in `platform/icons/`; `platform/platform.json` is no longer used. `db.sqlite` stores skills, bundles, installations, scan results, and related business data. The new format does not import settings or project directory configuration from legacy databases.

If a platform's skills path resolves to `~/.agents/skills`, installing to that platform is equivalent to adding the skill to Shared Hub. Other platforms use their own independent folders.

---

## v0.92.0 workflow notes

- Right-click rows for installation, update, uninstall and delete actions. Ctrl-click toggles selection and Shift-click selects a range. Batch actions share one confirmation and deduplicate folders and child skills.
- Drag column headers to reorder or column edges to resize. Use `+` / `-` in a focused list to expand or collapse. Each bundle occupies one table row.
- Overview metadata and skill lists are collapsible. Select a skill for the Documents tab: the file tree and preview initially share the height equally, with a draggable divider. Expand reading into a half-width, full-height view and close it to restore the previous layout.
- Shared Hub counts require both detection and enablement. Click installation entries to open platform or project pages; remove shared skills through Shared Hub.
- Right-click the Project directories heading to add a project, or a project row to edit or remove it. Settings manages software platforms; closing Settings restores the previous view.
- Update preview shows changed or failed repositories only. Apply or recheck each entry, and keep updates running after closing the dialog. Only changed entries are applied.
- AI Service separates connection configuration from prompts. Edit and save generated notes/tags; tags appear in the editor without duplicate pills.

## Screenshots

Captured from v0.92.0 using demonstration skills and fictional paths.

### Skill Repository

![Skill Repository](images/en/01.png)

### Shared Hub

![Shared Hub](images/en/02.png)

### Skill Bundles

![Skill Bundles](images/en/03.png)

### Settings

![Settings](images/en/04.png)

### Software Platforms And Project Directories

![Software Platforms And Project Directories](images/en/05.png)

### Update Preview

Review changes before applying them. Preview contents and options survive app restarts and remain available from the status bar until the next successful check.

![Update Preview](images/en/06.png)

### WebDAV Repository Sync

Sync repository files and bundles while keeping installation locations and application settings local.

![WebDAV Repository Sync](images/en/07.png)

### Installation Sources In Project Folders

Folders containing both independently installed and Shared Hub skills show both sources.

![Installation Sources In Project Folders](images/en/08.png)

### AI notes and tags

![AI notes and tags](images/en/09.png)

### Configurable AI prompts

![Configurable AI prompts](images/en/10.png)

### Simplified skill import

![Simplified skill import](images/en/11.png)

### Import statistics and skill details

![Import statistics and skill details](images/en/12.png)

---

## Download

Download installers and portable archives from [GitHub Releases](https://github.com/yufenglyu/skillshub/releases).

| OS | Typical artifacts |
|----|-------------------|
| Windows | MSI, `skillshub_*_windows_x64.zip` |
| macOS | DMG, `skillshub_*_macos_universal.zip`, `.tar.gz` |
| Linux | deb, rpm, `skillshub-v*_Linux-*.tar.gz` |

Installers and first launch create `.skillshub` with platform definitions, an empty repository, and SQLite. Portable archives place `.skillshub` next to the executable.

---

## Local Development

### Requirements

- Node.js LTS
- pnpm
- Rust stable
- Tauri v2 prerequisites: <https://v2.tauri.app/start/prerequisites/>

### Commands

```bash
pnpm install
pnpm tauri dev
pnpm test
pnpm typecheck
pnpm lint
cd src-tauri && cargo test
```

### Project Layout

```text
skillshub/
├── src/           # React frontend
├── src-tauri/     # Rust / Tauri backend
├── images/        # Simplified Chinese README screenshots
├── images/en/     # English README screenshots
├── scripts/       # Packaging helpers
├── CHANGELOG.md
└── CHANGELOG.zh.md
```

Local packaging commands:

```bash
pnpm package:release:windows
pnpm package:release:macos
pnpm package:release:linux
```

The scripts directory contains only these three standalone packaging entry points, including config preparation and portable archive creation. To clean build artifacts, use `-Clean` on Windows or `--clean` on macOS/Linux. Cleanup previews by default; add `-Run` / `--run` to execute and `-All` / `--all` to include release builds and node_modules.

---

## Tech Stack

- React 18, TypeScript, React Router, Zustand
- Tailwind CSS 4 and shadcn/ui style primitives
- Tauri v2, Rust, SQLite, SQLx
- GitHub API, WebDAV, optional AI note providers

---

## Data And Privacy

- Local-first; no telemetry.
- Network requests are limited to skill import/update, GitHub requests, WebDAV, update checks, and optional AI notes.
- Full backups include Skill Repository, Skill Bundles, platform/project install state, and ordinary settings.
- Backups do not include Shared Hub links or API keys, tokens, and passwords.
- Credentials are stored on disk unencrypted at rest.

---

## Contributing

Bug reports and focused pull requests are welcome. Do not include private paths, real tokens, proprietary skills, or sensitive screenshots in public issues or logs.

---

## License

[Apache License 2.0](LICENSE)
