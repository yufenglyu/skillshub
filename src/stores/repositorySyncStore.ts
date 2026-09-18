import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import type { RepositorySyncPreview, RepositorySyncPreviewReport } from "@/types";

export function hasRepositoryChanges(item: RepositorySyncPreview): boolean {
  return item.added.length > 0 || item.modified.length > 0 || item.deleted.length > 0;
}

interface RepositorySyncState {
  preview: RepositorySyncPreviewReport | null;
  isChecking: boolean;
  applied: boolean;
  appliedRepositories: string[];
  checkingRepository: string | null;
  recheckRepository: (repository: string) => Promise<void>;
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

export const useRepositorySyncStore = create<RepositorySyncState>()(persist((set, get) => ({
  preview: null,
  isChecking: false,
  applied: false,
  appliedRepositories: [],
  checkingRepository: null,
  markRepositoryApplied: (repository) => set(state => {
    const appliedRepositories = [...new Set([...state.appliedRepositories, repository])];
    return { appliedRepositories, applied: !!state.preview?.repositories.length && state.preview.repositories.every(item => (!item.error && !hasRepositoryChanges(item)) || appliedRepositories.includes(item.repository)) };
  }),
  recheckRepository: async (repository) => {
    if (get().isChecking || get().checkingRepository || useResourceLibraryStore.getState().isUpdatingSources) return;
    set({checkingRepository:repository});
    try {
      const report = await useResourceLibraryStore.getState().previewRepositorySync([repository]);
      const replacement = report.repositories.find(item => item.repository.toLowerCase() === repository.toLowerCase());
      if (!replacement) throw new Error("No repository preview returned");
      set(state => ({preview: state.preview ? {...state.preview, repositories:state.preview.repositories.map(item => item.repository === repository ? {...replacement, repository} : item)} : report, applied:false, appliedRepositories:state.appliedRepositories.filter(item=>item!==repository)}));
    } catch (error) {
      set(state => ({preview: state.preview ? {...state.preview, repositories:state.preview.repositories.map(item=>item.repository === repository ? {...item,error:String(error)} : item)} : null}));
    } finally { set({checkingRepository:null}); }
  },
  markApplied: () => set(state => ({ applied: true, appliedRepositories: state.preview?.repositories.map(item => item.repository) ?? [] })),
  requestedRepositories: null,
  error: null,
  checkForUpdates: (repositories) => {
    if (previewRequest) return previewRequest;
    if (get().checkingRepository || useResourceLibraryStore.getState().isUpdatingSources) return Promise.resolve();
    set({ isChecking: true, error: null, open: false, requestedRepositories: repositories ?? null });
    previewRequest = (async () => {
      try {
        const preview = await useResourceLibraryStore.getState().previewRepositorySync(repositories);
        set({ preview, open: true, includeAdded: true, removeDeleted: false, repositories: repositories ?? null, applied: false, appliedRepositories: [] });
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
}), {
  name: "skillshub.repository-update-preview.v1",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    preview: state.preview,
    repositories: state.repositories,
    includeAdded: state.includeAdded,
    removeDeleted: state.removeDeleted,
    applied: state.applied,
    appliedRepositories: state.appliedRepositories,
  }),
}));
