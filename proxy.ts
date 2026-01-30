import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getAllowedEmails } from '@/lib/allowed-emails'

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
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const allowedEmails = getAllowedEmails()

  // Allow login page (redirect to insights if already allowed user)
  if (pathname === '/login') {
    if (user && allowedEmails.includes(user.email || '')) {
      return NextResponse.redirect(new URL('/insights', request.url))
    }
    return response
  }

  // Protect all other routes
  if (!user) {
    // API routes: return 401 JSON so client can handle (e.g. chat widget)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Restrict to allowed emails
  if (!allowedEmails.includes(user.email || '')) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth|login|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
