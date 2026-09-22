import { useState } from "react";
export type SearchScope = "folder" | "name" | "description" | "notes";
export const allSearchScopes: SearchScope[] = [
  "folder",
  "name",
  "description",
  "notes",
];
export function useSearchScopes() {
  return useState<SearchScope[]>(allSearchScopes);
}
export function matchesSearch(
  skill: { name: string; description?: string | null; notes?: string | null },
  query: string,
  scopes: SearchScope[],
  folderName = "",
  folderNotes = "",
) {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    scopes.some((scope) =>
      (scope === "folder"
        ? folderName
        : scope === "notes"
          ? `${skill.notes ?? ""}\n${folderNotes}`
          : (skill[scope] ?? "")
      )
        .toLowerCase()
        .includes(q),
    )
  );
}

export function matchesTags(tags: string[] | undefined, selected: string[]) {
  return selected.every((key) =>
    tags?.some((tag) => tag.toLowerCase() === key),
  );
}
