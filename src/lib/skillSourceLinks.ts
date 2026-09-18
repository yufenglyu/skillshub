type SourceMetadata = { source?: string | null; source_repo?: string | null; source_path?: string | null; source_url?: string | null };

function webUrl(value?: string | null): URL | null {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url : null;
  } catch { return null; }
}

export function skillSourceLinks(skill: SourceMetadata) {
  const sourceUrl = webUrl(skill.source_url);
  const repo = skill.source_repo ?? skill.source?.match(/^github:(.+)$/i)?.[1]?.trim();
  let repository = webUrl(repo)?.href;
  if (!repository && /^[^/\\\s]+\/[^/\\\s]+$/.test(repo ?? "")) {
    repository = `https://github.com/${repo!.split("/").map(encodeURIComponent).join("/")}`;
  }
  if (!repository && sourceUrl && ["github.com", "raw.githubusercontent.com"].includes(sourceUrl.hostname)) {
    repository = `https://github.com/${sourceUrl.pathname.split("/").filter(Boolean).slice(0, 2).join("/")}`;
  }
  let sourcePath = webUrl(skill.source_path)?.href;
  if (!sourcePath && sourceUrl) {
    if (sourceUrl.hostname === "raw.githubusercontent.com") {
      const segments = sourceUrl.pathname.split("/").filter(Boolean);
      if (segments.length >= 4) sourcePath = `https://github.com/${segments.slice(0, 2).join("/")}/blob/${segments.slice(2).join("/")}`;
    } else if (sourceUrl.hostname !== "github.com" || /\/(blob|tree)\//.test(sourceUrl.pathname)) {
      sourcePath = sourceUrl.href;
    }
  }
  if (!sourcePath && repository && new URL(repository).hostname === "github.com" && skill.source_path) {
    const path = skill.source_path.replace(/\\/g, "/").split("/").filter(Boolean).map(encodeURIComponent).join("/");
    sourcePath = `${repository.replace(/\/$/, "")}/blob/HEAD/${path}`;
  }
  const isLocalPath = (value?: string | null) => !!value && /^(?:[a-z]:[\\/]|\\\\|\/|~[\\/])/i.test(value);
  const repositoryDirectory = isLocalPath(repo) ? repo! : undefined;
  const sourceDirectory = isLocalPath(skill.source_path)
    ? skill.source_path!.replace(/[\\/][^\\/]+\.[^\\/]+$/, "") : undefined;
  return { repository, sourcePath, repositoryDirectory, sourceDirectory };
}
