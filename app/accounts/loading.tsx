import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function AccountsLoading() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Hero header */}
      <div className="rounded-xl border border-l-[3px] border-l-blue-500 bg-gradient-to-r from-muted/50 to-muted/30 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-80 max-w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-40 rounded-full" />
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto md:min-w-[340px]">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
