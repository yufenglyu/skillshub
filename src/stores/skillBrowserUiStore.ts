import { create } from "zustand";

import type { SkillTableKind } from "@/hooks/useSkillTableColumns";

interface SkillBrowserUiState {
  active: boolean;
  columnKind: SkillTableKind;
  showColumnSettings: boolean;
  setControls: (options: { columnKind: SkillTableKind; showColumnSettings: boolean }) => void;
  clearControls: () => void;
}

export const useSkillBrowserUiStore = create<SkillBrowserUiState>((set) => ({
  active: false,
  columnKind: "skill",
  showColumnSettings: false,
  setControls: (options) =>
    set({
      active: true,
      columnKind: options.columnKind,
      showColumnSettings: options.showColumnSettings,
    }),
  clearControls: () =>
    set({
      active: false,
      columnKind: "skill",
      showColumnSettings: false,
    }),
}));
