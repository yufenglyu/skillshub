import { create } from "zustand";

import type { SkillTableKind } from "@/hooks/useSkillTableColumns";
import type { SkillListViewMode } from "@/lib/skillFolders";

interface SkillBrowserUiState {
  active: boolean;
  columnKind: SkillTableKind;
  viewMode: SkillListViewMode;
  onViewModeChange?: (value: SkillListViewMode) => void;
  setControls: (options: {
    columnKind: SkillTableKind;
    viewMode: SkillListViewMode;
    onViewModeChange: (value: SkillListViewMode) => void;
  }) => void;
  clearControls: () => void;
}

export const useSkillBrowserUiStore = create<SkillBrowserUiState>((set) => ({
  active: false,
  columnKind: "skill",
  viewMode: "all",
  onViewModeChange: undefined,
  setControls: (options) =>
    set({
      active: true,
      columnKind: options.columnKind,
      viewMode: options.viewMode,
      onViewModeChange: options.onViewModeChange,
    }),
  clearControls: () =>
    set({
      active: false,
      columnKind: "skill",
      viewMode: "all",
      onViewModeChange: undefined,
    }),
}));
