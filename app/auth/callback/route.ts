import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { syncGoogleSheet } from '@/lib/sync-google-sheet'
import { recordLastSync } from '@/lib/sync-metadata'
import { rebuildHistoricalNetWorthFromAccountHistory } from '@/lib/snapshot-historical-net-worth'
import { rebuildYoYNetWorthFromAppData } from '@/lib/yoy-net-worth'

const POST_LOGIN_REDIRECT = '/insights?openDaily=1'
const DUMMY_SHEET_ID = '1BxVuJ-DViN5nqpLc-8tGXex_pYiPY8dfL8UV5czCrHY'

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
      let isNewUser: boolean

      // Prefer RPC (one round trip); fall back to select + upsert if RPC missing or fails (e.g. migration not applied)
      const { data: profileResult, error: rpcError } = await supabase
        .rpc('ensure_user_profile', {
          p_id: data.user.id,
          p_email: data.user.email ?? null,
        })
        .single()

      if (!rpcError && profileResult) {
        type EnsureProfileRow = { id: string; email: string | null; google_spreadsheet_id: string | null; is_new: boolean }
        isNewUser = (profileResult as EnsureProfileRow).is_new === true
      } else {
        if (rpcError) {
          console.warn('[auth/callback] ensure_user_profile RPC failed, using fallback:', rpcError.message)
        }
        // Fallback: original select + upsert (two round trips)
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('google_spreadsheet_id')
          .eq('id', data.user.id)
          .single()
        isNewUser = !existingProfile?.google_spreadsheet_id
        await supabase
          .from('user_profiles')
          .upsert(
            {
              id: data.user.id,
              email: data.user.email ?? null,
              updated_at: new Date().toISOString(),
              ...(isNewUser ? { google_spreadsheet_id: DUMMY_SHEET_ID } : {}),
            },
            { onConflict: 'id' }
          )
      }

      // For new users, trigger sync in background (don't block redirect)
      if (isNewUser) {
        // Start sync immediately but don't await - redirect happens right away
        syncGoogleSheet(supabase, {
          spreadsheetId: DUMMY_SHEET_ID,
          userId: data.user.id,
        })
          .then(async (result) => {
            if (result.success) {
              await rebuildHistoricalNetWorthFromAccountHistory(supabase, data.user.id)
              await rebuildYoYNetWorthFromAppData(supabase, data.user.id)
              await recordLastSync(supabase, data.user.id)
              console.log(`[auth/callback] Successfully synced dummy data for user ${data.user.id}`)
            } else {
              console.error(`[auth/callback] Sync completed with errors for user ${data.user.id}:`, result.error)
            }
          })
          .catch((err) => {
            console.error('[auth/callback] Background sync error:', err)
            // Don't throw - this is background work
          })
      }

      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_code_error`)
}
