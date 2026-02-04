'use client'

import { useEffect, useCallback, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const HEADER_OFFSET = 100
const MOBILE_BREAKPOINT = 768
/** Minimum height for #forecast-evolution before we trust scroll position (avoids scrolling before chart has rendered). */
const FORECAST_EVOLUTION_MIN_HEIGHT = 150
/** Retry delays (ms) for scrolling to #forecast-evolution so we run again after content has rendered. */
const FORECAST_EVOLUTION_RETRY_DELAYS = [200, 500, 900]
/** When already on page, poll for hash/section changes (Next.js may not fire hashchange). */
const SAME_PAGE_POLL_INTERVAL = 120
const SAME_PAGE_POLL_DURATION = 1200

/**
 * On the Analysis page, scroll the main content to the section indicated by:
 * - URL hash (e.g. /analysis#forecast-evolution)
 * - section query param (e.g. /analysis?section=transaction-analysis from Dashboard trends links)
 * The main scroll container is .main-content, not the window.
 * Works when navigating from another page and when already on Analysis (same-page hash/section change).
 */
export function AnalysisHashScroll() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastScrolledId = useRef<string | null>(null)

  const scrollToTarget = useCallback((targetId: string) => {
    if (!targetId) return
    const element = document.getElementById(targetId)
    const main = document.querySelector('.main-content') as HTMLElement | null
    if (!element || !main) return

    const mainHeight = main.clientHeight
    const elementRect = element.getBoundingClientRect()
    const mainRect = main.getBoundingClientRect()
    const relativeTop = elementRect.top - mainRect.top + main.scrollTop
    const elementHeight = elementRect.height

    // For forecast-evolution, wait until the section has real height so we don't scroll to the wrong place
    if (targetId === 'forecast-evolution' && elementHeight < FORECAST_EVOLUTION_MIN_HEIGHT) {
      return
    }

    let scrollTop: number
    if (targetId === 'forecast-evolution') {
      // Center the section vertically in the viewport (desktop and mobile)
      const centerOffset = Math.floor(mainHeight / 2 - elementHeight / 2)
      scrollTop = Math.max(0, relativeTop - centerOffset)
      const maxScroll = main.scrollHeight - mainHeight
      scrollTop = Math.min(scrollTop, maxScroll)
    } else {
      scrollTop = Math.max(0, relativeTop - HEADER_OFFSET)
    }

    main.scrollTo({ top: scrollTop, behavior: 'smooth' })
    lastScrolledId.current = targetId
  }, [])

  useEffect(() => {
    if (pathname !== '/analysis') return

    const getTargetId = () => {
      const hashId = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
      const sectionParam = searchParams.get('section')
      return hashId || sectionParam || ''
    }

    const targetId = getTargetId()
    let t1: number | undefined
    const timeouts: number[] = []

    if (targetId) {
      lastScrolledId.current = null
      const run = () => scrollToTarget(targetId)
      t1 = requestAnimationFrame(() => requestAnimationFrame(run))
      const delay = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT ? 300 : 150
      timeouts.push(window.setTimeout(run, delay))
      if (targetId === 'forecast-evolution') {
        FORECAST_EVOLUTION_RETRY_DELAYS.forEach((ms) => {
          timeouts.push(
            window.setTimeout(() => requestAnimationFrame(run), ms)
          )
        })
      }
    }

    const onHashChange = () => {
      const id = getTargetId()
      if (id) {
        lastScrolledId.current = null
        scrollToTarget(id)
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
      if (pathFromLink !== pathname) return
      if (getTargetId() === hash && hash) {
        lastScrolledId.current = null
        scrollToTarget(hash)
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
        scrollToTarget(id)
      }
    }, SAME_PAGE_POLL_INTERVAL)

    return () => {
      if (t1 !== undefined) cancelAnimationFrame(t1)
      timeouts.forEach(clearTimeout)
      window.removeEventListener('hashchange', onHashChange)
      document.removeEventListener('click', onDocumentClick, true)
      window.clearInterval(pollId)
    }
  }, [pathname, searchParams, scrollToTarget])

  return null
}
