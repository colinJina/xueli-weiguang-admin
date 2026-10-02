"use client";

import Image from "next/image";
import { useState } from "react";
import { getExternalCoverUrl, normalizeCoverUrl } from "@/lib/review/cover-image";

export function CoverPreview({ src, title }: { src: string | null; title: string }) {
  const normalized = normalizeCoverUrl(src);
  const external = getExternalCoverUrl(normalized);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!normalized || failedUrl === normalized) {
    return <div className="flex aspect-video w-full items-center justify-center border border-border bg-panel text-xs text-subtle">{normalized ? "封面不可用" : "无封面"}</div>;
  }
  return external ? (
    <Image alt={`${title} 封面`} className="aspect-video h-auto w-full border border-border object-cover" height={90} width={160} onError={() => setFailedUrl(normalized)} referrerPolicy="no-referrer" sizes="96px" src={external} />
  ) : (
    // COS covers are displayed directly without extending the image optimizer's whitelist.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={`${title} 封面`} className="aspect-video w-full border border-border object-cover" loading="lazy" onError={() => setFailedUrl(normalized)} referrerPolicy="no-referrer" src={normalized} />
  );
}
