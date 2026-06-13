import {
  deletePublishedCosObjects,
  type DeletePublishedCosObjectsDependencies,
} from "../storage/cos/delete-published";

type PublishedVideoDeleteRow = {
  cover_url: string | null;
  id: string;
  platform: string;
  playback_ref: string | null;
  storage_provider: string | null;
};

type SupabaseResult<T> = PromiseLike<{
  data: T | null;
  error: { message: string } | null;
}>;

export type DeletePublishedVideoSupabaseClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => SupabaseResult<PublishedVideoDeleteRow>;
      };
    };
  };
  rpc: (
    fn: string,
    args: { p_video_id: string },
  ) => SupabaseResult<string>;
};

export type DeletePublishedVideoDependencies = DeletePublishedCosObjectsDependencies;

function isCosPublishedVideo(video: PublishedVideoDeleteRow) {
  return video.storage_provider === "cos" || video.platform === "cos";
}

export async function deletePublishedVideoRecord(
  input: {
    supabase: DeletePublishedVideoSupabaseClient;
    videoId: string;
  },
  dependencies?: DeletePublishedVideoDependencies,
) {
  const videoId = input.videoId.trim();

  if (!videoId) {
    throw new Error("缺少视频 ID。");
  }

  const { data: video, error: loadError } = await input.supabase
    .from("videos")
    .select("id,platform,storage_provider,playback_ref,cover_url")
    .eq("id", videoId)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }

  if (!video) {
    throw new Error("公开视频不存在。");
  }

  if (isCosPublishedVideo(video)) {
    await deletePublishedCosObjects(video, dependencies);
  }

  const { error: deleteError } = await input.supabase.rpc("delete_published_video", {
    p_video_id: video.id,
  });

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  return video.id;
}
