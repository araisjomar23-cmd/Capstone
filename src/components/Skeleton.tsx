export function SkeletonBox({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-md ${className}`} />
}

export function SkeletonStatCard() {
  return (
    <div className="stat-card">
      <div className="stat-accent-bar bg-gray-200" />
      <SkeletonBox className="h-2.5 w-20 mb-3" />
      <SkeletonBox className="h-7 w-16 mb-2" />
      <SkeletonBox className="h-2.5 w-24" />
    </div>
  )
}

export function SkeletonTableRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-t border-gray-100">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3.5">
              <SkeletonBox className="h-3.5 w-full max-w-[140px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="panel p-5">
      <SkeletonBox className="h-4 w-1/3 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBox key={i} className="h-3 w-full mb-2" />
      ))}
    </div>
  )
}