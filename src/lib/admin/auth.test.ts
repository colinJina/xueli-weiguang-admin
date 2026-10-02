import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));

vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

import { getAdminContext, loadAdminPageData, requireAdmin, requireAdminForAction } from "@/lib/admin/auth";

describe("admin authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "verified-user", email: "admin@example.test" } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-user", email: "current@example.test" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }) });
  });

  it("uses verified claims for pages and still queries the live admin role", async () => {
    const context = await requireAdmin();
    expect(context.user.id).toBe("verified-user");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith("id", "verified-user");
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { code: "invalid_jwt" } },
    { data: { claims: { sub: "untrusted-user" } }, error: { code: "invalid_jwt" } },
  ])("rejects missing or invalid tokens before querying profiles", async (claims) => {
    mocks.getClaims.mockResolvedValue(claims);
    await expect(requireAdmin()).rejects.toThrow("redirect:/login");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not grant admin access from token metadata", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "verified-user", user_metadata: { is_admin: true }, app_metadata: { is_admin: true } } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
    await expect(requireAdmin()).rejects.toThrow("redirect:/login?error=not_admin");
  });

  it("fails closed when the profile is missing or the database is unavailable", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(requireAdmin()).rejects.toThrow("redirect:/login?error=not_admin");
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    await expect(getAdminContext()).rejects.toThrow("database unavailable");
  });

  it("checks the current Auth user before admin mutations", async () => {
    const context = await requireAdminForAction();
    expect(context.user.email).toBe("current@example.test");
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenCalledWith("id", "verified-user");
  });

  it("blocks mutations when the current user has been removed or banned", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { code: "user_banned" } });
    await expect(requireAdminForAction()).rejects.toThrow("redirect:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("blocks mutations when the current user differs from the verified subject", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "different-user" } }, error: null });
    await expect(requireAdminForAction()).rejects.toThrow("redirect:/login");
  });

  it("starts page reads while the live role check is pending, without releasing data early", async () => {
    let allowAdmin: (value: { data: { is_admin: boolean }; error: null }) => void = () => {};
    mocks.maybeSingle.mockReturnValue(new Promise((resolve) => { allowAdmin = resolve; }));
    const load = vi.fn().mockResolvedValue("protected page data");
    let completed = false;
    const pageData = loadAdminPageData(load).then((data) => {
      completed = true;
      return data;
    });

    await vi.waitFor(() => {
      expect(load).toHaveBeenCalledOnce();
      expect(mocks.maybeSingle).toHaveBeenCalledOnce();
    });
    expect(completed).toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
    allowAdmin({ data: { is_admin: true }, error: null });
    await expect(pageData).resolves.toBe("protected page data");
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { code: "invalid_jwt" } },
  ])("does not start page reads for missing or invalid tokens", async (claims) => {
    mocks.getClaims.mockResolvedValue(claims);
    const load = vi.fn();
    await expect(loadAdminPageData(load)).rejects.toThrow("redirect:/login");
    expect(load).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("redirects non-admins even when the parallel read fails", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
    const load = vi.fn().mockRejectedValue(new Error("read failed"));
    await expect(loadAdminPageData(load)).rejects.toThrow("redirect:/login?error=not_admin");
  });

  it("does not release page data when the role lookup fails", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "role lookup failed" } });
    await expect(loadAdminPageData(async () => "protected page data")).rejects.toThrow("role lookup failed");
  });

  it("propagates read errors only after authorization passes", async () => {
    await expect(loadAdminPageData(async () => { throw new Error("read failed"); })).rejects.toThrow("read failed");
    expect(mocks.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
