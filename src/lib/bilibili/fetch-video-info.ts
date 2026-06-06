// 复制自 C:\Users\31744\Desktop\xueli-weiguang\src\lib\bilibili\fetch-video-info.ts。
// 在两个应用共享包之前，保持此辅助函数与公开站点仓库一致。

const BILIBILI_VIEW_ENDPOINT = "https://api.bilibili.com/x/web-interface/view";
const FETCH_TIMEOUT_MS = 8_000;
const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;

type BilibiliViewPayload = {
  code: number;
  message?: string;
  msg?: string;
  data?: {
    title?: string;
    pic?: string;
    desc?: string;
    duration?: number;
    pubdate?: number;
    owner?: {
      name?: string;
      face?: string;
    };
    stat?: {
      view?: number;
      like?: number;
    };
  };
};

export type BilibiliVideoInfo = {
  title: string;
  pic: string;
  desc: string;
  ownerName: string;
  ownerAvatar: string;
  viewCount: number;
  likeCount: number;
  duration: number;
  pubdate: number;
};

function buildBilibiliViewUrl(bvid: string): string {
  return `${BILIBILI_VIEW_ENDPOINT}?bvid=${encodeURIComponent(bvid)}`;
}

async function fetchBilibiliJson(
  url: string,
  signal: AbortSignal,
): Promise<BilibiliViewPayload> {
  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
      Referer: "https://www.bilibili.com",
      "User-Agent": "Mozilla/5.0 (compatible; XueliWeiguang/1.0)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Bilibili 元数据请求失败，HTTP 状态码：${response.status}`);
  }

  return (await response.json()) as BilibiliViewPayload;
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Bilibili 返回数据无效：缺少 ${fieldName}。`);
  }
}

function assertNumber(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Bilibili 返回数据无效：缺少 ${fieldName}。`);
  }
}

function assertBilibiliViewPayload(payload: BilibiliViewPayload): asserts payload is {
  code: 0;
  data: NonNullable<BilibiliViewPayload["data"]>;
} {
  if (payload.code !== 0) {
    throw new Error(payload.message ?? payload.msg ?? "Bilibili 元数据请求失败。");
  }

  if (!payload.data) {
    throw new Error("Bilibili 返回数据无效：缺少 data。");
  }

  assertString(payload.data.title, "title");
  assertString(payload.data.pic, "pic");
  assertString(payload.data.desc, "desc");
  assertNumber(payload.data.duration, "duration");
  assertNumber(payload.data.pubdate, "pubdate");

  if (!payload.data.owner) {
    throw new Error("Bilibili 返回数据无效：缺少 owner。");
  }

  if (!payload.data.stat) {
    throw new Error("Bilibili 返回数据无效：缺少 stat。");
  }

  assertString(payload.data.owner.name, "owner.name");
  assertString(payload.data.owner.face, "owner.face");
  assertNumber(payload.data.stat.view, "stat.view");
  assertNumber(payload.data.stat.like, "stat.like");
}

function mapViewPayloadToVideoInfo(
  data: NonNullable<BilibiliViewPayload["data"]>,
): BilibiliVideoInfo {
  return {
    title: data.title!,
    pic: data.pic!,
    desc: data.desc!,
    ownerName: data.owner!.name!,
    ownerAvatar: data.owner!.face!,
    viewCount: data.stat!.view!,
    likeCount: data.stat!.like!,
    duration: data.duration!,
    pubdate: data.pubdate!,
  };
}

export async function fetchBilibiliVideoInfo(bvid: string): Promise<BilibiliVideoInfo> {
  if (!BVID_PATTERN.test(bvid)) {
    throw new Error("无效的 Bilibili 视频 ID。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const payload = await fetchBilibiliJson(
      buildBilibiliViewUrl(bvid),
      controller.signal,
    );
    assertBilibiliViewPayload(payload);
    return mapViewPayloadToVideoInfo(payload.data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Bilibili 元数据请求超时。");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
