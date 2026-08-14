'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const OAUTH_URL_TTL_MS = 5 * 60 * 1000 // 5 minutes
const PREFETCH_TIMEOUT_MS = 3_000       // 3 seconds
const LOADING_RESET_MS = 10_000         // reset spinner if redirect hasn't happened

type CachedOAuthUrl = { url: string; fetchedAt: number }

function LoginForm() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const cachedRef = useRef<CachedOAuthUrl | null>(null)
  const loadingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'not_allowed') {
      setMessage('This email is not allowed to access the app.')
    } else if (error === 'cancelled') {
      setMessage('Sign-in was cancelled. Try again.')
    } else if (error === 'auth_code_error') {
      setMessage('Sign-in failed. Please try again.')
    }
  }, [searchParams])

  const prefetchOAuthUrl = useCallback(async () => {
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback`
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PREFETCH_TIMEOUT_MS))
    const fetch = supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    }).then(({ data }) => data?.url ?? null)

    const url = await Promise.race([fetch, timeout])
    if (url) cachedRef.current = { url, fetchedAt: Date.now() }
  }, [])

  // Pre-fetch on mount
  useEffect(() => {
    prefetchOAuthUrl()
  }, [prefetchOAuthUrl])

  // Re-fetch when the user returns to the tab (stale URL guard)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') prefetchOAuthUrl()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [prefetchOAuthUrl])

  // Reset loading spinner if redirect hasn't fired after LOADING_RESET_MS
  const scheduleLoadingReset = () => {
    if (loadingResetRef.current) clearTimeout(loadingResetRef.current)
    loadingResetRef.current = setTimeout(() => setLoading(false), LOADING_RESET_MS)
  }

  const handleGoogleSignIn = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setMessage('')
    setLoading(true)

    // Yield so the loading state paints before we block on network (helps first tap on mobile)
    await new Promise((r) => setTimeout(r, 0))

    try {
      const cached = cachedRef.current
      const isFresh = cached && Date.now() - cached.fetchedAt < OAUTH_URL_TTL_MS

      if (isFresh) {
        scheduleLoadingReset()
        window.location.href = cached.url
        return
      }

      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })

      if (error) {
        setMessage(error.message || 'Failed to sign in with Google')
        setLoading(false)
        submittingRef.current = false
        return
      }

      if (data?.url) {
        scheduleLoadingReset()
        window.location.href = data.url
        return
      }

      setMessage('Sign-in could not be started. Please try again.')
      setLoading(false)
      submittingRef.current = false
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to sign in')
      setLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Sign in with your Google account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button
            type="button"
            className="w-full bg-[#6389FF] hover:bg-[#5275e8] text-white border-0 touch-manipulation"
            disabled={loading}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') handleGoogleSignIn()
            }}
            onClick={handleGoogleSignIn}
          >
            {loading ? 'Redirecting...' : 'Sign in with Google'}
          </Button>
          {message && (
            <p className="text-sm text-negative">
              {message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function LoginFallback() {
  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Sign in with your Google account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          disabled
          className="w-full bg-[#6389FF] text-white border-0"
        >
          Sign in with Google
        </Button>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  )
}
