import { describe, expect, it, vi } from "vitest";

import type { ReviewPaletteColor } from "../../review/palette";
import type { SubmissionRow } from "../../review/types";
import type { CosObjectHead } from "./client";
import type { CosServerConfig } from "./config";
import { publishCosSubmission, type PublishSupabaseClient } from "./publish";

const videoId = "a167fcf0-1bdf-4c5f-bf67-8737bdf19313";
const videoKey = `videos/${videoId}/video.mp4`;
const coverKey = `videos/${videoId}/cover.png`;

const submission: SubmissionRow = {
  id: "e741ab94-a7c3-468e-9fdb-f6ffb777a77d",
  user_id: "2e54d033-d698-4f6c-88c4-8f2033b9ac37",
  platform: "cos",
  storage_provider: "cos",
  source_url: null,
  external_id: "original-video",
  status: "pending",
  auto_fetched_meta: {},
  fetched_at: null,
  fetch_error: null,
  pending_title: "Original video",
  pending_description: null,
  file_size: 4096,
  mime_type: "video/mp4",
  source_ref: "submissions/original/video.mp4",
  cover_ref: "submissions/original/cover.png",
  source_etag: '"video-etag"',
  cover_etag: '"cover-etag"',
  reviewed_by: null,
  review_note: null,
  created_at: "2026-10-03T00:00:00Z",
  reviewed_at: null,
};

const config: CosServerConfig = {
  region: "ap-test",
  bucket: "test-bucket",
  secretId: "fake-secret-id",
  secretKey: "fake-secret-key",
  cdnDomain: "https://cdn.example.test/",
  maxBytes: 52_428_800,
};

function fixture(palette: ReviewPaletteColor[] = []) {
  const rpc = vi.fn<PublishSupabaseClient["rpc"]>().mockResolvedValue({
    data: videoId,
    error: null,
  });
  const headObject = vi.fn(async (_config: CosServerConfig, key: string): Promise<CosObjectHead> => ({
    key,
    size: key === submission.source_ref ? 4096 : 512,
    mimeType: key === submission.source_ref ? "video/mp4" : "image/png",
    etag: key === submission.source_ref ? "VIDEO-ETAG" : "COVER-ETAG",
  }));
  const copyObject = vi.fn(async () => ({ etag: "copied-etag" }));
  const deleteObject = vi.fn(async (_config: CosServerConfig, _key: string) => undefined);
  const dependencies: NonNullable<Parameters<typeof publishCosSubmission>[1]> = {
    createVideoId: () => videoId,
    getConfig: () => config,
    headObject,
    copyObject,
    deleteObject,
  };
  const input = {
    supabase: { rpc },
    submission,
    categoryId: "7682737c-c700-4340-9dd8-09ec5eaa7356",
    tagIds: ["9d0f727a-f8ce-4dc7-a0ac-e2b17c254f34"],
    palette,
    reviewNote: "确认发布",
  };

  return { input, dependencies, rpc, headObject, copyObject, deleteObject };
}

describe("publishCosSubmission palette publication", () => {
  it("publishes all five colors in order with their original percentages through the palette RPC", async () => {
    const palette: ReviewPaletteColor[] = [
      { hex: "#CF3030", percentage: 0.45 },
      { hex: "#4466AA", percentage: 0.2 },
      { hex: "#FFFFFF", percentage: null },
      { hex: "#000000", percentage: 0 },
      { hex: "#33AA77", percentage: 0.15 },
    ];
    const { input, dependencies, rpc, copyObject, deleteObject } = fixture(palette);

    await expect(publishCosSubmission(input, dependencies)).resolves.toBe(videoId);

    expect(rpc).toHaveBeenCalledExactlyOnceWith("approve_cos_submission_with_palette", {
      p_submission_id: submission.id,
      p_video_id: videoId,
      p_category_id: input.categoryId,
      p_playback_ref: videoKey,
      p_cover_url: `https://cdn.example.test/${coverKey}`,
      p_tag_ids: input.tagIds,
      p_palette: palette,
      p_review_note: "确认发布",
    });
    expect(copyObject).toHaveBeenNthCalledWith(1, {
      config,
      sourceKey: submission.source_ref,
      targetKey: videoKey,
      sourceEtag: submission.source_etag,
      contentType: "video/mp4",
    });
    expect(copyObject).toHaveBeenNthCalledWith(2, {
      config,
      sourceKey: submission.cover_ref,
      targetKey: coverKey,
      sourceEtag: submission.cover_etag,
      contentType: "image/png",
    });
    expect(copyObject.mock.invocationCallOrder[1]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("removes both published copies when the database rejects the palette transaction", async () => {
    const { input, dependencies, rpc, deleteObject } = fixture([
      { hex: "#CF3030", percentage: null },
    ]);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "palette transaction rejected" } });

    await expect(publishCosSubmission(input, dependencies)).rejects.toThrow("palette transaction rejected");

    expect(deleteObject.mock.calls).toEqual([[config, videoKey], [config, coverKey]]);
    expect(deleteObject).not.toHaveBeenCalledWith(config, submission.source_ref);
    expect(deleteObject).not.toHaveBeenCalledWith(config, submission.cover_ref);
  });

  it("also removes both copies if the RPC request rejects before returning a response", async () => {
    const { input, dependencies, rpc, deleteObject } = fixture();
    const rpcError = new Error("database connection failed");
    rpc.mockRejectedValueOnce(rpcError);

    await expect(publishCosSubmission(input, dependencies)).rejects.toBe(rpcError);

    expect(deleteObject.mock.calls).toEqual([[config, videoKey], [config, coverKey]]);
  });

  it("removes only the completed video copy when copying the cover fails", async () => {
    const { input, dependencies, rpc, copyObject, deleteObject } = fixture();
    const copyError = new Error("cover copy failed");
    copyObject.mockResolvedValueOnce({ etag: "copied-video" }).mockRejectedValueOnce(copyError);

    await expect(publishCosSubmission(input, dependencies)).rejects.toBe(copyError);

    expect(deleteObject).toHaveBeenCalledExactlyOnceWith(config, videoKey);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not publish or delete source objects when the first copy fails", async () => {
    const { input, dependencies, rpc, copyObject, deleteObject } = fixture();
    const copyError = new Error("video copy failed");
    copyObject.mockRejectedValueOnce(copyError);

    await expect(publishCosSubmission(input, dependencies)).rejects.toBe(copyError);

    expect(copyObject).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

it("publishes QuickTime with a MOV key and the original content type", async () => {
  const { input, dependencies, headObject, copyObject, rpc } = fixture();
  input.submission = { ...submission, mime_type: "video/quicktime", source_ref: "submissions/original/video.mov" };
  headObject.mockImplementation(async (_config, key) => ({
    key, size: key === input.submission.source_ref ? 4096 : 512,
    mimeType: key === input.submission.source_ref ? "video/quicktime" : "image/png",
    etag: key === input.submission.source_ref ? "VIDEO-ETAG" : "COVER-ETAG",
  }));
  await expect(publishCosSubmission(input, dependencies)).resolves.toBe(videoId);
  expect(copyObject).toHaveBeenNthCalledWith(1, expect.objectContaining({
    targetKey: "videos/" + videoId + "/video.mov", contentType: "video/quicktime",
  }));
  expect(rpc).toHaveBeenCalledWith("approve_cos_submission_with_palette", expect.objectContaining({
    p_playback_ref: "videos/" + videoId + "/video.mov",
  }));
});
