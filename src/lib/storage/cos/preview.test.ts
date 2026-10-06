import { afterEach, describe, expect, it, vi } from "vitest";
import { CosConfigError } from "./config";
import { getCosPreviewUrl } from "./preview";

const mocks = vi.hoisted(() => ({ getObjectUrl: vi.fn(() => "https://bucket.example/cover.jpg?signature=test"), getConfig: vi.fn() }));
vi.mock("cos-nodejs-sdk-v5", () => ({ default: class { getObjectUrl = mocks.getObjectUrl; } }));
vi.mock("./config", async (importOriginal) => ({ ...await importOriginal<Record<string, unknown>>(), getCosServerConfig: mocks.getConfig }));
afterEach(() => vi.resetAllMocks());

describe("private original preview", () => {
  it("signs an expiring HTTPS GET for the requested object only", () => {
    mocks.getConfig.mockReturnValue({ bucket: "bucket", region: "region", secretId: "test-id", secretKey: "test-key" });
    expect(getCosPreviewUrl("uploads/cover.jpg")).toContain("signature=test");
    expect(mocks.getObjectUrl).toHaveBeenCalledWith({ Bucket: "bucket", Region: "region", Key: "uploads/cover.jpg", Sign: true, Method: "GET", Expires: 900, Protocol: "https:" });
  });

  it("does not generate a bucket-wide URL for a missing object reference", () => {
    expect(getCosPreviewUrl(null)).toBeNull();
    expect(getCosPreviewUrl(" ")).toBeNull();
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });

  it("keeps the queue usable when original storage is not configured", () => {
    mocks.getConfig.mockImplementation(() => { throw new CosConfigError("missing config"); });
    expect(getCosPreviewUrl("uploads/cover.jpg")).toBeNull();
    expect(mocks.getObjectUrl).not.toHaveBeenCalled();
  });
});
