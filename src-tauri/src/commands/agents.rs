use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::{self, Agent, DbPool};
use crate::path_utils::{expand_home_path, path_to_string, paths_resolve_to_same_entry};
use crate::AppState;

// ─── Types ────────────────────────────────────────────────────────────────────

/// An agent enriched with a live `is_detected` flag derived from the file
/// system at query time, rather than from the last scan run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWithStatus {
    pub id: String,
    pub display_name: String,
    pub category: String,
    pub global_skills_dir: String,
    pub project_skills_dir: Option<String>,
    pub icon_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_src: Option<String>,
    /// `true` if the agent is considered "installed" on this machine.
    /// Detected by checking whether `global_skills_dir` exists **or** its
    /// parent directory exists (parent existing implies the app is installed
    /// even if no skills have been added yet).
    pub is_detected: bool,
    pub is_builtin: bool,
    pub is_enabled: bool,
    pub shares_central_skills: bool,
}

/// Payload for registering a new user-defined agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomAgentConfig {
    /// Optional explicit ID. If omitted or empty, one is derived from
    /// `display_name`.
    pub id: Option<String>,
    /// Human-readable name shown in the UI.
    pub display_name: String,
    /// Agent category — "coding", "lobster", or "other".
    pub category: Option<String>,
    /// Absolute path to the agent's global skills directory.
    pub global_skills_dir: String,
}

/// Payload for updating an existing user-defined agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCustomAgentConfig {
    /// Human-readable name shown in the UI.
    pub display_name: String,
    /// Agent category — "coding", "lobster", or "other".
    pub category: Option<String>,
    /// Absolute path to the agent's global skills directory.
    pub global_skills_dir: String,
}

// ─── Detection Helpers ────────────────────────────────────────────────────────

/// Returns `true` if the agent appears to be installed on the current machine.
///
/// An agent is considered detected if:
/// - Its `global_skills_dir` exists, **or**
/// - The *parent* of `global_skills_dir` exists (the app is installed even
///   though no skills directory has been created yet).
pub fn is_agent_detected(global_skills_dir: &str) -> bool {
    let dir = Path::new(global_skills_dir);
    if dir.exists() {
        return true;
    }
    dir.parent().is_some_and(|p| p.exists())
}

/// Convert a `db::Agent` into `AgentWithStatus` using a live filesystem check.
fn paths_share_skills_root(left: &str, right: Option<&str>) -> bool {
    let Some(right) = right else {
        return false;
    };
    paths_resolve_to_same_entry(&expand_home_path(left), &expand_home_path(right))
}

fn agent_to_with_status(agent: Agent, central_root: Option<&str>) -> AgentWithStatus {
    let is_detected = is_agent_detected(&agent.global_skills_dir);
    let shares_central_skills =
        agent.id != "central" && paths_share_skills_root(&agent.global_skills_dir, central_root);
    AgentWithStatus {
        id: agent.id,
        display_name: agent.display_name,
        category: agent.category,
        global_skills_dir: agent.global_skills_dir,
        project_skills_dir: agent.project_skills_dir,
        icon_name: agent.icon_name.clone(),
        icon_src: crate::platforms::icon_src_for_agent(agent.icon_name.as_deref()),
        is_detected,
        is_builtin: agent.is_builtin,
        is_enabled: agent.is_enabled,
        shares_central_skills,
    }
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/// Return all agents from the DB with live detection status.
pub async fn get_agents_impl(pool: &DbPool) -> Result<Vec<AgentWithStatus>, String> {
    let agents = db::get_all_agents(pool).await?;
    let central_root = agents
        .iter()
        .find(|agent| agent.id == "central")
        .map(|agent| agent.global_skills_dir.clone());
    Ok(agents
        .into_iter()
        .map(|agent| agent_to_with_status(agent, central_root.as_deref()))
        .collect())
}

/// Scan the filesystem to update each agent's `is_detected` flag, then return
/// all agents with their refreshed status.
pub async fn detect_agents_impl(pool: &DbPool) -> Result<Vec<AgentWithStatus>, String> {
    let agents = db::get_all_agents(pool).await?;
    let mut result = Vec::with_capacity(agents.len());
    let central_root = agents
        .iter()
        .find(|agent| agent.id == "central")
        .map(|agent| agent.global_skills_dir.clone());

    for agent in agents {
        let is_detected = is_agent_detected(&agent.global_skills_dir);
        // Best-effort update; ignore errors (e.g., read-only DB in tests).
        let _ = db::update_agent_detected(pool, &agent.id, is_detected).await;
        result.push(agent_to_with_status(agent, central_root.as_deref()));
    }

    Ok(result)
}

fn slugify_platform_id(value: &str) -> String {
    let slug = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();
    slug.split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Insert a new user-defined agent and return its representation.
pub async fn add_custom_agent_impl(
    pool: &DbPool,
    config: CustomAgentConfig,
) -> Result<AgentWithStatus, String> {
    // Derive an ID from the provided value or the display_name.
    // Use a kebab-case slug (github-copilot) so icon filenames never contain spaces.
    let requested = match config.id.as_deref() {
        Some(s) if !s.trim().is_empty() => slugify_platform_id(s),
        _ => slugify_platform_id(&config.display_name),
    };
    let mut id = if requested.is_empty() {
        format!("platform-{}", Uuid::new_v4())
    } else {
        requested
    };
    if db::get_agent_by_id(pool, &id).await?.is_some() {
        id = format!("{}-{}", id, &Uuid::new_v4().to_string()[..8]);
    }

    if id.is_empty() {
        return Err("Agent ID cannot be empty".to_string());
    }

    let category = config.category.unwrap_or_else(|| "other".to_string());
    let global_skills_dir = path_to_string(&expand_home_path(&config.global_skills_dir));

    let agent = Agent {
        id: id.clone(),
        display_name: config.display_name,
        category,
        global_skills_dir,
        project_skills_dir: None,
        icon_name: Some(format!("{}.svg", id)),
        is_detected: false, // will be computed live below
        is_builtin: false,
        is_enabled: true,
    };

    db::insert_custom_agent(pool, &agent).await?;

    // Re-fetch so we have the persisted record.
    let persisted = db::get_agent_by_id(pool, &id)
        .await?
        .ok_or_else(|| "Failed to retrieve newly created agent".to_string())?;

    let central_root = db::get_agent_by_id(pool, "central")
        .await?
        .map(|agent| agent.global_skills_dir);
    Ok(agent_to_with_status(persisted, central_root.as_deref()))
}

/// Update an existing agent and return its updated representation.
pub async fn update_custom_agent_impl(
    pool: &DbPool,
    agent_id: &str,
    config: UpdateCustomAgentConfig,
) -> Result<AgentWithStatus, String> {
    if config.display_name.trim().is_empty() {
        return Err("Agent display name cannot be empty".to_string());
    }
    if config.global_skills_dir.trim().is_empty() {
        return Err("Agent global skills directory cannot be empty".to_string());
    }

    let category = config.category.unwrap_or_else(|| "other".to_string());
    let global_skills_dir = path_to_string(&expand_home_path(config.global_skills_dir.trim()));

    let updated = db::update_custom_agent(
        pool,
        agent_id,
        config.display_name.trim(),
        &category,
        &global_skills_dir,
    )
    .await?;

    let central_root = db::get_agent_by_id(pool, "central")
        .await?
        .map(|agent| agent.global_skills_dir);
    Ok(agent_to_with_status(updated, central_root.as_deref()))
}

/// Remove an agent by ID.
pub async fn remove_custom_agent_impl(pool: &DbPool, agent_id: &str) -> Result<(), String> {
    db::delete_custom_agent(pool, agent_id).await
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

/// Tauri command: return all registered agents with live detection status.
#[tauri::command]
pub async fn get_agents(state: State<'_, AppState>) -> Result<Vec<AgentWithStatus>, String> {
    get_agents_impl(&state.db).await
}

/// Tauri command: refresh detection status for all agents and return them.
#[tauri::command]
pub async fn detect_agents(state: State<'_, AppState>) -> Result<Vec<AgentWithStatus>, String> {
    detect_agents_impl(&state.db).await
}

/// Tauri command: register a new user-defined agent.
#[tauri::command]
pub async fn add_custom_agent(
    state: State<'_, AppState>,
    config: CustomAgentConfig,
) -> Result<AgentWithStatus, String> {
    add_custom_agent_impl(&state.db, config).await
}

/// Tauri command: update an existing agent.
#[tauri::command]
pub async fn update_custom_agent(
    state: State<'_, AppState>,
    agent_id: String,
    config: UpdateCustomAgentConfig,
) -> Result<AgentWithStatus, String> {
    update_custom_agent_impl(&state.db, &agent_id, config).await
}

/// Tauri command: remove an agent by ID.
#[tauri::command]
pub async fn remove_custom_agent(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<(), String> {
    remove_custom_agent_impl(&state.db, &agent_id).await
}

/// Tauri command: enable or disable a software platform.
#[tauri::command]
pub async fn set_agent_enabled(
    state: State<'_, AppState>,
    agent_id: String,
    enabled: bool,
) -> Result<AgentWithStatus, String> {
    let updated = db::set_agent_enabled(&state.db, &agent_id, enabled).await?;
    let central_root = db::get_agent_by_id(&state.db, "central")
        .await?
        .map(|agent| agent.global_skills_dir);
    Ok(agent_to_with_status(updated, central_root.as_deref()))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use sqlx::SqlitePool;
    use std::fs;
    use tempfile::TempDir;

    async fn setup_test_db() -> DbPool {
        let pool = SqlitePool::connect(":memory:").await.unwrap();
        db::init_database(&pool).await.unwrap();
        pool
    }

    // ── is_agent_detected ─────────────────────────────────────────────────────

    #[test]
    fn test_is_detected_existing_dir() {
        let tmp = TempDir::new().unwrap();
        assert!(
            is_agent_detected(tmp.path().to_str().unwrap()),
            "existing directory should be detected"
        );
    }

    #[test]
    fn test_is_detected_existing_parent() {
        let tmp = TempDir::new().unwrap();
        let nonexistent_skills = tmp.path().join("skills");
        // The parent (`tmp`) exists even though `skills/` does not.
        assert!(
            is_agent_detected(nonexistent_skills.to_str().unwrap()),
            "should be detected when parent dir exists"
        );
    }

    #[test]
    fn test_is_detected_nonexistent_path() {
        assert!(
            !is_agent_detected("/nonexistent/path/that/does/not/exist/skills"),
            "should not be detected when parent does not exist"
        );
    }

    // ── get_agents_impl ───────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_get_agents_returns_all_builtin() {
        let pool = setup_test_db().await;
        let agents = get_agents_impl(&pool).await.unwrap();
        assert_eq!(
            agents.len(),
            db::builtin_agents().len(),
            "should return all built-in agents"
        );
    }

    #[tokio::test]
    async fn test_get_agents_detected_flag_reflects_fs() {
        let tmp = TempDir::new().unwrap();
        let pool = setup_test_db().await;

        // Point claude-code's skills dir at the existing temp directory.
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'claude-code'")
            .bind(tmp.path().to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        let agents = get_agents_impl(&pool).await.unwrap();
        let claude = agents.iter().find(|a| a.id == "claude-code").unwrap();
        assert!(
            claude.is_detected,
            "claude-code should be detected when its dir exists"
        );
    }

    #[tokio::test]
    async fn test_get_agents_not_detected_when_dir_missing() {
        let pool = setup_test_db().await;

        // Point claude-code at a path whose parent also doesn't exist.
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'claude-code'")
            .bind("/nonexistent/deep/path/skills")
            .execute(&pool)
            .await
            .unwrap();

        let agents = get_agents_impl(&pool).await.unwrap();
        let claude = agents.iter().find(|a| a.id == "claude-code").unwrap();
        assert!(
            !claude.is_detected,
            "claude-code should not be detected when dir and parent both missing"
        );
    }

    #[tokio::test]
    async fn test_get_agents_marks_shared_central_skills_dir() {
        let tmp = TempDir::new().unwrap();
        let central = tmp.path().join("central");
        fs::create_dir_all(&central).unwrap();
        let pool = setup_test_db().await;

        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'central'")
            .bind(central.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'cursor'")
            .bind(central.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        let agents = get_agents_impl(&pool).await.unwrap();
        let cursor = agents.iter().find(|agent| agent.id == "cursor").unwrap();
        let claude = agents
            .iter()
            .find(|agent| agent.id == "claude-code")
            .unwrap();
        let central_agent = agents.iter().find(|agent| agent.id == "central").unwrap();
        assert!(cursor.shares_central_skills);
        assert!(!claude.shares_central_skills);
        assert!(!central_agent.shares_central_skills);
    }

    #[tokio::test]
    async fn test_get_agents_shared_dir_matches_trailing_slash_and_windows_prefix() {
        let tmp = TempDir::new().unwrap();
        let central = tmp.path().join("central");
        fs::create_dir_all(&central).unwrap();
        let pool = setup_test_db().await;

        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'central'")
            .bind(central.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        let trailing = format!("{}/", central.to_str().unwrap().replace('\\', "/"));
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'cursor'")
            .bind(&trailing)
            .execute(&pool)
            .await
            .unwrap();

        let agents = get_agents_impl(&pool).await.unwrap();
        let cursor = agents.iter().find(|agent| agent.id == "cursor").unwrap();
        assert!(
            cursor.shares_central_skills,
            "trailing separators should still resolve to the same skills directory"
        );

        #[cfg(windows)]
        {
            let prefixed = format!(r"\\?\{}", central.to_str().unwrap());
            sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'claude-code'")
                .bind(&prefixed)
                .execute(&pool)
                .await
                .unwrap();
            let agents = get_agents_impl(&pool).await.unwrap();
            let claude = agents
                .iter()
                .find(|agent| agent.id == "claude-code")
                .unwrap();
            assert!(
                claude.shares_central_skills,
                "Windows verbatim prefixes should still resolve to the same skills directory"
            );
        }
    }

    #[tokio::test]
    async fn test_get_agents_nested_central_subdir_is_independent() {
        let tmp = TempDir::new().unwrap();
        let central = tmp.path().join("central");
        let nested = central.join(".agents").join("skills");
        fs::create_dir_all(&nested).unwrap();
        let pool = setup_test_db().await;

        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'central'")
            .bind(central.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'cursor'")
            .bind(nested.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        let agents = get_agents_impl(&pool).await.unwrap();
        let cursor = agents.iter().find(|agent| agent.id == "cursor").unwrap();
        assert!(
            !cursor.shares_central_skills,
            "a nested .agents/skills folder is a different entry unless it canonicalizes to central"
        );
    }

    #[tokio::test]
    async fn test_update_custom_agent_refreshes_shares_central_after_path_change() {
        let tmp = TempDir::new().unwrap();
        let central = tmp.path().join("central");
        fs::create_dir_all(&central).unwrap();
        let pool = setup_test_db().await;

        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'central'")
            .bind(central.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        let independent = tmp.path().join("cursor-skills");
        fs::create_dir_all(&independent).unwrap();
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'cursor'")
            .bind(independent.to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        let before = get_agents_impl(&pool).await.unwrap();
        assert!(
            !before
                .iter()
                .find(|agent| agent.id == "cursor")
                .unwrap()
                .shares_central_skills
        );

        let updated = update_custom_agent_impl(
            &pool,
            "cursor",
            UpdateCustomAgentConfig {
                display_name: "Cursor".to_string(),
                category: Some("coding".to_string()),
                global_skills_dir: central.to_str().unwrap().to_string(),
            },
        )
        .await
        .unwrap();
        assert!(updated.shares_central_skills);
    }

    // ── detect_agents_impl ────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_detect_agents_updates_db() {
        let tmp = TempDir::new().unwrap();
        let pool = setup_test_db().await;

        // Point claude-code at a real directory.
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'claude-code'")
            .bind(tmp.path().to_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();

        // Initially not detected in DB.
        let before = db::get_agent_by_id(&pool, "claude-code")
            .await
            .unwrap()
            .unwrap();
        assert!(!before.is_detected);

        detect_agents_impl(&pool).await.unwrap();

        let after = db::get_agent_by_id(&pool, "claude-code")
            .await
            .unwrap()
            .unwrap();
        assert!(
            after.is_detected,
            "DB should reflect detected status after detect_agents"
        );
    }

    #[tokio::test]
    async fn test_detect_agents_returns_all_agents() {
        let pool = setup_test_db().await;
        let agents = detect_agents_impl(&pool).await.unwrap();
        assert_eq!(agents.len(), db::builtin_agents().len());
    }

    // ── add_custom_agent_impl ─────────────────────────────────────────────────

    #[tokio::test]
    async fn test_add_custom_agent_appears_in_list() {
        let pool = setup_test_db().await;

        let config = CustomAgentConfig {
            id: Some("my-custom".to_string()),
            display_name: "My Custom Agent".to_string(),
            category: Some("coding".to_string()),
            global_skills_dir: "/tmp/my-custom/skills".to_string(),
        };

        add_custom_agent_impl(&pool, config).await.unwrap();

        let agents = get_agents_impl(&pool).await.unwrap();
        assert_eq!(
            agents.len(),
            db::builtin_agents().len() + 1,
            "should have built-ins + 1 custom"
        );

        let custom = agents.iter().find(|a| a.id == "my-custom").unwrap();
        assert_eq!(custom.display_name, "My Custom Agent");
        assert!(!custom.is_builtin);
    }

    #[tokio::test]
    async fn test_add_custom_agent_auto_generates_id() {
        let pool = setup_test_db().await;

        let config = CustomAgentConfig {
            id: None,
            display_name: "Auto Named".to_string(),
            category: None,
            global_skills_dir: "/tmp/auto/skills".to_string(),
        };

        let agent = add_custom_agent_impl(&pool, config).await.unwrap();
        assert!(
            !agent.id.is_empty(),
            "auto-generated ID should not be empty"
        );
        assert_eq!(agent.id, "auto-named");
    }

    #[tokio::test]
    async fn test_add_custom_agent_with_detected_dir() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        fs::create_dir_all(&skills_dir).unwrap();

        let pool = setup_test_db().await;

        let config = CustomAgentConfig {
            id: Some("detected-agent".to_string()),
            display_name: "Detected Agent".to_string(),
            category: None,
            global_skills_dir: skills_dir.to_string_lossy().into_owned(),
        };

        let agent = add_custom_agent_impl(&pool, config).await.unwrap();
        assert!(
            agent.is_detected,
            "agent should be detected when skills dir exists"
        );
    }

    #[tokio::test]
    async fn test_add_custom_agent_duplicate_id_gets_unique_suffix() {
        let pool = setup_test_db().await;

        let config = CustomAgentConfig {
            id: Some("unique-id".to_string()),
            display_name: "First".to_string(),
            category: None,
            global_skills_dir: "/tmp/first/skills".to_string(),
        };
        add_custom_agent_impl(&pool, config).await.unwrap();

        let config2 = CustomAgentConfig {
            id: Some("unique-id".to_string()),
            display_name: "Second".to_string(),
            category: None,
            global_skills_dir: "/tmp/second/skills".to_string(),
        };
        let second = add_custom_agent_impl(&pool, config2).await.unwrap();
        assert!(second.id.starts_with("unique-id-"));
        assert_ne!(second.id, "unique-id");
    }

    #[tokio::test]
    async fn test_add_custom_agent_default_category() {
        let pool = setup_test_db().await;

        let config = CustomAgentConfig {
            id: Some("no-category".to_string()),
            display_name: "No Category".to_string(),
            category: None, // omitted
            global_skills_dir: "/tmp/nc/skills".to_string(),
        };

        let agent = add_custom_agent_impl(&pool, config).await.unwrap();
        assert_eq!(
            agent.category, "other",
            "default category should be 'other'"
        );
    }

    #[tokio::test]
    async fn test_add_custom_agent_expands_tilde_path() {
        let pool = setup_test_db().await;

        let config = CustomAgentConfig {
            id: Some("tilde-agent".to_string()),
            display_name: "Tilde Agent".to_string(),
            category: Some("coding".to_string()),
            global_skills_dir: "~/.tilde-agent/skills".to_string(),
        };

        let agent = add_custom_agent_impl(&pool, config).await.unwrap();
        assert!(
            !agent.global_skills_dir.starts_with('~'),
            "tilde paths must be expanded before persistence"
        );
        assert!(agent.global_skills_dir.contains(".tilde-agent"));
    }

    // ── update_custom_agent_impl ──────────────────────────────────────────────

    async fn add_test_custom_agent(pool: &DbPool, id: &str) {
        let config = CustomAgentConfig {
            id: Some(id.to_string()),
            display_name: format!("Agent {}", id),
            category: Some("other".to_string()),
            global_skills_dir: format!("/tmp/{}/skills", id),
        };
        add_custom_agent_impl(pool, config).await.unwrap();
    }

    #[tokio::test]
    async fn test_update_custom_agent_changes_fields() {
        let pool = setup_test_db().await;
        add_test_custom_agent(&pool, "update-me").await;

        let config = UpdateCustomAgentConfig {
            display_name: "Updated Name".to_string(),
            category: Some("coding".to_string()),
            global_skills_dir: "/tmp/updated/skills".to_string(),
        };

        let updated = update_custom_agent_impl(&pool, "update-me", config)
            .await
            .unwrap();
        assert_eq!(updated.display_name, "Updated Name");
        assert_eq!(updated.category, "coding");
        assert_eq!(updated.global_skills_dir, "/tmp/updated/skills");
        assert!(!updated.is_builtin);
    }

    #[tokio::test]
    async fn test_update_custom_agent_default_category() {
        let pool = setup_test_db().await;
        add_test_custom_agent(&pool, "cat-default").await;

        let config = UpdateCustomAgentConfig {
            display_name: "Cat Default".to_string(),
            category: None,
            global_skills_dir: "/tmp/cat-default/skills".to_string(),
        };

        let updated = update_custom_agent_impl(&pool, "cat-default", config)
            .await
            .unwrap();
        assert_eq!(
            updated.category, "other",
            "default category should be 'other'"
        );
    }

    #[tokio::test]
    async fn test_update_custom_agent_expands_tilde_path() {
        let pool = setup_test_db().await;
        add_test_custom_agent(&pool, "tilde-update").await;

        let config = UpdateCustomAgentConfig {
            display_name: "Tilde Update".to_string(),
            category: Some("coding".to_string()),
            global_skills_dir: "~/.tilde-update/skills".to_string(),
        };

        let updated = update_custom_agent_impl(&pool, "tilde-update", config)
            .await
            .unwrap();
        assert!(
            !updated.global_skills_dir.starts_with('~'),
            "tilde paths must be expanded before persistence"
        );
        assert!(updated.global_skills_dir.contains(".tilde-update"));
    }

    #[tokio::test]
    async fn test_update_custom_agent_not_found_fails() {
        let pool = setup_test_db().await;

        let config = UpdateCustomAgentConfig {
            display_name: "Ghost".to_string(),
            category: None,
            global_skills_dir: "/tmp/ghost/skills".to_string(),
        };

        let result = update_custom_agent_impl(&pool, "nonexistent-agent", config).await;
        assert!(result.is_err(), "Updating a nonexistent agent should fail");
    }

    #[tokio::test]
    async fn test_update_builtin_agent_success() {
        let pool = setup_test_db().await;

        let config = UpdateCustomAgentConfig {
            display_name: "Edited Claude".to_string(),
            category: Some("coding".to_string()),
            global_skills_dir: "/tmp/edited-claude/skills".to_string(),
        };

        let updated = update_custom_agent_impl(&pool, "claude-code", config)
            .await
            .unwrap();
        assert_eq!(updated.display_name, "Edited Claude");
        assert_eq!(updated.global_skills_dir, "/tmp/edited-claude/skills");
        assert!(
            updated.is_builtin,
            "Editing a built-in platform should preserve the built-in marker"
        );
    }

    #[tokio::test]
    async fn test_update_custom_agent_empty_display_name_fails() {
        let pool = setup_test_db().await;
        add_test_custom_agent(&pool, "empty-name").await;

        let config = UpdateCustomAgentConfig {
            display_name: "   ".to_string(),
            category: None,
            global_skills_dir: "/tmp/empty-name/skills".to_string(),
        };

        let result = update_custom_agent_impl(&pool, "empty-name", config).await;
        assert!(result.is_err(), "Empty display name should fail validation");
    }

    // ── remove_custom_agent_impl ──────────────────────────────────────────────

    #[tokio::test]
    async fn test_remove_custom_agent_success() {
        let pool = setup_test_db().await;
        add_test_custom_agent(&pool, "removable").await;

        remove_custom_agent_impl(&pool, "removable").await.unwrap();

        let agents = get_agents_impl(&pool).await.unwrap();
        assert!(
            agents.iter().all(|a| a.id != "removable"),
            "Removed agent should no longer appear in agent list"
        );
    }

    #[tokio::test]
    async fn test_remove_custom_agent_not_found_fails() {
        let pool = setup_test_db().await;
        let result = remove_custom_agent_impl(&pool, "ghost-agent").await;
        assert!(result.is_err(), "Removing a nonexistent agent should fail");
    }

    #[tokio::test]
    async fn test_remove_builtin_agent_success() {
        let pool = setup_test_db().await;
        remove_custom_agent_impl(&pool, "cursor").await.unwrap();

        let agents = get_agents_impl(&pool).await.unwrap();
        assert!(
            agents.iter().all(|a| a.id != "cursor"),
            "Removed built-in agent should no longer appear in agent list"
        );
    }
}
