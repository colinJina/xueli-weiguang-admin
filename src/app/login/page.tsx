import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Login",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <section className="w-full max-w-sm border border-borderStrong bg-surface p-6">
        <div className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-[0.28em] text-subtle">Admin Console</p>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">雪笺微光</h1>
          <p className="text-sm leading-6 text-muted">Use your Supabase admin account to continue.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
