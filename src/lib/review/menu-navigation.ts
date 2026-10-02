import { coerceSubmissionPage } from "@/lib/review/submission-navigation";
import type { HomeHeroFeatureRequestStatus, SubmissionStorageProvider } from "@/lib/review/types";

export type MenuSearchParams = Record<string, string | string[] | undefined>;
export type VideoSourceFilter = SubmissionStorageProvider | "all";
export type HomeHeroStatusFilter = HomeHeroFeatureRequestStatus | "all";

export function normalizeSearch(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

export function coerceVideoSource(value: unknown): VideoSourceFilter {
  return value === "bilibili" || value === "youtube" || value === "cos" ? value : "all";
}

export function coerceHomeHeroStatus(value: unknown): HomeHeroStatusFilter {
  return value === "applied" || value === "rejected" || value === "all" ? value : "pending";
}

export function buildMenuHref(path: string, values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "" && !(key === "page" && value === 1)) {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

// Only rebuild parameters supported by this exact menu; never redirect to a form-supplied URL.
export function getMenuReturnPath(path: string, value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith(`${path}?`)) {
    return path;
  }
  const params = new URLSearchParams(value.slice(path.length + 1));
  if (path === "/dashboard/videos") {
    const source = coerceVideoSource(params.get("source"));
    return buildMenuHref(path, {
      q: normalizeSearch(params.get("q")),
      source: source === "all" ? undefined : source,
      page: coerceSubmissionPage(params.get("page") ?? undefined),
    });
  }
  if (path === "/dashboard/home-hero") {
    const status = coerceHomeHeroStatus(params.get("status"));
    return buildMenuHref(path, {
      status: status === "pending" ? undefined : status,
      page: coerceSubmissionPage(params.get("page") ?? undefined),
    });
  }
  const family = params.get("family");
  const active = params.get("active");
  return buildMenuHref(path, {
    q: normalizeSearch(params.get("q")),
    family: path === "/dashboard/tones" && family && /^(unassigned|[0-9a-f-]{36})$/i.test(family) ? family : undefined,
    active: path === "/dashboard/tone-families" && (active === "enabled" || active === "disabled") ? active : undefined,
  });
}

export function matchesSearch(query: string, ...values: Array<string | null | undefined>) {
  const normalized = normalizeSearch(query).toLocaleLowerCase("zh-CN");
  return !normalized || values.some((value) => value?.toLocaleLowerCase("zh-CN").includes(normalized));
}

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
