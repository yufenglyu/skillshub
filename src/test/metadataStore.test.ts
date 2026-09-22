import { beforeEach, it, expect, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/tauri", () => ({ invoke, isTauriRuntime: () => false }));
import {
  useMetadataStore as metadata,
  findFolderNote,
} from "@/stores/metadataStore";
import { useResourceLibraryStore as resources } from "@/stores/resourceLibraryStore";
import { useCentralSkillsStore as central } from "@/stores/centralSkillsStore";
import { useSkillDetailStore as detail } from "@/stores/skillDetailStore";
import type { SkillWithLinks } from "@/types";
const skill = (id: string, tags: string[]): SkillWithLinks => ({
  id,
  name: id,
  file_path: `/${id}/SKILL.md`,
  is_central: false,
  scanned_at: "",
  linked_agents: [],
  tags,
  notes: "preserve",
});
beforeEach(() => {
  resources.setState({
    skills: [skill("a", ["A", "B"]), skill("b", ["B"]), skill("c", ["A"])],
  });
  central.setState({ skills: [skill("a", ["A", "B"])] });
});
it("adds or removes only the dropped tag and publishes to all loaded lists", async () => {
  await metadata.getState().changeTag("A", ["a", "b"], false);
  expect(resources.getState().skills.map((s) => s.tags)).toEqual([
    ["A", "B"],
    ["B", "A"],
    ["A"],
  ]);
  await metadata.getState().changeTag("A", ["a", "b"], true);
  expect(resources.getState().skills.map((s) => s.tags)).toEqual([
    ["B"],
    ["B"],
    ["A"],
  ]);
  expect(central.getState().skills[0].tags).toEqual(["B"]);
});
it("saving detail metadata refreshes the sidebar source without reloading the page", async () => {
  await detail
    .getState()
    .updateMetadata("a", { notes: "new", tags: ["fresh"] });
  expect(resources.getState().skills[0]).toMatchObject({
    notes: "new",
    tags: ["fresh"],
  });
  expect(central.getState().skills[0].tags).toEqual(["fresh"]);
});
it("keeps folder notes associated with members when its display path changes", () => {
  expect(
    findFolderNote(
      [{ id: "stable", notes: "memo", skillIds: ["a", "b"] }],
      ["b", "new"],
    )?.notes,
  ).toBe("memo");
});
