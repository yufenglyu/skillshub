import i18n from "@/i18n";
import { beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/tauri", () => ({ invoke, isTauriRuntime: () => true }));
import { UpdateCenter } from "@/components/skill/UpdateCenter";
import { useRepositorySyncStore as updates } from "@/stores/repositorySyncStore";
import {
  useTaskQueueStore as queue,
  waitForTask,
} from "@/stores/taskQueueStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
function clearSelection() {
  const checkbox = screen.getByRole("checkbox",{name:"全选"});
  if (checkbox.getAttribute("aria-checked") === "mixed") fireEvent.click(checkbox);
  if ((checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
}
const preview = {
  repositories: [
    {
      repository: "owner/repo",
      added: [{ skillId: "new", name: "New", version: "v1" }],
      modified: [
        {
          skillId: "changed",
          name: "Changed",
          version: "v1",
          files: [{ path: "SKILL.md", status: "modified" as const }],
        },
      ],
      deleted: [{ skillId: "deleted", name: "Deleted", version: "deleted" }],
      unchanged: [{ skillId: "same", name: "Same" }],
    },
  ],
};
beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  queue.setState({ tasks: [] });
  vi.spyOn(
    useResourceLibraryStore.getState(),
    "loadResourceLibrary",
  ).mockResolvedValue();
  vi.spyOn(
    useCentralSkillsStore.getState(),
    "loadCentralSkills",
  ).mockResolvedValue();
  updates.setState({
    preview: structuredClone(preview),
    open: true,
    ignored: [],
    isChecking: false,
    error: null,
    checkedAt: {},
  });
});
it("selects added and modified skills, keeps remote deletions opt-in and removes successes", async () => {
  render(<UpdateCenter />);
  fireEvent.click(screen.getByRole("button", { name: "owner/repo" }));
  expect(screen.getByText("SKILL.md", { exact: false })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "应用更新" }));
  await waitFor(() =>
    expect(updates.getState().preview?.repositories[0].modified).toHaveLength(
      0,
    ),
  );
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke).not.toHaveBeenCalledWith(
    "apply_repository_update_item",
    expect.objectContaining({ skillId: "deleted" }),
  );
  expect(updates.getState().preview?.repositories[0].deleted).toHaveLength(1);
  expect(updates.getState().preview?.repositories[0].unchanged).toHaveLength(3);
});
it("ignores only a content version and can restore it", () => {
  const view = render(<UpdateCenter />);
  fireEvent.click(screen.getByRole("button", { name: "owner/repo" }));
  fireEvent.click(screen.getByRole("button", { name: "忽略所选" }));
  expect(screen.queryByText("Changed")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "已忽略" }));
  fireEvent.click(screen.getAllByRole("button", { name: "取消忽略" })[0]);
  expect(updates.getState().ignored).toHaveLength(1);
  updates.setState({
    preview: {
      repositories: [
        {
          ...preview.repositories[0],
          modified: [{ skillId: "changed", name: "Changed", version: "v2" }],
        },
      ],
    },
  });
  view.rerender(<UpdateCenter />);
  fireEvent.click(screen.getByRole("button", { name: "已忽略" }));
  expect(screen.getByText("Changed")).toBeInTheDocument();
});
it("retains failed items with retry information while other items succeed", async () => {
  invoke.mockImplementation((_command, args) =>
    args.skillId === "changed"
      ? Promise.reject("network failed")
      : Promise.resolve(),
  );
  render(<UpdateCenter />);
  fireEvent.click(screen.getByRole("button", { name: "owner/repo" }));
  fireEvent.click(screen.getByRole("button", { name: "应用更新" }));
  await waitFor(() =>
    expect(
      queue.getState().tasks.filter((t) => t.status === "failed"),
    ).toHaveLength(1),
  );
  expect(updates.getState().preview?.repositories[0].added).toHaveLength(0);
  expect(updates.getState().preview?.repositories[0].modified).toHaveLength(1);
  expect(
    screen.getByText(
      queue.getState().tasks.find((t) => t.status === "failed")!.steps[0]
        .error!,
    ),
  ).toBeInTheDocument();
});
it("keeps the center available for more submissions while an update runs", async () => {
  let finish!: () => void;
  invoke
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  render(<UpdateCenter />);
  fireEvent.click(screen.getByRole("button", { name: "owner/repo" }));
  clearSelection();
  const changed = screen.getByText("Changed").closest("div")!;
  fireEvent.click(within(changed).getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "应用更新" }));
  const added = screen.getByText("New").closest("div")!;
  fireEvent.click(within(added).getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "应用更新" }));
  expect(queue.getState().tasks).toHaveLength(2);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  updates.getState().setOpen(false);
  finish();
  await Promise.all(queue.getState().tasks.map((t) => waitForTask(t.id)));
});

it("collapses repositories without clearing selected updates", () => {
  render(<UpdateCenter />);
  expect(screen.queryByText("Changed")).not.toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: "owner/repo" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(screen.getByText("Changed")).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.queryByText("Changed")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "应用更新" })).toBeEnabled();
});

it("does not classify skills from failed checks as unchanged",()=>{
 updates.setState({preview:{repositories:[{...preview.repositories[0],error:"rate limit was exceeded (HTTP 403)"}]}});
 render(<UpdateCenter/>);
 expect(screen.getByRole("button",{name:"无变化 0"})).toBeInTheDocument();
 expect(screen.queryByText("Same")).not.toBeInTheDocument();
 expect(screen.getByText(i18n.t("workflow.errors.rateLimit"), {exact:false})).toBeInTheDocument();
});

it("rechecks selected failed repositories together and preserves other results", async () => {
  const failed = (repository: string) => ({repository, added: [], modified: [], deleted: [], unchanged: [], error: "HTTP 403"});
  updates.setState({checkingRepository:null, preview:{repositories:[preview.repositories[0],failed("one/repo"),failed("two/repo"),failed("three/repo")]}});
  invoke.mockResolvedValue({repositories:[{...failed("one/repo"),error:undefined},{...failed("two/repo"),error:undefined}]});
  render(<UpdateCenter/>);
  fireEvent.click(screen.getByRole("button",{name:"检查失败 3"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"one/repo"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"two/repo"}));
  expect(screen.getByRole("checkbox",{name:"one/repo"})).toBeChecked();
  fireEvent.click(screen.getByRole("button",{name:"重查所选"}));
  await waitFor(()=>expect(updates.getState().checkingRepository).toBeNull());
  expect(invoke).toHaveBeenCalledWith("preview_source_backed_resource_repository_updates",{repositories:["one/repo","two/repo"]});
  expect(updates.getState().preview?.repositories[0]).toEqual(preview.repositories[0]);
  expect(updates.getState().preview?.repositories[3].error).toBe("HTTP 403");
  expect(updates.getState().preview?.repositories[1].error).toBeUndefined();
});
it("includes failed repositories in select all and clears their selection", () => {
  updates.setState({preview:{repositories:[{...preview.repositories[0],error:"offline"}]}});
  render(<UpdateCenter/>);
  fireEvent.click(screen.getByRole("checkbox",{name:"全选"}));
  expect(screen.getByRole("checkbox",{name:"owner/repo"})).toBeChecked();
  expect(screen.getByRole("button",{name:"应用更新"})).toBeDisabled();
  clearSelection();
  expect(screen.getByRole("checkbox",{name:"owner/repo"})).not.toBeChecked();
});
it("offers retrying failures in the footer without selecting each row", async () => {
  updates.setState({preview:{repositories:[{...preview.repositories[0],error:"offline"}]}});
  invoke.mockResolvedValue({repositories:[]});
  render(<UpdateCenter/>);
  fireEvent.click(screen.getByRole("button",{name:"检查失败 1"}));
  const retry = screen.getByRole("button",{name:"重试失败项"});
  expect(retry.closest("section")).toBeNull();
  fireEvent.click(retry);
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith("preview_source_backed_resource_repository_updates",{repositories:["owner/repo"]}));
  await waitFor(()=>expect(updates.getState().checkingRepository).toBeNull());
});

it("shows failed repositories only under all or failed and scopes bulk selection", () => {
  updates.setState({preview:{repositories:[preview.repositories[0],{repository:"failed/repo",added:[],modified:[],deleted:[],unchanged:[],error:"offline"}]}});
  render(<UpdateCenter/>);
  expect(screen.getByRole("dialog",{name:"更新状态"})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"全部"})).toHaveAttribute("aria-pressed","true");
  for (const name of ["新增 1","待更新 1","远程删除 1","无变化 1","已忽略"]) {
    fireEvent.click(screen.getByRole("button",{name}));
    expect(screen.queryByRole("checkbox",{name:"failed/repo"})).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole("button",{name:"新增 1"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"全选"}));
  fireEvent.click(screen.getByRole("button",{name:"检查失败 1"}));
  expect(screen.getByRole("checkbox",{name:"failed/repo"})).not.toBeChecked();
  expect(screen.queryByRole("checkbox",{name:"owner/repo"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox",{name:"全选"}));
  expect(screen.getByRole("button",{name:"重查所选"})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"应用更新"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"新增 1"}));
  expect(screen.getByRole("button",{name:"重查所选"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"全部"}));
  expect(screen.getByRole("checkbox",{name:"failed/repo"})).toBeChecked();
  expect(screen.getByRole("checkbox",{name:"owner/repo"})).toBeInTheDocument();
});

it("rechecks the selected update repository rather than the whole library",async()=>{
  updates.setState({checkingRepository:null,preview:{repositories:[preview.repositories[0],{...preview.repositories[0],repository:"other/repo"}]}});
  invoke.mockResolvedValue({repositories:[preview.repositories[0]]});
  render(<UpdateCenter/>);
  clearSelection();
  fireEvent.click(screen.getByRole("checkbox",{name:"owner/repo"}));
  fireEvent.click(screen.getByRole("button",{name:"重查所选"}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith("preview_source_backed_resource_repository_updates",{repositories:["owner/repo"]}));
  await waitFor(()=>expect(updates.getState().checkingRepository).toBeNull());
  expect(updates.getState().preview?.repositories[1].repository).toBe("other/repo");
});

it("allows unchanged items to be rechecked without making them applicable",()=>{
  render(<UpdateCenter/>);
  fireEvent.click(screen.getByRole("button",{name:"无变化 1"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"全选"}));
  expect(screen.getByRole("button",{name:"重查所选"})).toBeEnabled();
  expect(screen.getByRole("button",{name:"应用更新"})).toBeDisabled();
});
it("clears an old apply error after a successful scoped check of the same version",async()=>{
  queue.setState({tasks:[{id:"old",key:"owner/repo:changed:v1",kind:"update",label:"Changed",locks:[],status:"failed",cancelRequested:false,createdAt:1,steps:[{command:"apply_repository_update_item",label:"Changed",args:{repository:"owner/repo"},status:"failed",error:"old failure"}]}]});
  invoke.mockResolvedValue(preview);
  render(<UpdateCenter/>);
  fireEvent.click(screen.getByRole("button",{name:"owner/repo"}));
  expect(screen.getByText("old failure")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"重查所选"}));
  await waitFor(()=>expect(screen.queryByText("old failure")).not.toBeInTheDocument());
  expect(queue.getState().tasks.find(task=>task.id==="old")?.status).toBe("failed");
});

it("places replacements only under deleted and submits one replacement action",async()=>{
  updates.setState({preview:{repositories:[{repository:"owner/repo",added:[{skillId:"new",name:"New",sourcePath:"skills/new/SKILL.md",version:"v2"}],deleted:[{skillId:"old",name:"Old",version:"deleted"}],modified:[],unchanged:[]}]}});
  render(<UpdateCenter/>);
  expect(screen.getByRole("button",{name:"新增 0"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"远程删除 1"}));
  const replaceButton = screen.getByRole("button",{name:"删除并重导"});
  expect(replaceButton.closest("section")).toBeNull();
  expect(replaceButton).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"owner/repo"}));
  expect(screen.getByRole("combobox")).toHaveValue("owner/repo:new:v2");
  fireEvent.click(screen.getByRole("checkbox",{name:"owner/repo"}));
  expect(replaceButton).toBeEnabled();
  expect(screen.getByRole("button",{name:"应用更新"})).toBeDisabled();
  fireEvent.click(replaceButton);
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith("apply_repository_update_item",{repository:"owner/repo",skillId:"old",version:"deleted",action:"replace",replacementSkillId:"new",replacementVersion:"v2"}));
  await waitFor(()=>expect(updates.getState().preview?.repositories[0].deleted).toHaveLength(0));
  expect(updates.getState().preview?.repositories[0].added).toHaveLength(0);
  expect(updates.getState().preview?.repositories[0].unchanged[0].skillId).toBe("old");
});

it("keeps ordinary updates separate from selected replacements",async()=>{
  updates.setState({preview:{repositories:[{repository:"owner/repo",added:[{skillId:"new",name:"New",sourcePath:"skills/new/SKILL.md",version:"v2"}],deleted:[{skillId:"old",name:"Old",version:"deleted"}],modified:[{skillId:"changed",name:"Changed",version:"v1"}],unchanged:[]}]}});
  render(<UpdateCenter/>);
  fireEvent.click(screen.getByRole("checkbox",{name:"全选"}));
  expect(screen.getByRole("button",{name:"删除并重导"})).toBeEnabled();
  fireEvent.click(screen.getByRole("button",{name:"应用更新"}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith("apply_repository_update_item",{repository:"owner/repo",skillId:"changed",version:"v1",action:"modified"}));
  expect(invoke.mock.calls.filter(([command])=>command === "apply_repository_update_item")).toHaveLength(1);
  expect(updates.getState().preview?.repositories[0].deleted).toHaveLength(1);
});

it("keeps all routine update operations directly visible",()=>{
 render(<UpdateCenter/>);
 expect(screen.getByRole("button",{name:"重查所选"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"检查全部"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"忽略所选"})).toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"更多操作"})).not.toBeInTheDocument();
});
