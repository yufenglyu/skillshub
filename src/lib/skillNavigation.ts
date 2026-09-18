import { open } from "@tauri-apps/plugin-shell";
import { isTauriRuntime } from "@/lib/tauri";
type SkillIdentity = { source?: string | null; id: string; name: string; source_type?: string | null; source_repo?: string | null; source_path?: string | null; source_url?: string | null };
export function skillSearchUrl(skill: Pick<SkillIdentity, "name" | "source" | "source_type" | "source_repo" | "source_url">): string {
  try {
    const url = new URL(skill.source_url ?? "");
    if (url.hostname.toLowerCase() === "github.com" && url.protocol === "https:") return url.href;
  } catch { /* Metadata can exist without a URL. */ }
  const sourceRepo = skill.source?.match(/^github:\s*(.+)$/i)?.[1]?.trim();
  const repo = (skill.source_repo || sourceRepo)?.trim().replace(/\/+$/, "");
  const githubSource = !!sourceRepo || !skill.source_type || ["github", "skills-cli"].includes(skill.source_type.toLowerCase());
  if (githubSource && /^[^/\s]+\/[^/\s]+$/.test(repo ?? "")) {
    return `https://github.com/${repo!.split("/").map(encodeURIComponent).join("/")}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(skill.name)}`;
}
export async function openSkillSearch(skill: Parameters<typeof skillSearchUrl>[0]) {
  const url = skillSearchUrl(skill);
  if (isTauriRuntime()) await open(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
export function repositoryLocationUrl(skill: SkillIdentity, folder: boolean): string {
  const params = new URLSearchParams({ locate: skill.id, view: folder ? "folders" : "all" });
  if (skill.source_repo && skill.source_path != null) {
    params.set("repo", skill.source_repo);
    params.set("path", skill.source_path);
  }
  return `/resources?${params}`;
}
