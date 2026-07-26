import Link from "next/link";

type PaginationProps = {
  basePath: string;
  page: number;
  pageSize: number;
  searchParams?: Record<string, string | undefined>;
  total: number;
};

export function Pagination({ basePath, page, pageSize, searchParams = {}, total }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) {
    return null;
  }

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(searchParams)) {
      if (value) {
        params.set(key, value);
      }
    }

    if (targetPage > 1) {
      params.set("page", String(targetPage));
    } else {
      params.delete("page");
    }

    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <nav
      aria-label="分页"
      className="flex items-center justify-between gap-3 border border-border bg-surface px-4 py-3 text-sm"
    >
      <PageLink disabled={page <= 1} href={buildHref(page - 1)}>
        上一页
      </PageLink>
      <span className="text-xs uppercase tracking-[0.16em] text-subtle">
        第 {page} / {totalPages} 页
      </span>
      <PageLink disabled={page >= totalPages} href={buildHref(page + 1)}>
        下一页
      </PageLink>
    </nav>
  );
}

function PageLink({
  children,
  disabled,
  href,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-9 cursor-not-allowed items-center border border-border px-3 text-disabled">
        {children}
      </span>
    );
  }

  return (
    <Link className="admin-secondary-button" href={href}>
      {children}
    </Link>
  );
}
