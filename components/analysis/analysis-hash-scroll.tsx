'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const HEADER_OFFSET = 100

/**
 * On the Analysis page, scroll the main content to the section indicated by:
 * - URL hash (e.g. /analysis#forecast-evolution)
 * - section query param (e.g. /analysis?section=transaction-analysis from Dashboard trends links)
 * The main scroll container is .main-content, not the window.
 */
export function AnalysisHashScroll() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (pathname !== '/analysis') return
    const hashId = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    const sectionParam = searchParams.get('section')
    const targetId = hashId || sectionParam || ''
    if (!targetId) return

    const scrollToId = () => {
      const element = document.getElementById(targetId)
      const main = document.querySelector('.main-content')
      if (!element || !main) return
      const headerOffset = HEADER_OFFSET
      const elementRect = element.getBoundingClientRect()
      const mainRect = (main as HTMLElement).getBoundingClientRect()
      const relativeTop = elementRect.top - mainRect.top + (main as HTMLElement).scrollTop
      ;(main as HTMLElement).scrollTo({ top: Math.max(0, relativeTop - headerOffset), behavior: 'smooth' })
    }

    // Run after layout so the Analysis page content is in the DOM (main is the scroll container, not window)
    const t1 = requestAnimationFrame(() => {
      requestAnimationFrame(scrollToId)
    })
    const t2 = window.setTimeout(scrollToId, 150)
    return () => {
      cancelAnimationFrame(t1)
      clearTimeout(t2)
    }
  }, [pathname, searchParams])

  return null
}
