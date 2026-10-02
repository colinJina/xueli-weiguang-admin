"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { PendingButton } from "@/components/dashboard/pending-button";

type FormAction = (formData: FormData) => void | Promise<void>;

export function AdminForm({ action, children, className, label }: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return <form action={action} aria-label={label} className={className}><PendingFields>{children}</PendingFields></form>;
}

function PendingFields({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <fieldset aria-busy={pending} className="contents" disabled={pending}>{children}</fieldset>;
}

export function ConfirmDeleteButton({ action, label }: { action: FormAction; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const { pending } = useFormStatus();
  return confirming ? (
    <span className="flex flex-wrap items-center gap-2">
      <span className="w-full text-xs text-subtle">确认删除“{label}”？</span>
      <PendingButton className="admin-secondary-button" formAction={action} formNoValidate pendingText="删除中…">确认删除</PendingButton>
      <button className="admin-secondary-button" disabled={pending} onClick={() => setConfirming(false)} type="button">取消</button>
    </span>
  ) : (
    <button className="admin-secondary-button" disabled={pending} onClick={() => setConfirming(true)} type="button">删除</button>
  );
}
