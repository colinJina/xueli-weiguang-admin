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

const getVerifiedContext = cache(async () => {
  const supabase = await createClient();
  // getClaims verifies signature/expiry with cached public keys. Legacy
  // symmetric keys automatically fall back to an Auth server check.
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) {
    return { supabase, user: null };
  }

  const claims = data.claims;
  return {
    supabase,
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
    },
  };
});

// Share authorization only within one render/request. Never cache admin roles
// across requests: revoking profiles.is_admin must take effect immediately.
export const getAdminContext = cache(async (verifyCurrentUser = false) => {
  const { supabase, user } = await getVerifiedContext();
  if (!user) {
    return { supabase, user: null, isAdmin: false };
  }

  const [profileResult, currentUserResult] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    // Mutations still check the current Auth user, including bans/deletion.
    // Run this alongside the role lookup to avoid another network waterfall.
    verifyCurrentUser ? supabase.auth.getUser() : Promise.resolve(null),
  ]);

  if (verifyCurrentUser && (
    !currentUserResult || currentUserResult.error || currentUserResult.data.user?.id !== user.id
  )) {
    return { supabase, user: null, isAdmin: false };
  }

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  return {
    supabase,
    user: {
      id: user.id,
      email: currentUserResult?.data.user?.email ?? user.email,
    },
    isAdmin: Boolean(profileResult.data?.is_admin),
  };
});

export async function requireAdmin(verifyCurrentUser = false): Promise<AdminContext> {
  const context = verifyCurrentUser ? await getAdminContext(true) : await getAdminContext();

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

export async function requireAdminForAction(): Promise<AdminContext> {
  return requireAdmin(true);
}

// Only use for read-only queries with the user's RLS-protected client. Start
// reads alongside the live role check, but never expose data before it passes.
export async function loadAdminPageData<T>(
  load: (supabase: AdminContext["supabase"]) => Promise<T>,
): Promise<T> {
  const { supabase, user } = await getVerifiedContext();
  if (!user) {
    redirect("/login");
  }

  // Handle early read failures immediately so authorization still determines
  // whether this request redirects, and rejected reads cannot go unhandled.
  const resultPromise = Promise.resolve().then(() => load(supabase)).then(
    (data) => ({ ok: true as const, data }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  await requireAdmin();
  const result = await resultPromise;
  if (!result.ok) {
    throw result.error;
  }
  return result.data;
}
