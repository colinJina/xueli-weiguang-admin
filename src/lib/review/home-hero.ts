import type { HomeHeroFeatureRequestRow } from "@/lib/review/types";

export function getHomeHeroRequestApplyDisabledMessage(
  request: HomeHeroFeatureRequestRow,
) {
  if (request.request_status !== "pending") {
    return "只能处理待处理的首页精选申请。";
  }

  if (request.submission_status !== "approved") {
    return "投稿通过审核后才能设为首页精选。";
  }

  if (!request.video_id) {
    return "该投稿还没有生成公开视频。";
  }

  if (!request.published_at) {
    return "视频发布后才能设为首页精选。";
  }

  if (!request.cover_url) {
    return "视频缺少封面，不能设为首页精选。";
  }

  return null;
}
