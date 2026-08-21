use std::{env, path::PathBuf, process};

fn main() {
    let dest = env::args().nth(1).unwrap_or_else(|| {
        eprintln!("usage: prepare-config-dir <config-dir>");
        process::exit(2);
    });
    let dest = PathBuf::from(dest);
    if let Err(error) =
        tauri::async_runtime::block_on(skills_manage_lib::db::prepare_config_dir(&dest))
    {
        eprintln!(
            "Failed to prepare config directory '{}': {error}",
            dest.display()
        );
        process::exit(1);
    }
}
