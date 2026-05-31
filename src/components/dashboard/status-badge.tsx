import type { SubmissionStatus } from "@/lib/review/types";

const labels: Record<SubmissionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span className="inline-flex border border-borderStrong px-2 py-1 text-xs uppercase tracking-[0.14em] text-muted">
      {labels[status]}
    </span>
  );
}
