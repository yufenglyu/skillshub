export function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isWindowsPath(path: string): boolean {
  const normalized = normalizePathSeparators(path);
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("//") || path.includes("\\");
}

export function formatPathForDisplay(path: string): string {
  if (!path) {
    return path;
  }
  const withoutVerbatimPrefix = path
    .replace(/^\\\\\?\\UNC\\/i, "\\\\")
    .replace(/^\\\\\?\\/i, "")
    .replace(/^\/\/\?\/UNC\//i, "//")
    .replace(/^\/\/\?\//i, "");
  return isWindowsPath(withoutVerbatimPrefix)
    ? withoutVerbatimPrefix.replace(/\//g, "\\")
    : withoutVerbatimPrefix;
}

export function normalizePathForInputDisplay(path: string): string {
  return formatPathForDisplay(path).replace(/\\\\+/g, "\\");
}

export function compactHomePath(path: string): string {
  const normalized = normalizePathSeparators(path);
  if (normalized === "~") {
    return "~";
  }
  if (normalized.startsWith("~/")) {
    return normalized;
  }

  const homePatterns = [
    /^\/Users\/[^/]+\/?(.*)$/,
    /^\/home\/[^/]+\/?(.*)$/,
    /^[A-Za-z]:\/Users\/[^/]+\/?(.*)$/,
  ];

  for (const pattern of homePatterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    const rest = match[1];
    return rest ? `~/${rest}` : "~";
  }

  return normalized;
}

export function deriveHomeDir(path: string): string | undefined {
  const normalized = normalizePathSeparators(path).replace(/\/+$/, "");
  if (normalized === "~" || normalized.startsWith("~/")) {
    return "~";
  }

  const homePatterns = [
    /^((?:\/Users|\/home)\/[^/]+)(?:\/.*)?$/,
    /^([A-Za-z]:\/Users\/[^/]+)(?:\/.*)?$/,
    /^(\/\/[^/]+\/[^/]+)(?:\/.*)?$/,
  ];

  for (const pattern of homePatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return formatPathForDisplay(match[1]);
    }
  }

  return undefined;
}

export function joinPathForDisplay(basePath: string, relativePath: string): string {
  const normalizedBase = normalizePathSeparators(basePath).replace(/\/+$/, "");
  const normalizedRelative = normalizePathSeparators(relativePath).replace(/^\/+/, "");

  if (!normalizedBase) {
    return formatPathForDisplay(normalizedRelative);
  }

  return formatPathForDisplay(`${normalizedBase}/${normalizedRelative}`);
}

export function getPathBasename(path: string): string | undefined {
  const normalized = normalizePathSeparators(path).replace(/\/+$/, "");
  if (!normalized || normalized === "~") {
    return undefined;
  }

  const parts = normalized.split("/");
  return parts[parts.length - 1] || undefined;
}

export function describeSkillsPattern(path: string): string {
  const compact = compactHomePath(path);
  return compact.startsWith("~/") ? compact.slice(2) : compact;
}

export function normalizePathForComparison(path: string): string {
  return compactHomePath(normalizePathSeparators(path))
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function pathsShareSkillsRoot(
  left?: string | null,
  right?: string | null
): boolean {
  if (!left || !right) return false;
  return normalizePathForComparison(left) === normalizePathForComparison(right);
}
