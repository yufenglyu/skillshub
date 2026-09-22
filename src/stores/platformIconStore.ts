import { create } from "zustand";
import { invoke, isTauriRuntime } from "@/lib/tauri";
interface IconState {
  icons: Record<string,string>;
  load: () => Promise<void>;
  save: (agentId: string, dataUrl: string | null) => Promise<void>;
}
export const usePlatformIconStore = create<IconState>((set,get) => ({
  icons: {},
  load: async () => {
    if (!isTauriRuntime()) return;
    const icons = await invoke<Record<string,string>>("get_platform_icons");
    set({icons: icons ?? {}});
  },
  save: async (agentId,dataUrl) => {
    await invoke("set_platform_icon", {agentId,dataUrl});
    await get().load();
  },
}));
