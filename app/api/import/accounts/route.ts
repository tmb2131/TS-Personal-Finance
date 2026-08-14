import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { importAccountsFromSheet } from '@/lib/import-accounts-sheet'
import { finalizeDataPipeline } from '@/lib/ingestion'
import { CACHE_TAGS } from '@/lib/cache-tags'

const BodySchema = z.object({
  /** Parse and diff without writing. */
  dryRun: z.boolean().optional().default(false),
  /** One-off override; otherwise the id stored on the profile is used. */
  spreadsheetId: z.string().min(10).optional(),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('google_accounts_spreadsheet_id')
      .eq('id', user.id)
      .single()

    const spreadsheetId = parsed.data.spreadsheetId ?? profile?.google_accounts_spreadsheet_id
    if (!spreadsheetId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No accounts spreadsheet is configured. Set google_accounts_spreadsheet_id on your profile, or pass spreadsheetId.',
        },
        { status: 400 }
      )
    }

    const result = await importAccountsFromSheet(supabase, {
      spreadsheetId,
      userId: user.id,
      dryRun: parsed.data.dryRun,
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    // A dry run writes nothing, so there is nothing downstream to rebuild.
    if (!result.dryRun && result.rowsWritten > 0) {
      await finalizeDataPipeline({
        supabase,
        userId: user.id,
        context: 'Accounts sheet import',
        rebuildHistoricalNetWorth: true,
        rebuildYoYNetWorth: true,
        revalidate: [CACHE_TAGS.ACCOUNTS, CACHE_TAGS.NET_WORTH],
      })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Accounts import error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to import accounts' },
      { status: 500 }
    )
  }
}
