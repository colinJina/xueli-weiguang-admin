import { deleteCosObject } from "./client";
import { getCosServerConfig, type CosServerConfig } from "./config";

const PUBLISHED_VIDEO_KEY_PATTERN = /^videos\/([^/]+)\/video\.(mp4|webm)$/;
const PUBLISHED_COVER_KEY_PATTERN = /^videos\/([^/]+)\/cover\.(jpg|png|webp)$/;

export type PublishedCosVideo = {
  cover_url: string | null;
  id: string;
  playback_ref: string | null;
};

export type DeletePublishedCosObjectsDependencies = {
  deleteObject: typeof deleteCosObject;
  getConfig: () => CosServerConfig;
};

const defaultDependencies: DeletePublishedCosObjectsDependencies = {
  deleteObject: deleteCosObject,
  getConfig: getCosServerConfig,
};

function decodePathname(pathname: string) {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

function parseCoverKey(coverUrl: string) {
  try {
    return decodePathname(new URL(coverUrl).pathname);
  } catch {
    throw new Error("COS 发布封面 URL 无效。");
  }
}

export function resolvePublishedCosObjectKeys(video: PublishedCosVideo) {
  const videoKey = video.playback_ref?.trim();
  const coverUrl = video.cover_url?.trim();

  if (!videoKey || PUBLISHED_VIDEO_KEY_PATTERN.exec(videoKey)?.[1] !== video.id) {
    throw new Error("COS 发布视频对象不匹配。");
  }

  if (!coverUrl) {
    throw new Error("COS 发布封面对象缺失。");
  }

  const coverKey = parseCoverKey(coverUrl);

  if (PUBLISHED_COVER_KEY_PATTERN.exec(coverKey)?.[1] !== video.id) {
    throw new Error("COS 发布封面对象不匹配。");
  }

  return [videoKey, coverKey];
}

export async function deletePublishedCosObjects(
  video: PublishedCosVideo,
  dependencies: DeletePublishedCosObjectsDependencies = defaultDependencies,
) {
  const config = dependencies.getConfig();
  const keys = resolvePublishedCosObjectKeys(video);

  for (const key of keys) {
    await dependencies.deleteObject(config, key);
  }

  return keys;
}
