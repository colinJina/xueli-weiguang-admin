type NoticeProps = {
  error?: string;
  notice?: string;
};

export function Notice({ error, notice }: NoticeProps) {
  if (!error && !notice) {
    return null;
  }

  return (
    <div className="admin-alert" role={error ? "alert" : "status"}>
      {error ?? notice}
    </div>
  );
}
