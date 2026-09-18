//! Application preferences live beside db.sqlite, never in its business tables.
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};

use crate::db::{DbPool, ScanDirectory};

static CONFIG_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_platforms")]
    pub platforms: Vec<crate::platforms::PlatformDefinition>,
    #[serde(default)]
    pub settings: BTreeMap<String, String>,
    #[serde(default)]
    pub scan_directories: Vec<ScanDirectory>,
    #[serde(default)]
    pub next_scan_directory_id: i64,
    #[serde(flatten)]
    extra: BTreeMap<String, serde_json::Value>,
}

fn default_platforms() -> Vec<crate::platforms::PlatformDefinition> {
    crate::platforms::default_platform_definitions()
        .expect("Bundled platform defaults must be valid")
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            platforms: default_platforms(),
            settings: BTreeMap::new(),
            scan_directories: Vec::new(),
            next_scan_directory_id: 1,
            extra: BTreeMap::new(),
        }
    }
}

pub fn config_path(pool: &DbPool) -> Result<PathBuf, String> {
    let options = pool.connect_options();
    let filename = options.get_filename();
    if filename == Path::new(":memory:")
        || filename
            .to_string_lossy()
            .starts_with("file:sqlx-in-memory")
    {
        #[cfg(test)]
        {
            use std::sync::{Arc, OnceLock, Weak};
            type TestEntry = (Weak<sqlx::sqlite::SqliteConnectOptions>, tempfile::TempDir);
            static DIRS: OnceLock<Mutex<Vec<TestEntry>>> = OnceLock::new();
            let mut dirs = DIRS.get_or_init(|| Mutex::new(Vec::new())).lock().unwrap();
            dirs.retain(|(options, _)| options.strong_count() > 0);
            if let Some((_, dir)) = dirs
                .iter()
                .find(|(stored, _)| stored.ptr_eq(&Arc::downgrade(&options)))
            {
                return Ok(dir.path().join("config.json"));
            }
            let dir = tempfile::tempdir().map_err(|_| "Cannot create test config directory")?;
            let path = dir.path().join("config.json");
            dirs.push((Arc::downgrade(&options), dir));
            return Ok(path);
        }
        #[cfg(not(test))]
        return Err("Application config requires a file-backed database".into());
    }
    Ok(filename
        .parent()
        .unwrap_or(Path::new("."))
        .join("config.json"))
}

fn read(path: &Path) -> Result<AppConfig, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "Invalid config.json; existing configuration was left unchanged".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AppConfig::default()),
        Err(_) => Err("Cannot read config.json".into()),
    }
}

fn write(path: &Path, config: &AppConfig) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(config).map_err(|_| "Cannot serialize config.json")?;
    let temp = path.with_file_name(format!(".config-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
        return Err("Cannot save config.json; previous configuration was left unchanged".into());
    }
    Ok(())
}

pub fn load(pool: &DbPool) -> Result<AppConfig, String> {
    load_path(&config_path(pool)?)
}

pub fn load_path(path: &Path) -> Result<AppConfig, String> {
    let _guard = CONFIG_LOCK
        .lock()
        .map_err(|_| "Configuration lock failed")?;
    read(path)
}

pub fn update<T>(
    pool: &DbPool,
    change: impl FnOnce(&mut AppConfig) -> Result<T, String>,
) -> Result<T, String> {
    update_path(&config_path(pool)?, change)
}

pub fn update_path<T>(
    path: &Path,
    change: impl FnOnce(&mut AppConfig) -> Result<T, String>,
) -> Result<T, String> {
    let _guard = CONFIG_LOCK
        .lock()
        .map_err(|_| "Configuration lock failed")?;
    let mut config = read(path)?;
    let result = change(&mut config)?;
    write(path, &config)?;
    Ok(result)
}

/// Start with the clean file format; legacy database configuration is not imported.
pub fn initialize(pool: &DbPool) -> Result<(), String> {
    update(pool, |_| Ok(()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[tokio::test]
    async fn configuration_survives_reopen_and_is_absent_from_database() {
        let dir = tempfile::tempdir().unwrap();
        let database = dir.path().join("db.sqlite");
        let pool = db::create_pool(database.to_str().unwrap()).await.unwrap();
        db::init_database(&pool).await.unwrap();
        db::set_setting(&pool, "language", "en").await.unwrap();
        let project = db::add_scan_directory(&pool, "/example/project", Some("Example"))
            .await
            .unwrap();
        db::toggle_scan_directory(&pool, &project.path, false)
            .await
            .unwrap();
        pool.close().await;
        let pool = db::create_pool(database.to_str().unwrap()).await.unwrap();
        db::init_database(&pool).await.unwrap();
        assert_eq!(
            db::get_setting(&pool, "language").await.unwrap().as_deref(),
            Some("en")
        );
        let restored = db::get_scan_directory_by_id(&pool, project.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(restored.path, project.path);
        assert!(!restored.is_active);
        let tables: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('settings', 'scan_directories')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(tables, 0);
        assert!(dir.path().join("config.json").is_file());
    }

    #[tokio::test]
    async fn legacy_database_configuration_is_not_imported() {
        let dir = tempfile::tempdir().unwrap();
        let pool = db::create_pool(dir.path().join("db.sqlite").to_str().unwrap())
            .await
            .unwrap();
        sqlx::query("CREATE TABLE settings (key TEXT, value TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO settings VALUES ('language', 'legacy')")
            .execute(&pool)
            .await
            .unwrap();
        db::init_database(&pool).await.unwrap();
        assert_eq!(db::get_setting(&pool, "language").await.unwrap(), None);
    }

    #[tokio::test]
    async fn malformed_file_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let pool = db::create_pool(dir.path().join("db.sqlite").to_str().unwrap())
            .await
            .unwrap();
        let path = config_path(&pool).unwrap();
        fs::write(&path, "{invalid-json").unwrap();
        assert!(db::init_database(&pool).await.is_err());
        assert!(db::set_setting(&pool, "language", "en").await.is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "{invalid-json");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn parallel_writes_preserve_all_settings_and_unknown_fields() {
        let dir = tempfile::tempdir().unwrap();
        let pool = db::create_pool(dir.path().join("db.sqlite").to_str().unwrap())
            .await
            .unwrap();
        fs::write(config_path(&pool).unwrap(), r#"{"future_option":true}"#).unwrap();
        let mut tasks = Vec::new();
        for index in 0..20 {
            let pool = pool.clone();
            tasks.push(tokio::spawn(async move {
                db::set_setting(&pool, &format!("option-{index}"), "example")
                    .await
                    .unwrap();
            }));
        }
        for task in tasks {
            task.await.unwrap();
        }
        let config = load(&pool).unwrap();
        assert_eq!(config.settings.len(), 20);
        assert_eq!(config.extra["future_option"], true);
    }

    #[tokio::test]
    async fn rejected_change_preserves_file_and_removed_project_ids_are_not_reused() {
        let dir = tempfile::tempdir().unwrap();
        let pool = db::create_pool(dir.path().join("db.sqlite").to_str().unwrap())
            .await
            .unwrap();
        db::init_database(&pool).await.unwrap();
        let first = db::add_scan_directory(&pool, "/example/one", None)
            .await
            .unwrap();
        db::remove_scan_directory(&pool, &first.path).await.unwrap();
        let second = db::add_scan_directory(&pool, "/example/two", None)
            .await
            .unwrap();
        assert!(second.id > first.id);
        let before = fs::read(config_path(&pool).unwrap()).unwrap();
        assert!(update::<()>(&pool, |config| {
            config.settings.clear();
            Err("rejected".into())
        })
        .is_err());
        assert_eq!(fs::read(config_path(&pool).unwrap()).unwrap(), before);
    }
}
