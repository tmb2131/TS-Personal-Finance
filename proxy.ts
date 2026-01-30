import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Get allowed emails from environment variable, fallback to default for development
const getAllowedEmails = (): string[] => {
  const envEmails = process.env.ALLOWED_EMAILS
  if (envEmails) {
    return envEmails.split(',').map(email => email.trim())
  }
  // Fallback to default emails for backward compatibility
  return [
    'thomas.brosens@gmail.com',
    'sriya.sundaresan@gmail.com',
    'admin@findash.com' // Developer bypass
  ]
}

const ALLOWED_EMAILS = getAllowedEmails()

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Check if accessing login page
  if (request.nextUrl.pathname === '/login') {
    if (user && ALLOWED_EMAILS.includes(user.email || '')) {
      return NextResponse.redirect(new URL('/insights', request.url))
    }
    return response
  }

  // Protect all other routes
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Check if user email is allowed
  if (!ALLOWED_EMAILS.includes(user.email || '')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth (auth routes - CRITICAL fix)
     * - login (login page - CRITICAL fix)
     * - images/public (public assets)
     */
    '/((?!_next/static|_next/image|favicon.ico|auth|login|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
