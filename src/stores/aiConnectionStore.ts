import { create } from "zustand";
import { invoke } from "@/lib/tauri";
import { AI_PROVIDERS, type RegionId } from "@/data/aiProviders";

export type AiConnection = { region: RegionId; apiKey: string; model: string; url: string };
export type AiConnections = Record<string, AiConnection>;
export const useAiConnectionStore = create<{
  load: () => Promise<{provider: string; profiles: AiConnections}>;
  save: (provider: string, profiles: AiConnections) => Promise<void>;
}>(() => ({
  load: async () => {
    const keys = ["ai_provider", "ai_region", "ai_api_key", "ai_model", "ai_api_url", "ai_connection_profiles"];
    const [provider, region, apiKey, model, url, saved] = await Promise.all(keys.map(key => invoke<string | null>("get_setting", {key})));
    const profiles: AiConnections = saved ? JSON.parse(saved) : {};
    const active = provider || "claude";
    const preset = AI_PROVIDERS.find(item => item.id === active);
    profiles[active] = {region: (region || preset?.regions[0] || "intl") as RegionId, apiKey: apiKey || "", model: model ?? preset?.defaultModel ?? "", url: url || ""};
    return {provider: active, profiles};
  },
  save: async (provider, profiles) => {
    const config = profiles[provider];
    const url = provider === "custom" ? config.url : AI_PROVIDERS.find(item => item.id === provider)?.endpoints[config.region] ?? "";
    for (const [key, value] of Object.entries({ai_connection_profiles: JSON.stringify(profiles), ai_provider: provider, ai_region: config.region, ai_api_key: config.apiKey, ai_model: config.model, ai_api_url: url})) {
      await invoke("set_setting", {key, value});
    }
  },
}));
