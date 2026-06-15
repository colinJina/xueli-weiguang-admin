

import "server-only";

import { Innertube } from "youtubei.js";

import type { ReviewFetchedMeta } from "@/lib/review/fetched-meta";

const FETCH_TIMEOUT_MS = 10_000;
const YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
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

type YouTubeOEmbedPayload = {
  author_name?: unknown;
  thumbnail_url?: unknown;
  title?: unknown;
};

type YouTubeClient = {
  getBasicInfo(videoId: string): Promise<YouTubeBasicInfo>;
};

type FetchYouTubeVideoInfoOptions = {
  createClient?: () => Promise<YouTubeClient>;
  fetchOEmbed?: typeof fetch;
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

function getTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapYouTubePayloadToVideoInfo(
  payload: YouTubeBasicInfo,
  fallback?: Pick<YouTubeVideoInfo, "ownerName" | "pic" | "title">,
): YouTubeVideoInfo {
  const basicInfo = payload.basic_info;

  if (!basicInfo) {
    throw new Error("Invalid YouTube payload: basic_info is missing.");
  }

  const title = getTrimmedString(basicInfo.title) ?? fallback?.title;
  const pic = getTrimmedString(pickBestThumbnail(basicInfo.thumbnail)) ?? fallback?.pic;
  const ownerName = getTrimmedString(basicInfo.author) ?? fallback?.ownerName;
  const viewCount =
    typeof basicInfo.view_count === "number" && !Number.isNaN(basicInfo.view_count)
      ? basicInfo.view_count
      : fallback
        ? 0
        : undefined;

  assertString(title, "title");
  assertString(pic, "thumbnail");
  assertString(ownerName, "author");
  assertNumber(viewCount, "view_count");

  return {
    title,
    pic,
    desc: basicInfo.short_description ?? "",
    ownerName,
    ownerAvatar: "",
    viewCount,
    likeCount: basicInfo.like_count ?? 0,
    duration: basicInfo.duration ?? 0,
    pubdate: 0,
  };
}

function mapOEmbedPayloadToVideoInfo(payload: YouTubeOEmbedPayload): YouTubeVideoInfo {
  const title = getTrimmedString(payload.title);
  const pic = getTrimmedString(payload.thumbnail_url);
  const ownerName = getTrimmedString(payload.author_name);

  assertString(title, "title");
  assertString(pic, "thumbnail");
  assertString(ownerName, "author");

  return {
    title,
    pic,
    desc: "",
    ownerName,
    ownerAvatar: "",
    viewCount: 0,
    likeCount: 0,
    duration: 0,
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

async function fetchYouTubeOEmbedInfo(
  videoId: string,
  fetchOEmbed: typeof fetch,
  timeoutMs: number,
) {
  const endpoint = new URL(YOUTUBE_OEMBED_ENDPOINT);
  endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  endpoint.searchParams.set("format", "json");

  const response = await withTimeout(fetchOEmbed(endpoint), timeoutMs);

  if (!response.ok) {
    throw new Error(`YouTube oEmbed request failed with status ${response.status}.`);
  }

  return mapOEmbedPayloadToVideoInfo((await response.json()) as YouTubeOEmbedPayload);
}

export async function fetchYouTubeVideoInfo(
  videoId: string,
  options: FetchYouTubeVideoInfoOptions = {},
): Promise<YouTubeVideoInfo> {
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error("Invalid YouTube video id.");
  }

  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  let payload: YouTubeBasicInfo | null = null;
  let primaryError: unknown;

  try {
    const client = await withTimeout((options.createClient ?? createDefaultClient)(), timeoutMs);
    payload = await withTimeout(client.getBasicInfo(videoId), timeoutMs);

    return mapYouTubePayloadToVideoInfo(payload);
  } catch (error) {
    primaryError = error;
  }

  try {
    const fallback = await fetchYouTubeOEmbedInfo(videoId, options.fetchOEmbed ?? fetch, timeoutMs);

    return payload?.basic_info ? mapYouTubePayloadToVideoInfo(payload, fallback) : fallback;
  } catch {
    throw primaryError;
  }
}
