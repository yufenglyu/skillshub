use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use super::agents::is_agent_detected;
use crate::db::{self, DbPool, SkillInstallation};
use crate::path_utils::remove_symlink_path;
use crate::AppState;

// ─── Types ────────────────────────────────────────────────────────────────────

/// Result of a single skill install operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallResult {
    pub symlink_path: String,
}

/// Result of a batch install across multiple agents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchInstallResult {
    pub succeeded: Vec<String>,
    pub failed: Vec<FailedInstall>,
}

/// Describes a single failed install within a batch operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailedInstall {
    pub agent_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddResourceSkillToCentralResult {
    pub skill_id: String,
    pub central_path: String,
}

// ─── Path Utilities ───────────────────────────────────────────────────────────

/// Compute a relative path from `from_dir` to `to_path`.
///
/// Both paths must be absolute. The resulting path can be used as a symlink
/// target placed inside `from_dir`.
///
/// Examples:
/// - `make_relative_path("/a/b/c", "/a/d/e/f")` -> `"../../d/e/f"`
/// - `make_relative_path("/home/user/.claude/skills", "/home/user/.agents/skills/my-skill")`
///   -> `"../../.agents/skills/my-skill"`
pub fn make_relative_path(from_dir: &Path, to_path: &Path) -> PathBuf {
    let from_components: Vec<_> = from_dir.components().collect();
    let to_components: Vec<_> = to_path.components().collect();

    // Find the length of the common path prefix.
    let common_len = from_components
        .iter()
        .zip(to_components.iter())
        .take_while(|(a, b)| a == b)
        .count();

    // Number of ".." hops needed to climb out of `from_dir`.
    let up_count = from_components.len() - common_len;

    let mut result = PathBuf::new();
    for _ in 0..up_count {
        result.push("..");
    }
    for component in &to_components[common_len..] {
        result.push(component.as_os_str());
    }

    if result.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        result
    }
}

// ─── Platform-specific symlink creation ──────────────────────────────────────

#[cfg(unix)]
pub fn create_symlink(target: &Path, link: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(target, link).map_err(|e| format!("Failed to create symlink: {}", e))
}

#[cfg(windows)]
pub fn create_symlink(target: &Path, link: &Path) -> Result<(), String> {
    std::os::windows::fs::symlink_dir(target, link)
        .map_err(|e| format!("Failed to create symlink: {}", e))
}

#[cfg(not(any(unix, windows)))]
pub fn create_symlink(_target: &Path, _link: &Path) -> Result<(), String> {
    Err("Symlink creation is only supported on Unix systems".to_string())
}

pub fn symlink_target_path(from_dir: &Path, to_path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let from_prefix = from_dir.components().next();
        let to_prefix = to_path.components().next();
        if from_prefix != to_prefix {
            return to_path.to_path_buf();
        }
    }

    make_relative_path(from_dir, to_path)
}

fn relative_skill_path_under_central(
    central_root: &Path,
    canonical_dir: &Path,
    skill_id: &str,
) -> PathBuf {
    let Ok(relative) = canonical_dir.strip_prefix(central_root) else {
        return PathBuf::from(skill_id);
    };

    if relative.as_os_str().is_empty() {
        return PathBuf::from(skill_id);
    }

    if relative
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
    {
        relative.to_path_buf()
    } else {
        PathBuf::from(skill_id)
    }
}

fn cleanup_replaced_installation_path(
    installation: &SkillInstallation,
    next_path: &Path,
) -> Result<(), String> {
    let previous_path = PathBuf::from(&installation.installed_path);
    if previous_path == next_path || !previous_path.exists() {
        return Ok(());
    }

    let metadata = std::fs::symlink_metadata(&previous_path).map_err(|e| {
        format!(
            "Failed to inspect previous installation '{}': {}",
            previous_path.display(),
            e
        )
    })?;

    if metadata.file_type().is_symlink() {
        remove_symlink_path(&previous_path).map_err(|e| {
            format!(
                "Failed to remove previous symlink installation '{}': {}",
                previous_path.display(),
                e
            )
        })?;
    } else if metadata.is_dir() && installation.link_type == "copy" {
        std::fs::remove_dir_all(&previous_path).map_err(|e| {
            format!(
                "Failed to remove previous copied installation '{}': {}",
                previous_path.display(),
                e
            )
        })?;
    } else {
        return Err(format!(
            "Previous installation path '{}' is not safely removable",
            previous_path.display()
        ));
    }

    Ok(())
}

// ─── Recursive Directory Copy ─────────────────────────────────────────────────

/// Recursively copy a directory tree from `src` to `dst`.
///
/// `dst` must not exist prior to the call (or may be an empty dir).
/// The behaviour mirrors `cp -r src dst` on Unix.
pub fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| {
        format!(
            "Failed to create destination directory '{}': {}",
            dst.display(),
            e
        )
    })?;

    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read source directory '{}': {}", src.display(), e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to determine file type: {}", e))?;

        if file_type.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| {
                format!(
                    "Failed to copy '{}' -> '{}': {}",
                    src_path.display(),
                    dst_path.display(),
                    e
                )
            })?;
        }
    }

    Ok(())
}

fn safe_relative_resource_path(source_dir: &Path, resource_root: &Path, skill_id: &str) -> PathBuf {
    let Ok(relative) = source_dir.strip_prefix(resource_root) else {
        return PathBuf::from(skill_id);
    };

    if relative.as_os_str().is_empty()
        || !relative
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return PathBuf::from(skill_id);
    }

    relative.to_path_buf()
}

fn skill_dir_from_file_path(file_path: &str) -> String {
    Path::new(file_path)
        .parent()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|| file_path.to_string())
}

pub async fn add_resource_skill_to_central_impl(
    pool: &DbPool,
    skill_id: &str,
) -> Result<AddResourceSkillToCentralResult, String> {
    let mut skill = db::get_skill_by_id(pool, skill_id)
        .await?
        .ok_or_else(|| format!("Skill '{}' not found in database", skill_id))?;

    if skill.is_central {
        let central_path = skill
            .canonical_path
            .clone()
            .unwrap_or_else(|| skill_dir_from_file_path(&skill.file_path));
        let central_root = db::get_agent_by_id(pool, "central")
            .await?
            .ok_or_else(|| "Central Skills agent not found".to_string())?
            .global_skills_dir;
        sync_central_skill_to_platforms(pool, skill_id, Path::new(&central_root)).await?;
        return Ok(AddResourceSkillToCentralResult {
            skill_id: skill_id.to_string(),
            central_path,
        });
    }

    let central_agent = db::get_agent_by_id(pool, "central")
        .await?
        .ok_or_else(|| "Central Skills agent not found".to_string())?;
    let central_root = PathBuf::from(central_agent.global_skills_dir);
    let resource_root = db::get_skill_resource_library_dir(pool).await?;

    let source_dir = skill
        .canonical_path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(skill_dir_from_file_path(&skill.file_path)));
    if !source_dir.join("SKILL.md").exists() {
        return Err(format!(
            "Skill source '{}' does not contain SKILL.md",
            source_dir.display()
        ));
    }

    let relative_path = safe_relative_resource_path(&source_dir, &resource_root, skill_id);
    let central_dir = central_root.join(relative_path);
    if central_dir != source_dir && central_dir.exists() {
        return Err(format!(
            "Central skill target already exists: {}",
            central_dir.display()
        ));
    }

    if central_dir != source_dir {
        copy_dir_all(&source_dir, &central_dir)?;
    }

    skill.canonical_path = Some(central_dir.to_string_lossy().into_owned());
    skill.file_path = central_dir.join("SKILL.md").to_string_lossy().into_owned();
    skill.is_central = true;
    db::upsert_skill(pool, &skill).await?;

    sync_central_skill_to_platforms(pool, skill_id, &central_root).await?;

    Ok(AddResourceSkillToCentralResult {
        skill_id: skill_id.to_string(),
        central_path: central_dir.to_string_lossy().into_owned(),
    })
}

async fn sync_central_skill_to_platforms(
    pool: &DbPool,
    skill_id: &str,
    central_root: &Path,
) -> Result<(), String> {
    let mut failures = Vec::new();

    for agent in db::get_all_agents(pool).await? {
        if agent.id == "central"
            || !agent.is_enabled
            || !is_agent_detected(&agent.global_skills_dir)
            || resolved_path(Path::new(&agent.global_skills_dir)) == resolved_path(central_root)
        {
            continue;
        }

        if let Err(error) = install_central_skill_to_agent_for_sync(pool, skill_id, &agent.id).await
        {
            failures.push(format!("{}: {}", agent.display_name, error));
        }
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Skill was added to Central Skills, but platform synchronization failed: {}",
            failures.join("; ")
        ))
    }
}

pub(crate) async fn sync_all_central_skills_to_detected_platforms(
    pool: &DbPool,
) -> Result<(), String> {
    let central_root = db::get_agent_by_id(pool, "central")
        .await?
        .ok_or_else(|| "Central Skills agent not found".to_string())?
        .global_skills_dir;
    let central_root = PathBuf::from(central_root);
    let mut failures = Vec::new();

    for skill in db::get_central_skills(pool).await? {
        if let Err(error) = sync_central_skill_to_platforms(pool, &skill.id, &central_root).await {
            failures.push(format!("{}: {}", skill.name, error));
        }
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Central Skills synchronization failed: {}",
            failures.join("; ")
        ))
    }
}

async fn install_source_dir_for_skill(
    pool: &DbPool,
    skill_id: &str,
    central_root: &Path,
) -> Result<PathBuf, String> {
    if let Some(skill) = db::get_skill_by_id(pool, skill_id).await? {
        if let Some(canonical_path) = skill.canonical_path {
            let canonical_dir = PathBuf::from(canonical_path);
            if canonical_dir.join("SKILL.md").exists() {
                return Ok(canonical_dir);
            }
        }

        let source_file = PathBuf::from(&skill.file_path);
        if source_file.exists() {
            return source_file
                .parent()
                .map(Path::to_path_buf)
                .ok_or_else(|| format!("Invalid file_path for skill '{}'", skill_id));
        }
    }

    let central_dir = central_root.join(skill_id);
    if central_dir.join("SKILL.md").exists() {
        return Ok(central_dir);
    }

    Err(format!("Skill source not found for '{}'", skill_id))
}

fn resolved_path(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

pub(crate) fn validate_platform_install_target(
    agent_id: &str,
    source_dir: &Path,
    agent_dir: &Path,
    central_root: &Path,
) -> Result<(), String> {
    let source_dir = resolved_path(source_dir);
    let agent_dir = resolved_path(agent_dir);
    let central_root = resolved_path(central_root);

    if !source_dir.starts_with(&central_root) && agent_dir.starts_with(&central_root) {
        return Err(format!(
            "Agent '{}' uses the central skills directory; refusing to install a non-central skill there",
            agent_id
        ));
    }

    Ok(())
}

async fn existing_install_path_for_agent(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
) -> Result<Option<String>, String> {
    Ok(existing_installation_for_agent(pool, skill_id, agent_id)
        .await?
        .map(|installation| installation.installed_path))
}

async fn existing_installation_for_agent(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
) -> Result<Option<SkillInstallation>, String> {
    Ok(db::get_skill_installations(pool, skill_id)
        .await?
        .into_iter()
        .find(|installation| installation.agent_id == agent_id))
}

async fn repair_legacy_platform_link_in_central(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
    central_root: &Path,
) -> Result<Option<PathBuf>, String> {
    let Some(mut skill) = db::get_skill_by_id(pool, skill_id)
        .await?
        .filter(|skill| skill.is_central)
    else {
        return Ok(None);
    };
    let Some(legacy_path) = skill.canonical_path.as_deref().map(PathBuf::from) else {
        return Ok(None);
    };
    let Some(installation) = db::get_skill_installations_for_legacy_repair(pool, skill_id)
        .await?
        .into_iter()
        .find(|installation| installation.agent_id == agent_id)
    else {
        return Ok(None);
    };
    let Some(source_dir) = installation.symlink_target.as_deref().map(PathBuf::from) else {
        return Ok(None);
    };

    if installation.link_type != "symlink"
        || Path::new(&installation.installed_path) != legacy_path
        || !legacy_path.starts_with(central_root)
        || source_dir.starts_with(central_root)
        || !source_dir.join("SKILL.md").exists()
    {
        return Ok(None);
    }

    match std::fs::symlink_metadata(&legacy_path) {
        Ok(metadata)
            if metadata.file_type().is_symlink()
                && resolved_path(&legacy_path) == resolved_path(&source_dir) =>
        {
            remove_symlink_path(&legacy_path).map_err(|error| {
                format!(
                    "Failed to remove legacy platform link from Central Skills '{}': {}",
                    legacy_path.display(),
                    error
                )
            })?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return Ok(None),
    }

    skill.file_path = source_dir.join("SKILL.md").to_string_lossy().into_owned();
    skill.canonical_path = Some(source_dir.to_string_lossy().into_owned());
    skill.is_central = false;
    skill.scanned_at = chrono::Utc::now().to_rfc3339();
    db::repair_legacy_centralized_resource_skill(pool, &skill, &legacy_path.to_string_lossy())
        .await?;

    Ok(Some(source_dir))
}

async fn universal_available_install_result(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
    canonical_dir: &Path,
    central_root: &Path,
) -> Result<Option<InstallResult>, String> {
    if !db::agent_supports_universal_agents_skills(agent_id) {
        return Ok(None);
    }
    if !canonical_dir.starts_with(central_root) {
        return Ok(None);
    }

    let symlink_path = existing_install_path_for_agent(pool, skill_id, agent_id)
        .await?
        .unwrap_or_else(|| canonical_dir.to_string_lossy().into_owned());
    Ok(Some(InstallResult { symlink_path }))
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/// Core install logic, separated from the Tauri layer for testability.
///
/// Creates a relative symlink at `agent.global_skills_dir/<skill_id>` that
/// points to the skill's current source directory.
///
/// Returns an error if:
/// - The agent or central agent is not found in the database.
/// - The skill source does not exist (no SKILL.md).
/// - A real (non-symlink) directory already exists at the target path.
/// - `agent_id` is "central" (would create a self-referencing symlink).
async fn install_skill_to_agent_from_source_impl(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
    source_override: Option<&Path>,
    allow_universal_availability: bool,
) -> Result<InstallResult, String> {
    // Guard: cannot install to the central agent itself.
    if agent_id == "central" {
        return Err("Cannot install a skill to the central agent itself".to_string());
    }

    // 1. Look up the target agent.
    let agent = db::get_agent_by_id(pool, agent_id)
        .await?
        .ok_or_else(|| format!("Agent '{}' not found", agent_id))?;

    // 2. Look up the central agent to determine the canonical root.
    let central = db::get_agent_by_id(pool, "central")
        .await?
        .ok_or_else(|| "Central agent not found in database".to_string())?;

    let central_root = PathBuf::from(&central.global_skills_dir);
    let canonical_dir = if let Some(source_dir) = source_override {
        source_dir.to_path_buf()
    } else {
        match repair_legacy_platform_link_in_central(pool, skill_id, agent_id, &central_root)
            .await?
        {
            Some(source_dir) => source_dir,
            None => install_source_dir_for_skill(pool, skill_id, &central_root).await?,
        }
    };
    let agent_dir = PathBuf::from(&agent.global_skills_dir);
    validate_platform_install_target(agent_id, &canonical_dir, &agent_dir, &central_root)?;

    if allow_universal_availability {
        if let Some(result) = universal_available_install_result(
            pool,
            skill_id,
            agent_id,
            &canonical_dir,
            &central_root,
        )
        .await?
        {
            return Ok(result);
        }
    }

    // 4. Compute symlink location.
    let relative_skill_path =
        relative_skill_path_under_central(&central_root, &canonical_dir, skill_id);
    let symlink_path = agent_dir.join(relative_skill_path);

    // 5. Ensure the target parent directory exists.
    if let Some(parent) = symlink_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create agent skills directory: {}", e))?;
    }

    if let Some(existing) = existing_installation_for_agent(pool, skill_id, agent_id).await? {
        cleanup_replaced_installation_path(&existing, &symlink_path)?;
    }

    // 6. Handle any existing entry at the symlink path.
    match std::fs::symlink_metadata(&symlink_path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            // Remove stale symlink so we can replace it.
            remove_symlink_path(&symlink_path)
                .map_err(|e| format!("Failed to remove existing symlink: {}", e))?;
        }
        Ok(meta) if meta.is_dir() => {
            return Err(format!(
                "A real directory already exists at '{}'. Refusing to overwrite.",
                symlink_path.display()
            ));
        }
        Ok(_) => {
            return Err(format!(
                "A file already exists at '{}'. Refusing to overwrite.",
                symlink_path.display()
            ));
        }
        Err(_) => {} // Path does not exist — proceed normally.
    }

    // 7. Compute the relative path from the agent directory to the canonical dir.
    let symlink_parent = symlink_path.parent().unwrap_or(&agent_dir);
    let relative_target = symlink_target_path(symlink_parent, &canonical_dir);

    // 8. Create the symlink.
    create_symlink(&relative_target, &symlink_path)?;

    // 9. Persist the installation record.
    let installation = SkillInstallation {
        skill_id: skill_id.to_string(),
        agent_id: agent_id.to_string(),
        installed_path: symlink_path.to_string_lossy().into_owned(),
        link_type: "symlink".to_string(),
        symlink_target: Some(canonical_dir.to_string_lossy().into_owned()),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db::upsert_skill_installation(pool, &installation).await?;

    Ok(InstallResult {
        symlink_path: symlink_path.to_string_lossy().into_owned(),
    })
}

pub async fn install_skill_to_agent_impl(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
) -> Result<InstallResult, String> {
    install_skill_to_agent_from_source_impl(pool, skill_id, agent_id, None, true).await
}

async fn resource_source_dir_for_skill(pool: &DbPool, skill_id: &str) -> Result<PathBuf, String> {
    let skill = db::get_skill_by_id(pool, skill_id)
        .await?
        .ok_or_else(|| format!("Skill '{}' not found in database", skill_id))?;
    let resource_root = db::get_skill_resource_library_dir(pool).await?;

    let mut candidates = Vec::new();
    if let Some(canonical_path) = skill.canonical_path.as_deref() {
        candidates.push(PathBuf::from(canonical_path));
    }
    if let Some(file_parent) = Path::new(&skill.file_path).parent() {
        candidates.push(file_parent.to_path_buf());
    }

    for candidate in &candidates {
        if candidate.starts_with(&resource_root) && candidate.join("SKILL.md").exists() {
            return Ok(candidate.clone());
        }
    }

    let central_root = db::get_agent_by_id(pool, "central")
        .await?
        .ok_or_else(|| "Central agent not found in database".to_string())?
        .global_skills_dir;
    let central_root = PathBuf::from(central_root);
    for candidate in candidates {
        let Ok(relative_path) = candidate.strip_prefix(&central_root) else {
            continue;
        };
        let resource_candidate = resource_root.join(relative_path);
        if resource_candidate.join("SKILL.md").exists() {
            return Ok(resource_candidate);
        }
    }

    Err(format!(
        "Resource Library source not found for skill '{}'",
        skill_id
    ))
}

pub async fn install_resource_skill_to_agent_impl(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
    method: &str,
) -> Result<InstallResult, String> {
    let source_dir = resource_source_dir_for_skill(pool, skill_id).await?;

    match method {
        "copy" => {
            install_skill_to_agent_copy_from_source_impl(
                pool,
                skill_id,
                agent_id,
                Some(&source_dir),
                false,
            )
            .await
        }
        "symlink" => {
            install_skill_to_agent_from_source_impl(
                pool,
                skill_id,
                agent_id,
                Some(&source_dir),
                false,
            )
            .await
        }
        _ => match install_skill_to_agent_from_source_impl(
            pool,
            skill_id,
            agent_id,
            Some(&source_dir),
            false,
        )
        .await
        {
            Ok(result) => Ok(result),
            Err(error) if should_fallback_to_copy(&error) => {
                install_skill_to_agent_copy_from_source_impl(
                    pool,
                    skill_id,
                    agent_id,
                    Some(&source_dir),
                    false,
                )
                .await
            }
            Err(error) => Err(error),
        },
    }
}

pub async fn install_skill_to_agent_auto_impl(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
) -> Result<InstallResult, String> {
    match install_skill_to_agent_impl(pool, skill_id, agent_id).await {
        Ok(result) => Ok(result),
        Err(error) if should_fallback_to_copy(&error) => {
            install_skill_to_agent_copy_impl(pool, skill_id, agent_id).await
        }
        Err(error) => Err(error),
    }
}

async fn install_central_skill_to_agent_for_sync(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
) -> Result<InstallResult, String> {
    match install_skill_to_agent_from_source_impl(pool, skill_id, agent_id, None, false).await {
        Ok(result) => Ok(result),
        Err(error) if should_fallback_to_copy(&error) => {
            install_skill_to_agent_copy_from_source_impl(pool, skill_id, agent_id, None, false)
                .await
        }
        Err(error) => Err(error),
    }
}

#[cfg(windows)]
fn should_fallback_to_copy(error: &str) -> bool {
    error.contains("Failed to create symlink")
}

#[cfg(not(windows))]
fn should_fallback_to_copy(_error: &str) -> bool {
    false
}

/// Core copy-install logic — copies the skill directory instead of symlinking.
///
/// Copies the skill's current source directory recursively into
/// `agent.global_skills_dir/<skill_id>`. Existing symlinks at the target are
/// replaced; existing real directories cause an error.
async fn install_skill_to_agent_copy_from_source_impl(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
    source_override: Option<&Path>,
    allow_universal_availability: bool,
) -> Result<InstallResult, String> {
    // Guard: cannot install to the central agent itself.
    if agent_id == "central" {
        return Err("Cannot install a skill to the central agent itself".to_string());
    }

    // 1. Look up the target agent.
    let agent = db::get_agent_by_id(pool, agent_id)
        .await?
        .ok_or_else(|| format!("Agent '{}' not found", agent_id))?;

    // 2. Look up the central agent to determine the canonical root.
    let central = db::get_agent_by_id(pool, "central")
        .await?
        .ok_or_else(|| "Central agent not found in database".to_string())?;

    let central_root = PathBuf::from(&central.global_skills_dir);
    let canonical_dir = if let Some(source_dir) = source_override {
        source_dir.to_path_buf()
    } else {
        match repair_legacy_platform_link_in_central(pool, skill_id, agent_id, &central_root)
            .await?
        {
            Some(source_dir) => source_dir,
            None => install_source_dir_for_skill(pool, skill_id, &central_root).await?,
        }
    };
    let agent_dir = PathBuf::from(&agent.global_skills_dir);
    validate_platform_install_target(agent_id, &canonical_dir, &agent_dir, &central_root)?;

    if allow_universal_availability {
        if let Some(result) = universal_available_install_result(
            pool,
            skill_id,
            agent_id,
            &canonical_dir,
            &central_root,
        )
        .await?
        {
            return Ok(result);
        }
    }

    // 4. Compute target location.
    let relative_skill_path =
        relative_skill_path_under_central(&central_root, &canonical_dir, skill_id);
    let target_path = agent_dir.join(relative_skill_path);

    // 5. Ensure the target parent directory exists.
    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create agent skills directory: {}", e))?;
    }

    if let Some(existing) = existing_installation_for_agent(pool, skill_id, agent_id).await? {
        cleanup_replaced_installation_path(&existing, &target_path)?;
    }

    // 6. Handle any existing entry at the target path.
    match std::fs::symlink_metadata(&target_path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            // Remove stale symlink so we can replace it with a real copy.
            remove_symlink_path(&target_path)
                .map_err(|e| format!("Failed to remove existing symlink: {}", e))?;
        }
        Ok(meta) if meta.is_dir() => {
            return Err(format!(
                "A real directory already exists at '{}'. Refusing to overwrite.",
                target_path.display()
            ));
        }
        Ok(_) => {
            return Err(format!(
                "A file already exists at '{}'. Refusing to overwrite.",
                target_path.display()
            ));
        }
        Err(_) => {} // Path does not exist — proceed normally.
    }

    // 7. Recursively copy the canonical skill directory.
    copy_dir_all(&canonical_dir, &target_path)?;

    // 8. Persist the installation record.
    let installation = SkillInstallation {
        skill_id: skill_id.to_string(),
        agent_id: agent_id.to_string(),
        installed_path: target_path.to_string_lossy().into_owned(),
        link_type: "copy".to_string(),
        symlink_target: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db::upsert_skill_installation(pool, &installation).await?;

    Ok(InstallResult {
        symlink_path: target_path.to_string_lossy().into_owned(),
    })
}

pub async fn install_skill_to_agent_copy_impl(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
) -> Result<InstallResult, String> {
    install_skill_to_agent_copy_from_source_impl(pool, skill_id, agent_id, None, true).await
}

/// Core uninstall logic, separated from the Tauri layer for testability.
///
/// Removes the path recorded by a managed `skill_installations` row and then
/// deletes that row. Without managed ownership, no filesystem path is touched.
///
/// For symlinked skills: removes the symlink.
/// For copied skills: removes the copied directory (tracked in the DB as link_type='copy').
/// Refuses to delete real directories not tracked as copies in the DB.
pub async fn uninstall_skill_from_agent_impl(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
) -> Result<(), String> {
    // 1. Look up the agent.
    db::get_agent_by_id(pool, agent_id)
        .await?
        .ok_or_else(|| format!("Agent '{}' not found", agent_id))?;

    // 2. Look up the installation record to determine where and how it was installed.
    let installations = db::get_skill_installations(pool, skill_id).await?;
    let record = match installations
        .iter()
        .find(|record| record.agent_id == agent_id)
    {
        Some(record) => record,
        None if db::agent_supports_universal_agents_skills(agent_id) => return Ok(()),
        None => {
            return Err(format!(
                "No managed installation found for skill '{}' on agent '{}'",
                skill_id, agent_id
            ))
        }
    };
    let install_path = PathBuf::from(&record.installed_path);
    let link_type = record.link_type.as_str();

    // 3. Inspect the entry at that path and remove it appropriately.
    match std::fs::symlink_metadata(&install_path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            // Always safe to remove symlinks.
            remove_symlink_path(&install_path)
                .map_err(|e| format!("Failed to remove symlink: {}", e))?;
        }
        Ok(meta) if meta.is_dir() => {
            // Only remove real directories that were explicitly installed as copies.
            if link_type == "copy" {
                std::fs::remove_dir_all(&install_path)
                    .map_err(|e| format!("Failed to remove copied skill directory: {}", e))?;
            } else {
                return Err(format!(
                    "Path '{}' exists but is not a symlink. Refusing to delete.",
                    install_path.display()
                ));
            }
        }
        Ok(_) => {
            return Err(format!(
                "Path '{}' exists but is not a symlink. Refusing to delete.",
                install_path.display()
            ));
        }
        Err(_) => {
            // Path doesn't exist — still clean up the DB record.
        }
    }

    // 4. Remove the installation record from the database.
    db::delete_skill_installation(pool, skill_id, agent_id).await?;

    Ok(())
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

/// Tauri command: install a skill to a single agent via relative symlink.
#[tauri::command]
pub async fn install_skill_to_agent(
    state: State<'_, AppState>,
    skill_id: String,
    agent_id: String,
    method: Option<String>,
) -> Result<InstallResult, String> {
    match method.as_deref().unwrap_or("auto") {
        "copy" => install_skill_to_agent_copy_impl(&state.db, &skill_id, &agent_id).await,
        "symlink" => install_skill_to_agent_impl(&state.db, &skill_id, &agent_id).await,
        _ => install_skill_to_agent_auto_impl(&state.db, &skill_id, &agent_id).await,
    }
}

#[tauri::command]
pub async fn add_resource_skill_to_central(
    state: State<'_, AppState>,
    skill_id: String,
) -> Result<AddResourceSkillToCentralResult, String> {
    add_resource_skill_to_central_impl(&state.db, &skill_id).await
}

/// Tauri command: remove a skill's symlink from an agent.
#[tauri::command]
pub async fn uninstall_skill_from_agent(
    state: State<'_, AppState>,
    skill_id: String,
    agent_id: String,
) -> Result<(), String> {
    uninstall_skill_from_agent_impl(&state.db, &skill_id, &agent_id).await
}

/// Tauri command: install a skill to multiple agents in one call.
///
/// `method` must be either `"symlink"` (default, creates a relative symlink) or
/// `"copy"` (copies the skill directory). Each agent install is attempted
/// independently; failures are collected in the `failed` list rather than
/// short-circuiting the entire batch.
#[tauri::command]
pub async fn batch_install_to_agents(
    state: State<'_, AppState>,
    skill_id: String,
    agent_ids: Vec<String>,
    method: Option<String>,
) -> Result<BatchInstallResult, String> {
    let method = method.as_deref().unwrap_or("auto");
    let mut succeeded = Vec::new();
    let mut failed = Vec::new();

    for agent_id in &agent_ids {
        let install_result = match method {
            "copy" => install_skill_to_agent_copy_impl(&state.db, &skill_id, agent_id).await,
            "symlink" => install_skill_to_agent_impl(&state.db, &skill_id, agent_id).await,
            _ => install_skill_to_agent_auto_impl(&state.db, &skill_id, agent_id).await,
        };
        match install_result {
            Ok(_) => succeeded.push(agent_id.clone()),
            Err(e) => failed.push(FailedInstall {
                agent_id: agent_id.clone(),
                error: e,
            }),
        }
    }

    Ok(BatchInstallResult { succeeded, failed })
}

/// Install a Resource Library skill directly into only the requested agents.
/// The source is always resolved inside the Resource Library, even when the
/// same skill also has a Central Skills copy.
#[tauri::command]
pub async fn batch_install_resource_skill_to_agents(
    state: State<'_, AppState>,
    skill_id: String,
    agent_ids: Vec<String>,
    method: Option<String>,
) -> Result<BatchInstallResult, String> {
    let method = method.as_deref().unwrap_or("auto");
    let mut succeeded = Vec::new();
    let mut failed = Vec::new();

    for agent_id in &agent_ids {
        match install_resource_skill_to_agent_impl(&state.db, &skill_id, agent_id, method).await {
            Ok(_) => succeeded.push(agent_id.clone()),
            Err(error) => failed.push(FailedInstall {
                agent_id: agent_id.clone(),
                error,
            }),
        }
    }

    Ok(BatchInstallResult { succeeded, failed })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use sqlx::SqlitePool;
    use std::fs;
    use tempfile::TempDir;

    // ── Test helpers ──────────────────────────────────────────────────────────

    /// Create an in-memory SQLite pool with the full schema initialised and
    /// the central/claude-code agent directories redirected to `central_dir`
    /// and `agent_dir` respectively.
    async fn setup_db(central_dir: &Path, agent_dir: &Path) -> DbPool {
        let pool = SqlitePool::connect(":memory:").await.unwrap();
        db::init_database(&pool).await.unwrap();

        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'central'")
            .bind(central_dir.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'claude-code'")
            .bind(agent_dir.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        pool
    }

    /// Create a minimal skill directory containing a valid `SKILL.md`.
    fn create_central_skill(central_dir: &Path, skill_id: &str) -> PathBuf {
        let skill_dir = central_dir.join(skill_id);
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            format!(
                "---\nname: {}\ndescription: Test skill\n---\n\n# {}\n",
                skill_id, skill_id
            ),
        )
        .unwrap();
        skill_dir
    }

    async fn create_resource_skill(pool: &DbPool, resource_dir: &Path, skill_id: &str) -> PathBuf {
        let skill_dir = create_central_skill(resource_dir, skill_id);
        let skill = db::Skill {
            id: skill_id.to_string(),
            name: skill_id.to_string(),
            description: Some("Resource library skill".to_string()),
            file_path: skill_dir.join("SKILL.md").to_string_lossy().into_owned(),
            canonical_path: Some(skill_dir.to_string_lossy().into_owned()),
            is_central: false,
            source: Some("resource-library".to_string()),
            content: None,
            scanned_at: chrono::Utc::now().to_rfc3339(),
        };
        db::upsert_skill(pool, &skill).await.unwrap();
        skill_dir
    }

    async fn create_noncentral_skill(pool: &DbPool, source_root: &Path, skill_id: &str) -> PathBuf {
        let skill_dir = create_central_skill(source_root, skill_id);
        db::upsert_skill(
            pool,
            &db::Skill {
                id: skill_id.to_string(),
                name: skill_id.to_string(),
                description: Some("Platform-only skill".to_string()),
                file_path: skill_dir.join("SKILL.md").to_string_lossy().into_owned(),
                canonical_path: None,
                is_central: false,
                source: Some("native".to_string()),
                content: None,
                scanned_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();
        skill_dir
    }

    // ── make_relative_path ────────────────────────────────────────────────────

    #[test]
    fn test_make_relative_path_sibling_dirs() {
        let from = Path::new("/home/user/claude/skills");
        let to = Path::new("/home/user/.agents/skills/my-skill");
        let rel = make_relative_path(from, to);
        assert_eq!(rel, PathBuf::from("../../.agents/skills/my-skill"));
    }

    #[test]
    fn test_make_relative_path_same_parent() {
        let from = Path::new("/tmp/test/agent");
        let to = Path::new("/tmp/test/central/skill-x");
        let rel = make_relative_path(from, to);
        assert_eq!(rel, PathBuf::from("../central/skill-x"));
    }

    #[test]
    fn test_make_relative_path_deep_nesting() {
        let from = Path::new("/a/b/c/d");
        let to = Path::new("/a/x/y");
        let rel = make_relative_path(from, to);
        assert_eq!(rel, PathBuf::from("../../../x/y"));
    }

    // ── install_skill_to_agent_impl ───────────────────────────────────────────

    #[tokio::test]
    async fn test_install_creates_symlink() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;

        create_central_skill(&central_dir, "my-skill");

        let result = install_skill_to_agent_impl(&pool, "my-skill", "claude-code").await;
        assert!(result.is_ok(), "install should succeed: {:?}", result);

        let symlink_path = agent_dir.join("my-skill");
        let meta = fs::symlink_metadata(&symlink_path).unwrap();
        assert!(meta.file_type().is_symlink(), "entry should be a symlink");
    }

    #[tokio::test]
    async fn test_install_to_universal_agent_returns_central_availability_without_link() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join(".agents/skills");
        let cursor_dir = tmp.path().join(".cursor/skills");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &tmp.path().join("claude")).await;
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'cursor'")
            .bind(cursor_dir.to_string_lossy().to_string())
            .execute(&pool)
            .await
            .unwrap();
        create_central_skill(&central_dir, "universal-skill");

        let result = install_skill_to_agent_impl(&pool, "universal-skill", "cursor")
            .await
            .unwrap();

        assert_eq!(
            result.symlink_path,
            central_dir
                .join("universal-skill")
                .to_string_lossy()
                .into_owned()
        );
        assert!(
            !cursor_dir.join("universal-skill").exists(),
            "universal agents must not receive redundant links for central skills"
        );
        assert!(
            db::get_skill_installations(&pool, "universal-skill")
                .await
                .unwrap()
                .into_iter()
                .all(|installation| installation.agent_id != "cursor"),
            "universal availability must not create removable installation rows"
        );
    }

    #[tokio::test]
    async fn test_install_symlink_is_relative() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "rel-skill");

        install_skill_to_agent_impl(&pool, "rel-skill", "claude-code")
            .await
            .unwrap();

        let symlink_path = agent_dir.join("rel-skill");
        let link_target = fs::read_link(&symlink_path).unwrap();
        assert!(
            link_target.is_relative(),
            "symlink target should be relative, got {:?}",
            link_target
        );
    }

    #[tokio::test]
    async fn test_install_symlink_resolves_correctly() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "resolve-skill");

        install_skill_to_agent_impl(&pool, "resolve-skill", "claude-code")
            .await
            .unwrap();

        let symlink_path = agent_dir.join("resolve-skill");
        // Following the symlink should give access to SKILL.md in the central dir.
        let skill_md = symlink_path.join("SKILL.md");
        assert!(
            skill_md.exists(),
            "SKILL.md should be accessible via symlink"
        );
    }

    #[tokio::test]
    async fn test_install_creates_agent_dir_if_missing() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        // Do NOT pre-create agent_dir — install should create it.
        let agent_dir = tmp.path().join("new-agent-dir");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "dir-skill");

        let result = install_skill_to_agent_impl(&pool, "dir-skill", "claude-code").await;
        assert!(result.is_ok(), "install should create missing agent dir");
        assert!(agent_dir.exists(), "agent dir should have been created");
    }

    #[tokio::test]
    async fn test_install_updates_db_record() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "db-skill");

        install_skill_to_agent_impl(&pool, "db-skill", "claude-code")
            .await
            .unwrap();

        let installations = db::get_skill_installations(&pool, "db-skill")
            .await
            .unwrap();
        assert_eq!(installations.len(), 1);
        assert_eq!(installations[0].agent_id, "claude-code");
        assert_eq!(installations[0].link_type, "symlink");
    }

    #[tokio::test]
    async fn test_install_resource_skill_to_universal_agent_creates_platform_link() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join(".agents").join("skills");
        let cursor_dir = tmp.path().join(".cursor").join("skills");
        let resource_dir = tmp.path().join("resource-library");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(&cursor_dir).unwrap();
        fs::create_dir_all(&resource_dir).unwrap();

        let pool = setup_db(&central_dir, &tmp.path().join("claude")).await;
        db::set_skill_resource_library_dir(&pool, &resource_dir.to_string_lossy())
            .await
            .unwrap();
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'cursor'")
            .bind(cursor_dir.to_string_lossy().into_owned())
            .execute(&pool)
            .await
            .unwrap();

        let source_dir = create_resource_skill(&pool, &resource_dir, "resource-only").await;

        install_resource_skill_to_agent_impl(&pool, "resource-only", "cursor", "symlink")
            .await
            .unwrap();

        let installed_path = cursor_dir.join("resource-only");
        assert!(
            fs::symlink_metadata(&installed_path).is_ok(),
            "resource skill should be explicitly installed into the selected platform"
        );
        assert!(
            !central_dir.join("resource-only").exists(),
            "installing a resource skill to a platform must not copy it into the central library"
        );

        let installations = db::get_skill_installations(&pool, "resource-only")
            .await
            .unwrap();
        assert_eq!(installations.len(), 1);
        assert_eq!(installations[0].agent_id, "cursor");
        assert_eq!(
            installations[0].symlink_target.as_deref(),
            Some(source_dir.to_string_lossy().as_ref())
        );

        let skill = db::get_skill_by_id(&pool, "resource-only")
            .await
            .unwrap()
            .unwrap();
        assert!(
            !skill.is_central,
            "resource library installs must not mark the skill as central"
        );
    }

    #[tokio::test]
    async fn test_resource_install_uses_resource_source_even_when_central_copy_exists() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let resource_dir = tmp.path().join("resource-library");
        let agent_dir = tmp.path().join("claude").join("skills");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(agent_dir.parent().unwrap()).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        db::set_skill_resource_library_dir(&pool, &resource_dir.to_string_lossy())
            .await
            .unwrap();
        sqlx::query("UPDATE agents SET is_enabled = 0 WHERE id != 'central'")
            .execute(&pool)
            .await
            .unwrap();
        let resource_source = create_resource_skill(&pool, &resource_dir, "dual-source").await;
        add_resource_skill_to_central_impl(&pool, "dual-source")
            .await
            .unwrap();

        install_resource_skill_to_agent_impl(&pool, "dual-source", "claude-code", "symlink")
            .await
            .unwrap();

        let installation = db::get_skill_installations(&pool, "dual-source")
            .await
            .unwrap()
            .into_iter()
            .find(|installation| installation.agent_id == "claude-code")
            .unwrap();
        assert_eq!(
            installation.symlink_target.as_deref(),
            Some(resource_source.to_string_lossy().as_ref()),
            "a Resource Library install must target the resource source rather than the Central Skills copy"
        );
        assert_eq!(
            fs::canonicalize(agent_dir.join("dual-source")).unwrap(),
            fs::canonicalize(resource_source).unwrap()
        );
    }

    #[tokio::test]
    async fn test_symlink_install_noncentral_skill_does_not_promote_to_central() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join(".agents").join("skills");
        let source_root = tmp.path().join("source-platform").join("skills");
        let target_dir = tmp.path().join("target-platform").join("skills");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &target_dir).await;
        let source_dir = create_noncentral_skill(&pool, &source_root, "platform-only").await;

        install_skill_to_agent_impl(&pool, "platform-only", "claude-code")
            .await
            .unwrap();

        let installed_path = target_dir.join("platform-only");
        assert!(fs::symlink_metadata(&installed_path).unwrap().is_symlink());
        assert!(!central_dir.join("platform-only").exists());

        let installation = db::get_skill_installations(&pool, "platform-only")
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        assert_eq!(installation.agent_id, "claude-code");
        assert_eq!(
            installation.symlink_target.as_deref(),
            Some(source_dir.to_string_lossy().as_ref())
        );

        let skill = db::get_skill_by_id(&pool, "platform-only")
            .await
            .unwrap()
            .unwrap();
        assert!(!skill.is_central);
        assert_eq!(skill.canonical_path, None);
    }

    #[tokio::test]
    async fn test_copy_install_noncentral_skill_does_not_promote_to_central() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join(".agents").join("skills");
        let source_root = tmp.path().join("source-platform").join("skills");
        let target_dir = tmp.path().join("target-platform").join("skills");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &target_dir).await;
        create_noncentral_skill(&pool, &source_root, "platform-only-copy").await;

        install_skill_to_agent_copy_impl(&pool, "platform-only-copy", "claude-code")
            .await
            .unwrap();

        let installed_path = target_dir.join("platform-only-copy");
        assert!(installed_path.join("SKILL.md").exists());
        assert!(!fs::symlink_metadata(&installed_path).unwrap().is_symlink());
        assert!(!central_dir.join("platform-only-copy").exists());

        let skill = db::get_skill_by_id(&pool, "platform-only-copy")
            .await
            .unwrap()
            .unwrap();
        assert!(!skill.is_central);
        assert_eq!(skill.canonical_path, None);
    }

    async fn point_agent_at_central(pool: &DbPool, agent_id: &str, central_dir: &Path) {
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = ?")
            .bind(central_dir.to_string_lossy().to_string())
            .bind(agent_id)
            .execute(pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn test_symlink_install_rejects_noncentral_skill_when_agent_uses_central_dir() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join(".agents").join("skills");
        let source_root = tmp.path().join("resource-library");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &tmp.path().join("claude")).await;
        point_agent_at_central(&pool, "codex", &central_dir).await;
        create_noncentral_skill(&pool, &source_root, "resource-only").await;

        let error = install_skill_to_agent_impl(&pool, "resource-only", "codex")
            .await
            .unwrap_err();

        assert!(error.contains("central skills directory"));
        assert!(!central_dir.join("resource-only").exists());
    }

    #[tokio::test]
    async fn test_copy_install_rejects_noncentral_skill_when_agent_uses_central_dir() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join(".agents").join("skills");
        let source_root = tmp.path().join("resource-library");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &tmp.path().join("claude")).await;
        point_agent_at_central(&pool, "codex", &central_dir).await;
        create_noncentral_skill(&pool, &source_root, "resource-copy").await;

        let error = install_skill_to_agent_copy_impl(&pool, "resource-copy", "codex")
            .await
            .unwrap_err();

        assert!(error.contains("central skills directory"));
        assert!(!central_dir.join("resource-copy").exists());
    }

    #[tokio::test]
    async fn test_reinstall_migrates_legacy_platform_link_out_of_central() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join(".agents").join("skills");
        let resource_dir = tmp.path().join("resource-library");
        let codex_dir = tmp.path().join(".codex").join("skills");
        fs::create_dir_all(&central_dir).unwrap();
        let source_dir = create_central_skill(&resource_dir, "legacy-resource");
        let legacy_link = central_dir.join("legacy-resource");
        create_symlink(&source_dir, &legacy_link).unwrap();

        let pool = setup_db(&central_dir, &tmp.path().join("claude")).await;
        point_agent_at_central(&pool, "codex", &codex_dir).await;
        db::upsert_skill(
            &pool,
            &db::Skill {
                id: "legacy-resource".to_string(),
                name: "legacy-resource".to_string(),
                description: Some("Legacy resource skill".to_string()),
                file_path: legacy_link.join("SKILL.md").to_string_lossy().into_owned(),
                canonical_path: Some(legacy_link.to_string_lossy().into_owned()),
                is_central: true,
                source: Some("resource-library".to_string()),
                content: None,
                scanned_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO skill_installations
             (skill_id, agent_id, installed_path, link_type, symlink_target, is_managed, created_at)
             VALUES (?, 'codex', ?, 'symlink', ?, 0, ?)",
        )
        .bind("legacy-resource")
        .bind(legacy_link.to_string_lossy().into_owned())
        .bind(source_dir.to_string_lossy().into_owned())
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();

        install_skill_to_agent_impl(&pool, "legacy-resource", "codex")
            .await
            .unwrap();

        assert!(fs::symlink_metadata(&legacy_link).is_err());
        let codex_link = codex_dir.join("legacy-resource");
        assert!(codex_link.join("SKILL.md").exists());
        assert!(fs::symlink_metadata(&codex_link).unwrap().is_symlink());
        let repaired = db::get_skill_by_id(&pool, "legacy-resource")
            .await
            .unwrap()
            .unwrap();
        assert!(!repaired.is_central);
        assert_eq!(
            repaired.canonical_path.as_deref(),
            Some(source_dir.to_string_lossy().as_ref())
        );
        let installation = db::get_skill_installations(&pool, "legacy-resource")
            .await
            .unwrap()
            .into_iter()
            .find(|installation| installation.agent_id == "codex")
            .unwrap();
        assert_eq!(installation.installed_path, codex_link.to_string_lossy());
    }

    #[tokio::test]
    async fn test_install_uses_nested_canonical_path_from_db() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        let nested_skill_dir = central_dir.join("superpowers").join("using-superpowers");
        fs::create_dir_all(&nested_skill_dir).unwrap();
        fs::write(
            nested_skill_dir.join("SKILL.md"),
            "---\nname: using-superpowers\ndescription: Nested central\n---\n",
        )
        .unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        db::upsert_skill(
            &pool,
            &db::Skill {
                id: "using-superpowers".to_string(),
                name: "using-superpowers".to_string(),
                description: Some("Nested central".to_string()),
                file_path: nested_skill_dir
                    .join("SKILL.md")
                    .to_string_lossy()
                    .into_owned(),
                canonical_path: Some(nested_skill_dir.to_string_lossy().into_owned()),
                is_central: true,
                source: Some("native".to_string()),
                content: None,
                scanned_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();

        install_skill_to_agent_impl(&pool, "using-superpowers", "claude-code")
            .await
            .unwrap();

        let symlink_path = agent_dir.join("superpowers").join("using-superpowers");
        assert!(symlink_path.join("SKILL.md").exists());
        assert!(
            !agent_dir.join("using-superpowers").exists(),
            "nested canonical skill must not be flattened at the platform root"
        );
        assert!(
            !central_dir.join("using-superpowers").exists(),
            "nested canonical skill must not be copied to the central root"
        );
        let link_target = fs::read_link(&symlink_path).unwrap();
        assert!(
            link_target
                .components()
                .collect::<Vec<_>>()
                .windows(2)
                .any(|pair| {
                    pair[0].as_os_str() == "superpowers"
                        && pair[1].as_os_str() == "using-superpowers"
                }),
            "symlink should point at nested canonical path, got {:?}",
            link_target
        );
    }

    #[tokio::test]
    async fn test_install_preserves_nested_canonical_relative_path() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        let nested_skill_dir = central_dir
            .join("anthropics")
            .join("skills")
            .join("brand-guidelines");
        fs::create_dir_all(&nested_skill_dir).unwrap();
        fs::write(
            nested_skill_dir.join("SKILL.md"),
            "---\nname: brand-guidelines\ndescription: Brand rules\n---\n",
        )
        .unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        db::upsert_skill(
            &pool,
            &db::Skill {
                id: "brand-guidelines".to_string(),
                name: "brand-guidelines".to_string(),
                description: Some("Brand rules".to_string()),
                file_path: nested_skill_dir
                    .join("SKILL.md")
                    .to_string_lossy()
                    .into_owned(),
                canonical_path: Some(nested_skill_dir.to_string_lossy().into_owned()),
                is_central: true,
                source: Some("github:anthropics/skills".to_string()),
                content: None,
                scanned_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();

        install_skill_to_agent_impl(&pool, "brand-guidelines", "claude-code")
            .await
            .unwrap();

        let nested_link = agent_dir
            .join("anthropics")
            .join("skills")
            .join("brand-guidelines");
        assert!(
            nested_link.join("SKILL.md").exists(),
            "platform install should keep the central author/repo grouping"
        );
        assert!(
            !agent_dir.join("brand-guidelines").exists(),
            "nested canonical skills should not be flattened at the platform root"
        );
    }

    #[tokio::test]
    async fn test_copy_install_preserves_nested_canonical_relative_path() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        let nested_skill_dir = central_dir
            .join("anthropics")
            .join("skills")
            .join("copy-guidelines");
        fs::create_dir_all(&nested_skill_dir).unwrap();
        fs::write(
            nested_skill_dir.join("SKILL.md"),
            "---\nname: copy-guidelines\ndescription: Copy rules\n---\n",
        )
        .unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        db::upsert_skill(
            &pool,
            &db::Skill {
                id: "copy-guidelines".to_string(),
                name: "copy-guidelines".to_string(),
                description: Some("Copy rules".to_string()),
                file_path: nested_skill_dir
                    .join("SKILL.md")
                    .to_string_lossy()
                    .into_owned(),
                canonical_path: Some(nested_skill_dir.to_string_lossy().into_owned()),
                is_central: true,
                source: Some("github:anthropics/skills".to_string()),
                content: None,
                scanned_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();

        install_skill_to_agent_copy_impl(&pool, "copy-guidelines", "claude-code")
            .await
            .unwrap();

        let nested_copy = agent_dir
            .join("anthropics")
            .join("skills")
            .join("copy-guidelines");
        assert!(
            nested_copy.join("SKILL.md").exists(),
            "copy install should keep the central author/repo grouping"
        );
        assert!(
            !agent_dir.join("copy-guidelines").exists(),
            "nested canonical copies should not be flattened at the platform root"
        );
    }

    #[tokio::test]
    async fn test_nested_symlink_install_removes_previous_flat_installation() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        let nested_skill_dir = central_dir
            .join("anthropics")
            .join("skills")
            .join("migrated-link");
        fs::create_dir_all(&nested_skill_dir).unwrap();
        fs::write(
            nested_skill_dir.join("SKILL.md"),
            "---\nname: migrated-link\ndescription: Migrated link\n---\n",
        )
        .unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        db::upsert_skill(
            &pool,
            &db::Skill {
                id: "migrated-link".to_string(),
                name: "migrated-link".to_string(),
                description: Some("Migrated link".to_string()),
                file_path: nested_skill_dir
                    .join("SKILL.md")
                    .to_string_lossy()
                    .into_owned(),
                canonical_path: Some(nested_skill_dir.to_string_lossy().into_owned()),
                is_central: true,
                source: Some("github:anthropics/skills".to_string()),
                content: None,
                scanned_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();
        fs::create_dir_all(&agent_dir).unwrap();
        let old_flat_path = agent_dir.join("migrated-link");
        create_symlink(&nested_skill_dir, &old_flat_path).unwrap();
        db::upsert_skill_installation(
            &pool,
            &SkillInstallation {
                skill_id: "migrated-link".to_string(),
                agent_id: "claude-code".to_string(),
                installed_path: old_flat_path.to_string_lossy().into_owned(),
                link_type: "symlink".to_string(),
                symlink_target: Some(nested_skill_dir.to_string_lossy().into_owned()),
                created_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();

        install_skill_to_agent_impl(&pool, "migrated-link", "claude-code")
            .await
            .unwrap();

        assert!(
            !old_flat_path.exists(),
            "old flat symlink should be removed"
        );
        assert!(agent_dir
            .join("anthropics")
            .join("skills")
            .join("migrated-link")
            .join("SKILL.md")
            .exists());
    }

    #[tokio::test]
    async fn test_nested_copy_install_removes_previous_flat_installation() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        let nested_skill_dir = central_dir
            .join("anthropics")
            .join("skills")
            .join("migrated-copy");
        fs::create_dir_all(&nested_skill_dir).unwrap();
        fs::write(
            nested_skill_dir.join("SKILL.md"),
            "---\nname: migrated-copy\ndescription: Migrated copy\n---\n",
        )
        .unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        db::upsert_skill(
            &pool,
            &db::Skill {
                id: "migrated-copy".to_string(),
                name: "migrated-copy".to_string(),
                description: Some("Migrated copy".to_string()),
                file_path: nested_skill_dir
                    .join("SKILL.md")
                    .to_string_lossy()
                    .into_owned(),
                canonical_path: Some(nested_skill_dir.to_string_lossy().into_owned()),
                is_central: true,
                source: Some("github:anthropics/skills".to_string()),
                content: None,
                scanned_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();
        let old_flat_path = agent_dir.join("migrated-copy");
        fs::create_dir_all(&old_flat_path).unwrap();
        fs::write(old_flat_path.join("SKILL.md"), "---\nname: old\n---\n").unwrap();
        db::upsert_skill_installation(
            &pool,
            &SkillInstallation {
                skill_id: "migrated-copy".to_string(),
                agent_id: "claude-code".to_string(),
                installed_path: old_flat_path.to_string_lossy().into_owned(),
                link_type: "copy".to_string(),
                symlink_target: None,
                created_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();

        install_skill_to_agent_copy_impl(&pool, "migrated-copy", "claude-code")
            .await
            .unwrap();

        assert!(!old_flat_path.exists(), "old flat copy should be removed");
        assert!(agent_dir
            .join("anthropics")
            .join("skills")
            .join("migrated-copy")
            .join("SKILL.md")
            .exists());
    }

    #[tokio::test]
    async fn test_install_fails_when_canonical_missing() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        // Do NOT create the skill in central_dir.

        let result = install_skill_to_agent_impl(&pool, "nonexistent-skill", "claude-code").await;
        assert!(
            result.is_err(),
            "install should fail if canonical skill missing"
        );
    }

    #[tokio::test]
    async fn test_install_fails_for_unknown_agent() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "some-skill");

        let result = install_skill_to_agent_impl(&pool, "some-skill", "nonexistent-agent").await;
        assert!(result.is_err(), "install should fail for unknown agent");
    }

    #[tokio::test]
    async fn test_install_to_central_agent_is_rejected() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &tmp.path().join("claude")).await;
        create_central_skill(&central_dir, "self-skill");

        let result = install_skill_to_agent_impl(&pool, "self-skill", "central").await;
        assert!(
            result.is_err(),
            "installing to 'central' should be rejected"
        );
    }

    #[tokio::test]
    async fn test_install_replaces_existing_symlink() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(&agent_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "re-link-skill");

        // Install once.
        install_skill_to_agent_impl(&pool, "re-link-skill", "claude-code")
            .await
            .unwrap();

        // Install again — should replace the existing symlink without error.
        let result = install_skill_to_agent_impl(&pool, "re-link-skill", "claude-code").await;
        assert!(result.is_ok(), "re-install should succeed: {:?}", result);
    }

    #[tokio::test]
    async fn test_install_refuses_to_overwrite_real_dir() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(&agent_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "real-dir-skill");

        // Create a real (non-symlink) directory at the install location.
        fs::create_dir_all(agent_dir.join("real-dir-skill")).unwrap();

        let result = install_skill_to_agent_impl(&pool, "real-dir-skill", "claude-code").await;
        assert!(
            result.is_err(),
            "install should refuse to overwrite a real directory"
        );
    }

    // ── uninstall_skill_from_agent_impl ───────────────────────────────────────

    #[tokio::test]
    async fn test_uninstall_removes_symlink() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "uninstall-skill");

        install_skill_to_agent_impl(&pool, "uninstall-skill", "claude-code")
            .await
            .unwrap();

        let symlink_path = agent_dir.join("uninstall-skill");
        assert!(symlink_path.exists() || fs::symlink_metadata(&symlink_path).is_ok());

        uninstall_skill_from_agent_impl(&pool, "uninstall-skill", "claude-code")
            .await
            .unwrap();

        assert!(
            fs::symlink_metadata(&symlink_path).is_err(),
            "symlink should have been removed"
        );
    }

    #[tokio::test]
    async fn test_uninstall_removes_db_record() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "db-uninstall-skill");

        install_skill_to_agent_impl(&pool, "db-uninstall-skill", "claude-code")
            .await
            .unwrap();

        uninstall_skill_from_agent_impl(&pool, "db-uninstall-skill", "claude-code")
            .await
            .unwrap();

        let installations = db::get_skill_installations(&pool, "db-uninstall-skill")
            .await
            .unwrap();
        assert!(installations.is_empty(), "DB record should be removed");
    }

    #[tokio::test]
    async fn test_uninstall_refuses_real_dir() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&agent_dir).unwrap();
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;

        // Place a real directory where the symlink would be.
        fs::create_dir_all(agent_dir.join("protected-skill")).unwrap();

        let result = uninstall_skill_from_agent_impl(&pool, "protected-skill", "claude-code").await;
        assert!(
            result.is_err(),
            "uninstall should refuse to delete a real directory"
        );

        // Ensure the directory still exists.
        assert!(
            agent_dir.join("protected-skill").is_dir(),
            "real directory should NOT have been deleted"
        );
    }

    #[tokio::test]
    async fn test_uninstall_nonexistent_path_still_cleans_db() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(&agent_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;

        // Manually insert an installation record without creating the symlink.
        let installation = SkillInstallation {
            skill_id: "ghost-skill".to_string(),
            agent_id: "claude-code".to_string(),
            installed_path: agent_dir.join("ghost-skill").to_string_lossy().into_owned(),
            link_type: "symlink".to_string(),
            symlink_target: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db::upsert_skill_installation(&pool, &installation)
            .await
            .unwrap();

        let result = uninstall_skill_from_agent_impl(&pool, "ghost-skill", "claude-code").await;
        assert!(result.is_ok(), "uninstall of missing path should succeed");

        let installations = db::get_skill_installations(&pool, "ghost-skill")
            .await
            .unwrap();
        assert!(installations.is_empty(), "DB record should be cleaned up");
    }

    #[tokio::test]
    async fn test_uninstall_universal_availability_without_record_is_noop() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join(".agents/skills");
        fs::create_dir_all(&central_dir).unwrap();
        let pool = setup_db(&central_dir, &tmp.path().join("claude")).await;
        create_central_skill(&central_dir, "universal-skill");

        uninstall_skill_from_agent_impl(&pool, "universal-skill", "cursor")
            .await
            .unwrap();

        assert!(
            central_dir.join("universal-skill/SKILL.md").exists(),
            "uninstalling read-only universal availability must not delete the central skill"
        );
    }

    #[tokio::test]
    async fn test_uninstall_without_managed_record_keeps_external_symlink() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        let external_dir = tmp.path().join("external-skill");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(&agent_dir).unwrap();
        fs::create_dir_all(&external_dir).unwrap();
        fs::write(
            external_dir.join("SKILL.md"),
            "---\nname: External Skill\n---\n",
        )
        .unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        let external_link = agent_dir.join("external-skill");
        create_symlink(&external_dir, &external_link).unwrap();

        let result = uninstall_skill_from_agent_impl(&pool, "external-skill", "claude-code").await;

        assert!(
            result.is_err(),
            "uninstall without a managed installation row should be rejected"
        );
        assert!(
            fs::symlink_metadata(&external_link)
                .unwrap()
                .file_type()
                .is_symlink(),
            "the external symlink must remain untouched"
        );
        assert_eq!(
            external_link.canonicalize().unwrap(),
            external_dir.canonicalize().unwrap()
        );
    }

    #[tokio::test]
    async fn test_uninstall_uses_recorded_installed_path_for_nested_skill() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("hermes");
        let nested_installed = agent_dir.join("apple").join("apple-reminders");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(&nested_installed).unwrap();
        fs::write(
            nested_installed.join("SKILL.md"),
            "---\nname: apple-reminders\ndescription: Nested platform\n---\n",
        )
        .unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        let installation = SkillInstallation {
            skill_id: "apple-reminders".to_string(),
            agent_id: "claude-code".to_string(),
            installed_path: nested_installed.to_string_lossy().into_owned(),
            link_type: "copy".to_string(),
            symlink_target: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db::upsert_skill_installation(&pool, &installation)
            .await
            .unwrap();

        uninstall_skill_from_agent_impl(&pool, "apple-reminders", "claude-code")
            .await
            .unwrap();

        assert!(
            !nested_installed.exists(),
            "uninstall should remove the actual nested installed path"
        );
    }

    // ── batch install ─────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_batch_install_multiple_agents() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let claude_dir = tmp.path().join("claude");
        let aider_dir = tmp.path().join("aider");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &claude_dir).await;

        // Override a second non-universal agent's dir too.
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'aider'")
            .bind(aider_dir.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        create_central_skill(&central_dir, "batch-skill");

        let result = batch_install_impl(
            &pool,
            "batch-skill",
            &["claude-code".to_string(), "aider".to_string()],
        )
        .await;

        assert_eq!(result.succeeded.len(), 2);
        assert!(result.failed.is_empty());

        assert!(fs::symlink_metadata(claude_dir.join("batch-skill")).is_ok());
        assert!(fs::symlink_metadata(aider_dir.join("batch-skill")).is_ok());
    }

    #[tokio::test]
    async fn test_batch_install_partial_failure() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let claude_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &claude_dir).await;
        create_central_skill(&central_dir, "partial-skill");

        let result = batch_install_impl(
            &pool,
            "partial-skill",
            &[
                "claude-code".to_string(),
                "nonexistent-agent".to_string(), // will fail
            ],
        )
        .await;

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.failed.len(), 1);
        assert_eq!(result.failed[0].agent_id, "nonexistent-agent");
    }

    /// Helper that mirrors `batch_install_to_agents` but works with a raw pool
    /// (no Tauri State).
    async fn batch_install_impl(
        pool: &DbPool,
        skill_id: &str,
        agent_ids: &[String],
    ) -> BatchInstallResult {
        let mut succeeded = Vec::new();
        let mut failed = Vec::new();

        for agent_id in agent_ids {
            match install_skill_to_agent_impl(pool, skill_id, agent_id).await {
                Ok(_) => succeeded.push(agent_id.clone()),
                Err(e) => failed.push(FailedInstall {
                    agent_id: agent_id.clone(),
                    error: e,
                }),
            }
        }

        BatchInstallResult { succeeded, failed }
    }

    // ── install_skill_to_agent_copy_impl ──────────────────────────────────────

    #[tokio::test]
    async fn test_copy_install_creates_real_directory() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "copy-skill");

        let result = install_skill_to_agent_copy_impl(&pool, "copy-skill", "claude-code").await;
        assert!(result.is_ok(), "copy install should succeed: {:?}", result);

        let target = agent_dir.join("copy-skill");
        let meta = fs::symlink_metadata(&target).unwrap();
        // Must be a real directory — NOT a symlink.
        assert!(
            meta.is_dir() && !meta.file_type().is_symlink(),
            "installed path should be a real directory, not a symlink"
        );
    }

    #[tokio::test]
    async fn test_copy_install_files_are_copied() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;

        // Create skill with multiple files to verify all are copied.
        let skill_dir = central_dir.join("multi-file-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: multi-file-skill\ndescription: Test\n---\n",
        )
        .unwrap();
        fs::write(skill_dir.join("extra.txt"), "extra content").unwrap();

        install_skill_to_agent_copy_impl(&pool, "multi-file-skill", "claude-code")
            .await
            .unwrap();

        let installed_skill_dir = agent_dir.join("multi-file-skill");

        // Verify SKILL.md was copied.
        let skill_md = installed_skill_dir.join("SKILL.md");
        assert!(skill_md.exists(), "SKILL.md should be copied to agent dir");

        // Verify extra file was copied.
        let extra = installed_skill_dir.join("extra.txt");
        assert!(extra.exists(), "extra.txt should be copied to agent dir");
        assert_eq!(
            fs::read_to_string(&extra).unwrap(),
            "extra content",
            "copied file contents should match"
        );

        // Confirm that the installed path is NOT a symlink.
        let meta = fs::symlink_metadata(&installed_skill_dir).unwrap();
        assert!(
            !meta.file_type().is_symlink(),
            "installed directory must NOT be a symlink"
        );
    }

    #[tokio::test]
    async fn test_copy_install_updates_db_with_copy_type() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "db-copy-skill");

        install_skill_to_agent_copy_impl(&pool, "db-copy-skill", "claude-code")
            .await
            .unwrap();

        let installations = db::get_skill_installations(&pool, "db-copy-skill")
            .await
            .unwrap();
        assert_eq!(installations.len(), 1);
        assert_eq!(installations[0].agent_id, "claude-code");
        assert_eq!(
            installations[0].link_type, "copy",
            "DB should record link_type as 'copy'"
        );
    }

    #[tokio::test]
    async fn test_copy_install_to_central_is_rejected() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &tmp.path().join("claude")).await;
        create_central_skill(&central_dir, "self-copy-skill");

        let result = install_skill_to_agent_copy_impl(&pool, "self-copy-skill", "central").await;
        assert!(
            result.is_err(),
            "copy install to 'central' should be rejected"
        );
    }

    #[tokio::test]
    async fn test_add_resource_skill_to_central_preserves_source_group_path() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        let resource_dir = tmp.path().join("resource");
        let grouped_resource_dir = resource_dir.join("owner").join("repo");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(&agent_dir).unwrap();
        fs::create_dir_all(&grouped_resource_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        db::set_skill_resource_library_dir(&pool, &resource_dir.to_string_lossy())
            .await
            .unwrap();
        create_resource_skill(&pool, &grouped_resource_dir, "resource-only").await;

        let result = add_resource_skill_to_central_impl(&pool, "resource-only")
            .await
            .unwrap();

        let expected_dir = central_dir.join("owner").join("repo").join("resource-only");
        assert_eq!(PathBuf::from(result.central_path), expected_dir);
        assert!(expected_dir.join("SKILL.md").exists());

        let skill = db::get_skill_by_id(&pool, "resource-only")
            .await
            .unwrap()
            .unwrap();
        assert!(skill.is_central);
        assert_eq!(
            skill.canonical_path.as_deref(),
            Some(expected_dir.to_string_lossy().as_ref())
        );
    }

    #[tokio::test]
    async fn test_add_resource_skill_to_central_syncs_to_detected_enabled_platforms() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let resource_dir = tmp.path().join("resource-library");
        let agent_dir = tmp.path().join("claude").join("skills");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(agent_dir.parent().unwrap()).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        db::set_skill_resource_library_dir(&pool, &resource_dir.to_string_lossy())
            .await
            .unwrap();
        sqlx::query("UPDATE agents SET is_enabled = 0 WHERE id != 'central'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE agents SET is_enabled = 1 WHERE id = 'claude-code'")
            .execute(&pool)
            .await
            .unwrap();
        create_resource_skill(&pool, &resource_dir, "shared-skill").await;

        add_resource_skill_to_central_impl(&pool, "shared-skill")
            .await
            .unwrap();

        let central_skill = central_dir.join("shared-skill");
        let platform_skill = agent_dir.join("shared-skill");
        assert!(central_skill.join("SKILL.md").exists());
        assert!(
            platform_skill.join("SKILL.md").exists(),
            "adding a resource skill to Central Skills must synchronize it to detected enabled platforms"
        );
        assert!(fs::symlink_metadata(platform_skill).unwrap().is_symlink());
    }

    #[tokio::test]
    async fn test_add_resource_skill_to_central_preserves_github_source_metadata() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        let resource_dir = tmp.path().join("resource");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(&agent_dir).unwrap();
        fs::create_dir_all(&resource_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        db::set_skill_resource_library_dir(&pool, &resource_dir.to_string_lossy())
            .await
            .unwrap();
        create_resource_skill(&pool, &resource_dir, "github-resource").await;
        let mut skill = db::get_skill_by_id(&pool, "github-resource")
            .await
            .unwrap()
            .unwrap();
        skill.source = Some("github:example/skills".to_string());
        db::upsert_skill(&pool, &skill).await.unwrap();
        db::upsert_skill_source(
            &pool,
            &db::SkillSource {
                skill_id: "github-resource".to_string(),
                source_type: "github".to_string(),
                source_url: Some(
                    "https://raw.githubusercontent.com/example/skills/main/SKILL.md".to_string(),
                ),
                source_author: Some("example".to_string()),
                source_repo: Some("example/skills".to_string()),
                source_path: Some("skills/github-resource/SKILL.md".to_string()),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await
        .unwrap();

        add_resource_skill_to_central_impl(&pool, "github-resource")
            .await
            .unwrap();

        let promoted = db::get_skill_by_id(&pool, "github-resource")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(promoted.source.as_deref(), Some("github:example/skills"));
        let source = db::get_skill_source(&pool, "github-resource")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(source.source_type, "github");
        assert_eq!(source.source_repo.as_deref(), Some("example/skills"));
    }

    #[tokio::test]
    async fn test_copy_install_fails_when_canonical_missing() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        // Deliberately do NOT create the skill in central_dir.

        let result = install_skill_to_agent_copy_impl(&pool, "missing-skill", "claude-code").await;
        assert!(
            result.is_err(),
            "copy install should fail when canonical skill is missing"
        );
    }

    #[tokio::test]
    async fn test_copy_install_refuses_to_overwrite_real_dir() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();
        fs::create_dir_all(&agent_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "existing-dir-skill");

        // Create a real directory at the target location.
        fs::create_dir_all(agent_dir.join("existing-dir-skill")).unwrap();

        let result =
            install_skill_to_agent_copy_impl(&pool, "existing-dir-skill", "claude-code").await;
        assert!(
            result.is_err(),
            "copy install should refuse to overwrite an existing real directory"
        );
    }

    // ── uninstall (copy) ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_uninstall_removes_copied_directory() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "uninstall-copy-skill");

        // First, install via copy.
        install_skill_to_agent_copy_impl(&pool, "uninstall-copy-skill", "claude-code")
            .await
            .unwrap();

        let target = agent_dir.join("uninstall-copy-skill");
        assert!(
            target.is_dir(),
            "copied directory should exist before uninstall"
        );

        // Now uninstall.
        uninstall_skill_from_agent_impl(&pool, "uninstall-copy-skill", "claude-code")
            .await
            .unwrap();

        assert!(
            fs::symlink_metadata(&target).is_err(),
            "copied directory should have been removed after uninstall"
        );
    }

    #[tokio::test]
    async fn test_uninstall_copy_removes_db_record() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "db-copy-uninstall-skill");

        install_skill_to_agent_copy_impl(&pool, "db-copy-uninstall-skill", "claude-code")
            .await
            .unwrap();

        uninstall_skill_from_agent_impl(&pool, "db-copy-uninstall-skill", "claude-code")
            .await
            .unwrap();

        let installations = db::get_skill_installations(&pool, "db-copy-uninstall-skill")
            .await
            .unwrap();
        assert!(
            installations.is_empty(),
            "DB record should be removed after uninstall"
        );
    }

    #[tokio::test]
    async fn test_uninstall_refuses_real_dir_without_copy_record() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&agent_dir).unwrap();
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;

        // Place a real directory with NO DB record as 'copy' type.
        fs::create_dir_all(agent_dir.join("protected-skill")).unwrap();

        let result = uninstall_skill_from_agent_impl(&pool, "protected-skill", "claude-code").await;
        assert!(
            result.is_err(),
            "uninstall should refuse to delete a real directory without a copy record"
        );

        // Ensure the directory still exists.
        assert!(
            agent_dir.join("protected-skill").is_dir(),
            "real directory should NOT have been deleted"
        );
    }

    #[tokio::test]
    async fn test_batch_install_uses_copy_method() {
        let tmp = TempDir::new().unwrap();
        let central_dir = tmp.path().join("central");
        let agent_dir = tmp.path().join("claude");
        fs::create_dir_all(&central_dir).unwrap();

        let pool = setup_db(&central_dir, &agent_dir).await;
        create_central_skill(&central_dir, "batch-copy-skill");

        let mut succeeded = Vec::new();
        let mut failed = Vec::new();
        for agent_id in &["claude-code".to_string()] {
            match install_skill_to_agent_copy_impl(&pool, "batch-copy-skill", agent_id).await {
                Ok(_) => succeeded.push(agent_id.clone()),
                Err(e) => failed.push(FailedInstall {
                    agent_id: agent_id.clone(),
                    error: e,
                }),
            }
        }

        assert_eq!(succeeded.len(), 1);
        assert!(failed.is_empty());

        // The installed directory must NOT be a symlink.
        let target = agent_dir.join("batch-copy-skill");
        let meta = fs::symlink_metadata(&target).unwrap();
        assert!(
            !meta.file_type().is_symlink(),
            "batch copy install should create a real directory"
        );
    }
}
