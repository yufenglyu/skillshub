import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRepositorySyncStore } from "@/stores/repositorySyncStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import type { RepositorySyncPreviewReport } from "@/types";

describe("background repository preview", () => {
  it("scans before a full check and preserves its report time on a repository retry", async () => {
    const order:string[]=[];
    useResourceLibraryStore.setState({error:null});
    vi.spyOn(useResourceLibraryStore.getState(),"loadResourceLibrary").mockImplementation(async()=>{order.push("scan");});
    vi.spyOn(useResourceLibraryStore.getState(),"previewRepositorySync").mockImplementation(async()=>{order.push("check");return {repositories:[{repository:"example/repo",added:[],modified:[],deleted:[],unchanged:[]}]};});
    await useRepositorySyncStore.getState().checkForUpdates();
    expect(order).toEqual(["scan","check"]);
    expect(useRepositorySyncStore.getState().reportCheckedAt).toEqual(expect.any(Number));
    useRepositorySyncStore.setState({reportCheckedAt:1000});
    await useRepositorySyncStore.getState().recheckRepository("example/repo");
    expect(useRepositorySyncStore.getState().reportCheckedAt).toBe(1000);
    expect(useRepositorySyncStore.getState().checkedAt["example/repo"]).toBeGreaterThan(1000);
    expect(order).toEqual(["scan","check","check"]);
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useRepositorySyncStore.setState({ preview: null, open: false, isChecking: false, error: null,
      applied: false, appliedRepositories: [], checkingRepository: null, repositories: null, requestedRepositories: null, includeAdded: true, removeDeleted: false });
  });

  it("continues without a mounted page and coalesces repeat clicks", async () => {
    let finish!: (report: RepositorySyncPreviewReport) => void;
    const check = vi.spyOn(useResourceLibraryStore.getState(), "previewRepositorySync")
      .mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const apply = vi.spyOn(useResourceLibraryStore.getState(), "syncSourceBackedSkills");
    const request = useRepositorySyncStore.getState().checkForUpdates(["example/skills"]);
    useRepositorySyncStore.getState().setOpen(false);
    expect(useRepositorySyncStore.getState().isChecking).toBe(true);
    expect(useRepositorySyncStore.getState().checkForUpdates()).toBe(request);
    finish({ repositories: [] });
    await request;
    expect(check).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(useRepositorySyncStore.getState()).toMatchObject({
      isChecking: false, open: true, preview: { repositories: [] }, repositories: ["example/skills"],
    });
  });

  it("retains failures for status-bar retry and accepts a later successful check", async () => {
    const check = vi.spyOn(useResourceLibraryStore.getState(), "previewRepositorySync")
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({ repositories: [] });
    await useRepositorySyncStore.getState().checkForUpdates();
    expect(useRepositorySyncStore.getState()).toMatchObject({ isChecking: false, error: expect.any(String) });
    await useRepositorySyncStore.getState().checkForUpdates();
    expect(check).toHaveBeenCalledTimes(2);
    expect(useRepositorySyncStore.getState()).toMatchObject({ error: null, open: true });
  });

  it("restores the report and choices without reopening a dialog or resuming a spinner", async () => {
    useRepositorySyncStore.setState({ preview: { repositories: [] }, repositories: ["example/skills"],
      includeAdded: false, removeDeleted: true, applied: true, open: true, isChecking: true });
    const key = "skillshub.repository-update-preview.v1";
    const saved = localStorage.getItem(key)!;
    expect(JSON.parse(saved).state).not.toHaveProperty("open");
    expect(JSON.parse(saved).state).not.toHaveProperty("isChecking");
    useRepositorySyncStore.setState({ preview: null, repositories: null, includeAdded: true,
      removeDeleted: false, applied: false, open: false, isChecking: false });
    localStorage.setItem(key, saved);
    await useRepositorySyncStore.persist.rehydrate();
    expect(useRepositorySyncStore.getState()).toMatchObject({ preview: { repositories: [] },
      repositories: ["example/skills"], includeAdded: false, removeDeleted: true, applied: true,
      open: false, isChecking: false });
  });

  it("keeps the saved report on failure and replaces its scope and choices only on success", async () => {
    useRepositorySyncStore.setState({ preview: { repositories: [] }, repositories: ["old/skills"],
      includeAdded: false, removeDeleted: true, applied: true });
    vi.spyOn(useResourceLibraryStore.getState(), "previewRepositorySync")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ repositories: [] });
    await useRepositorySyncStore.getState().checkForUpdates(["new/skills"]);
    expect(useRepositorySyncStore.getState()).toMatchObject({ preview: { repositories: [] },
      repositories: ["old/skills"], requestedRepositories: ["new/skills"], applied: true });
    await useRepositorySyncStore.getState().checkForUpdates(["new/skills"]);
    expect(useRepositorySyncStore.getState()).toMatchObject({ repositories: ["new/skills"],
      includeAdded: true, removeDeleted: false, applied: false });
  });
  it("rechecks one repository without losing other results or options", async () => {
    const first = {repository:"one/repo",added:[],modified:[],deleted:[],unchanged:[]};
    const second = {...first,repository:"two/repo"};
    useRepositorySyncStore.setState({preview:{repositories:[first,second]},includeAdded:false,removeDeleted:true});
    useRepositorySyncStore.getState().markApplied();
    const check = vi.spyOn(useResourceLibraryStore.getState(), "previewRepositorySync").mockResolvedValue({repositories:[{...first,modified:[{skillId:"x",name:"Changed"}]}]});
    await useRepositorySyncStore.getState().recheckRepository("one/repo");
    expect(check).toHaveBeenCalledWith(["one/repo"]);
    expect(useRepositorySyncStore.getState().preview?.repositories[1]).toEqual(second);
    expect(useRepositorySyncStore.getState()).toMatchObject({applied:false,appliedRepositories:["two/repo"],includeAdded:false,removeDeleted:true,checkingRepository:null});
    useRepositorySyncStore.getState().markRepositoryApplied("one/repo");
    expect(useRepositorySyncStore.getState().applied).toBe(true);
  });

  it("retains other items when a single recheck fails", async () => {
    const item = {repository:"one/repo",added:[],modified:[],deleted:[],unchanged:[]};
    useRepositorySyncStore.setState({preview:{repositories:[item,{...item,repository:"two/repo"}]}});
    vi.spyOn(useResourceLibraryStore.getState(), "previewRepositorySync").mockRejectedValue(new Error("offline"));
    await useRepositorySyncStore.getState().recheckRepository("one/repo");
    expect(useRepositorySyncStore.getState().preview?.repositories[0].error).toEqual(expect.any(String));
    expect(useRepositorySyncStore.getState().preview?.repositories[1].error).toBeUndefined();
  });

});

it("removes the withdrawn screenshot preview without changing real data or ignored versions", async () => {
  const repo = (repository: string) => ({repository, added: [], modified: [], deleted: [], unchanged: []});
  const persisted = {
    ignored: ["real/repo:skill:version"],
    preview: {repositories: [
      {...repo("demo/engineering"),added:[{skillId:"new",name:"performance-review",version:"demo-v2"}],modified:[{skillId:"react-patterns",name:"react-patterns",version:"demo-v2"}]},
      {...repo("demo/research"),modified:[{skillId:"research-notes",name:"research-notes",version:"demo-v2"}]},
    ]},
  };
  localStorage.setItem("skillshub.repository-update-preview.v1",JSON.stringify({state:persisted,version:0}));
  await useRepositorySyncStore.persist.rehydrate();
  expect(useRepositorySyncStore.getState().preview).toBeNull();
  expect(useRepositorySyncStore.getState().ignored).toEqual(persisted.ignored);
  const realPreview={repositories:[repo("demo/engineering"),repo("demo/research")]};
  localStorage.setItem("skillshub.repository-update-preview.v1",JSON.stringify({state:{preview:realPreview},version:0}));
  await useRepositorySyncStore.persist.rehydrate();
  expect(useRepositorySyncStore.getState().preview).toEqual(realPreview);
});

it("does not let scoped check results replace repositories outside its scope",async()=>{
  const first={repository:"one/repo",added:[],modified:[],deleted:[],unchanged:[]};
  const second={...first,repository:"two/repo"};
  useRepositorySyncStore.setState({isChecking:false,checkingRepository:null,preview:{repositories:[first,second]}});
  vi.spyOn(useResourceLibraryStore.getState(),"previewRepositorySync").mockResolvedValue({repositories:[first,{...second,error:"outside scope"}]});
  await useRepositorySyncStore.getState().recheckRepository("one/repo");
  expect(useRepositorySyncStore.getState().preview?.repositories[1]).toEqual(second);
});
