'use client'

import { useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'

/** Offset from top of viewport so section title/cards sit nicely below any chrome. */
const SECTION_TOP_OFFSET = 16
/** For expenses-table, use minimal offset to put it at the top. */
const EXPENSES_TABLE_TOP_OFFSET = 0
/** Section ids we handle (scroll so summary cards at top, table below). */
const DASHBOARD_SECTION_IDS = ['annual-trends', 'monthly-trends', 'expenses-table'] as const
/** Minimum height for section before we trust scroll (avoids scrolling before Suspense content has rendered). */
const SECTION_MIN_HEIGHT = 100
/** Retry delays (ms) so we scroll again after content has rendered. */
const RETRY_DELAYS = [200, 500, 900]
/** When already on page, poll for hash changes (Next.js may not fire hashchange). */
const SAME_PAGE_POLL_INTERVAL = 120
const SAME_PAGE_POLL_DURATION = 1200

/**
 * On the Dashboard page, scroll the main content to the section indicated by the URL hash
 * (e.g. /#annual-trends, /#monthly-trends). Positions the section so its top (summary cards)
 * is at the top of the viewport and the table is visible below.
 * Works when navigating from another page and when already on Dashboard (same-page hash change).
 */
export function DashboardHashScroll() {
  const pathname = usePathname()
  const lastScrolledId = useRef<string | null>(null)

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
    const offset = targetId === 'expenses-table' ? EXPENSES_TABLE_TOP_OFFSET : SECTION_TOP_OFFSET
    const scrollTop = Math.max(0, relativeTop - offset)
    const maxScroll = main.scrollHeight - mainHeight
    const clampedScroll = Math.min(scrollTop, maxScroll)

    main.scrollTo({ top: clampedScroll, behavior: 'smooth' })
    lastScrolledId.current = targetId
  }, [])

  useEffect(() => {
    if (pathname !== '/dashboard') return

    const getTargetId = () =>
      typeof window !== 'undefined' ? (window.location.hash.slice(1) || '') : ''

    const runScroll = (id: string) => {
      if (id && DASHBOARD_SECTION_IDS.includes(id as (typeof DASHBOARD_SECTION_IDS)[number])) {
        scrollToTarget(id)
      }
    }

    const targetId = getTargetId()
    let t1: number | undefined
    const timeouts: number[] = []
    if (targetId && DASHBOARD_SECTION_IDS.includes(targetId as (typeof DASHBOARD_SECTION_IDS)[number])) {
      lastScrolledId.current = null
      const run = () => scrollToTarget(targetId)
      t1 = requestAnimationFrame(() => requestAnimationFrame(run))
      timeouts.push(window.setTimeout(run, 150))
      RETRY_DELAYS.forEach((ms) => timeouts.push(window.setTimeout(() => requestAnimationFrame(run), ms)))
    }

    const scheduleRetries = (id: string) => {
      RETRY_DELAYS.forEach((ms) =>
        timeouts.push(window.setTimeout(() => requestAnimationFrame(() => runScroll(id)), ms))
      )
    }

    const onHashChange = () => {
      const id = getTargetId()
      if (id) {
        lastScrolledId.current = null
        runScroll(id)
        scheduleRetries(id)
      }
    }
    window.addEventListener('hashchange', onHashChange)

    /** When user re-clicks a link that already matches the current URL (same hash), still scroll to section. */
    const onDocumentClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href*="#"]')
      if (!link) return
      const href = link.getAttribute('href') ?? ''
      const idx = href.indexOf('#')
      if (idx === -1) return
      const pathFromLink = href.slice(0, idx) || '/'
      const hash = href.slice(idx + 1)
      if (pathFromLink !== pathname || !DASHBOARD_SECTION_IDS.includes(hash as (typeof DASHBOARD_SECTION_IDS)[number])) return
      if (getTargetId() === hash) {
        lastScrolledId.current = null
        runScroll(hash)
        scheduleRetries(hash)
      }
    }
    document.addEventListener('click', onDocumentClick, true)

    const pollStart = Date.now()
    const pollId = window.setInterval(() => {
      if (Date.now() - pollStart > SAME_PAGE_POLL_DURATION) {
        window.clearInterval(pollId)
        return
      }
      const id = getTargetId()
      if (id && id !== lastScrolledId.current) {
        runScroll(id)
      }
    }, SAME_PAGE_POLL_INTERVAL)

    return () => {
      if (t1 !== undefined) cancelAnimationFrame(t1)
      timeouts.forEach(clearTimeout)
      window.removeEventListener('hashchange', onHashChange)
      document.removeEventListener('click', onDocumentClick, true)
      window.clearInterval(pollId)
    }
  }, [pathname, scrollToTarget])

  return null
}
