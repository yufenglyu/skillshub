# SkillsHub

SkillsHub is a local-first desktop app for collecting, reviewing, and installing AI agent skills across multiple coding tools.

[中文文档](README_CN.md)

> **Disclaimer**
>
> SkillsHub is an independent, unofficial application. It is not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, GitHub, skills.sh, MiniMax, or any other supported platform, publisher, or trademark owner.

## What It Does

SkillsHub keeps skill storage and platform installation separate:

- **Skill Resource Library** is the default place for skills imported through `npx skills` and skills added from local folders.
- **Central Skills** is the compatibility library, usually `~/.agents/skills/`, for skills you intentionally promote into the shared central directory.
- **Software Platforms** are the concrete tool-specific skills folders, such as Claude Code, Codex CLI, Cursor, Gemini CLI, OpenClaw, and similar tools.
- **Collections** let you group skills from the Resource Library and install them as reusable sets.
- **Project Directories** are project-level install targets. SkillsHub manages skills under each configured project's `.agents/skills` folder, so Resource Library and Central Skills can be installed into projects the same way they are installed into software platforms.

Application data is stored in `~/.skillshub/db.sqlite`. On first launch after upgrading from older releases, SkillsHub can migrate an existing `~/.skillsmanage/db.sqlite` database when the new database does not exist yet.

## Highlights

- Resource-library-first workflow where **Import Skills** runs an isolated `npx skills add owner/repo` download and then copies complete skill folders into the Resource Library.
- **Add Skills** copies an already prepared local single-skill folder or skill-pack folder into the Resource Library, keeping local additions distinct from source-tracked npx imports.
- Imports accept only GitHub `owner/repo`; an optional skill name imports a single skill from a multi-skill repository.
- Source-tracked skills support **Update Skills**: SkillsHub checks the saved repository marker first and only re-downloads and overwrites local copies when the source changed.
- The bottom status bar reports live import, update, and install progress, with update summaries for successful, skipped, and failed skills.
- Resource Library folder view grouped by source-style paths such as `owner/repo`, matching common local layouts like `author/project/skill`.
- Folder views in the Resource Library, Central Skills, software platforms, and project directories support folder-level management. Resource Library folders can be promoted to Central Skills or installed into software platforms and project directories, while platform and project directory folders can be uninstalled as folders.
- Single-skill cards and folder cards use the same install icon semantics: the database icon means promote to Central Skills, and the package-install icon means install into a software platform or project directory.
- Skill cards show created and updated dates separately with labels that match the current UI language.
- Direct installation from the Resource Library to selected software platforms or project directories without forcing the skill into Central Skills.
- Collections add skills from the Resource Library instead of only from Central Skills, and collection members can still be installed into software platforms or project directories.
- One-click promotion from the Resource Library to Central Skills, with automatic synchronization to every detected local platform and configured project directory when Central Skills already contains managed skills.
- Central Skills management with folder view, safe deletion previews, platform install status, and batch uninstall from selected platforms.
- Read-only skill detail page that defaults to Markdown preview and merges time, source, and storage-path metadata into one Basic Info section.
- Software platform management in Settings, including editable built-in platforms, custom platforms, Lobster/Coding grouping, two-column compact layout, built-in/detected group counts, and visual distinction for detected local skills directories.
- Project directory management in Settings, now ordered below Software Platforms and treated as project-scoped install targets using `.agents/skills`.
- Collapsible sidebar sections for Software Platforms, Lobster platforms, Coding platforms, and Project Directories.
- Local ZIP backup and WebDAV backup/import, including connection testing, remote backup listing, upload, selected import, and selected delete. Backup files exclude API keys, tokens, and password-like values.
- Update checking from the About section.
- Bilingual UI, system/light/dark theme mode from the lower-left sidebar, unified selected-state colors across sidebar/provider/language controls, and a simplified top area without a global search box.

## Screenshots

English screenshots are generated from the English UI. Chinese screenshots are kept in [README_CN.md](README_CN.md).

### Skill Resource Library

![Skill Resource Library](images/en/01.png)

### Central Skills

![Central Skills](images/en/02.png)

### Collections

![Collections](images/en/03.png)

### Settings, Platforms, And Backup

![Settings, platforms, and backup](images/en/04.png)

### Platform Skills

![Platform skills](images/en/05.png)

### Project Directories

![Project directories](images/en/06.png)

## Skill Storage Model

SkillsHub uses four different storage concepts:

| Area | Purpose | Typical Path |
|------|---------|--------------|
| Skill Resource Library | Long-term local storage for imported or manually created skills | `~/.skillshub/library` |
| Central Skills | Shared compatibility directory for intentionally promoted skills | `~/.agents/skills` |
| Platform directory | Tool-specific install target created as a symlink or copy | Depends on platform |
| Project directory | Project-scoped install target managed below the configured project root | `<project>/.agents/skills` |

Installing a skill directly from the Resource Library writes only to the selected software platforms or project directories. Promoting a skill to Central Skills writes to the central directory. When Central Skills already contains managed skills, newly detected local platforms and configured project directories are automatically included in central synchronization and shown in the sidebar.

Collections store skill references. When adding skills, the picker reads from the Resource Library; when installing a collection or a single skill inside a collection, SkillsHub distributes the Resource Library skill into the selected software platforms or project directories.

Changing the Resource Library path, Central Skills path, platform directory, or project directory does not automatically rewrite existing symlinks or copies. Reinstall affected skills if you intentionally move those directories.

## Supported Platforms

Built-in platform definitions can be edited or removed from Settings. They are stored in local app configuration when changed, so the customizations survive restart.

| Category | Examples |
|----------|----------|
| Coding | Claude Code, Codex CLI, Cursor, Gemini CLI, GitHub Copilot, Kiro CLI, Warp, Windsurf, Trae, Aider, OpenCode, Continue, Qwen, and other coding agents |
| Lobster | OpenClaw, AutoClaw, EasyClaw, QClaw, WorkBuddy, and related Lobster-style platforms |
| Custom | Any local platform with a stable skills directory |

In the sidebar, built-in platforms are shown only when their configured skills directory exists locally, unless you explicitly choose to show all platforms. Software platform groups and project directory lists can be collapsed independently. Settings group headers show both the total built-in platform count and the number detected on the current machine.

## Importing And Adding Skills

The Resource Library separates network imports from local folder additions:

- **Import Skills** accepts only a GitHub `owner/repo`. SkillsHub runs `npx skills add owner/repo` in an isolated temporary directory, then copies the complete downloaded skill folders into the Resource Library. When you fill the optional skill name, only that skill is imported.
- **Add Skills** copies an already prepared local skill folder. The folder can be a single skill directory or a pack directory containing multiple skills. SkillsHub marks these records as local additions.

Skills imported through `npx skills` store the source repository, optional skill name, and source update marker for later **Update Skills** runs. Local additions have no remote source and are not included in source updates.

## Backup And Migration

SkillsHub can export and import complete local backup files. WebDAV backup support adds connection testing, remote backup listing, upload, selected-remote restore, and selected-remote delete workflows.

Backups include skills, source metadata, collections, custom platform settings, regular app settings, and platform installation state. API keys, tokens, and passwords are intentionally excluded and must be re-entered after restore.

## Privacy And Security

- SkillsHub is local-first and does not include telemetry.
- Network requests happen only when you use network-backed features such as `npx skills` import/update, WebDAV backup, update checking, or AI-generated notes.
- Credentials are stored locally when you choose to save them. The app does not encrypt local settings at rest.
- Do not share real tokens, API keys, private paths, or sensitive screenshots in issues, pull requests, or logs.

## Development

### Requirements

- Node.js LTS
- pnpm
- Rust stable toolchain
- Tauri v2 system dependencies: <https://v2.tauri.app/start/prerequisites/>

### Commands

```bash
pnpm install
pnpm tauri dev
pnpm build
pnpm test
pnpm typecheck
pnpm lint
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

The Vite development server uses port `24200`.

## Release

GitHub Actions publishes desktop packages when a version tag such as `v0.20.0` is pushed. The release workflow reads release notes from `CHANGELOG.md`, so every release version must have a matching changelog section.

Local packaging scripts are still available for host-specific builds:

| Platform | Command |
|----------|---------|
| Windows | `pnpm package:release:windows -- -Version 0.20.0` |
| macOS | `pnpm package:release:macos -- -Version 0.20.0` |
| Linux | `pnpm package:release:linux -- -Version 0.20.0` |

Use `-VersionOnly` when you only need to update version metadata before committing a release.

### Build Output Directories

Tauri and the local packaging scripts intentionally use separate output folders:

| Path | Produced By | Purpose | Upload To Release |
|------|-------------|---------|-------------------|
| `dist/` | Vite | Frontend build copied into the desktop app by Tauri | No |
| `src-tauri/target/` | Cargo/Tauri | Rust build cache, executable, and raw platform bundle output | No |
| `release-assets/` | Local packaging scripts and GitHub Actions | Final renamed installer/archive files for distribution | Yes |

When packaging locally, use files from `release-assets/`. Treat `dist/` and `src-tauri/target/` as generated build internals unless you are diagnosing a build problem.

## Project Structure

```text
skillshub/
├── src/                 # React frontend
├── src-tauri/           # Rust/Tauri backend
├── dist/                # Generated Vite frontend build used by Tauri
├── src-tauri/target/    # Generated Cargo/Tauri build output
├── release-assets/      # Generated final release installers and archives
├── images/              # Chinese README screenshots
├── images/en/           # English README screenshots
├── scripts/             # Release packaging scripts
├── CHANGELOG.md         # English changelog
└── CHANGELOG.zh.md      # Chinese changelog
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
