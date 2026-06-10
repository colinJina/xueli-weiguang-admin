import { randomUUID } from "node:crypto";

import type { SubmissionRow } from "../../review/types";
import {
  copyCosObject,
  deleteCosObject,
  headCosObject,
  normalizeCosEtag,
  CosObjectNotFoundError,
  type CosObjectHead,
} from "./client";
import { getCosServerConfig, type CosServerConfig } from "./config";

const videoExtensions: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const coverExtensions: Record<string, string> = {
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

export type PublishSupabaseClient = {
  rpc: (
    fn: "approve_cos_submission",
    args: {
      p_submission_id: string;
      p_video_id: string;
      p_category_id: string;
      p_playback_ref: string;
      p_cover_url: string;
      p_tag_ids: string[];
      p_tone_ids: string[];
      p_review_note: string | null;
    },
  ) => PromiseLike<{
    data: string | null;
    error: { message: string } | null;
  }>;
};

export type PublishCosSubmissionInput = {
  supabase: PublishSupabaseClient;
  submission: SubmissionRow;
  categoryId: string;
  tagIds: string[];
  toneIds: string[];
  reviewNote: string | null;
};

type PublishCosSubmissionDependencies = {
  createVideoId: () => string;
  getConfig: () => CosServerConfig;
  headObject: typeof headCosObject;
  copyObject: typeof copyCosObject;
  deleteObject: typeof deleteCosObject;
};

const defaultDependencies: PublishCosSubmissionDependencies = {
  createVideoId: randomUUID,
  getConfig: getCosServerConfig,
  headObject: headCosObject,
  copyObject: copyCosObject,
  deleteObject: deleteCosObject,
};

function assertNonEmpty(value: string | null | undefined, message: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function parseFileSize(value: number | string | null) {
  const size = Number(value);

  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("投稿视频大小缺失或无效。");
  }

  return size;
}

function getVideoExtension(mimeType: string) {
  const extension = videoExtensions[mimeType];

  if (!extension) {
    throw new Error("不支持的视频 MIME 类型。");
  }

  return extension;
}

function getCoverExtension(coverRef: string) {
  const extension = coverRef.split(".").pop()?.toLowerCase();

  if (!extension) {
    throw new Error("封面对象扩展名缺失。");
  }

  const normalized = coverExtensions[extension];

  if (!normalized) {
    throw new Error("不支持的封面对象类型。");
  }

  return normalized;
}

function buildPublicCosUrl(config: CosServerConfig, key: string) {
  const baseUrl = config.cdnDomain
    ? config.cdnDomain.replace(/\/+$/g, "")
    : `https://${config.bucket}.cos.${config.region}.myqcloud.com`;

  return `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function assertHeadMatchesSubmission(input: {
  expectedEtag: string;
  expectedMimeType: string;
  expectedSize: number;
  head: CosObjectHead;
}) {
  const actualEtag = normalizeCosEtag(input.head.etag);
  const expectedEtag = normalizeCosEtag(input.expectedEtag);

  if (!actualEtag || !expectedEtag || actualEtag !== expectedEtag) {
    throw new Error("COS 对象 ETag 与投稿记录不一致。");
  }

  if (input.head.mimeType !== input.expectedMimeType) {
    throw new Error("COS 视频 MIME 与投稿记录不一致。");
  }

  if (input.head.size !== input.expectedSize) {
    throw new Error("COS 视频大小与投稿记录不一致。");
  }
}

async function cleanupCopiedObjects(
  config: CosServerConfig,
  keys: string[],
  dependencies: Pick<PublishCosSubmissionDependencies, "deleteObject">,
) {
  const results = await Promise.allSettled(
    keys.map((key) => dependencies.deleteObject(config, key)),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to clean copied COS publish object", result.reason);
    }
  }
}

export async function publishCosSubmission(
  input: PublishCosSubmissionInput,
  dependencies: PublishCosSubmissionDependencies = defaultDependencies,
) {
  const submission = input.submission;

  if (submission.status !== "pending") {
    throw new Error("只能审核待处理投稿。");
  }

  if (submission.storage_provider !== "cos" && submission.platform !== "cos") {
    throw new Error("不支持的投稿来源。");
  }

  const sourceRef = assertNonEmpty(submission.source_ref, "COS 视频对象缺失。");
  const coverRef = assertNonEmpty(submission.cover_ref, "COS 封面对象缺失。");
  assertNonEmpty(submission.pending_title, "COS 投稿标题缺失。");
  const sourceEtag = assertNonEmpty(submission.source_etag, "COS 视频 ETag 缺失。");
  const coverEtag = assertNonEmpty(submission.cover_etag, "COS 封面 ETag 缺失。");
  const mimeType = assertNonEmpty(submission.mime_type, "COS 视频 MIME 缺失。");
  const fileSize = parseFileSize(submission.file_size);
  const videoId = dependencies.createVideoId();
  const playbackRef = `videos/${videoId}/video.${getVideoExtension(mimeType)}`;
  const coverPlaybackRef = `videos/${videoId}/cover.${getCoverExtension(coverRef)}`;
  const config = dependencies.getConfig();
  const copiedKeys: string[] = [];

  try {
    const [videoHead, coverHead] = await Promise.all([
      dependencies.headObject(config, sourceRef),
      dependencies.headObject(config, coverRef),
    ]);

    assertHeadMatchesSubmission({
      expectedEtag: sourceEtag,
      expectedMimeType: mimeType,
      expectedSize: fileSize,
      head: videoHead,
    });

    const actualCoverEtag = normalizeCosEtag(coverHead.etag);
    const expectedCoverEtag = normalizeCosEtag(coverEtag);

    if (!actualCoverEtag || !expectedCoverEtag || actualCoverEtag !== expectedCoverEtag) {
      throw new Error("COS 封面 ETag 与投稿记录不一致。");
    }

    await dependencies.copyObject({
      config,
      sourceKey: sourceRef,
      targetKey: playbackRef,
      sourceEtag: sourceEtag,
      contentType: mimeType,
    });
    copiedKeys.push(playbackRef);

    await dependencies.copyObject({
      config,
      sourceKey: coverRef,
      targetKey: coverPlaybackRef,
      sourceEtag: coverEtag,
      contentType: coverHead.mimeType,
    });
    copiedKeys.push(coverPlaybackRef);

    const { data, error } = await input.supabase.rpc("approve_cos_submission", {
      p_submission_id: submission.id,
      p_video_id: videoId,
      p_category_id: input.categoryId,
      p_playback_ref: playbackRef,
      p_cover_url: buildPublicCosUrl(config, coverPlaybackRef),
      p_tag_ids: input.tagIds,
      p_tone_ids: input.toneIds,
      p_review_note: input.reviewNote,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? videoId;
  } catch (error) {
    if (copiedKeys.length > 0) {
      await cleanupCopiedObjects(config, copiedKeys, dependencies);
    }

    if (error instanceof CosObjectNotFoundError) {
      throw new Error(error.message);
    }

    throw error;
  }
}
