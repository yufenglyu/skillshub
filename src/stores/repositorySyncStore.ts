import {
  registerTaskExecutor,
  registerTaskResult,
  useTaskQueueStore,
  waitForTask,
} from "./taskQueueStore";
import { useCentralSkillsStore } from "./centralSkillsStore";
import i18n from "@/i18n";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import type {
  RepositorySyncPreview,
  RepositorySyncPreviewReport,
} from "@/types";

export function hasRepositoryChanges(item: RepositorySyncPreview): boolean {
  return (
    item.added.length > 0 || item.modified.length > 0 || item.deleted.length > 0
  );
}

interface RepositorySyncState {
  checkedAt: Record<string, number>;
  ignored: string[];
  setIgnored: (keys: string[]) => void;
  preview: RepositorySyncPreviewReport | null;
  isChecking: boolean;
  applied: boolean;
  appliedRepositories: string[];
  checkingRepository: string | null;
  recheckRepository: (repository: string) => Promise<void>;
  recheckRepositories: (repositories: string[]) => Promise<void>;
  markRepositoryApplied: (repository: string) => void;
  markApplied: () => void;
  requestedRepositories: string[] | null;
  error: string | null;
  checkForUpdates: (repositories?: string[]) => Promise<void>;
  open: boolean;
  includeAdded: boolean;
  removeDeleted: boolean;
  repositories: string[] | null;
  setPreview: (preview: RepositorySyncPreviewReport | null) => void;
  setOpen: (open: boolean) => void;
  setIncludeAdded: (includeAdded: boolean) => void;
  setRemoveDeleted: (removeDeleted: boolean) => void;
  setRepositories: (repositories: string[] | null) => void;
}

let previewRequest: Promise<void> | null = null;

export const useRepositorySyncStore = create<RepositorySyncState>()(
  persist(
    (set, get) => ({
      checkedAt: {},
      ignored: [],
      setIgnored: (ignored) => set({ ignored }),
      preview: null,
      isChecking: false,
      applied: false,
      appliedRepositories: [],
      checkingRepository: null,
      markRepositoryApplied: (repository) =>
        set((state) => {
          const appliedRepositories = [
            ...new Set([...state.appliedRepositories, repository]),
          ];
          return {
            appliedRepositories,
            applied:
              !!state.preview?.repositories.length &&
              state.preview.repositories.every(
                (item) =>
                  (!item.error && !hasRepositoryChanges(item)) ||
                  appliedRepositories.includes(item.repository),
              ),
          };
        }),
      recheckRepository: (repository) => get().recheckRepositories([repository]),
      recheckRepositories: async (repositories) => {
        if (get().isChecking || get().checkingRepository || !repositories.length) return;
        const requested = [...new Set(repositories.map(repo => repo.toLowerCase()))];
        set({ checkingRepository: requested[0] });
        try {
          const report = await checkInBackground(requested);
          set((state) => ({
            preview: state.preview ? {
              ...state.preview,
              repositories: state.preview.repositories.map(item => {
                if (!requested.includes(item.repository.toLowerCase())) return item;
                const replacement = report.repositories.find(repo => repo.repository.toLowerCase() === item.repository.toLowerCase());
                return replacement ? { ...replacement, repository: item.repository } : { ...item, error: i18n.t("workflow.operationFailed") };
              }),
            } : report,
            applied: false,
            appliedRepositories: state.appliedRepositories.filter(item => !requested.includes(item.toLowerCase())),
          }));
        } catch (error) {
          set((state) => ({
            preview: state.preview ? {
              ...state.preview,
              repositories: state.preview.repositories.map(item => requested.includes(item.repository.toLowerCase()) ? { ...item, error: String(error) } : item),
            } : null,
          }));
        } finally {
          set({ checkingRepository: null });
        }
      },
      markApplied: () =>
        set((state) => ({
          applied: true,
          appliedRepositories:
            state.preview?.repositories.map((item) => item.repository) ?? [],
        })),
      requestedRepositories: null,
      error: null,
      checkForUpdates: (repositories) => {
        if (previewRequest) return previewRequest;
        if (get().checkingRepository) return Promise.resolve();
        set({
          isChecking: true,
          error: null,
          requestedRepositories: repositories ?? null,
        });
        previewRequest = (async () => {
          try {
            const preview = await checkInBackground(repositories);
            set({
              preview,
              open: true,
              includeAdded: true,
              removeDeleted: false,
              repositories: repositories ?? null,
              applied: false,
              appliedRepositories: [],
            });
          } catch (error) {
            set({ error: String(error) });
          } finally {
            set({ isChecking: false });
          }
        })().finally(() => {
          previewRequest = null;
        });
        return previewRequest;
      },
      open: false,
      includeAdded: true,
      removeDeleted: false,
      repositories: null,
      setPreview: (preview) => set({ preview }),
      setOpen: (open) => set({ open }),
      setIncludeAdded: (includeAdded) => set({ includeAdded }),
      setRemoveDeleted: (removeDeleted) => set({ removeDeleted }),
      setRepositories: (repositories) => set({ repositories }),
    }),
    {
      name: "skillshub.repository-update-preview.v1",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const saved = persisted as Partial<RepositorySyncState> | undefined;
        const repositories = saved?.preview?.repositories;
        // Remove only the exact preview seeded by the withdrawn screenshot build.
        const screenshotPreview = repositories?.length === 2 &&
          repositories.some(repo => repo.repository === "demo/engineering" &&
            repo.added.some(item => item.skillId === "new" && item.version === "demo-v2") &&
            repo.modified.some(item => item.skillId === "react-patterns" && item.version === "demo-v2")) &&
          repositories.some(repo => repo.repository === "demo/research" &&
            repo.modified.some(item => item.skillId === "research-notes" && item.version === "demo-v2"));
        return { ...current, ...saved, ...(screenshotPreview ? {
          preview: null, repositories: null, applied: false, appliedRepositories: [],
        } : {}) };
      },
      partialize: (state) => ({
        checkedAt: state.checkedAt,
        ignored: state.ignored,
        preview: state.preview,
        repositories: state.repositories,
        includeAdded: state.includeAdded,
        removeDeleted: state.removeDeleted,
        applied: state.applied,
        appliedRepositories: state.appliedRepositories,
      }),
    },
  ),
);

async function checkInBackground(
  repositories?: string[],
): Promise<RepositorySyncPreviewReport> {
  const id = useTaskQueueStore
    .getState()
    .enqueue({
      key: `check:${repositories?.slice().sort().join(",") ?? "all"}`,
      kind: "check",
      locks: repositories?.length ? repositories.map(repo => `repo:${repo.toLowerCase()}`) : ["repo:*"],
      label: i18n.t("workflow.recheck"),
      steps: [
        {
          label: i18n.t("workflow.recheck"),
          command: "preview_source_backed_resource_repository_updates",
          args: { repositories: repositories ?? null },
        },
      ],
    });
  const task = await waitForTask(id);
  if (task.status !== "success" && task.status !== "partial")
    throw new Error(task.steps.find(step => step.error)?.error ?? i18n.t("workflow.operationFailed"));
  return task.steps[0].result as RepositorySyncPreviewReport;
}
registerTaskResult("apply_repository_update_item", async (step) => {
  useRepositorySyncStore.setState((state) => {
    if (!state.preview) return {};
    const action = step.args.action;
    if (action !== "added" && action !== "modified" && action !== "deleted" && action !== "replace") return {};
    const preview = {...state.preview, repositories:state.preview.repositories.map(repo => {
      if (repo.repository.toLowerCase() !== String(step.args.repository).toLowerCase()) return repo;
      const matches = (item: (typeof repo.added)[number]) => item.skillId === step.args.skillId && (item.version ?? "") === step.args.version;
      if (action === "replace") {
        const replacement=repo.added.find(item=>item.skillId===step.args.replacementSkillId && item.version===step.args.replacementVersion);
        if (!replacement || !repo.deleted.some(matches)) return repo;
        return {...repo,deleted:repo.deleted.filter(item=>!matches(item)),added:repo.added.filter(item=>item!==replacement),
          unchanged:[...repo.unchanged.filter(item=>item.skillId!==step.args.skillId),{...replacement,skillId:String(step.args.skillId),files:[]}]};
      }
      const completed = repo[action].filter(matches);
      return {...repo, [action]:repo[action].filter(item => !matches(item)),
        unchanged: action === "deleted" ? repo.unchanged : [...repo.unchanged.filter(item => !completed.some(done => done.skillId === item.skillId)), ...completed.map(item => ({...item, files:[]}))]};
    })};
    return {preview, applied:preview.repositories.every(repo => !repo.error && !hasRepositoryChanges(repo))};
  });
  await Promise.all([
    useResourceLibraryStore.getState().loadResourceLibrary(),
    useCentralSkillsStore.getState().loadCentralSkills(),
  ]);
});

registerTaskExecutor(
  "preview_source_backed_resource_repository_updates",
  (args) =>
    useResourceLibraryStore
      .getState()
      .previewRepositorySync(args.repositories as string[] | undefined),
);

registerTaskResult("update_source_backed_resource_skill", async () => {
  await useResourceLibraryStore.getState().loadResourceLibrary();
});

registerTaskResult(
  "preview_source_backed_resource_repository_updates",
  (step, result) => {
    const rawReport = result as RepositorySyncPreviewReport;
    if (!rawReport?.repositories) return;
    const scope = Array.isArray(step.args.repositories) ? new Set((step.args.repositories as string[]).map(repo => repo.toLowerCase())) : null;
    const report = {repositories:rawReport.repositories.filter(repo => !scope || scope.has(repo.repository.toLowerCase()))};
    useRepositorySyncStore.setState((state) => ({
      checkedAt: {...state.checkedAt, ...Object.fromEntries(report.repositories.filter(repo => !repo.error).map(repo => [repo.repository.toLowerCase(), Date.now()]))},
      preview:
        step.args.repositories && state.preview
          ? {
              repositories: [
                ...state.preview.repositories.map(
                  (repo) =>
                    report.repositories.find(
                      (r) =>
                        r.repository.toLowerCase() ===
                        repo.repository.toLowerCase(),
                    ) ?? repo,
                ),
                ...report.repositories.filter(
                  (repo) =>
                    !state.preview!.repositories.some(
                      (r) =>
                        r.repository.toLowerCase() ===
                        repo.repository.toLowerCase(),
                    ),
                ),
              ],
            }
          : report,
    }));
  },
);
