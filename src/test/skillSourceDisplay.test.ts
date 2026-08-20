import {
  getSkillSourceLineKeys,
  getSkillSourceLocation,
  isExceptionalSkillOrigin,
} from "@/lib/skillSourceDisplay";

describe("skill source display", () => {
  it("labels a platform symlink into Central Skills", () => {
    expect(
      getSkillSourceLocation({
        is_central: true,
        link_type: "symlink",
        symlink_target: "~/.agents/skills/frontend-design",
      })
    ).toBe("central");
    expect(getSkillSourceLineKeys("symlink", "central").label).toBe(
      "platform.sourceLine.centralSymlink"
    );
  });

  it("labels a Central Skills entry that links to the resource library", () => {
    expect(
      getSkillSourceLocation({
        is_central: true,
        link_type: "symlink",
        symlink_target: "~/.skillshub/library/owner/repo/shared-skill",
      })
    ).toBe("resource-library");
    expect(getSkillSourceLineKeys("symlink", "resource-library").label).toBe(
      "platform.sourceLine.resourceSymlink"
    );
  });

  it("labels a real directory in Central Skills", () => {
    expect(
      getSkillSourceLocation({
        is_central: true,
        link_type: "native",
      })
    ).toBe("central");
    expect(getSkillSourceLineKeys("native", "central").label).toBe(
      "platform.sourceLine.centralNative"
    );
  });

  it("labels a platform copy that is not central", () => {
    expect(
      getSkillSourceLocation({
        is_central: false,
        link_type: "copy",
      })
    ).toBe("standalone");
  });

  it("labels a resource-library origin even without a central-looking target", () => {
    expect(
      getSkillSourceLocation({
        is_central: false,
        link_type: "symlink",
        symlink_target: "~/Skills/resource-linked-skill",
        source: "resource-library",
      })
    ).toBe("resource-library");
  });

  it("keeps plugin and compatibility origins exceptional", () => {
    expect(isExceptionalSkillOrigin("plugin")).toBe(true);
    expect(isExceptionalSkillOrigin("user")).toBe(false);
  });
});
