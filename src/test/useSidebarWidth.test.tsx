import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useSidebarWidth } from "@/hooks/useSidebarWidth";

describe("useSidebarWidth", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts at the default expanded width", () => {
    const { result } = renderHook(() => useSidebarWidth());

    expect(result.current.width).toBe(280);
  });

  it("clamps saved width to the supported range", () => {
    const { result } = renderHook(() => useSidebarWidth());

    act(() => result.current.setWidth(999));
    expect(result.current.width).toBe(420);

    act(() => result.current.setWidth(100));
    expect(result.current.width).toBe(240);
  });

  it("resets to the default width", () => {
    const { result } = renderHook(() => useSidebarWidth());

    act(() => result.current.setWidth(360));
    act(() => result.current.resetWidth());

    expect(result.current.width).toBe(280);
  });
}
);
