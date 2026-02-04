'use client'

import { useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'

/** Offset from top of viewport when scrolling to a section (0 = section at top of screen). */
const SECTION_TOP_OFFSET = 0
/** Section ids on the Insights page (KeyInsights cards). */
const INSIGHTS_SECTION_IDS = ['executive-summary', 'net-worth', 'annual-budget', 'annual-spend', 'monthly-spend'] as const
/** Minimum height for section before we trust scroll (avoids scrolling before content has rendered). */
const SECTION_MIN_HEIGHT = 80
/** Retry delays (ms) so we scroll again after content has rendered. */
const RETRY_DELAYS = [150, 400, 800]
/** When already on page, poll for hash changes (Next.js may not fire hashchange). */
const SAME_PAGE_POLL_INTERVAL = 120
const SAME_PAGE_POLL_DURATION = 1200

/**
 * On the Insights page, scroll the main content to the section indicated by the URL hash
 * (e.g. /insights#annual-budget). Positions the section at the top of the viewport.
 * Works when navigating from another page and when already on Insights (same-page hash change).
 */
export function InsightsHashScroll() {
  const pathname = usePathname()
  const lastScrolledId = useRef<string | null>(null)

  const scrollToTarget = useCallback((targetId: string) => {
    if (!targetId || !INSIGHTS_SECTION_IDS.includes(targetId as (typeof INSIGHTS_SECTION_IDS)[number])) return
    const element = document.getElementById(targetId)
    const main = document.querySelector('.main-content') as HTMLElement | null
    if (!element || !main) return

    const elementRect = element.getBoundingClientRect()
    const mainRect = main.getBoundingClientRect()
    const relativeTop = elementRect.top - mainRect.top + main.scrollTop
    const elementHeight = elementRect.height

    if (elementHeight < SECTION_MIN_HEIGHT) return

    const mainHeight = main.clientHeight
    const scrollTop = Math.max(0, relativeTop - SECTION_TOP_OFFSET)
    const maxScroll = main.scrollHeight - mainHeight
    const clampedScroll = Math.min(scrollTop, maxScroll)

    main.scrollTo({ top: clampedScroll, behavior: 'smooth' })
    lastScrolledId.current = targetId
  }, [])

  useEffect(() => {
    if (pathname !== '/insights') return

    const getTargetId = () =>
      typeof window !== 'undefined' ? (window.location.hash.slice(1) || '') : ''

    const runScroll = (targetId: string) => {
      if (targetId && INSIGHTS_SECTION_IDS.includes(targetId as (typeof INSIGHTS_SECTION_IDS)[number])) {
        scrollToTarget(targetId)
      }
    }

    // Initial run and retries (e.g. after nav from another page)
    const targetId = getTargetId()
    let t1: number | undefined
    const timeouts: number[] = []
    if (targetId) {
      lastScrolledId.current = null
      const run = () => runScroll(targetId)
      t1 = requestAnimationFrame(() => requestAnimationFrame(run))
      timeouts.push(window.setTimeout(run, 150))
      RETRY_DELAYS.forEach((ms) => timeouts.push(window.setTimeout(() => requestAnimationFrame(run), ms)))
    }

    const onHashChange = () => {
      const id = getTargetId()
      if (id) {
        lastScrolledId.current = null
        runScroll(id)
      }
    }
    window.addEventListener('hashchange', onHashChange)

    const onDocumentClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href*="#"]')
      if (!link) return
      const href = link.getAttribute('href') ?? ''
      const idx = href.indexOf('#')
      if (idx === -1) return
      const pathFromLink = href.slice(0, idx) || '/'
      const hash = href.slice(idx + 1)
      if (pathFromLink !== pathname || !INSIGHTS_SECTION_IDS.includes(hash as (typeof INSIGHTS_SECTION_IDS)[number])) return
      if (getTargetId() === hash) {
        lastScrolledId.current = null
        runScroll(hash)
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
