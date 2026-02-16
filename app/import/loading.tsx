import { Skeleton } from '@/components/ui/skeleton'

export default function ImportLoading() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Hero header */}
      <div className="rounded-xl border bg-muted/30 p-4 md:p-5">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="mt-2 h-5 w-96 max-w-full" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-36 rounded-full" />
        </div>
      </div>

      {/* Upload area */}
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}
