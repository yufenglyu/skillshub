import { beforeEach, it, expect, vi } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/tauri", () => ({ invoke, isTauriRuntime: () => true }));
vi.mock("@/components/github-import/GitHubRepoImportWizard", () => ({
  GitHubRepoImportWizard: ({
    open,
    onImport,
  }: {
    open: boolean;
    onImport: (selections: unknown[]) => void;
  }) =>
    open ? (
      <button
        onClick={() =>
          onImport([
            { sourcePath: "skills/a", resolution: "overwrite" },
            { sourcePath: "skills/b", resolution: "overwrite" },
          ])
        }
      >
        confirm selection
      </button>
    ) : null,
}));
import { AddSkillsDialog } from "@/components/skill/AddSkillsDialog";
import {
  useTaskQueueStore as queue,
  waitForTask,
} from "@/stores/taskQueueStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
beforeEach(() => {
  queue.setState({ tasks: [] });
  invoke.mockReset();
  vi.spyOn(
    useResourceLibraryStore.getState(),
    "loadResourceLibrary",
  ).mockResolvedValue();
});
it("validates local skills first and queues selected skills without waiting for import", async () => {
  const close = vi.fn();
  let finish!: () => void;
  invoke.mockImplementation((command) =>
    command === "preview_local_resource_skills"
      ? Promise.resolve([
          { skillId: "a", name: "A", conflict: false },
          { skillId: "b", name: "B", conflict: true },
        ])
      : new Promise<void>((resolve) => {
          finish = resolve;
        }),
  );
  render(
    <MemoryRouter>
      <AddSkillsDialog open onOpenChange={close} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("本地"), {
    target: { value: "/test/skills" },
  });
  fireEvent.click(screen.getByRole("button", { name: "添加" }));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(invoke).toHaveBeenCalledWith("add_local_resource_skills", {
    input: {
      sourceDir: "/test/skills",
      overwrite: false,
      selectedSkillIds: ["a"],
    },
  });
  finish();
  await waitForTask(queue.getState().tasks[0].id);
  expect(
    useResourceLibraryStore.getState().loadResourceLibrary,
  ).toHaveBeenCalled();
});
it("queues GitHub selections as separate retryable steps and closes immediately", async () => {
  const close = vi.fn();
  invoke.mockImplementation((command) =>
    Promise.resolve(
      command === "preview_github_repo_import"
        ? {
            repo: { owner: "owner", repo: "repo" },
            skills: [
              { sourcePath: "skills/a", skillId: "a" },
              { sourcePath: "skills/b", skillId: "b" },
            ],
          }
        : { importedSkills: [] },
    ),
  );
  render(
    <MemoryRouter>
      <AddSkillsDialog open onOpenChange={close} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("GitHub"), {
    target: { value: "owner/repo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "导入" }));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(
    screen.queryByRole("button", { name: "confirm selection" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(queue.getState().tasks[0].status).toBe("success"));
  expect(queue.getState().tasks[0].steps).toHaveLength(2);
});

it("shows only two add entries and cancellation stops a pending preview from importing", async () => {
  let finish!: (items: unknown[]) => void;
  invoke.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const close = vi.fn();
  render(
    <MemoryRouter>
      <AddSkillsDialog open onOpenChange={close} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: "添加" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "导入" })).toBeInTheDocument();
  expect(screen.queryByText("手动创建")).not.toBeInTheDocument();
  expect(screen.queryByText("选择技能")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("本地"), {
    target: { value: "/test/skills" },
  });
  fireEvent.click(screen.getByRole("button", { name: "添加" }));
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  await act(async () => finish([{ skillId: "a", name: "A", conflict: false }]));
  expect(close).toHaveBeenCalledWith(false);
  expect(queue.getState().tasks).toHaveLength(0);
});

it("shows a safe actionable preview error and keeps input available for retry",async()=>{
  invoke.mockRejectedValue("Invalid GitHub repository URL.");
  const close=vi.fn();
  render(<MemoryRouter><AddSkillsDialog open onOpenChange={close}/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("GitHub"),{target:{value:"invalid"}});
  fireEvent.click(screen.getByRole("button",{name:"导入"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("owner/repo");
  expect(screen.getByRole("button",{name:"导入"})).toBeEnabled();
  expect(close).not.toHaveBeenCalled();
  expect(queue.getState().tasks).toHaveLength(0);
});
