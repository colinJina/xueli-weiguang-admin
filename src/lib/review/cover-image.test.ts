import { describe, expect, it } from "vitest";

import { getExternalCoverUrl, normalizeCoverUrl } from "./cover-image";

describe("review covers", () => {
  it("upgrades existing Bilibili HTTP and protocol-relative metadata", () => {
    expect(getExternalCoverUrl("http://i0.hdslb.com/bfs/archive/cover.jpg"))
      .toBe("https://i0.hdslb.com/bfs/archive/cover.jpg");
    expect(getExternalCoverUrl("//i2.hdslb.com/bfs/archive/cover.jpg"))
      .toBe("https://i2.hdslb.com/bfs/archive/cover.jpg");
  });

  it("supports both YouTube thumbnail formats", () => {
    expect(getExternalCoverUrl("https://i.ytimg.com/vi/video/hqdefault.jpg")).toBeTruthy();
    expect(getExternalCoverUrl("https://i.ytimg.com/vi_webp/video/maxresdefault.webp")).toBeTruthy();
  });

  it.each(["", "invalid", "javascript:alert(1)", "https://evil.test/cover.jpg", "https://i0.hdslb.com.evil.test/bfs/cover.jpg", "https://i0.hdslb.com:8443/bfs/cover.jpg", "https://i0.hdslb.com/other/cover.jpg", "https://user:secret@i0.hdslb.com/bfs/cover.jpg"])("does not send untrusted URL %s to the image optimizer", (url) => {
    expect(getExternalCoverUrl(url)).toBeNull();
  });

  it("keeps valid COS covers usable by the homepage preview", () => {
    expect(normalizeCoverUrl("https://media.example.test/cover.jpg")).toBe("https://media.example.test/cover.jpg");
  });
});
