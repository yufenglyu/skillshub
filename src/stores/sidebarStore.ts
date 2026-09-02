import { create } from "zustand";

interface SidebarState {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  expanded: true,
  setExpanded: (expanded) => set({ expanded }),
  toggleExpanded: () => set((state) => ({ expanded: !state.expanded })),
}));
