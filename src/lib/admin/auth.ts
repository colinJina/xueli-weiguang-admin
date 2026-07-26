import { cache } from "react";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: {
    id: string;
    email?: string;
  };
};

// cache() 让 layout 与 page 在同一次请求内共享同一份鉴权结果，避免重复的
// getUser + profiles 网络往返。
export const getAdminContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { supabase, user: null, isAdmin: false };
  }

  const [userResult, profileResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle(),
  ]);

  const user = userResult.data.user;

  if (!user) {
    return { supabase, user: null, isAdmin: false };
  }

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  return {
    supabase,
    user: {
      id: user.id,
      email: user.email,
    },
    isAdmin: Boolean(profileResult.data?.is_admin),
  };
});

export async function requireAdmin(): Promise<AdminContext> {
  const context = await getAdminContext();

  if (!context.user) {
    redirect("/login");
  }

  if (!context.isAdmin) {
    redirect("/login?error=not_admin");
  }

  return {
    supabase: context.supabase,
    user: context.user,
  };
}
