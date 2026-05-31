import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { getAdminContext } from "@/lib/admin/auth";

export const metadata = {
  title: "Login",
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
  const errorMessage =
    error === "not_admin" || isNonAdmin
      ? "This account is signed in but is not marked as an admin."
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <section className="w-full max-w-sm border border-borderStrong bg-surface p-6">
        <div className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-[0.28em] text-subtle">Admin Console</p>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">雪笠微光</h1>
          <p className="text-sm leading-6 text-muted">Use your Supabase admin account to continue.</p>
        </div>
        {errorMessage ? (
          <div className="mb-4 border border-borderStrong bg-panel px-3 py-2 text-sm text-muted">
            {errorMessage}
          </div>
        ) : null}
        {isNonAdmin ? <SignOutButton /> : <LoginForm />}
      </section>
    </main>
  );
}
