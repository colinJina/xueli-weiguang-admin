import type { SubmissionStatusFilter } from "@/lib/review/types";

export const SUBMISSIONS_PATH = "/dashboard/submissions";

export const submissionStatusTabs: Array<{ label: string; value: SubmissionStatusFilter }> = [
  { label: "待审核", value: "pending" },
  { label: "已通过", value: "approved" },
  { label: "已拒绝", value: "rejected" },
  { label: "全部", value: "all" },
];

export function coerceSubmissionStatus(value: string | undefined): SubmissionStatusFilter {
  return value === "approved" || value === "rejected" || value === "all" ? value : "pending";
}

export function coerceSubmissionPage(value: string | number | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= 1_000_000 ? page : 1;
}

export function buildSubmissionsHref(status: SubmissionStatusFilter, page = 1) {
  const params = new URLSearchParams();
  if (status !== "pending") {
    params.set("status", status);
  }
  if (page > 1) {
    params.set("page", String(coerceSubmissionPage(page)));
  }
  const query = params.toString();
  return query ? `${SUBMISSIONS_PATH}?${query}` : SUBMISSIONS_PATH;
}

// Rebuild the local URL from allowed parameters instead of trusting a form URL.
export function getSubmissionReturnPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith(`${SUBMISSIONS_PATH}?`)) {
    return SUBMISSIONS_PATH;
  }
  const params = new URLSearchParams(value.slice(SUBMISSIONS_PATH.length + 1));
  return buildSubmissionsHref(
    coerceSubmissionStatus(params.get("status") ?? undefined),
    coerceSubmissionPage(params.get("page") ?? undefined),
  );
}
