use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

use super::github_import;
use crate::commands::skills::{
    add_repo_resource_skills_impl, AddLocalResourceSkillsRequest, AddLocalResourceSkillsResult,
};
use crate::db::{self, DbPool};
use crate::path_utils;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSkillsViaNpxRequest {
    pub input: String,
    pub skill: Option<String>,
    pub overwrite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSkillsViaNpxResult {
    pub package: String,
    pub skill: Option<String>,
    pub original_input: String,
    pub cli_version: Option<String>,
    pub local_import: AddLocalResourceSkillsResult,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SkillsCliImportTarget {
    package: String,
    skill: Option<String>,
    original_input: String,
}

pub const NPX_SYNC_SCOPE_REPO: &str = "repo";
pub const NPX_SYNC_SCOPE_SKILL: &str = "skill";

fn parse_npx_import_target(
    input: &str,
    explicit_skill: Option<&str>,
) -> Result<SkillsCliImportTarget, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Import input cannot be empty".to_string());
    }

    let package = trimmed.to_string();
    let skill = explicit_skill
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if !is_owner_repo(&package) {
        return Err(
            "Import source must use owner/repo format, for example mattpocock/skills.".to_string(),
        );
    }

    Ok(SkillsCliImportTarget {
        package,
        skill,
        original_input: trimmed.to_string(),
    })
}

fn is_owner_repo(value: &str) -> bool {
    let parts = value.split('/').collect::<Vec<_>>();
    parts.len() == 2
        && parts
            .iter()
            .all(|part| !part.trim().is_empty() && !part.contains('\\') && !part.contains(':'))
}

pub fn npx_update_request_from_source(
    source: &db::SkillSource,
) -> Option<ImportSkillsViaNpxRequest> {
    if source.source_type != "skills-cli" {
        return None;
    }
    let input = source
        .source_repo
        .as_deref()
        .or(source.source_url.as_deref())?
        .trim();
    if input.is_empty() {
        return None;
    }
    Some(ImportSkillsViaNpxRequest {
        input: input.to_string(),
        skill: source
            .source_path
            .as_deref()
            .map(source_path_to_skill_filter),
        overwrite: true,
    })
}

fn source_path_to_skill_filter(source_path: &str) -> String {
    let trimmed = source_path.trim().trim_matches('/');
    let without_manifest = trimmed.strip_suffix("/SKILL.md").unwrap_or(trimmed);
    if without_manifest.is_empty() || without_manifest == "." || without_manifest == "SKILL.md" {
        return trimmed.to_string();
    }
    without_manifest
        .rsplit('/')
        .find(|segment| !segment.trim().is_empty() && *segment != "skills")
        .unwrap_or(without_manifest)
        .to_string()
}

fn skills_add_args(target: &SkillsCliImportTarget) -> Vec<String> {
    let mut args = vec![
        "-y".to_string(),
        "skills".to_string(),
        "add".to_string(),
        target.package.clone(),
        "--copy".to_string(),
        "-y".to_string(),
    ];
    if let Some(skill) = &target.skill {
        args.push("--skill".to_string());
        args.push(skill.clone());
    }
    args
}

fn create_skills_cli_staging_dir() -> Result<PathBuf, String> {
    let staging_root = path_utils::app_data_dir()
        .join("staging")
        .join("skills-cli");
    std::fs::create_dir_all(&staging_root)
        .map_err(|e| format!("Failed to create skills CLI staging directory: {}", e))?;
    let dir = staging_root.join(format!(
        "{}-{}",
        Utc::now().format("%Y%m%d%H%M%S"),
        std::process::id()
    ));
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create skills CLI staging job directory: {}", e))?;
    Ok(dir)
}

fn npx_command_path() -> Result<PathBuf, String> {
    let candidates = npx_command_candidates();
    for candidate in candidates {
        if candidate.is_absolute() && candidate.is_file() {
            return Ok(candidate);
        }
        if !candidate.is_absolute() {
            return Ok(candidate);
        }
    }
    Err("Could not find npx. Install Node.js, then restart SkillsHub so the desktop app can see PATH. On Windows, the expected command is usually %APPDATA%\\npm\\npx.cmd.".to_string())
}

fn npx_command_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if cfg!(windows) {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            candidates.push(PathBuf::from(appdata).join("npm").join("npx.cmd"));
        }
        if let Some(program_files) = std::env::var_os("ProgramFiles") {
            candidates.push(PathBuf::from(program_files).join("nodejs").join("npx.cmd"));
        }
        candidates.push(PathBuf::from("npx.cmd"));
        candidates.push(PathBuf::from("npx.exe"));
    } else {
        candidates.push(PathBuf::from("npx"));
    }
    candidates
}

fn npx_command() -> Result<Command, String> {
    let mut command = Command::new(npx_command_path()?);
    hide_subprocess_window(&mut command);
    Ok(command)
}

#[cfg(windows)]
fn hide_subprocess_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_subprocess_window(_: &mut Command) {}

fn run_command_capture(mut command: Command) -> Result<String, String> {
    let output = command
        .output()
        .map_err(|e| {
            format!(
                "Failed to execute npx skills: {}. SkillsHub could not launch npx from the desktop app environment; restart the app after installing Node.js, or add npm's global bin directory to the system PATH.",
                e
            )
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        let detail = [stdout.trim(), stderr.trim()]
            .into_iter()
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        Err(if detail.is_empty() {
            format!("npx skills failed with status {}", output.status)
        } else {
            detail
        })
    }
}

fn apply_github_clone_env(command: &mut Command, token: Option<&str>) {
    command.env("GIT_TERMINAL_PROMPT", "0");
    command.env("GCM_INTERACTIVE", "never");
    let Some(token) = token.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    command.env("GITHUB_TOKEN", token);
    command.env("GH_TOKEN", token);
    command.env("GIT_CONFIG_COUNT", "1");
    command.env("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader");
    command.env(
        "GIT_CONFIG_VALUE_0",
        format!("AUTHORIZATION: bearer {token}"),
    );
}

fn strip_ansi_codes(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            out.push(ch);
            continue;
        }
        match chars.peek().copied() {
            Some('[') => {
                chars.next();
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            Some(']') => {
                chars.next();
                for next in chars.by_ref() {
                    if next == '\u{7}' || next == '\\' {
                        break;
                    }
                }
            }
            Some(_) => {
                chars.next();
            }
            None => {}
        }
    }
    out
}

fn is_git_progress_noise(line: &str) -> bool {
    let compact: String = line
        .chars()
        .filter(|ch| !matches!(ch, '[' | ']' | '\u{1b}'))
        .collect();
    let lower = compact.to_ascii_lowercase();
    let looks_like_progress = lower.contains("cloning")
        || lower.contains("counting objects")
        || lower.contains("compressing objects")
        || lower.contains("receiving objects")
        || lower.contains("resolving deltas")
        || lower.contains("remote:");
    looks_like_progress
        && !lower.contains("fatal")
        && !lower.contains("error")
        && !lower.contains("unable to access")
        && !lower.contains("failed to connect")
}

fn sanitize_cli_output(text: &str) -> String {
    let stripped = strip_ansi_codes(text);
    let mut lines: Vec<String> = Vec::new();
    for raw_line in stripped.split('\n') {
        let line = raw_line.rsplit('\r').next().unwrap_or(raw_line).trim();
        if line.is_empty() || is_git_progress_noise(line) {
            continue;
        }
        if lines.last().is_some_and(|previous| previous == line) {
            continue;
        }
        lines.push(line.to_string());
    }
    const MAX: usize = 1600;
    let joined = lines.join("\n");
    if joined.len() <= MAX {
        return joined;
    }
    let start = joined
        .char_indices()
        .map(|(index, _)| index)
        .find(|index| *index >= joined.len().saturating_sub(MAX))
        .unwrap_or(0);
    format!("…{}", &joined[start..])
}

fn looks_like_github_connectivity_error(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    if lower.contains("authentication failed") || lower.contains("could not read username") {
        return false;
    }
    let mentions_github = lower.contains("github.com") || lower.contains("github");
    let mentions_network = [
        "failed to connect",
        "could not connect",
        "unable to access",
        "timed out",
        "timeout",
        "network is unreachable",
        "connection refused",
        "no route to host",
        "failed to clone",
    ]
    .iter()
    .any(|marker| lower.contains(marker));
    mentions_github && mentions_network
}

fn format_npx_import_failure(npx_error: &str, archive_fallback_error: Option<&str>) -> String {
    let sanitized = sanitize_cli_output(npx_error);
    let connectivity = looks_like_github_connectivity_error(&sanitized)
        || looks_like_github_connectivity_error(npx_error);
    if connectivity {
        let mut message = "Could not connect to GitHub (timed out or blocked on port 443). Check your network, proxy, or GitHub token in Settings.".to_string();
        if let Some(fallback) = archive_fallback_error {
            let fallback = sanitize_cli_output(fallback);
            if !fallback.is_empty() {
                message.push_str(" Archive download also failed: ");
                message.push_str(&fallback);
            }
        } else if !sanitized.is_empty() {
            message.push('\n');
            message.push_str(&sanitized);
        }
        return message;
    }
    if sanitized.is_empty() {
        npx_error.trim().to_string()
    } else {
        sanitized
    }
}

fn skills_cli_version() -> Option<String> {
    let mut command = npx_command().ok()?;
    command.args(["-y", "skills", "--version"]);
    run_command_capture(command)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn fetch_import_remote_ref(pool: &DbPool, package: &str) -> Option<String> {
    let auth = github_import::github_direct_auth_from_settings(pool)
        .await
        .ok()?;
    let repo_url = format!("https://github.com/{package}");
    let repo = github_import::resolve_repo_ref(&repo_url, auth.as_deref())
        .await
        .ok()?;
    github_import::fetch_repo_head_ref(&repo, auth.as_deref())
        .await
        .ok()
}

fn run_skills_add_in_staging(
    target: &SkillsCliImportTarget,
    staging_dir: &Path,
    github_token: Option<&str>,
) -> Result<(), String> {
    let mut command = npx_command()?;
    command.args(skills_add_args(target));
    command.current_dir(staging_dir);
    apply_github_clone_env(&mut command, github_token);
    run_command_capture(command).map(|_| ())
}

async fn mark_npx_sources(
    pool: &DbPool,
    imported: &AddLocalResourceSkillsResult,
    target: &SkillsCliImportTarget,
    cli_version: Option<&str>,
    remote_ref: Option<&str>,
    source_manifest_paths: &HashMap<String, String>,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let sync_scope = if target.skill.is_some() {
        NPX_SYNC_SCOPE_SKILL
    } else {
        NPX_SYNC_SCOPE_REPO
    };
    for skill in &imported.added_skills {
        let source_path = source_manifest_paths
            .get(&skill.id)
            .cloned()
            .or_else(|| target.skill.as_deref().map(source_path_to_manifest_path))
            .unwrap_or_else(|| format!("{}/SKILL.md", skill.id));
        db::upsert_skill_source(
            pool,
            &db::SkillSource {
                skill_id: skill.id.clone(),
                source_type: "skills-cli".to_string(),
                source_url: Some(target.original_input.clone()),
                source_author: cli_version.map(|value| format!("skills@{value}")),
                source_repo: Some(target.package.clone()),
                source_path: Some(source_path),
                updated_at: now.clone(),
            },
        )
        .await?;
        db::upsert_skill_source_sync(
            pool,
            &db::SkillSourceSync {
                skill_id: skill.id.clone(),
                sync_scope: sync_scope.to_string(),
                remote_ref: remote_ref.map(str::to_string),
                skill_fingerprint: None,
                last_checked_at: None,
                last_sync_at: Some(now.clone()),
                sync_status: "success".to_string(),
                sync_error: None,
                remote_deleted: false,
                updated_at: now.clone(),
            },
        )
        .await?;
    }
    Ok(())
}

async fn source_manifest_paths_for_target(
    package: &str,
    skill_filter: Option<&str>,
    auth_token: Option<&str>,
) -> HashMap<String, String> {
    let repo_url = format!("https://github.com/{package}");
    let Ok(repo) = github_import::resolve_repo_ref(&repo_url, auth_token).await else {
        return HashMap::new();
    };
    let Ok(mut candidates) = github_import::fetch_repo_skill_candidates(&repo, auth_token).await
    else {
        return HashMap::new();
    };
    if let Some(filter) = skill_filter
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        candidates.retain(|candidate| {
            candidate.skill_id.eq_ignore_ascii_case(filter)
                || candidate.skill_directory_name.eq_ignore_ascii_case(filter)
                || candidate.source_path.eq_ignore_ascii_case(filter)
                || candidate.source_manifest_path.eq_ignore_ascii_case(filter)
        });
    }

    candidates
        .into_iter()
        .map(|candidate| (candidate.skill_id, candidate.source_manifest_path))
        .collect()
}

fn source_path_to_manifest_path(source_path: &str) -> String {
    let trimmed = source_path.trim().trim_matches('/');
    if trimmed.is_empty() || trimmed == "." {
        "SKILL.md".to_string()
    } else if trimmed.ends_with("/SKILL.md") || trimmed == "SKILL.md" {
        trimmed.to_string()
    } else {
        format!("{trimmed}/SKILL.md")
    }
}

pub async fn import_skills_via_npx_impl(
    pool: &DbPool,
    input: ImportSkillsViaNpxRequest,
) -> Result<ImportSkillsViaNpxResult, String> {
    let target = parse_npx_import_target(&input.input, input.skill.as_deref())?;
    let cli_version = skills_cli_version();
    let github_token = github_import::github_direct_auth_from_settings(pool).await?;
    let remote_ref = fetch_import_remote_ref(pool, &target.package).await;
    let staging_dir = create_skills_cli_staging_dir()?;
    let staged_skills_dir = staging_dir.join(".agents").join("skills");
    if let Err(snapshot_error) = github_import::stage_repo_skills_into_dir(
        pool,
        &target.package,
        target.skill.as_deref(),
        &staged_skills_dir,
    )
    .await
    {
        if let Err(npx_error) =
            run_skills_add_in_staging(&target, &staging_dir, github_token.as_deref())
        {
            let _ = std::fs::remove_dir_all(&staging_dir);
            if looks_like_github_connectivity_error(&npx_error) {
                return Err(format_npx_import_failure(&npx_error, Some(&snapshot_error)));
            }
            return Err(format!(
                "{} GitHub archive import also failed: {}",
                format_npx_import_failure(&npx_error, None),
                snapshot_error
            ));
        }
    }

    if !staged_skills_dir.is_dir() {
        let _ = std::fs::remove_dir_all(&staging_dir);
        return Err("Skill import did not create a .agents/skills staging directory".to_string());
    }

    let (owner, repo) = target
        .package
        .split_once('/')
        .ok_or_else(|| "Import source must use owner/repo format.".to_string())?;
    let mut local_import = add_repo_resource_skills_impl(
        pool,
        AddLocalResourceSkillsRequest {
            source_dir: staged_skills_dir.to_string_lossy().into_owned(),
            overwrite: input.overwrite,
        },
        owner,
        repo,
    )
    .await?;
    let source_manifest_paths = source_manifest_paths_for_target(
        &target.package,
        target.skill.as_deref(),
        github_token.as_deref(),
    )
    .await;
    mark_npx_sources(
        pool,
        &local_import,
        &target,
        cli_version.as_deref(),
        remote_ref.as_deref(),
        &source_manifest_paths,
    )
    .await?;
    local_import.added_skills = crate::commands::skills::get_resource_library_skills_impl(pool)
        .await?
        .into_iter()
        .filter(|skill| {
            local_import
                .added_skills
                .iter()
                .any(|added| added.id == skill.id)
        })
        .collect();

    let _ = std::fs::remove_dir_all(&staging_dir);
    Ok(ImportSkillsViaNpxResult {
        package: target.package,
        skill: target.skill,
        original_input: target.original_input,
        cli_version,
        local_import,
    })
}

#[tauri::command]
pub async fn import_skills_via_npx(
    state: State<'_, AppState>,
    input: ImportSkillsViaNpxRequest,
) -> Result<ImportSkillsViaNpxResult, String> {
    import_skills_via_npx_impl(&state.db, input).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_npx_import_target_accepts_owner_repo_and_explicit_skill() {
        let target = parse_npx_import_target("mattpocock/skills", Some("ask-matt")).unwrap();
        assert_eq!(target.package, "mattpocock/skills");
        assert_eq!(target.skill.as_deref(), Some("ask-matt"));
        assert_eq!(
            skills_add_args(&target),
            vec![
                "-y",
                "skills",
                "add",
                "mattpocock/skills",
                "--copy",
                "-y",
                "--skill",
                "ask-matt"
            ]
        );
    }

    #[test]
    fn parse_npx_import_target_rejects_skills_sh_url() {
        let error =
            parse_npx_import_target("https://www.skills.sh/mattpocock/skills/ask-matt", None)
                .unwrap_err();
        assert!(error.contains("owner/repo"));
    }

    #[test]
    fn parse_npx_import_target_rejects_github_url() {
        let error = parse_npx_import_target(
            "https://github.com/anthropics/skills/tree/main/skills",
            None,
        )
        .unwrap_err();
        assert!(error.contains("owner/repo"));
    }

    #[test]
    fn npx_update_request_from_source_accepts_skills_cli_source() {
        let source = db::SkillSource {
            skill_id: "ask-matt".to_string(),
            source_type: "skills-cli".to_string(),
            source_url: Some("https://www.skills.sh/mattpocock/skills/ask-matt".to_string()),
            source_author: Some("skills@1.0.0".to_string()),
            source_repo: Some("mattpocock/skills".to_string()),
            source_path: Some("ask-matt/SKILL.md".to_string()),
            updated_at: "2026-08-12T00:00:00Z".to_string(),
        };

        let request = npx_update_request_from_source(&source).unwrap();
        assert_eq!(request.input, "mattpocock/skills");
        assert_eq!(request.skill.as_deref(), Some("ask-matt"));
        assert!(request.overwrite);
    }

    #[test]
    fn npx_update_request_from_source_uses_skill_name_for_plugin_manifest_path() {
        let source = db::SkillSource {
            skill_id: "agent-native-design".to_string(),
            source_type: "skills-cli".to_string(),
            source_url: Some("Agents365-ai/365-skills".to_string()),
            source_author: Some("skills@1.0.0".to_string()),
            source_repo: Some("Agents365-ai/365-skills".to_string()),
            source_path: Some(
                "plugins/agent-native-design/skills/agent-native-design/SKILL.md".to_string(),
            ),
            updated_at: "2026-08-12T00:00:00Z".to_string(),
        };

        let request = npx_update_request_from_source(&source).unwrap();
        assert_eq!(request.input, "Agents365-ai/365-skills");
        assert_eq!(request.skill.as_deref(), Some("agent-native-design"));
    }

    #[test]
    fn npx_update_request_from_source_ignores_local_folder_source() {
        let source = db::SkillSource {
            skill_id: "local-skill".to_string(),
            source_type: "local-folder".to_string(),
            source_url: None,
            source_author: None,
            source_repo: None,
            source_path: Some("D:\\Data\\Skills\\local-skill".to_string()),
            updated_at: "2026-08-12T00:00:00Z".to_string(),
        };

        assert!(npx_update_request_from_source(&source).is_none());
    }

    #[test]
    fn sanitize_cli_output_drops_git_progress_and_keeps_fatal() {
        let raw = "[1G][]0 Cloning\r[1G][]0 Cloning\r[1G][]0 Cloning\nCloning into 'C:\\Users\\LYF\\AppData\\Local\\Temp\\skills-QF9ZEp'...\nfatal: unable to access 'https://github.com/forrestchang/andrej-karpathy-skills.git/': Failed to connect to github.com port 443 after 21093 ms: Could not connect to server";
        let sanitized = sanitize_cli_output(raw);
        assert!(!sanitized.contains("[1G]"));
        assert!(!sanitized.to_ascii_lowercase().contains("cloning into"));
        assert!(sanitized.contains("Failed to connect to github.com"));
    }

    #[test]
    fn format_npx_import_failure_explains_github_timeout() {
        let raw = "Failed to clone repository...\nfatal: unable to access 'https://github.com/forrestchang/andrej-karpathy-skills.git/': Failed to connect to github.com port 443 after 21093 ms: Could not connect to server";
        let formatted = format_npx_import_failure(raw, None);
        assert!(formatted.contains("Could not connect to GitHub"));
        assert!(formatted.contains("Failed to connect to github.com"));
        assert!(!formatted.contains("[1G]"));
    }

    #[test]
    fn looks_like_github_connectivity_error_ignores_auth_failures() {
        assert!(!looks_like_github_connectivity_error(
            "fatal: Authentication failed for 'https://github.com/owner/repo.git/'"
        ));
        assert!(looks_like_github_connectivity_error(
            "fatal: unable to access 'https://github.com/owner/repo.git/': Failed to connect to github.com port 443"
        ));
    }
}
