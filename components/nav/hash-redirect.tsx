'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { resolveSectionId } from '@/lib/app-sections'

/**
 * Client-side redirect for retired routes whose sections were split across more
 * than one destination.
 *
 * A URL fragment is never sent to the server, so `next.config.ts` cannot tell
 * `/dashboard#budget-table` (now on /spending) from `/dashboard#annual-trends`
 * (now on /trends). This resolves the target in the browser and forwards to the
 * right page, keeping it so the section still scrolls into view.
 *
 * The target may arrive as a fragment OR as `?section=`. The query form was
 * previously ignored, so `/analysis?section=transaction-analysis` — the shape
 * every trends-table cell link used — fell through to the fallback and landed
 * on the wrong page.
 */
export function HashRedirect({
  map,
  fallback,
}: {
  /** Section id (fragment or `?section=` value) to destination path. */
  map: Record<string, string>
  /** Destination when there is no recognised section id. */
  fallback: string
}) {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    const search = window.location.search
    const sectionParam = new URLSearchParams(search).get('section') ?? ''
    const raw = hash || sectionParam

    // Raw id first: the map is keyed on the ids these retired routes actually
    // used, and resolving an alias first could turn a key that IS in the map
    // into one that is not.
    const destination = (raw && (map[raw] ?? map[resolveSectionId(raw)])) || fallback
    // Preserve a fragment if that is how the target arrived; a `?section=`
    // target is already in the query string, and HashScroll reads both.
    router.replace(`${destination}${search}${hash ? `#${hash}` : ''}`)
  }, [map, fallback, router])

  return (
    <p className="text-body text-muted-foreground" role="status">
      Taking you to the new location...
    </p>
  )
}
