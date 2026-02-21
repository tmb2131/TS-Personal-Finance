'use client'

/**
 * Mobile "Welcome back" placeholder shown while insights load or until the
 * post-login daily summary modal opens. Matches login/insights loading branding.
 */
export function WelcomeBack() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
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
      <div className="flex space-x-2">
        <div className="h-2 w-2 rounded-full bg-primary/60 animate-pulse" />
        <div className="h-2 w-2 rounded-full bg-primary/60 animate-pulse delay-75" />
        <div className="h-2 w-2 rounded-full bg-primary/60 animate-pulse delay-150" />
      </div>
    </div>
  )
}
