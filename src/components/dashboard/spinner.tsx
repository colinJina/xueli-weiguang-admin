export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`admin-spinner ${className}`.trim()} />;
}
