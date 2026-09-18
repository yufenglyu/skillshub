import { describe, expect, it } from "vitest";
import { skillSearchUrl, repositoryLocationUrl } from "@/lib/skillNavigation";

describe("skill navigation", () => {
  it("preserves GitHub source links and repository casing", () => {
    expect(skillSearchUrl({ name: "Test", source_url: "https://github.com/Owner/Repo/tree/main/skills/test" })).toBe("https://github.com/Owner/Repo/tree/main/skills/test");
    expect(skillSearchUrl({ name: "Test", source_type: "github", source_repo: "Owner/Repo" })).toBe("https://github.com/Owner/Repo");
  });
  it("recognizes repository source labels and metadata without a source type", () => {
    expect(skillSearchUrl({ name: "Test", source: "github:Owner/Repo" })).toBe("https://github.com/Owner/Repo");
    expect(skillSearchUrl({ name: "Test", source_repo: "Owner/Repo" })).toBe("https://github.com/Owner/Repo");
  });
  it("searches non-GitHub skills and rejects lookalike domains", () => {
    expect(skillSearchUrl({ name: "中文 & skill", source_url: "https://github.com.example.org/test" })).toBe("https://www.google.com/search?q=" + encodeURIComponent("中文 & skill"));
    expect(skillSearchUrl({ name: "Local", source_type: "local", source_repo: "Owner/Repo" })).toBe("https://www.google.com/search?q=Local");
  });
  it("carries identity and the destination view without losing special characters", () => {
    const url = new URL(repositoryLocationUrl({ id: "a/b#c", name: "test", source_repo: "Owner/Repo", source_path: "技能/test" }, true), "http://localhost");
    expect(url.searchParams.get("locate")).toBe("a/b#c");
    expect(url.searchParams.get("view")).toBe("folders");
    expect(url.searchParams.get("path")).toBe("技能/test");
    expect(repositoryLocationUrl({ id: "test", name: "test" }, false)).toContain("view=all");
  });
});
