import { create } from "zustand";

export type AppTaskStatus = "idle" | "running" | "success" | "error";

export interface AppStatusTask {
  id: string;
  label: string;
  status: AppTaskStatus;
  detail?: string | null;
  updatedCount?: number | null;
  unchangedCount?: number | null;
  skippedCount?: number | null;
  failedCount?: number | null;
  currentCount?: number | null;
  totalCount?: number | null;
  error?: string | null;
  items?: AppStatusTaskItem[];
  onRetryFailedItem?: (item: AppStatusTaskItem) => void;
  onManualCheckFailedItem?: (item: AppStatusTaskItem) => void;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface AppStatusTaskItem {
  skillId?: string | null;
  name: string;
  status: "updated" | "unchanged" | "skipped" | "failed" | "info";
  repository?: string | null;
  detail?: string | null;
}

interface AppStatusState {
  task: AppStatusTask | null;
  startTask: (task: Pick<AppStatusTask, "id" | "label"> & Partial<AppStatusTask>) => void;
  updateTask: (patch: Partial<AppStatusTask>) => void;
  completeTask: (patch?: Partial<AppStatusTask>) => void;
  failTask: (patch: Partial<AppStatusTask> & { error?: string | null }) => void;
  resetStatus: () => void;
}

function nowIso() {
  return new Date().toISOString();
}

export const useAppStatusStore = create<AppStatusState>((set, get) => ({
  task: null,

  startTask: (task) =>
    set({
      task: {
        ...task,
        status: "running",
        error: null,
        startedAt: task.startedAt ?? nowIso(),
        completedAt: null,
      },
    }),

  updateTask: (patch) =>
    set((state) => ({
      task: state.task ? { ...state.task, ...patch } : null,
    })),

  completeTask: (patch = {}) => {
    const task = get().task;
    if (!task) return;
    set({
      task: {
        ...task,
        ...patch,
        status: "success",
        error: null,
        completedAt: patch.completedAt ?? nowIso(),
      },
    });
  },

  failTask: (patch) => {
    const task = get().task;
    if (!task) return;
    set({
      task: {
        ...task,
        ...patch,
        status: "error",
        completedAt: patch.completedAt ?? nowIso(),
      },
    });
  },

  resetStatus: () => set({ task: null }),
}));
