"use client";

import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/dashboard/spinner";

type PendingButtonProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
  formNoValidate?: boolean;
  pendingText?: string;
};

export function PendingButton({
  children,
  className = "admin-button",
  disabled = false,
  formAction,
  formNoValidate,
  pendingText,
}: PendingButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={disabled || pending}
      formAction={formAction}
      formNoValidate={formNoValidate}
      type="submit"
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {pendingText ?? "处理中…"}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
