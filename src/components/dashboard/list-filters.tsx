"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";

import { Spinner } from "@/components/dashboard/spinner";

type Filter = {
  name: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
};

export function ListFilters({ path, query, placeholder = "搜索名称", filters = [], summary }: {
  path: string;
  query?: string;
  placeholder?: string;
  filters?: Filter[];
  summary: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim()) {params.set(key, value.trim());}
    }
    startTransition(() => router.push(`${path}${params.size ? `?${params}` : ""}`));
  }

  return (
    <div className="admin-card space-y-3 p-4">
      <form action={path} aria-busy={pending} method="get" onSubmit={submit}>
        <fieldset className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap" disabled={pending}>
          {query !== undefined ? (
            <input aria-label={placeholder} className="admin-input min-w-0 sm:w-64" defaultValue={query} maxLength={100} name="q" placeholder={placeholder} type="search" />
          ) : null}
          {filters.map((filter) => (
            <select aria-label={filter.label} className="admin-input sm:w-44" defaultValue={filter.value} key={filter.name} name={filter.name}>
              {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ))}
          <button className="admin-secondary-button" disabled={pending} type="submit">
            {pending ? <><Spinner />筛选中…</> : "筛选"}
          </button>
          <Link aria-disabled={pending} className={`admin-secondary-button${pending ? " pointer-events-none opacity-50" : ""}`} href={path}>重置</Link>
        </fieldset>
      </form>
      <p aria-live="polite" className="text-xs text-subtle">{pending ? "正在加载筛选结果…" : summary}</p>
    </div>
  );
}
