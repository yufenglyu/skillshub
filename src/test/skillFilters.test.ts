import { describe, it, expect } from "vitest";
import {
  matchesSearch,
  matchesTags,
  allSearchScopes,
} from "@/lib/skillFilters";
describe("skill filters", () => {
  it("requires all selected tags on the same skill", () => {
    expect(matchesTags(["A", "B"], ["a", "b"])).toBe(true);
    expect(matchesTags(["A"], ["a", "b"])).toBe(false);
  });
  it("searches selected fields and folder notes but never tags", () => {
    const skill = {
      name: "Skill",
      description: "description",
      notes: "manual",
      tags: ["secret-tag"],
    };
    expect(matchesSearch(skill, "description", ["name"])).toBe(false);
    expect(matchesSearch(skill, "description", allSearchScopes)).toBe(true);
    expect(
      matchesSearch(
        skill,
        "directory memo",
        ["notes"],
        "directory",
        "directory memo",
      ),
    ).toBe(true);
    expect(matchesSearch(skill, "secret-tag", allSearchScopes)).toBe(false);
  });
});
