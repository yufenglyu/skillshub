pub mod commands;
pub mod db;
pub mod path_utils;

use db::DbPool;
use std::fs;
use std::path::Path;
use tauri::Manager;

/// Application state shared across Tauri commands.
pub struct AppState {
    pub db: DbPool,
}

fn migrate_legacy_app_data_if_needed(new_dir: &Path, legacy_dir: &Path) -> Result<(), String> {
    let new_db = new_dir.join("db.sqlite");
    let legacy_db = legacy_dir.join("db.sqlite");
    if new_db.exists() || !legacy_db.exists() {
        return Ok(());
    }

    fs::create_dir_all(new_dir).map_err(|e| {
        format!(
            "Failed to create ~/.skillshub directory for legacy data migration: {}",
            e
        )
    })?;

    for filename in ["db.sqlite", "db.sqlite-wal", "db.sqlite-shm"] {
        let source = legacy_dir.join(filename);
        if source.exists() {
            fs::copy(&source, new_dir.join(filename)).map_err(|e| {
                format!(
                    "Failed to migrate legacy app data file '{}': {}",
                    filename, e
                )
            })?;
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let db_dir = path_utils::app_data_dir();
            let legacy_db_dir = path_utils::legacy_app_data_dir();
            migrate_legacy_app_data_if_needed(&db_dir, &legacy_db_dir)
                .expect("Failed to migrate legacy ~/.skillsmanage data");
            fs::create_dir_all(&db_dir).expect("Failed to create ~/.skillshub directory");
            let db_path = path_utils::path_to_string(&db_dir.join("db.sqlite"));

            // Create pool and initialize schema
            let pool = tauri::async_runtime::block_on(async {
                db::create_pool(&db_path)
                    .await
                    .expect("Failed to open SQLite database")
            });
            tauri::async_runtime::block_on(async {
                db::init_database(&pool)
                    .await
                    .expect("Failed to initialize database schema")
            });

            app.manage(AppState { db: pool });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Scanner
            commands::scanner::scan_all_skills,
            // Agents
            commands::agents::get_agents,
            commands::agents::detect_agents,
            commands::agents::add_custom_agent,
            commands::agents::update_custom_agent,
            commands::agents::remove_custom_agent,
            // Linker
            commands::linker::install_skill_to_agent,
            commands::linker::add_resource_skill_to_central,
            commands::linker::uninstall_skill_from_agent,
            commands::linker::batch_install_to_agents,
            // Skills
            commands::skills::get_skills_by_agent,
            commands::skills::get_central_skills,
            commands::skills::get_resource_library_skills,
            commands::skills::update_skill_metadata,
            commands::skills::get_central_skill_bundles,
            commands::skills::get_central_skill_bundle_detail,
            commands::skills::preview_delete_central_skill_bundle,
            commands::skills::delete_central_skill_bundle,
            commands::skills::delete_central_skill,
            commands::skills::delete_resource_skill,
            commands::skills::get_skill_detail,
            commands::skills::read_skill_content,
            commands::skills::read_file_by_path,
            commands::skills::list_skill_directory,
            commands::skills::open_in_file_manager,
            // Backup
            commands::backup::export_app_backup,
            commands::backup::import_app_backup,
            commands::backup::list_webdav_backups,
            commands::backup::upload_webdav_backup,
            commands::backup::download_webdav_backup,
            // Collections
            commands::collections::create_collection,
            commands::collections::get_collections,
            commands::collections::get_collection_detail,
            commands::collections::add_skill_to_collection,
            commands::collections::remove_skill_from_collection,
            commands::collections::delete_collection,
            commands::collections::update_collection,
            commands::collections::batch_install_collection,
            commands::collections::export_collection,
            commands::collections::import_collection,
            // Settings
            commands::settings::get_scan_directories,
            commands::settings::add_scan_directory,
            commands::settings::remove_scan_directory,
            commands::settings::set_scan_directory_active,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::update_central_skills_dir,
            commands::settings::get_skill_resource_library_dir,
            commands::settings::update_skill_resource_library_dir,
            // Discover
            commands::discover::discover_scan_roots,
            commands::discover::get_scan_roots,
            commands::discover::get_obsidian_vaults,
            commands::discover::get_obsidian_vault_skills,
            commands::discover::set_scan_root_enabled,
            commands::discover::start_project_scan,
            commands::discover::stop_project_scan,
            commands::discover::get_discovered_skills,
            commands::discover::import_discovered_skill_to_central,
            commands::discover::import_discovered_skill_to_platform,
            commands::discover::clear_discovered_skills,
            commands::github_import::preview_github_repo_import,
            commands::github_import::import_github_repo_skills,
            commands::github_import::fetch_github_skill_markdown,
            // Marketplace
            commands::marketplace::list_registries,
            commands::marketplace::add_registry,
            commands::marketplace::remove_registry,
            commands::marketplace::sync_registry,
            commands::marketplace::sync_registry_with_options,
            commands::marketplace::search_marketplace_skills,
            commands::marketplace::install_marketplace_skill,
            commands::marketplace::install_remote_skill_from_url,
            commands::marketplace::update_source_backed_central_skills,
            commands::marketplace::update_source_backed_central_skill,
            commands::marketplace::explain_skill,
            commands::marketplace::get_skill_explanation,
            commands::marketplace::explain_skill_stream,
            commands::marketplace::refresh_skill_explanation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::migrate_legacy_app_data_if_needed;
    use std::fs;

    #[test]
    fn migrate_legacy_app_data_copies_existing_database_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let legacy_dir = dir.path().join(".skillsmanage");
        let new_dir = dir.path().join(".skillshub");
        fs::create_dir_all(&legacy_dir).expect("legacy dir");
        fs::write(legacy_dir.join("db.sqlite"), "main-db").expect("legacy db");
        fs::write(legacy_dir.join("db.sqlite-wal"), "wal").expect("legacy wal");
        fs::write(legacy_dir.join("db.sqlite-shm"), "shm").expect("legacy shm");

        migrate_legacy_app_data_if_needed(&new_dir, &legacy_dir).expect("migration");

        assert_eq!(
            fs::read_to_string(new_dir.join("db.sqlite")).unwrap(),
            "main-db"
        );
        assert_eq!(
            fs::read_to_string(new_dir.join("db.sqlite-wal")).unwrap(),
            "wal"
        );
        assert_eq!(
            fs::read_to_string(new_dir.join("db.sqlite-shm")).unwrap(),
            "shm"
        );
    }

    #[test]
    fn migrate_legacy_app_data_does_not_overwrite_new_database() {
        let dir = tempfile::tempdir().expect("tempdir");
        let legacy_dir = dir.path().join(".skillsmanage");
        let new_dir = dir.path().join(".skillshub");
        fs::create_dir_all(&legacy_dir).expect("legacy dir");
        fs::create_dir_all(&new_dir).expect("new dir");
        fs::write(legacy_dir.join("db.sqlite"), "legacy-db").expect("legacy db");
        fs::write(new_dir.join("db.sqlite"), "new-db").expect("new db");

        migrate_legacy_app_data_if_needed(&new_dir, &legacy_dir).expect("migration");

        assert_eq!(
            fs::read_to_string(new_dir.join("db.sqlite")).unwrap(),
            "new-db"
        );
    }
}
