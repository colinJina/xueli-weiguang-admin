export const metadata = {
  title: "Videos",
};

export default function VideosPage() {
  return <PlaceholderPage title="Videos" />;
}

function PlaceholderPage({ title }: Readonly<{ title: string }>) {
  return (
    <div className="border border-border bg-surface p-6">
      <p className="text-xs uppercase tracking-[0.22em] text-subtle">{title}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">{title}</h1>
      <p className="mt-3 text-sm text-muted">Management UI will be added in a later task.</p>
    </div>
  );
}
