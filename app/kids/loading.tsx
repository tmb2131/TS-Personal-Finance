import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function KidsLoading() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Hero header */}
      <div className="rounded-xl border border-l-[3px] border-l-indigo-500 bg-gradient-to-r from-muted/50 to-muted/30 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-80 max-w-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full md:w-[220px]" />
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-36" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
