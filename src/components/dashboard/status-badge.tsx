import type { SubmissionStatus } from "@/lib/review/types";

const labels: Record<SubmissionStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span className="inline-flex rounded-badge border border-borderStrong px-2 py-1 text-xs leading-4 text-muted">
      {labels[status]}
    </span>
  );
}
