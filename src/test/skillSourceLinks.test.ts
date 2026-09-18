import { describe, expect, it } from "vitest";
import { skillSourceLinks } from "@/lib/skillSourceLinks";

describe("skill source links", () => {
  it("preserves repository casing and the branch from a raw file URL", () => {
    const links = skillSourceLinks({ source_repo: "Example/Skills", source_path: "skills/demo/SKILL.md", source_url: "https://raw.githubusercontent.com/Example/Skills/develop/skills/demo/SKILL.md" });
    expect(links.repository).toBe("https://github.com/Example/Skills");
    expect(links.sourcePath).toBe("https://github.com/Example/Skills/blob/develop/skills/demo/SKILL.md");
  });
  it("uses the default branch without assuming main and encodes path segments", () => {
    expect(skillSourceLinks({ source: "github:Example/Skills", source_path: "skill name/SKILL.md" }).sourcePath).toBe("https://github.com/Example/Skills/blob/HEAD/skill%20name/SKILL.md");
  });
  it("opens the parent folder for an absolute local file", () => {
    expect(skillSourceLinks({ source_path: "D:\\skills\\demo\\SKILL.md" }).sourceDirectory).toBe("D:\\skills\\demo");
  });
  it("does not turn unsupported schemes or missing metadata into links", () => {
    expect(skillSourceLinks({ source_url: "javascript:alert(1)" }).sourcePath).toBeUndefined();
    expect(skillSourceLinks({}).repository).toBeUndefined();
  });
});
