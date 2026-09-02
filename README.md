# SkillsHub

### A local-first desktop manager for AI agent skills

SkillsHub helps you collect, update, group, and install `SKILL.md` skills across coding tools and project directories without mixing long-term storage with runtime install folders.

[简体中文](README_CN.md) · [Download](https://github.com/yufenglyu/skillshub/releases) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/yufenglyu/skillshub/issues)

Current document language: **English**. App languages: **English / Simplified Chinese**.

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

- Import a GitHub repository with `owner/repo`; SkillsHub runs `npx skills add` in an isolated temporary directory before copying results into the repository.
- Add prepared local skill folders or skill packs.
- Check source-backed skills for updates, update one skill, update a folder in directory view, or review update statistics by status.

### Install Across Tools

- Install repository skills directly to enabled software platforms or named project directories.
- Add a skill to Shared Hub with a symlink into the repository, then remove only the link when you take it out.
- Keep flat and folder views consistent across Skill Repository, Shared Hub, platforms, projects, and bundles.

### Organize And Automate

- Create Skill Bundles, then batch-install a bundle to multiple targets.
- Configure keyboard shortcuts for the command palette, sidebar toggle, flat/folder view toggle, global rescan, and page navigation.
- Manage platform definitions, project directories, paths, GitHub PAT, AI notes, update checks, local ZIP backup, and WebDAV backup in Settings.

---

## Concepts

| Concept | Purpose | Default location |
|---------|---------|------------------|
| **Skill Repository** | Primary store for imported and local skills | `~/.skillshub/library` |
| **Skill Bundles** | Reusable groups of repository skills | App database |
| **Shared Hub** | Shared compatibility folder backed by repository symlinks | `~/.agents/skills` |
| **Software platforms** | Tool-specific skill folders | Platform config |
| **Project directories** | Named project-scoped install targets | `<project>/.agents/skills` |
| **Config folder** | Database, repository, platform manifest, icons, settings | `~/.skillshub` or portable `.skillshub` |

If a platform's skills path resolves to `~/.agents/skills`, installing to that platform is equivalent to adding the skill to Shared Hub. Other platforms use their own independent folders.

---

## Screenshots

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

---

## Download

Download installers and portable archives from [GitHub Releases](https://github.com/yufenglyu/skillshub/releases).

| OS | Typical artifacts |
|----|-------------------|
| Windows | MSI, `skillshub_*_windows_x64.zip` |
| macOS | DMG, `skillshub_*_macos_universal.zip`, `.tar.gz` |
| Linux | deb, rpm, `skillshub-v*_Linux-*.tar.gz` |

Installers and first launch create `.skillshub` with platform definitions, icons, an empty repository, and SQLite. Portable archives place `.skillshub` next to the executable.

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
