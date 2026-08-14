'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Client-side redirect for retired routes whose sections were split across more
 * than one destination.
 *
 * A URL fragment is never sent to the server, so `next.config.ts` cannot tell
 * `/dashboard#budget-table` (now on /spending) from `/dashboard#annual-trends`
 * (now on /trends). This resolves the fragment in the browser and forwards to
 * the right page, keeping the fragment so the target section still scrolls
 * into view.
 */
export function HashRedirect({
  map,
  fallback,
}: {
  /** Fragment (without `#`) to destination path. */
  map: Record<string, string>
  /** Destination when there is no fragment, or none we recognise. */
  fallback: string
}) {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    const search = window.location.search
    const destination = (hash && map[hash]) || fallback
    router.replace(`${destination}${search}${hash ? `#${hash}` : ''}`)
  }, [map, fallback, router])

  return (
    <p className="text-body text-muted-foreground" role="status">
      Taking you to the new location...
    </p>
  )
}
