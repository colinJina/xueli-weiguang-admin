"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useOptimistic, useTransition } from "react";
import type { ReactNode } from "react";

import { MenuLoading } from "@/components/dashboard/menu-loading";

type DashboardNavigation = {
  pathname: string;
  selectedPathname: string;
  isPending: boolean;
  navigate: (href: string) => void;
};

const NavigationContext = createContext<DashboardNavigation | null>(null);

export function DashboardNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [selectedPathname, selectPathname] = useOptimistic(pathname);
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      selectPathname(href);
      router.push(href);
    });
  }

  return (
    <NavigationContext.Provider value={{ pathname, selectedPathname, isPending, navigate }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useDashboardNavigation() {
  const navigation = useContext(NavigationContext);

  if (!navigation) {
    throw new Error("Dashboard navigation must be used inside its provider.");
  }

  return navigation;
}

export function DashboardContent({ children }: { children: ReactNode }) {
  const { isPending } = useDashboardNavigation();

  return (
    <main aria-busy={isPending} className="mx-auto w-full max-w-content px-4 py-5 md:px-6">
      {isPending ? <MenuLoading /> : null}
      {/* Keep the current page mounted while hiding its stale content and controls. */}
      <div hidden={isPending} inert={isPending}>{children}</div>
    </main>
  );
}
