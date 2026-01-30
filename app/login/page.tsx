'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('admin@findash.com')
  const [password, setPassword] = useState('123456')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    console.log('Login attempt:', email)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('Login result - data:', data)
      console.log('Login result - error:', error)

      if (error) {
        console.error('Login error:', error)
        throw error
      }

      // Verify user is authenticated
      const { data: { user } } = await supabase.auth.getUser()
      console.log('User after login:', user)

      if (!user) {
        throw new Error('Authentication failed - no user returned')
      }

      // Force refresh and redirect to Key Insights
      console.log('Login successful, redirecting...')
      router.refresh()
      router.push('/insights')
    } catch (error: any) {
      console.error('Login catch block - error:', error)
      setMessage(error.message || 'Failed to sign in')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>TS Personal Finance Login</CardTitle>
          <CardDescription>
            Developer bypass - Enter your credentials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="admin@findash.com"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Enter password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            {message && (
              <p className="text-sm text-red-600">
                {message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
