import * as tauri from "@/lib/tauri";

export async function openInFileManager(path: string): Promise<void> {
  const trimmed = path.trim();
  if (!trimmed) {
    return;
  }
  await tauri.invoke("open_in_file_manager", { path: trimmed });
}
