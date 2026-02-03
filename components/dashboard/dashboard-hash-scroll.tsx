'use client'

import { useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'

/** Offset from top of viewport so section title/cards sit nicely below any chrome. */
const SECTION_TOP_OFFSET = 16
/** Section ids we handle (scroll so summary cards at top, table below). */
const DASHBOARD_SECTION_IDS = ['annual-trends', 'monthly-trends'] as const
/** Minimum height for section before we trust scroll (avoids scrolling before Suspense content has rendered). */
const SECTION_MIN_HEIGHT = 100
/** Retry delays (ms) so we scroll again after content has rendered. */
const RETRY_DELAYS = [200, 500, 900]

/**
 * On the Dashboard page, scroll the main content to the section indicated by the URL hash
 * (e.g. /#annual-trends, /#monthly-trends). Positions the section so its top (summary cards)
 * is at the top of the viewport and the table is visible below.
 * Uses retries so scrolling works after Suspense content has loaded.
 */
export function DashboardHashScroll() {
  const pathname = usePathname()

  const scrollToTarget = useCallback((targetId: string) => {
    if (!targetId || !DASHBOARD_SECTION_IDS.includes(targetId as (typeof DASHBOARD_SECTION_IDS)[number])) return
    const element = document.getElementById(targetId)
    const main = document.querySelector('.main-content') as HTMLElement | null
    if (!element || !main) return

    const elementRect = element.getBoundingClientRect()
    const mainRect = main.getBoundingClientRect()
    const relativeTop = elementRect.top - mainRect.top + main.scrollTop
    const elementHeight = elementRect.height

    // Wait until the section has real height (Suspense may still be showing skeleton)
    if (elementHeight < SECTION_MIN_HEIGHT) return

    const mainHeight = main.clientHeight
    const scrollTop = Math.max(0, relativeTop - SECTION_TOP_OFFSET)
    const maxScroll = main.scrollHeight - mainHeight
    const clampedScroll = Math.min(scrollTop, maxScroll)

    main.scrollTo({ top: clampedScroll, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (pathname !== '/') return

    const getTargetId = () =>
      typeof window !== 'undefined' ? (window.location.hash.slice(1) || '') : ''

    const targetId = getTargetId()
    if (!targetId || !DASHBOARD_SECTION_IDS.includes(targetId as (typeof DASHBOARD_SECTION_IDS)[number])) return

    const runScroll = () => scrollToTarget(targetId)

    // Run after layout
    const t1 = requestAnimationFrame(() => {
      requestAnimationFrame(runScroll)
    })
    const t2 = window.setTimeout(runScroll, 150)

    // Retry so we scroll again after Suspense/content has rendered
    const timeouts: number[] = []
    RETRY_DELAYS.forEach((ms) => {
      timeouts.push(
        window.setTimeout(() => {
          requestAnimationFrame(runScroll)
        }, ms)
      )
    })

    const onHashChange = () => {
      const id = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
      if (id && DASHBOARD_SECTION_IDS.includes(id as (typeof DASHBOARD_SECTION_IDS)[number])) {
        scrollToTarget(id)
      }
    }

    window.addEventListener('hashchange', onHashChange)

    return () => {
      cancelAnimationFrame(t1)
      clearTimeout(t2)
      timeouts.forEach(clearTimeout)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [pathname, scrollToTarget])

  return null
}
