"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Spinner } from "@/components/dashboard/spinner";
import { createClient } from "@/lib/supabase/client";

type LoginPhase = "idle" | "signing-in" | "redirecting";

function getLoginErrorMessage(code?: string) {
  switch (code) {
    case "invalid_credentials":
      return "邮箱或密码错误";
    case "email_not_confirmed":
      return "请先验证邮箱";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "操作频繁，请稍后重试";
    default:
      return "登录失败，请重试";
  }
}

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
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isSubmitting = phase !== "idle";
  const submitLabel = phase === "signing-in" ? "登录中" : phase === "redirecting" ? "进入中" : "登录";

  useEffect(() => {
    // Initialize storage/session handling while the user fills in the form.
    createClient();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setErrorMessage(null);
    setPhase("signing-in");

    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setErrorMessage(getLoginErrorMessage(error.code));
        setPhase("idle");
        return;
      }

      // Keep the form locked until navigation finishes, including the dashboard's load.
      setPhase("redirecting");
      router.replace(getSafeNextPath(searchParams.get("next")));
    } catch {
      setErrorMessage("连接失败，请重试");
      setPhase("idle");
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <fieldset aria-busy={isSubmitting} className="min-w-0 space-y-4" disabled={isSubmitting}>
        <div className="space-y-2">
          <label className="admin-label" htmlFor="email">
            邮箱
          </label>
          <input
            aria-describedby={errorMessage ? "login-error" : undefined}
            aria-invalid={Boolean(errorMessage)}
            autoComplete="email"
            className="admin-input h-control-lg"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div className="space-y-2">
          <label className="admin-label" htmlFor="password">
            密码
          </label>
          <div className="relative">
            <input
              aria-describedby={errorMessage ? "login-error" : undefined}
              aria-invalid={Boolean(errorMessage)}
              autoComplete="current-password"
              className="admin-input h-control-lg pr-12"
              id="password"
              name="password"
              required
              type={isPasswordVisible ? "text" : "password"}
            />
            <button
              aria-controls="password"
              aria-label={isPasswordVisible ? "隐藏密码" : "显示密码"}
              aria-pressed={isPasswordVisible}
              className="admin-icon-button absolute right-0 top-0"
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {isPasswordVisible ? <path d="m3 3 18 18" /> : null}
              </svg>
            </button>
          </div>
        </div>
      </fieldset>

      {errorMessage ? (
        <p className="admin-alert" id="login-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button
        aria-label={submitLabel}
        className="admin-button login-submit"
        data-loading={isSubmitting}
        disabled={isSubmitting}
        type="submit"
      >
        <span aria-live="polite" className="inline-flex items-center justify-center gap-2" role="status">
          {isSubmitting ? <Spinner /> : null}
          {submitLabel}
        </span>
        {isSubmitting ? <span aria-hidden="true" className="login-progress" /> : null}
      </button>
    </form>
  );
}
