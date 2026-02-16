import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function SettingsLoading() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <Skeleton className="h-9 w-36 mb-2" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>

      {/* Settings form */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </CardContent>
      </Card>

      {/* Category planning */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
