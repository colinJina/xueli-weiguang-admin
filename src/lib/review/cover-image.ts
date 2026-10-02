export function normalizeCoverUrl(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

export function getExternalCoverUrl(value: string | null | undefined) {
  const normalized = normalizeCoverUrl(value);
  if (!normalized) {
    return null;
  }
  const url = new URL(normalized);
  const isBilibili = /^i[0-2]\.hdslb\.com$/.test(url.hostname) && url.pathname.startsWith("/bfs/");
  const isYouTube = url.hostname === "i.ytimg.com" && /^\/vi(?:_webp)?\//.test(url.pathname);
  return !url.port && (isBilibili || isYouTube) ? normalized : null;
}
