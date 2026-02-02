import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const POST_LOGIN_REDIRECT = '/insights'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()

    const response = NextResponse.redirect(`${origin}${POST_LOGIN_REDIRECT}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options })
            response.cookies.delete({ name, ...options })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      await supabase
        .from('user_profiles')
        .upsert(
          { id: data.user.id, email: data.user.email ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        )
      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_code_error`)
}