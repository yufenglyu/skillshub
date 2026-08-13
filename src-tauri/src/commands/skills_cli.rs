use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

use super::github_import;
use crate::commands::skills::{
    add_repo_resource_skills_impl, AddLocalResourceSkillsRequest, AddLocalResourceSkillsResult,
};
use crate::db::{self, DbPool};
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
        skill: source.source_path.clone(),
        overwrite: true,
    })
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

fn app_data_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "Failed to determine user home directory".to_string())?;
    Ok(home.join(".skillshub"))
}

fn create_skills_cli_staging_dir() -> Result<PathBuf, String> {
    let staging_root = app_data_dir()?.join("staging").join("skills-cli");
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
) -> Result<(), String> {
    let mut command = npx_command()?;
    command.args(skills_add_args(target));
    command.current_dir(staging_dir);
    run_command_capture(command).map(|_| ())
}

async fn mark_npx_sources(
    pool: &DbPool,
    imported: &AddLocalResourceSkillsResult,
    target: &SkillsCliImportTarget,
    cli_version: Option<&str>,
    remote_ref: Option<&str>,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let sync_scope = if target.skill.is_some() {
        NPX_SYNC_SCOPE_SKILL
    } else {
        NPX_SYNC_SCOPE_REPO
    };
    for skill in &imported.added_skills {
        db::upsert_skill_source(
            pool,
            &db::SkillSource {
                skill_id: skill.id.clone(),
                source_type: "skills-cli".to_string(),
                source_url: Some(target.original_input.clone()),
                source_author: cli_version.map(|value| format!("skills@{value}")),
                source_repo: Some(target.package.clone()),
                source_path: target.skill.clone().or_else(|| Some(skill.id.clone())),
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

pub async fn import_skills_via_npx_impl(
    pool: &DbPool,
    input: ImportSkillsViaNpxRequest,
) -> Result<ImportSkillsViaNpxResult, String> {
    let target = parse_npx_import_target(&input.input, input.skill.as_deref())?;
    let cli_version = skills_cli_version();
    let remote_ref = fetch_import_remote_ref(pool, &target.package).await;
    let staging_dir = create_skills_cli_staging_dir()?;
    if let Err(error) = run_skills_add_in_staging(&target, &staging_dir) {
        let _ = std::fs::remove_dir_all(&staging_dir);
        return Err(error);
    }

    let staged_skills_dir = staging_dir.join(".agents").join("skills");
    if !staged_skills_dir.is_dir() {
        let _ = std::fs::remove_dir_all(&staging_dir);
        return Err("npx skills did not create a .agents/skills staging directory".to_string());
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
    mark_npx_sources(
        pool,
        &local_import,
        &target,
        cli_version.as_deref(),
        remote_ref.as_deref(),
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
            source_path: Some("ask-matt".to_string()),
            updated_at: "2026-08-12T00:00:00Z".to_string(),
        };

        let request = npx_update_request_from_source(&source).unwrap();
        assert_eq!(request.input, "mattpocock/skills");
        assert_eq!(request.skill.as_deref(), Some("ask-matt"));
        assert!(request.overwrite);
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
}
