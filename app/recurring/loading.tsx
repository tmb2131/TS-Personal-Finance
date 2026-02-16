import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function RecurringLoading() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Hero header */}
      <div className="rounded-xl border bg-muted/30 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-72 max-w-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto md:min-w-[320px]">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
