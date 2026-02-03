'use client'

import { useEffect, useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const HEADER_OFFSET = 100
const MOBILE_BREAKPOINT = 768

/**
 * On the Analysis page, scroll the main content to the section indicated by:
 * - URL hash (e.g. /analysis#forecast-evolution)
 * - section query param (e.g. /analysis?section=transaction-analysis from Dashboard trends links)
 * The main scroll container is .main-content, not the window.
 * On mobile, scrolling to #forecast-evolution centers the section in the viewport.
 */
export function AnalysisHashScroll() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

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
    const isMobile = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT

    let scrollTop: number
    if (isMobile && targetId === 'forecast-evolution') {
      // Center the section in the viewport on mobile so the chart is visible
      const centerOffset = Math.floor(mainHeight / 2 - elementHeight / 2)
      scrollTop = Math.max(0, relativeTop - centerOffset)
      // Don't scroll past the bottom
      const maxScroll = main.scrollHeight - mainHeight
      scrollTop = Math.min(scrollTop, maxScroll)
    } else {
      scrollTop = Math.max(0, relativeTop - HEADER_OFFSET)
    }

    main.scrollTo({ top: scrollTop, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (pathname !== '/analysis') return

    const getTargetId = () => {
      const hashId = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
      const sectionParam = searchParams.get('section')
      return hashId || sectionParam || ''
    }

    const targetId = getTargetId()
    if (!targetId) return

    const runScroll = () => scrollToTarget(targetId)

    // Run after layout so the Analysis page content is in the DOM
    const t1 = requestAnimationFrame(() => {
      requestAnimationFrame(runScroll)
    })
    // On mobile, allow more time for content to render (e.g. when navigating from Insights)
    const delay = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT ? 300 : 150
    const t2 = window.setTimeout(runScroll, delay)

    const onHashChange = () => {
      const id = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
      if (id) scrollToTarget(id)
    }

    window.addEventListener('hashchange', onHashChange)

    return () => {
      cancelAnimationFrame(t1)
      clearTimeout(t2)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [pathname, searchParams, scrollToTarget])

  return null
}
