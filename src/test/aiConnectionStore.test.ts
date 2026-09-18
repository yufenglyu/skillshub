import { expect, it, vi } from "vitest";
import { invoke } from "@/lib/tauri";
import { useAiConnectionStore } from "@/stores/aiConnectionStore";
vi.mock("@/lib/tauri", () => ({invoke:vi.fn()}));

it("loads legacy active settings and retains other saved provider profiles after saving", async () => {
  const settings = new Map<string,string>([["ai_provider","claude"],["ai_model","custom-legacy-model"],["ai_api_key","fixture-legacy-key"]]);
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    const {key,value} = args as {key:string;value:string};
    if (command === "get_setting") return settings.get(key) ?? null;
    settings.set(key,value);
  });
  const store = useAiConnectionStore.getState();
  const loaded = await store.load();
  expect(loaded.profiles.claude.model).toBe("custom-legacy-model");
  loaded.profiles.deepseek = {region:"intl",model:"custom-deepseek",apiKey:"fixture-other-key",url:""};
  await store.save("deepseek",loaded.profiles);
  const restored = await store.load();
  expect(restored.provider).toBe("deepseek");
  expect(restored.profiles.claude).toEqual(loaded.profiles.claude);
  expect(restored.profiles.deepseek.model).toBe("custom-deepseek");
  expect(restored.profiles.deepseek.apiKey).toBe("fixture-other-key");
});
