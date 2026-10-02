"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { Spinner } from "@/components/dashboard/spinner";

const links = [
  { href: "/dashboard/submissions", label: "投稿审核" },
  { href: "/dashboard/videos", label: "已发布视频" },
  { href: "/dashboard/home-hero", label: "首页精选" },
  { href: "/dashboard/categories", label: "分类" },
  { href: "/dashboard/tags", label: "标签" },
  { href: "/dashboard/tone-families", label: "色族" },
  { href: "/dashboard/tones", label: "色调" },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [selectedPathname, selectPathname] = useOptimistic(pathname);
  const [isPending, startTransition] = useTransition();
  const pendingLink = isPending ? links.find((link) => link.href === selectedPathname) : undefined;

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-background md:min-h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="border-b border-border px-4 py-4">
        <p className="text-xs uppercase tracking-[0.28em] text-subtle">管理后台</p>
        <Link className="mt-2 block text-lg font-semibold text-foreground" href="/dashboard">
          雪笠微光
        </Link>
      </div>

      <nav aria-label="后台导航" aria-busy={isPending} className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-col md:overflow-visible">
        {links.map((link) => {
          const isActive = selectedPathname === link.href || selectedPathname.startsWith(`${link.href}/`);
          const isCurrent = pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              className={[
                "flex h-control shrink-0 items-center whitespace-nowrap rounded-control border px-3 text-sm transition-colors duration-150",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-transparent text-muted hover:border-borderStrong hover:text-foreground",
              ].join(" ")}
              aria-current={isCurrent ? "page" : undefined}
              href={link.href}
              key={link.href}
              onNavigate={(event) => {
                event.preventDefault();
                startTransition(() => {
                  selectPathname(link.href);
                  router.push(link.href);
                });
              }}
            >
              {link.label}
              <span className="ml-auto flex w-4 shrink-0 items-center justify-end pl-2">
                {pendingLink?.href === link.href ? <Spinner className="h-3 w-3" /> : null}
              </span>
            </Link>
          );
        })}
      </nav>
      <p aria-live="polite" className="sr-only">
        {pendingLink ? `正在打开${pendingLink.label}` : ""}
      </p>
    </aside>
  );
}
