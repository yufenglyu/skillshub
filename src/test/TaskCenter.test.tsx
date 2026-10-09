import {beforeEach, it, expect} from "vitest";
import {render, screen, fireEvent, act, within} from "@testing-library/react";
import {TaskCenter} from "@/components/layout/TaskCenter";
import {useTaskQueueStore as queue, type BackgroundTask} from "@/stores/taskQueueStore";
import {useRepositorySyncStore as updates} from "@/stores/repositorySyncStore";
import {useAppStatusStore} from "@/stores/appStatusStore";
const task = (id: string, status: BackgroundTask["status"]): BackgroundTask => ({id, key:id, label:id, kind:"check", status, cancelRequested:false, createdAt:1, locks:[], steps:[{label:id, command:"test", args:{}, status}]});
function openCenter() {fireEvent.click(screen.getByRole("button", {name:/任务与更新 ·/}));}
beforeEach(() => {
  queue.setState({tasks:[task("running", "running"), task("queued", "queued"), task("done", "success")]});
  updates.setState({open:false, centerView:null, preview:null, error:null, ignored:[], checkedAt:{}, updateErrors:{}, isChecking:false, checkingRepository:null});
  useAppStatusStore.setState({task:null});
});
it("stops queued work immediately and lets the current step finish", () => {
  render(<TaskCenter/>); openCenter();
  expect(screen.getByRole("button", {name:"进行中 2"})).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", {name:"停止全部"}));
  expect(queue.getState().tasks.find(t => t.id === "queued")?.status).toBe("cancelled");
  expect(queue.getState().tasks.find(t => t.id === "running")).toMatchObject({status:"running", cancelRequested:true});
  expect(screen.getByText("当前步骤结束后停止；已完成的操作保留。")).toBeInTheDocument();
});
it("cleans finished history without stopping active work or erasing failures", () => {
  queue.setState({tasks:[task("running","running"), task("done","success"), task("failed","failed"), task("cancelled","cancelled")]});
  render(<TaskCenter/>); openCenter();
  fireEvent.click(screen.getByRole("button", {name:"历史 3"}));
  const height = screen.getByRole("dialog").style.height;
  fireEvent.click(screen.getByRole("button", {name:"清理已完成记录"}));
  expect(queue.getState().tasks.map(t => t.id)).toEqual(["running", "failed"]);
  expect(queue.getState().tasks[0].cancelRequested).toBe(false);
  expect(screen.getByRole("dialog").style.height).toBe(height);
  expect(screen.queryByRole("button", {name:"清空所有任务"})).not.toBeInTheDocument();
});
it("opens pending changes first and hides unchanged skills by default", () => {
  updates.setState({preview:{repositories:[{repository:"example/repo", added:[], modified:[{skillId:"changed",name:"Changed",version:"v1"}], deleted:[], unchanged:[{skillId:"same",name:"Same"}]}]}});
  render(<TaskCenter/>); openCenter();
  expect(screen.getByRole("button", {name:"待处理 1"})).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", {name:"example/repo"}));
  expect(screen.getByText("Changed")).toBeInTheDocument();
  expect(screen.queryByText("Same")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"无变化 1"}));
  expect(screen.getByText("Same")).toBeInTheDocument();
});
it("preserves the chosen view when results arrive", () => {
  render(<TaskCenter/>); openCenter();
  act(() => updates.setState({preview:{repositories:[{repository:"example/repo",added:[{skillId:"new",name:"New"}],modified:[],deleted:[],unchanged:[]}]}}));
  expect(screen.getByRole("button", {name:"进行中 2"})).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", {name:"待处理 1"})).toHaveAttribute("aria-pressed", "false");
});
it("aggregates a batch and moves it to history only after all children finish", () => {
  queue.setState({tasks:[{...task("a","success"),batchId:"batch",batchLabel:"Batch"},{...task("b","running"),batchId:"batch",batchLabel:"Batch"},{...task("c","queued"),batchId:"batch",batchLabel:"Batch"}]});
  render(<TaskCenter/>); openCenter();
  expect(screen.getByRole("button", {name:"进行中 1"})).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("已完成 1 · 执行中 1 · 排队 1 · 失败 0")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:/^Batch/}));
  expect(screen.getAllByText("a · 成功").length).toBeGreaterThan(0);
  act(() => queue.setState(s => ({tasks:s.tasks.map(t => ({...t,status:"success"}))})));
  expect(screen.getByRole("button", {name:"历史 1"})).toBeInTheDocument();
});
it("shows known check results without arbitrary arguments", () => {
  queue.setState({tasks:[{...task("check","success"),steps:[{label:"重新检查",command:"preview_source_backed_resource_repository_updates",args:{repositories:["example/repo"],privateField:"hidden-test-value"},status:"success",result:{repositories:[{repository:"example/repo",added:[{skillId:"new",name:"New"}],modified:[],deleted:[],unchanged:[{skillId:"same",name:"Same"}]}]}}]}]});
  render(<TaskCenter/>); openCenter();
  fireEvent.click(screen.getByRole("button", {name:/^check/}));
  expect(screen.getByText("新增 1")).toBeInTheDocument();
  expect(screen.queryByText("hidden-test-value")).not.toBeInTheDocument();
});
it("offers interrupted AI work in pending and avoids counting report failures twice", () => {
  queue.setState({tasks:[{...task("ai","interrupted"),kind:"ai"},{...task("check","partial"),steps:[{label:"check",command:"preview_source_backed_resource_repository_updates",args:{repositories:["example/repo"]},status:"partial"}]}]});
  updates.setState({checkedAt:{"example/repo":2},preview:{repositories:[{repository:"example/repo",added:[],modified:[],deleted:[],unchanged:[],error:"network unavailable"}]}});
  render(<TaskCenter/>); openCenter();
  expect(screen.getByRole("button", {name:"待处理 2"})).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", {name:/^ai/})).toBeInTheDocument();
  expect(within(screen.getByRole("dialog")).getAllByRole("button", {name:"重试"})).toHaveLength(1);
});

it("preserves update selections while switching views", () => {
  updates.setState({preview:{repositories:[{repository:"example/repo",added:[],modified:[{skillId:"changed",name:"Changed",version:"v1"}],deleted:[],unchanged:[]}]}});
  render(<TaskCenter/>); openCenter();
  fireEvent.click(screen.getByRole("button", {name:"example/repo"}));
  fireEvent.click(screen.getByRole("checkbox", {name:"Changed"}));
  expect(screen.getByRole("checkbox", {name:"Changed"})).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", {name:"进行中 2"}));
  fireEvent.click(screen.getByRole("button", {name:"待处理 1"}));
  expect(screen.getByRole("checkbox", {name:"Changed"})).not.toBeChecked();
});
it("retains completed children of a running batch when cleaning other history", () => {
  queue.setState({tasks:[{...task("a","success"),batchId:"batch"},{...task("b","running"),batchId:"batch"},task("old","success")]});
  queue.getState().clearFinished();
  expect(queue.getState().tasks.map(t => t.id)).toEqual(["a", "b"]);
  expect(queue.getState().tasks[1].cancelRequested).toBe(false);
});

it("deletes failed task records from pending and history without touching running work", () => {
  queue.setState({tasks:[task("failed","failed"), task("running","running")]});
  render(<TaskCenter/>); openCenter();
  fireEvent.click(screen.getByRole("button", {name:"删除任务记录：failed"}));
  expect(queue.getState().tasks.map(t => t.id)).toEqual(["running"]);
  expect(queue.getState().tasks[0].cancelRequested).toBe(false);
  expect(screen.getByRole("button", {name:"待处理 0"})).toBeInTheDocument();
  act(() => queue.setState(s => ({tasks:[...s.tasks,task("another","interrupted")]})));
  fireEvent.click(screen.getByRole("button", {name:"历史 1"}));
  fireEvent.click(screen.getByRole("button", {name:"删除任务记录：another"}));
  expect(queue.getState().tasks.map(t => t.id)).toEqual(["running"]);
  act(() => queue.getState().remove("running"));
  expect(queue.getState().tasks[0].id).toBe("running");
});
it("allows dismissing a failed repository check in pending", () => {
  queue.setState({tasks:[]});
  updates.setState({preview:{repositories:[{repository:"failed/repo",added:[],modified:[],deleted:[],unchanged:[],error:"network unavailable"}]}});
  render(<TaskCenter/>); openCenter();
  fireEvent.click(screen.getByRole("button", {name:"移除检查结果"}));
  expect(updates.getState().preview?.repositories).toEqual([]);
  expect(screen.getByRole("button", {name:"待处理 0"})).toBeInTheDocument();
});
