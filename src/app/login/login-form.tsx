"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Spinner } from "@/components/dashboard/spinner";
import { createClient } from "@/lib/supabase/client";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.replace(getSafeNextPath(searchParams.get("next")));
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-[0.18em] text-subtle" htmlFor="email">
          邮箱
        </label>
        <input
          autoComplete="email"
          className="admin-input"
          id="email"
          name="email"
          placeholder="admin@example.com"
          required
          type="email"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-[0.18em] text-subtle" htmlFor="password">
          密码
        </label>
        <input
          autoComplete="current-password"
          className="admin-input"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      {errorMessage ? (
        <p className="border border-borderStrong bg-panel px-3 py-2 text-sm text-muted" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button className="admin-button w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            正在登录…
          </span>
        ) : (
          "登录"
        )}
      </button>
    </form>
  );
}
