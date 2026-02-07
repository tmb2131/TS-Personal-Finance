import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existing } = await supabase
      .from('account_balances')
      .select('data_source')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
    }

    if (existing.data_source !== 'manual') {
      return NextResponse.json(
        { success: false, error: 'Can only delete manually entered data' },
        { status: 403 }
      )
    }

    const { error } = await supabase.from('account_balances').delete().eq('id', id)

    if (error) {
      console.error('Error deleting account:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Account DELETE error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete account' },
      { status: 500 }
    )
  }
}
