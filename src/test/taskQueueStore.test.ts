import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/tauri", () => ({ invoke }));
import {
  useTaskQueueStore as queue,
  waitForTask,
} from "@/stores/taskQueueStore";
const input = (key: string, locks: string[] = []) => ({
  key,
  kind: "update" as const,
  label: key,
  locks,
  steps: [{ command: "test", args: { key }, label: key }],
});
describe("background queue", () => {
  beforeEach(() => {
    invoke.mockReset();
    queue.setState({ tasks: [] });
    localStorage.clear();
  });
  it("limits update concurrency, serializes shared targets and rejects duplicate submissions", async () => {
    const finishes: Array<() => void> = [];
    invoke.mockImplementation(
      () => new Promise<void>((resolve) => finishes.push(resolve)),
    );
    const a = queue.getState().enqueue(input("a", ["repo:one"]));
    const b = queue.getState().enqueue(input("b", ["repo:one"]));
    const c = queue.getState().enqueue(input("c", ["repo:two"]));
    expect(queue.getState().enqueue(input("a"))).toBe(a);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(queue.getState().tasks.find((t) => t.id === b)?.status).toBe(
      "queued",
    );
    finishes[0]();
    await waitForTask(a);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
    finishes[1]();
    finishes[2]();
    await Promise.all([waitForTask(b), waitForTask(c)]);
  });
  it("finishes a current step and stops before the next on cancellation", async () => {
    let finish!: () => void;
    invoke.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const task = {
      ...input("cancel"),
      steps: [...input("one").steps, ...input("two").steps],
    };
    const id = queue.getState().enqueue(task);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    queue.getState().cancel(id);
    finish();
    const result = await waitForTask(id);
    expect(result.status).toBe("cancelled");
    expect(result.steps[0].status).toBe("success");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("retries only failures and never exposes raw provider responses", async () => {
    invoke
      .mockResolvedValueOnce("done")
      .mockRejectedValueOnce("provider raw body");
    const id = queue
      .getState()
      .enqueue({
        ...input("retry"),
        steps: [...input("one").steps, ...input("two").steps],
      });
    const task = await waitForTask(id);
    expect(task.status).toBe("partial");
    expect(task.steps[1].error).not.toContain("provider raw body");
    invoke.mockResolvedValueOnce("done");
    queue.getState().retry(id);
    expect((await waitForTask(id)).status).toBe("success");
    expect(invoke).toHaveBeenCalledTimes(3);
  });
  it("restores unfinished tasks as interrupted without running them", async () => {
    const task = {
      ...input("restore"),
      id: "saved",
      locks: [],
      createdAt: 1,
      cancelRequested: false,
      status: "running",
      steps: [{ ...input("restore").steps[0], status: "running" }],
    };
    localStorage.setItem(
      "skillshub.background-tasks.v1",
      JSON.stringify({ state: { tasks: [task] }, version: 0 }),
    );
    await queue.persist.rehydrate();
    expect(queue.getState().tasks[0].status).toBe("interrupted");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("keeps only the latest 100 completed tasks in memory", async () => {
    invoke.mockResolvedValue("done");
    for (let i = 0; i < 105; i++)
      await waitForTask(queue.getState().enqueue(input(`history-${i}`)));
    expect(queue.getState().tasks).toHaveLength(100);
    expect(queue.getState().tasks[0].key).toBe("history-5");
  });
});

import {taskErrorMessage} from "@/stores/taskQueueStore";
import i18n from "@/i18n";
it("distinguishes changed categories from changed remote contents",()=>{
  expect(taskErrorMessage("Preview changed: item category changed; check this repository again")).toBe(i18n.t("workflow.errors.categoryChanged"));
  expect(taskErrorMessage("Preview changed: remote content version changed; check this repository again")).toBe(i18n.t("workflow.errors.remoteVersionChanged"));
});
it("distinguishes GitHub rate limiting from credentials and AI authorization",()=>{
  expect(taskErrorMessage("GitHub rate limit was exceeded (HTTP 403)")).toBe(i18n.t("workflow.errors.rateLimit"));
  expect(taskErrorMessage("HTTP 429 Too Many Requests")).toBe(i18n.t("workflow.errors.rateLimit"));
  expect(taskErrorMessage("GitHub denied access (HTTP 401)")).toBe(i18n.t("workflow.errors.githubAuthorization"));
  expect(taskErrorMessage("HTTP 401", "ai")).toBe(i18n.t("workflow.errors.aiAuthorization"));
});

it("serializes a full check against updates but lets independent repositories run",async()=>{
  queue.setState({tasks:[]}); invoke.mockReset();
  const finishes:Array<()=>void>=[];
  invoke.mockImplementation(()=>new Promise<void>(resolve=>finishes.push(resolve)));
  const update=queue.getState().enqueue(input("write",["repo:one"]));
  const check=queue.getState().enqueue({...input("check",["repo:*"]),kind:"check"});
  expect(queue.getState().tasks.find(task=>task.id===check)?.status).toBe("queued");
  finishes[0](); await waitForTask(update);
  await waitFor(()=>expect(finishes).toHaveLength(2));
  finishes[1](); await waitForTask(check);
});
