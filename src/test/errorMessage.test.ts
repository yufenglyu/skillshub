import { describe, expect, it } from "vitest";
import { toErrorMessage } from "@/lib/errorMessage";

describe("toErrorMessage", () => {
  it("keeps string errors", () => {
    expect(toErrorMessage("WebDAV upload failed with status 409")).toBe(
      "WebDAV upload failed with status 409"
    );
  });

  it("reads message from Error instances", () => {
    expect(toErrorMessage(new Error("request timed out"))).toBe("request timed out");
  });

  it("reads message from Tauri-style error objects", () => {
    expect(toErrorMessage({ message: "WebDAV upload failed: error sending request" })).toBe(
      "WebDAV upload failed: error sending request"
    );
  });

  it("does not stringify objects as [object Object]", () => {
    expect(toErrorMessage({ code: 1, message: "WebDAV upload failed with status 405" })).not.toBe(
      "[object Object]"
    );
  });
});
