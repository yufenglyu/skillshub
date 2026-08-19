import { describe, expect, it } from "vitest";
import { webDavErrorDetail } from "@/lib/webdavError";

function t(key: string) {
  return key;
}

describe("webDavErrorDetail", () => {
  it("maps object-shaped Tauri errors instead of falling back to unknown", () => {
    expect(
      webDavErrorDetail(t, { message: "WebDAV upload failed with status 409 Conflict" })
    ).toBe("settings.webdavErrorRemote");
  });

  it("maps connection-style transport failures", () => {
    expect(webDavErrorDetail(t, { message: "WebDAV upload failed: error sending request" })).toBe(
      "settings.webdavErrorConnection"
    );
  });

  it("maps oversized backup errors", () => {
    expect(webDavErrorDetail(t, "WebDAV backup exceeds size limit")).toBe(
      "settings.webdavErrorTooLarge"
    );
  });
});
