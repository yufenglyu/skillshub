import { describe, expect, it } from "vitest";
import { splitResourceLibrarySkillsByFolder } from "@/pages/ResourceLibraryView";
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
      name: "example",
      skillCount: 2,
    });
    expect(split.groups[0].skills.map((skill) => skill.id)).toEqual([
      "demo-a",
      "demo-b",
    ]);
  });
});
