import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <DashboardSidebar />
      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-subtle">Operations</p>
            <p className="max-w-[52vw] truncate text-sm text-muted">{user.email}</p>
          </div>
          <SignOutButton />
        </header>
        <main className="mx-auto w-full max-w-content px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
