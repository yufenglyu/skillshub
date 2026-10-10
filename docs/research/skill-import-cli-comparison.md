# 技能导入 CLI 对比核验

核验日期：2026-10-10。仅阅读公开官方文档、源码与本项目业务代码；没有执行安装、更新或发布命令。外部文档对应滚动更新的 main / trunk，不代表固定发行版已经包含全部功能。

## 命令名称与定位

- Vercel Labs 的命令是 `npx skills`（复数），npm 包与可执行名称均为 `skills`。本笔记按这一方案理解用户的“npx skill”。[官方 package.json](https://github.com/vercel-labs/skills/blob/main/package.json)
- 当前 `gh skill` 是 GitHub CLI 内置命令，官方发布公告要求 v2.90.0 或更新版本；手册仍将这组功能标为 preview。不能因为存在同名第三方扩展就将官方方案描述为扩展。[官方公告](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/)、[命令手册](https://cli.github.com/manual/gh_skill)

## 外部方案对比

| 维度 | npx skills | gh skill |
| --- | --- | --- |
| 定位 | 跨来源、跨 Agent 技能 CLI | GitHub 仓库技能管理 |
| 来源 | GitHub、GitLab、Azure Repos、Git URL、本地路径、直接文件或归档 URL | GitHub OWNER/REPO、本地目录 |
| 安装 | add；选择技能与 Agent；项目或全局；symlink 或 copy | install；项目或用户；可用 --dir 指定目录 |
| 版本 | Git ref 来源能力；具体更新行为需结合锁文件与版本核验 | 默认最新 release，回退默认分支；支持 @version / --pin |
| 更新 | update，可指定技能及项目/全局范围 | update，以 frontmatter 中 tree SHA 比对；--dry-run；pin 默认跳过 |
| 其它 | find、list、remove、init、use | search、list、preview、publish |

表中 npx 功能据 [官方 README](https://github.com/vercel-labs/skills/blob/main/README.md)；gh 安装、更新分别据 [install 手册](https://cli.github.com/manual/gh_skill_install)、[update 手册](https://cli.github.com/manual/gh_skill_update)。gh 搜索通过 GitHub Code Search API 搜索公开仓库；publish 负责规范校验及创建 GitHub Release。[search](https://cli.github.com/manual/gh_skill_search)、[publish](https://cli.github.com/manual/gh_skill_publish)

## 下载机制、依赖与元数据

`npx skills` 的 Git 来源由系统 Git 做 shallow clone（depth 1）；指定 SHA 时有 init + fetch + checkout 的回退。GitHub 认证失败可尝试已有 gh 与 SSH 环境。Git 来源因此有 Node/npm 与 Git 运行环境要求，gh 为可选回退，不能笼统写成完全不依赖 Git。当前 main 的 package.json 声明 Node >=22.20.0；发行版本应单独固定。[git.ts](https://github.com/vercel-labs/skills/blob/main/src/git.ts)、[package.json](https://github.com/vercel-labs/skills/blob/main/package.json)

`gh skill` 不依赖 Node/npm。官方安装命令提供 `--dir`，适合将技能先放入临时目录；安装会改写 SKILL.md frontmatter，注入来源跟踪 metadata。本地来源明确复制文件而非建立链接。更新可扫描自定义目录；无来源 metadata 的第三方安装技能，在非交互模式会跳过。其远程底层究竟采用逐文件 API 还是归档，本轮未获得可核验源码，故不作断言。[install](https://cli.github.com/manual/gh_skill_install)、[update](https://cli.github.com/manual/gh_skill_update)

## 本项目当前代码证据

以下项目核验由主任务提供，依据当前代码，不沿用旧架构说明中 skills_cli.rs 的描述：

- 当前主通路是 Rust GitHub 快照导入；预览、导入都下载整仓 tarball，解压普通文件进内存。[github_import.rs](src-tauri/src/commands/github_import.rs:291)、[下载与解压](src-tauri/src/commands/github_import.rs:1219)
- 前端按技能拆导入步骤，多技能可能重复下载仓库。[importPreparationStore.ts](src/stores/importPreparationStore.ts:42)
- 根目录技能当前只收集根级文件，普通技能收集子目录；根技能资源完整性需要修复。[collect_snapshot_source_files](src-tauri/src/commands/github_import.rs:1326)
- 导入提供冲突处理、暂存目录、数据库事务及回滚；来源更新有固定 SHA 快照及 added / modified / deleted / unchanged 文件分类。[导入事务](src-tauri/src/commands/github_import.rs:612)、[来源更新](src-tauri/src/commands/remote_sources.rs:646)

## 对 SkillsHub 的适配判断

建议保留现有 Rust 导入、资源库与安装管理作为主通路，优先修复根技能资源遗漏、ref/路径解析及重复整仓下载。外部 CLI 可作为可选来源适配器：下载到隔离临时目录，扫描校验后提交资源库，再由现有 linker 安装到平台。此项是设计建议，尚未实施或测试。

`npx skills` 更适合扩展 GitLab、Azure Repos 等来源；`gh skill` 更适合已有 GitHub CLI 环境及版本 pin、preview 等需求。gh 的 `--dir` 降低隔离适配成本，但需明确 frontmatter 注入与 SkillsHub 数据库来源信息如何归一，避免形成两套更新机制。官方 preview 状态意味着接入前应固定 CLI 版本并做兼容验收。
