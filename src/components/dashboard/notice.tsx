type NoticeProps = {
  error?: string;
  notice?: string;
};

export function Notice({ error, notice }: NoticeProps) {
  if (!error && !notice) {
    return null;
  }

  return (
    <div className="border border-borderStrong bg-panel px-3 py-2 text-sm text-muted">
      {error ?? notice}
    </div>
  );
}
