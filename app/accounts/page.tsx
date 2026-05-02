import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountsOverview } from '@/components/accounts/accounts-overview'
import { AddAccountDialog } from '@/components/accounts/add-account-dialog'
import { PageHeader, PageHeaderBadge } from '@/components/ui/page-header'

export default async function AccountsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Accounts Overview"
        description="Add and edit account balances directly in-app."
        accent="blue"
        badges={
          <>
            <PageHeaderBadge>Input Mode: In-App</PageHeaderBadge>
            <PageHeaderBadge>Optional refresh: Google Sheet transactions</PageHeaderBadge>
          </>
        }
        actions={
          <AddAccountDialog
            triggerLabel="Add Account"
            triggerVariant="default"
            triggerSize="default"
          />
        }
      />
      <AccountsOverview />
    </div>
  )
}
