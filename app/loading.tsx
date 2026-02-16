import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="w-full max-w-7xl mx-auto space-y-2 md:space-y-3">
      {/* Header */}
      <div>
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>

      {/* At a Glance */}
      <Skeleton className="h-48 w-full rounded-lg" />

      {/* Navigation */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>

      {/* Budget table */}
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
