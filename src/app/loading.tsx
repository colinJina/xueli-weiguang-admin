import { Spinner } from "@/components/dashboard/spinner";

// This boundary also covers the dashboard's async authorization layout.
export default function AppLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-muted">
      <p aria-live="polite" className="inline-flex items-center gap-2 text-sm" role="status">
        <Spinner />
        加载中
      </p>
    </main>
  );
}
