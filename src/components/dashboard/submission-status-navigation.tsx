"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import type { ReactNode } from "react";

import { Spinner } from "@/components/dashboard/spinner";
import { buildSubmissionsHref, submissionStatusTabs } from "@/lib/review/submission-navigation";
import type { SubmissionStatusFilter } from "@/lib/review/types";

export function SubmissionStatusNavigation({
  children,
  status,
}: {
  children: ReactNode;
  status: SubmissionStatusFilter;
}) {
  const router = useRouter();
  const [selectedStatus, selectStatus] = useOptimistic(status);
  const [isPending, startTransition] = useTransition();
  const selectedLabel = submissionStatusTabs.find((tab) => tab.value === selectedStatus)?.label;

  return (
    <div className="space-y-5">
      <nav aria-label="状态筛选" aria-busy={isPending} className="flex flex-wrap gap-2">
        {submissionStatusTabs.map((tab) => {
          const isActive = tab.value === selectedStatus;
          return (
            <Link
              aria-current={tab.value === status ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-control border px-3 py-1.5 text-xs uppercase tracking-[0.16em] transition-colors ${
                isActive
                  ? "border-borderStrong bg-panel text-foreground"
                  : "border-border text-subtle hover:border-borderStrong hover:text-foreground"
              }`}
              href={buildSubmissionsHref(tab.value)}
              key={tab.value}
              prefetch={false}
              onNavigate={(event) => {
                event.preventDefault();
                startTransition(() => {
                  selectStatus(tab.value);
                  router.push(buildSubmissionsHref(tab.value), { scroll: false });
                });
              }}
            >
              {tab.label}
              {isPending && isActive ? <Spinner className="h-3 w-3" /> : null}
            </Link>
          );
        })}
      </nav>
      <p aria-live="polite" className={isPending ? "text-xs text-subtle" : "sr-only"}>
        {isPending ? `正在加载${selectedLabel}投稿…` : ""}
      </p>
      <div aria-busy={isPending} className={`space-y-5 ${isPending ? "opacity-50" : ""}`} inert={isPending}>
        {children}
      </div>
    </div>
  );
}
