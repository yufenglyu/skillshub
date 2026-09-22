import { invoke } from "@/lib/tauri";
export interface LocalImportPreviewItem {
  skillId: string;
  name: string;
  conflict: boolean;
}
export async function previewLocalImport(sourceDir: string) {
  return invoke<LocalImportPreviewItem[]>("preview_local_resource_skills", {
    sourceDir,
  });
}
