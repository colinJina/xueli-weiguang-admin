"use client";

import Image from "next/image";
import { useState } from "react";
import { getExternalCoverUrl, normalizeCoverUrl } from "@/lib/review/cover-image";

export function CoverPreview({ src, title, sizes = "96px", emptyLabel = "暂无封面", contain = false, priority = false }: {
  src: string | null; title: string; sizes?: string; emptyLabel?: string; contain?: boolean; priority?: boolean;
}) {
  const normalized = normalizeCoverUrl(src);
  const external = getExternalCoverUrl(normalized);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!normalized || failedUrl === normalized) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-control border border-border bg-panel text-xs text-subtle" role="img" aria-label={`${title}：${normalized ? "封面不可用" : emptyLabel}`}>
        <svg aria-hidden="true" className="h-7 w-7 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m3 16 5-5 4 4 3-3 6 6" /></svg>
        <span>{normalized ? "封面不可用" : emptyLabel}</span>
      </div>
    );
  }
  const imageClassName = `h-full w-full ${contain ? "object-contain" : "object-cover"}`;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-control border border-border bg-panel">
      {external ? (
        <Image alt={`${title} 封面`} className={imageClassName} fill onError={() => setFailedUrl(normalized)} priority={priority} referrerPolicy="no-referrer" sizes={sizes} src={external} />
      ) : (
        // Signed COS covers stay direct so the image optimizer does not cache private previews.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`${title} 封面`} className={imageClassName} loading={priority ? "eager" : "lazy"} onError={() => setFailedUrl(normalized)} referrerPolicy="no-referrer" src={normalized} />
      )}
    </div>
  );
}
