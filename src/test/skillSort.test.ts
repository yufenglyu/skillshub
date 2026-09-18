import { describe, expect, it } from "vitest";
import { sortFoldersBySkillBrowserOrder } from "@/lib/skillSort";

function folder(name: string, skillCount: number, stars?: number | null) {
  return { name, skillCount, relativePath: name, path: name, linkedAgentIds: [], readOnlyAgentIds: [], linkedAgentCount: 0, readOnlyAgentCount: 0, skills: [{ name, github_stars: stars }] };
}

describe("folder numeric sorting", () => {
  const folders = [folder("ten", 10, 100), folder("two", 2, 20), folder("unknown", 1), folder("zero", 0, 0)];
  it("sorts counts numerically in both directions without mutating the source", () => {
    expect(sortFoldersBySkillBrowserOrder(folders, "skillCount", "asc").map(f => f.skillCount)).toEqual([0, 1, 2, 10]);
    expect(sortFoldersBySkillBrowserOrder(folders, "skillCount", "desc").map(f => f.skillCount)).toEqual([10, 2, 1, 0]);
    expect(folders[0].name).toBe("ten");
  });
  it("keeps missing stars last and treats zero as a known value", () => {
    expect(sortFoldersBySkillBrowserOrder(folders, "githubStars", "asc").map(f => f.name)).toEqual(["zero", "two", "ten", "unknown"]);
    expect(sortFoldersBySkillBrowserOrder(folders, "githubStars", "desc").map(f => f.name)).toEqual(["ten", "two", "zero", "unknown"]);
  });
});
