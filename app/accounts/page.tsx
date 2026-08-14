import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountsOverview } from '@/components/accounts/accounts-overview'
import { AddAccountDialog } from '@/components/accounts/add-account-dialog'
import { ImportAccountsButton } from '@/components/accounts/import-accounts-button'
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
        description="Add and edit account balances in-app, or import the latest values from the master sheet."
        accent="blue"
        badges={
          <>
            <PageHeaderBadge>Input Mode: In-App</PageHeaderBadge>
            <PageHeaderBadge>Optional refresh: Google Sheet transactions</PageHeaderBadge>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <ImportAccountsButton />
            <AddAccountDialog
              triggerLabel="Add Account"
              triggerVariant="default"
              triggerSize="default"
            />
          </div>
        }
      />
      <AccountsOverview />
    </div>
  )
}
