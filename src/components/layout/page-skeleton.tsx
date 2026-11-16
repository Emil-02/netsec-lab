export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-4 py-10" aria-busy="true" aria-label="Memuat">
      <div className="h-4 w-32 rounded bg-surface-2" />
      <div className="mt-6 h-9 w-2/3 rounded bg-surface-2" />
      <div className="mt-4 h-4 w-1/2 rounded bg-surface-2" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-4 rounded bg-surface-2" style={{ width: `${90 - i * 7}%` }} />
        ))}
      </div>
    </div>
  );
}
