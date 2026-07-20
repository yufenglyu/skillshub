import { describe, expect, it } from "vitest";
import { splitResourceLibrarySkillsByFolder } from "@/lib/skillFolders";
import type { SkillWithLinks } from "@/types";

function resourceSkill(overrides: Partial<SkillWithLinks>): SkillWithLinks {
  return {
    id: "demo",
    name: "demo",
    description: "Demo skill",
    file_path: "D:/old-resource/example/skills/demo/SKILL.md",
    canonical_path: "D:/old-resource/example/skills/demo",
    is_central: false,
    source_author: "example",
    source_repo: "example/skills",
    scanned_at: "2026-07-14T00:00:00Z",
    linked_agents: [],
    read_only_agents: [],
    ...overrides,
  };
}

describe("splitResourceLibrarySkillsByFolder", () => {
  it("groups resource library imports by author and project directory", () => {
    const split = splitResourceLibrarySkillsByFolder(
      [
        resourceSkill({
          id: "algorithmic-art",
          name: "algorithmic-art",
          canonical_path: "D:/resource/anthropics/skills/algorithmic-art",
          file_path: "D:/resource/anthropics/skills/algorithmic-art/SKILL.md",
          source_author: "anthropics",
          source_repo: "anthropics/skills",
        }),
        resourceSkill({
          id: "brand-guidelines",
          name: "brand-guidelines",
          canonical_path: "D:/resource/anthropics/skills/brand-guidelines",
          file_path: "D:/resource/anthropics/skills/brand-guidelines/SKILL.md",
          source_author: "anthropics",
          source_repo: "anthropics/skills",
        }),
        resourceSkill({
          id: "api-and-interface-design",
          name: "api-and-interface-design",
          canonical_path: "D:/resource/addyosmani/agent-skills/api-and-interface-design",
          file_path: "D:/resource/addyosmani/agent-skills/api-and-interface-design/SKILL.md",
          source_author: "addyosmani",
          source_repo: "addyosmani/agent-skills",
        }),
      ],
      "D:/resource"
    );

    expect(split.rootSkills).toHaveLength(0);
    expect(split.groups.map((group) => group.name)).toEqual([
      "addyosmani/agent-skills",
      "anthropics/skills",
    ]);
    expect(split.groups.find((group) => group.name === "anthropics/skills")).toMatchObject({
      relativePath: "anthropics/skills",
      path: "D:/resource/anthropics/skills",
      skillCount: 2,
    });
  });

  it("falls back to source owner folders when paths are outside the current resource root", () => {
    const split = splitResourceLibrarySkillsByFolder(
      [
        resourceSkill({
          id: "demo-a",
          name: "demo-a",
          canonical_path: "D:/old-resource/example/skills/demo-a",
          file_path: "D:/old-resource/example/skills/demo-a/SKILL.md",
        }),
        resourceSkill({
          id: "demo-b",
          name: "demo-b",
          canonical_path: "D:/other-place/example/skills/demo-b",
          file_path: "D:/other-place/example/skills/demo-b/SKILL.md",
        }),
      ],
      "D:/new-resource"
    );

    expect(split.rootSkills).toHaveLength(0);
    expect(split.groups).toHaveLength(1);
    expect(split.groups[0]).toMatchObject({
      name: "example/skills",
      skillCount: 2,
    });
    expect(split.groups[0].skills.map((skill) => skill.id)).toEqual([
      "demo-a",
      "demo-b",
    ]);
  });
});
