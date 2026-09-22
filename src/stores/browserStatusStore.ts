import { create } from "zustand";
export interface BrowserStats {
  path: string;
  groups: number;
  skills: number;
  selected: number;
  selectedGroups: number;
  installed: number;
  name?: string;
  collections: boolean;
}
export const useBrowserStatusStore = create<{stats: BrowserStats | null; setStats: (stats: BrowserStats) => void}>(set => ({
  stats: null,
  setStats: stats => set({stats}),
}));
