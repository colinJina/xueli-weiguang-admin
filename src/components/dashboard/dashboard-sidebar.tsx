"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard/submissions", label: "投稿审核" },
  { href: "/dashboard/videos", label: "已发布视频" },
  { href: "/dashboard/categories", label: "分类" },
  { href: "/dashboard/tags", label: "标签" },
  { href: "/dashboard/tones", label: "色调" },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-background md:min-h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="border-b border-border px-4 py-4">
        <p className="text-xs uppercase tracking-[0.28em] text-subtle">管理后台</p>
        <Link className="mt-2 block text-lg font-semibold text-foreground" href="/dashboard">
          雪笠微光
        </Link>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-col md:overflow-visible">
        {links.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              className={[
                "whitespace-nowrap border px-3 py-2 text-sm transition",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-transparent text-muted hover:border-borderStrong hover:text-foreground",
              ].join(" ")}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
