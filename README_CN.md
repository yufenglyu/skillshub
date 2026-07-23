# SkillsHub

SkillsHub 是一个本地优先的桌面应用，用来收集、查看、整理并安装 AI agent skills 到多个 coding 工具。

[English](README.md)

> **免责声明**
>
> SkillsHub 是独立的非官方应用。它与 Anthropic、OpenAI、GitHub、skills.sh、MiniMax 或其他受支持平台、发布方、商标所有者均无隶属、背书或赞助关系。

## 它解决什么问题

SkillsHub 把技能的长期保存和平台安装拆开：

- **技能资源库** 是默认入口，用于保存导入、下载和手动创建的 skills。GitHub 仓库和支持的 skills.sh 链接都会先导入这里。
- **中央技能库** 通常是 `~/.agents/skills/`，用于把你明确选择共享的技能放入兼容目录。
- **软件平台** 是具体工具自己的 skills 目录，例如 Claude Code、Codex CLI、Cursor、Gemini CLI、OpenClaw 等。
- **技能集合** 用于把中央技能组成可复用分组，并批量安装到平台。
- **项目技能库** 用于扫描已配置的项目目录，发现还没有纳入 SkillsHub 管理的 skills。

应用数据保存在 `~/.skillshub/db.sqlite`。从旧版本升级时，如果新数据库不存在，SkillsHub 会在首次启动时迁移已有的 `~/.skillsmanage/db.sqlite`。

## 核心能力

- 以技能资源库为默认工作流，支持 GitHub 导入、支持的 skills.sh 导入和手动创建技能。
- 资源库顶部提供统一的 **导入技能** 菜单，合并“从 GitHub 导入”和“从 skills.sh 导入”。
- GitHub 仓库导入支持先预览，再选择导入，并处理重命名、覆盖或跳过冲突。
- 导入技能会记录来源信息；可追踪来源的技能支持从来源更新。
- 技能资源库的来源更新会先从已保存的 GitHub 仓库和路径信息恢复缺失的 raw URL，再更新本地文件。
- 技能资源库目录视图按 `owner/repo` 这类来源路径分组，更贴近 `作者/项目/技能` 的本地结构。
- 技能卡片会分别显示创建日期和更新日期，并根据当前界面语言显示对应标签。
- 资源库技能可以直接安装到指定平台，不强制加入中央技能库。
- 资源库技能也可以一键加入中央技能库；中央技能库已有托管技能时，新检测到的本地平台会自动纳入同步和侧边栏显示。
- 中央技能库支持目录视图、安全删除预览、平台安装状态和批量从平台卸载。
- 技能详情页支持 Markdown 预览、原始源码、备注、标签、来源信息、时间信息、存储路径、安装状态和技能集合等分区。
- 来源信息支持手动编辑，包括来源类型、来源仓库、来源作者、来源路径和来源 URL。
- 设置页的软件平台管理支持编辑/删除内置平台、添加自定义平台、龙虾类/编程类分组、紧凑两列布局、内置/已检测数量统计，并区分本机已检测到目录和未检测到目录的平台。
- 支持本地 ZIP 备份和 WebDAV 备份/导入，包括测试连接、查看远端、上传备份、导入选中和删除选中；备份文件不会包含 API Key、Token 或密码类内容。
- 关于区域支持检查更新。
- 中英文界面、左下角系统/浅色/深色主题切换，侧边栏、提供商、语言选中态颜色统一，顶部区域去掉全局搜索框，主视图保留各页面自己的搜索和操作入口。

## 界面截图

中文 README 使用中文界面截图；英文 README 使用英文界面截图，避免中英文混用。

### 技能资源库

![技能资源库](images/01.png)

### 中央技能库

![中央技能库](images/02.png)

### 技能集合

![技能集合](images/03.png)

### 设置、软件平台与备份

![设置、软件平台与备份](images/04.png)

### 平台技能

![平台技能](images/05.png)

### 项目技能库

![项目技能库](images/06.png)

## 存储模型

SkillsHub 使用三个不同的存储概念：

| 区域 | 用途 | 常见路径 |
|------|------|----------|
| 技能资源库 | 长期保存导入或手动创建的技能 | `~/.skillshub/library` |
| 中央技能库 | 保存明确加入共享兼容目录的技能 | `~/.agents/skills` |
| 平台目录 | 某个工具自己的安装目标，通常是符号链接或复制文件 | 取决于平台 |

从技能资源库直接安装技能时，只写入所选平台。加入中央技能库时，会写入中央目录。中央技能库已有托管技能时，新检测到的本地平台会自动纳入中央技能同步，并显示在侧边栏中。

修改技能资源库路径或中央技能库路径不会自动改写已有平台软链接或副本；如果你确实移动了目录，需要按需重新安装相关技能。

## 支持的平台

内置平台可以在设置页编辑或删除。对内置平台的修改会写入本地配置文件，下次启动后仍然保留。

| 分类 | 示例 |
|------|------|
| 编程类 | Claude Code、Codex CLI、Cursor、Gemini CLI、GitHub Copilot、Kiro CLI、Warp、Windsurf、Trae、Aider、OpenCode、Continue、Qwen 等 |
| 龙虾类 | OpenClaw、AutoClaw、EasyClaw、QClaw、WorkBuddy 等 |
| 自定义 | 任意拥有稳定 skills 目录的本地平台 |

左侧栏默认只展示本机已存在对应 skills 目录的内置平台；也可以手动切换为显示全部平台。设置页的平台分组标题会同时显示内置平台总数和当前电脑已检测到的数量。

## 导入技能

技能资源库提供一个统一的导入菜单：

- **从 GitHub 导入**：输入仓库 URL，预览仓库中的 `SKILL.md`，选择后导入到技能资源库。
- **从 skills.sh 导入**：输入支持的 skills.sh 技能链接，解析背后的 GitHub 来源后导入到技能资源库。

可以在设置页配置 GitHub Personal Access Token，用于需要认证或遇到 GitHub 限流时的直连请求。Token 只用于 GitHub 相关域名，不会写入备份文件。

## 备份与迁移

SkillsHub 支持导出和导入完整本地备份文件。WebDAV 备份支持测试连接、查看远端备份列表、上传、选择远端备份恢复，以及删除选中的远端备份。

备份包含技能文件、来源信息、技能集合、自定义平台、普通应用配置和平台安装状态。API Key、Token 和密码类内容会被排除，恢复后需要重新填写。

## 隐私与安全

- SkillsHub 本地优先，不包含遥测。
- 只有在使用 GitHub 导入、skills.sh 链接解析、来源更新、WebDAV 备份、检查更新或 AI 备注等网络功能时才会发起请求。
- 你选择保存的凭据会保存在本机；应用不会对本地设置做静态加密。
- 不要在 issue、PR、截图或日志中公开真实 Token、API Key、私有路径或其他敏感信息。

## 开发

### 环境要求

- Node.js LTS
- pnpm
- Rust stable toolchain
- Tauri v2 系统依赖：<https://v2.tauri.app/start/prerequisites/>

### 常用命令

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

Vite 开发服务器默认使用 `24200` 端口。

## 发布

推送 `v0.15.0` 这样的版本 tag 后，GitHub Actions 会构建并发布桌面安装包。发布工作流会从 `CHANGELOG.md` 读取对应版本的 release notes，因此每次发布都必须有匹配的更新日志条目。

本地仍可使用分平台脚本打包：

| 平台 | 命令 |
|------|------|
| Windows | `pnpm package:release:windows -- -Version 0.15.0` |
| macOS | `pnpm package:release:macos -- -Version 0.15.0` |
| Linux | `pnpm package:release:linux -- -Version 0.15.0` |

只需要更新版本元数据时使用 `-VersionOnly`。

## 项目结构

```text
skillshub/
├── src/                 # React 前端
├── src-tauri/           # Rust/Tauri 后端
├── images/              # 中文 README 截图
├── images/en/           # 英文 README 截图
├── scripts/             # 发布打包脚本
├── CHANGELOG.md         # 英文更新日志
└── CHANGELOG.zh.md      # 中文更新日志
```

## 许可证

本项目使用 Apache License 2.0，详见 [LICENSE](LICENSE)。
