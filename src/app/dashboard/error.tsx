"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Spinner } from "@/components/dashboard/spinner";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div aria-busy={isPending} className="admin-card space-y-4 p-6" role="alert">
      <h1 className="text-xl font-semibold">页面暂时无法加载</h1>
      <p className="text-sm text-muted">数据请求未完成，请重试。可通过左侧菜单继续访问其他页面。</p>
      <div className="flex flex-wrap gap-2">
        <button className="admin-button" disabled={isPending} onClick={retry} type="button">
          {isPending ? <><Spinner />重新加载中…</> : "重新加载"}
        </button>
        <Link className="admin-secondary-button" href="/dashboard">返回控制台</Link>
      </div>
    </div>
  );
}
