import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { getAdminContext } from "@/lib/admin/auth";

export const metadata = {
  title: "登录",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ error }, context] = await Promise.all([searchParams, getAdminContext()]);

  if (context.user && context.isAdmin) {
    redirect("/dashboard");
  }

  const isNonAdmin = context.user && !context.isAdmin;
  const errorMessage = error === "not_admin" || isNonAdmin ? "无管理员权限" : null;

  return (
    <main className="login-shell">
      <link crossOrigin="anonymous" href={process.env.NEXT_PUBLIC_SUPABASE_URL} rel="preconnect" />
      <section aria-labelledby="login-title" className="admin-card login-card">
        <header className="mb-6 flex flex-col items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-control-lg w-control-lg items-center justify-center rounded-control border border-borderStrong bg-panel"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
            </svg>
          </span>
          <h1 className="text-2xl font-semibold leading-8" id="login-title">
            登录
          </h1>
        </header>
        {errorMessage ? (
          <div className="admin-alert mb-6" role="alert">
            {errorMessage}
          </div>
        ) : null}
        {isNonAdmin ? (
          <div className="flex justify-center">
            <SignOutButton />
          </div>
        ) : (
          <LoginForm />
        )}
      </section>
    </main>
  );
}
