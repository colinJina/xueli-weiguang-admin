"use client";

import Image from "next/image";
import { useState } from "react";

import { getExternalCoverUrl } from "@/lib/review/cover-image";

export function SubmissionCover({ src, title }: { src: string; title: string }) {
  const coverUrl = getExternalCoverUrl(src);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!coverUrl || failedUrl === coverUrl) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 border border-border bg-panel text-xs text-subtle">
        <span>封面暂时无法加载</span>
        {coverUrl ? <a href={coverUrl} referrerPolicy="no-referrer" rel="noreferrer" target="_blank" className="underline">查看原图</a> : null}
      </div>
    );
  }

  return (
    <Image
      alt={`${title} 封面`}
      className="aspect-video h-auto w-full border border-border object-cover"
      height={180}
      width={320}
      onError={() => setFailedUrl(coverUrl)}
      referrerPolicy="no-referrer"
      sizes="(max-width: 767px) 100vw, 180px"
      src={coverUrl}
    />
  );
}
