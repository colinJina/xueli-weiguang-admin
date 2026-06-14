// 复制自 C:\Users\31744\Desktop\xueli-weiguang\src\lib\youtube\fetch-video-info.ts。
// 在两个应用共享包之前，保持此辅助函数与公开站点仓库一致。

import "server-only";

import { Innertube } from "youtubei.js";

import type { ReviewFetchedMeta } from "@/lib/review/fetched-meta";

const FETCH_TIMEOUT_MS = 10_000;
const YOUTUBE_VIDEO_ID_PATTERN = /^[0-9A-Za-z_-]{11}$/;

type YouTubeThumbnail = {
  url?: string;
  width?: number;
};

type YouTubeBasicInfo = {
  basic_info?: {
    title?: string;
    short_description?: string;
    author?: string;
    thumbnail?: YouTubeThumbnail[];
    view_count?: number;
    like_count?: number;
    duration?: number;
  };
};

type YouTubeClient = {
  getBasicInfo(videoId: string): Promise<YouTubeBasicInfo>;
};

type FetchYouTubeVideoInfoOptions = {
  createClient?: () => Promise<YouTubeClient>;
  timeoutMs?: number;
};

export type YouTubeVideoInfo = ReviewFetchedMeta;

async function createDefaultClient(): Promise<YouTubeClient> {
  return Innertube.create({
    lang: "zh-CN",
    location: "US",
    retrieve_player: false,
    enable_session_cache: false,
    enable_safety_mode: true,
  });
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid YouTube payload: ${fieldName} is missing.`);
  }
}

function assertNumber(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid YouTube payload: ${fieldName} is missing.`);
  }
}

function pickBestThumbnail(thumbnails: YouTubeThumbnail[] | undefined) {
  const sorted = [...(thumbnails ?? [])]
    .filter((thumbnail) => typeof thumbnail.url === "string" && thumbnail.url)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

  return sorted[0]?.url ?? "";
}

function mapYouTubePayloadToVideoInfo(payload: YouTubeBasicInfo): YouTubeVideoInfo {
  const basicInfo = payload.basic_info;

  if (!basicInfo) {
    throw new Error("Invalid YouTube payload: basic_info is missing.");
  }

  const pic = pickBestThumbnail(basicInfo.thumbnail);

  assertString(basicInfo.title, "title");
  assertString(pic, "thumbnail");
  assertString(basicInfo.author, "author");
  assertNumber(basicInfo.view_count, "view_count");

  return {
    title: basicInfo.title,
    pic,
    desc: basicInfo.short_description ?? "",
    ownerName: basicInfo.author,
    ownerAvatar: "",
    viewCount: basicInfo.view_count,
    likeCount: basicInfo.like_count ?? 0,
    duration: basicInfo.duration ?? 0,
    pubdate: 0,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("YouTube metadata request timed out."));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

export async function fetchYouTubeVideoInfo(
  videoId: string,
  options: FetchYouTubeVideoInfoOptions = {},
): Promise<YouTubeVideoInfo> {
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error("Invalid YouTube video id.");
  }

  const client = await withTimeout(
    (options.createClient ?? createDefaultClient)(),
    options.timeoutMs ?? FETCH_TIMEOUT_MS,
  );
  const payload = await withTimeout(
    client.getBasicInfo(videoId),
    options.timeoutMs ?? FETCH_TIMEOUT_MS,
  );

  return mapYouTubePayloadToVideoInfo(payload);
}
