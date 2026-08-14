'use client'

import { useEffect, useCallback, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { resolveSectionId } from '@/lib/app-sections'

const HEADER_OFFSET = 100
const MOBILE_BREAKPOINT = 768
/** Charts mount empty and grow; scrolling before they have height lands in the wrong place. */
const MIN_SECTION_HEIGHT = 150
const RETRY_DELAYS = [200, 500, 900]
/** Next does not always fire hashchange for same-page fragment changes. */
const SAME_PAGE_POLL_INTERVAL = 120
const SAME_PAGE_POLL_DURATION = 1200

/**
 * Scrolls the main content area to the section named by the URL fragment or a
 * `section` query param. The scroll container is `.main-content`, not the
 * window, so native fragment behaviour does not apply.
 *
 * This replaces three near-identical per-page copies that differed only in
 * which pathname they checked and which section they special-cased for height.
 */
export function HashScroll() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastScrolledId = useRef<string | null>(null)

  const scrollToTarget = useCallback((targetId: string, force = false) => {
    if (!targetId) return
    const element = document.getElementById(targetId)
    const main = document.querySelector('.main-content') as HTMLElement | null
    if (!element || !main) return

    const elementRect = element.getBoundingClientRect()
    // Not laid out yet: a retry will catch it once the section has height.
    // `force` is the last retry — a genuinely short section (one that never
    // reaches MIN_SECTION_HEIGHT) would otherwise never be scrolled to at all.
    if (!force && elementRect.height < MIN_SECTION_HEIGHT) return

    const relativeTop = elementRect.top - main.getBoundingClientRect().top + main.scrollTop
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'

    main.scrollTo({ top: Math.max(0, relativeTop - HEADER_OFFSET), behavior })
    lastScrolledId.current = targetId
  }, [])

  useEffect(() => {
    // A fragment is whatever the linker typed. `/position#runway` is a
    // reasonable guess that matched no element, so the page silently stayed at
    // the top; the section is `cash-runway`. Aliases live in lib/app-sections.
    const getTargetId = () => {
      const hashId = typeof window !== 'undefined' ? decodeURIComponent(window.location.hash.slice(1)) : ''
      return resolveSectionId(hashId || searchParams.get('section') || '')
    }

    const targetId = getTargetId()
    let frame: number | undefined
    const timeouts: number[] = []

    if (targetId) {
      lastScrolledId.current = null
      const run = () => scrollToTarget(targetId)
      frame = requestAnimationFrame(() => requestAnimationFrame(run))
      const delay = window.innerWidth < MOBILE_BREAKPOINT ? 300 : 150
      timeouts.push(window.setTimeout(run, delay))
      RETRY_DELAYS.forEach((ms, index) => {
        const isLast = index === RETRY_DELAYS.length - 1
        timeouts.push(
          window.setTimeout(() => requestAnimationFrame(() => scrollToTarget(targetId, isLast)), ms)
        )
      })
    }

    const onHashChange = () => {
      const id = getTargetId()
      if (!id) return
      lastScrolledId.current = null
      scrollToTarget(id)
    }
    window.addEventListener('hashchange', onHashChange)

    const pollStart = Date.now()
    const pollId = window.setInterval(() => {
      if (Date.now() - pollStart > SAME_PAGE_POLL_DURATION) {
        window.clearInterval(pollId)
        return
      }
      const id = getTargetId()
      if (id && id !== lastScrolledId.current) scrollToTarget(id)
    }, SAME_PAGE_POLL_INTERVAL)

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      timeouts.forEach(clearTimeout)
      window.removeEventListener('hashchange', onHashChange)
      window.clearInterval(pollId)
    }
  }, [pathname, searchParams, scrollToTarget])

  return null
}
