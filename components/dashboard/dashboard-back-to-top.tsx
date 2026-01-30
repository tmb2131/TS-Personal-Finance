'use client'

import { ArrowUp } from 'lucide-react'

function scrollToTop(e: React.MouseEvent) {
  e.preventDefault()
  const main = document.querySelector('main')
  if (main) {
    main.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

export function DashboardBackToTop() {
  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted/50 transition-colors"
    >
      <ArrowUp className="h-4 w-4" />
      Back to top
    </button>
  )
}
