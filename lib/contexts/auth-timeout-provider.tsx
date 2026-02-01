'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const INACTIVITY_MS = 5 * 60 * 1000 // 5 minutes
const HIDDEN_LOGOUT_MS = 5 * 60 * 1000 // treat tab hidden for 5+ min as "app closed"

export function AuthTimeoutProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hiddenAtRef = useRef<number | null>(null)

  const signOutAndRedirect = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }, [router])

  const resetInactivityTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    timeoutRef.current = setTimeout(() => {
      signOutAndRedirect()
    }, INACTIVITY_MS)
  }, [signOutAndRedirect])

  useEffect(() => {
    const supabase = createClient()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        resetInactivityTimer()
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
      }
    })

    // Initial check: if already signed in, start timer. If refresh token is invalid, sign out to clear stale cookies.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) resetInactivityTimer()
    }).catch(async (err: unknown) => {
      const isRefreshTokenError =
        err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'refresh_token_not_found'
      if (isRefreshTokenError) {
        await supabase.auth.signOut()
        if (pathname !== '/login') router.replace('/login')
      }
    })

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    const onActivity = () => {
      if (timeoutRef.current) resetInactivityTimer()
    }
    activityEvents.forEach((ev) => window.addEventListener(ev, onActivity))

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
      } else {
        const hiddenAt = hiddenAtRef.current
        hiddenAtRef.current = null
        if (hiddenAt != null && Date.now() - hiddenAt >= HIDDEN_LOGOUT_MS) {
          signOutAndRedirect()
          return
        }
        if (timeoutRef.current) resetInactivityTimer()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      subscription.unsubscribe()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      activityEvents.forEach((ev) => window.removeEventListener(ev, onActivity))
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [pathname, resetInactivityTimer, signOutAndRedirect])

  return <>{children}</>
}
