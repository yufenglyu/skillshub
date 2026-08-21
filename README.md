# SkillsHub

A local-first desktop app for collecting and organizing AI agent skills (`SKILL.md`), then installing them into coding tools and project directories.

[中文文档](README_CN.md) · [Releases](https://github.com/yufenglyu/skillshub/releases) · [Changelog](CHANGELOG.md)

> **Disclaimer**  
> SkillsHub is an independent, unofficial application. It is not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, GitHub, skills.sh, MiniMax, or any other supported platform, publisher, or trademark owner.

---

## Who It’s For

You use tools like Claude Code, Codex, Cursor, Gemini CLI, or OpenClaw, and you don’t want to:

- Keep a separate copy of every skill in every tool  
- Mix “download stash” with the folders tools actually read  
- Lose install relationships after a reinstall or machine switch  

SkillsHub keeps **long-term storage**, a **shared compatibility library**, and **per-tool install targets** separate.

---

## Core Ideas

| Concept | Role | Default path |
|---------|------|--------------|
| **Skill Resource Library** | Home for imported and locally added skills | `~/.skillshub/library` |
| **Central Skills** | Shared compatibility library you opt into (symlink into the library) | `~/.agents/skills` |
| **Software platforms** | Tool-specific skills directories (symlink or copy) | Per platform config |
| **Project directories** | Named project-scoped install targets | `<project>/.agents/skills` |
| **Skill Collections Library** | Reusable groups of Resource Library skills | App database |
| **Config folder** | Database, library, platform manifest and icons | `~/.skillshub` (or `.skillshub` next to a portable binary) |

```text
Resource Library ── install ──► selected platforms / projects
       │
       └── add to Central Skills ──► ~/.agents/skills
                                        │
                                        └── available to “shared” platforms
```

- Resource Library skills can install **directly** to platforms or projects without entering Central Skills.  
- Adding to Central Skills creates a symlink only; removing from Central Skills deletes the link.  
- If a platform’s skills path resolves to `~/.agents/skills`, installing there means **Add to Central Skills**. Settings labels those platforms **Shared**; others are **Independent**.

---

## Features

- **One table UX** across Resource Library, Central Skills, platforms, and projects — search, sort, flat / folder views.  
- **Import skills** via GitHub `owner/repo` (`npx skills add` in an isolated temp dir), optionally one skill from a multi-skill repo.  
- **Add skills** by copying a prepared local skill or skill pack.  
- **Update skills** when a source marker changed; live progress in the status bar.  
- **Install / uninstall** to checked platforms or projects; collections can fan out to many targets (including optional Central Skills).  
- **Discover** scans disk for unmanaged project skills (no sidebar entry; reachable from global search).  
- **Settings** for paths, enable/edit platforms, project directories, local ZIP / WebDAV backup, GitHub PAT, optional AI notes, and updates.  
- **Chinese / English UI** and Catppuccin-style themes.

---

## Screenshots

### Skill Resource Library

![Skill Resource Library](images/en/01.png)

### Central Skills

![Central Skills](images/en/02.png)

### Skill Collections Library

![Skill Collections Library](images/en/03.png)

### Software platforms

![Software platforms](images/en/05.png)

### Settings

![Settings](images/en/04.png)

---

## Download

Get installers or portable archives from [GitHub Releases](https://github.com/yufenglyu/skillshub/releases):

| OS | Typical artifacts |
|----|-------------------|
| Windows | MSI, `skillshub_*_windows_x64.zip` |
| macOS | DMG, `skillshub_*_macos_universal.zip` / `.tar.gz` |
| Linux | deb / rpm, `skillshub-v*_Linux-*.tar.gz` |

Installers (or first launch) prepare `.skillshub` with default platform JSON/icons, an empty library, and SQLite. Portable archives already ship `.skillshub` next to the app. Upgrading from older builds may migrate `~/.skillsmanage` when the new folder does not exist yet.

---

## Supported Platforms

Built-in definitions live in `.skillshub/platform/platform.json` with icons under `platform/icons/`. That folder is the source of truth after startup; older per-file JSON layouts migrate automatically. Enable, disable, or edit builtins in Settings, or add custom platforms (kebab-case ids).

Examples: Claude Code, Codex CLI, Cursor, Gemini CLI, GitHub Copilot, OpenClaw, Warp, Windsurf, Trae, Aider, OpenCode, Continue, Qwen, and more. The sidebar shows **enabled and locally detected** platforms by default.

---

## Backup And Privacy

- **Local-first**, no telemetry.  
- Network use is limited to skill import/update, GitHub-related requests, WebDAV, update checks, and optional AI notes.  
- Full backups include the Resource Library, collections, platform/install state, and ordinary settings — **not** Central Skills, and **not** API keys / tokens / passwords.  
- Credentials stay on disk unencrypted at rest. Do not paste real tokens, private paths, or sensitive screenshots into issues, PRs, or logs.

---

## Development

### Requirements

- Node.js LTS, pnpm, Rust stable  
- Tauri v2 prerequisites: <https://v2.tauri.app/start/prerequisites/>

### Commands

```bash
pnpm install
pnpm tauri dev          # full app (Vite on port 24200)
pnpm test
pnpm typecheck
pnpm lint
cd src-tauri && cargo test
```

### Layout

```text
skillshub/
├── src/           # React frontend
├── src-tauri/     # Rust / Tauri backend
├── images/        # Chinese README screenshots
├── images/en/     # English README screenshots
├── scripts/       # Packaging and screenshot helpers
├── CHANGELOG.md
└── CHANGELOG.zh.md
```

Local packaging: `pnpm package:release:windows|macos|linux`. CI publishes on version tags; release notes come from `CHANGELOG.md`.

---

## License

[Apache License 2.0](LICENSE)
