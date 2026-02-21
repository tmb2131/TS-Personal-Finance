import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function InsightsLoading() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Mobile welcome screen - replaces generic skeletons on mobile */}
      <div className="md:hidden flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        {/* Logo matching login page branding */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8"
          >
            <path d="M4 18 L10 14 L16 10 L22 6" />
          </svg>
        </div>
        
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
          <p className="text-muted-foreground">Loading your financial dashboard...</p>
        </div>
        
        {/* Subtle loading animation */}
        <div className="flex space-x-2">
          <div className="h-2 w-2 rounded-full bg-primary/60 animate-pulse" />
          <div className="h-2 w-2 rounded-full bg-primary/60 animate-pulse delay-75" />
          <div className="h-2 w-2 rounded-full bg-primary/60 animate-pulse delay-150" />
        </div>
      </div>

      {/* Desktop skeleton layout - unchanged */}
      <div className="hidden md:block">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-36" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-80 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
