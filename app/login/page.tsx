'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const supabase = createClient()

function LoginForm() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const oauthUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'not_allowed') {
      setMessage('This email is not allowed to access the app.')
    } else if (error === 'auth_code_error') {
      setMessage('Sign-in failed. Please try again.')
    }
  }, [searchParams])

  useEffect(() => {
    const redirectTo = `${window.location.origin}/auth/callback`
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    }).then(({ data }) => {
      if (data?.url) oauthUrlRef.current = data.url
    })
  }, [])

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setMessage('')

    try {
      if (oauthUrlRef.current) {
        window.location.href = oauthUrlRef.current
        return
      }

      const redirectTo = `${window.location.origin}/auth/callback`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })

      if (error) {
        setMessage(error.message || 'Failed to sign in with Google')
        setLoading(false)
        return
      }

      // Supabase returns the OAuth URL – we must redirect the browser to it
      if (data?.url) {
        window.location.href = data.url
        return
      }

      setMessage('Sign-in could not be started. Please try again.')
      setLoading(false)
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to sign in')
      setLoading(false)
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
            className="w-full bg-[#6389FF] hover:bg-[#5275e8] text-white border-0"
            disabled={loading}
            onClick={handleGoogleSignIn}
          >
            {loading ? 'Redirecting...' : 'Sign in with Google'}
          </Button>
          {message && (
            <p className="text-sm text-red-600">
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
