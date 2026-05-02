import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KidsAccountsOverview } from '@/components/kids/kids-accounts-overview'
import { AddKidsAccountDialog } from '@/components/kids/add-kids-account-dialog'
import { PageHeader, PageHeaderBadge } from '@/components/ui/page-header'

export default async function KidsAccountsPage() {
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
        title="Kids Accounts"
        description="Track each child's balances, purpose, and notes with in-app editing."
        accent="indigo"
        badges={<PageHeaderBadge>Input Mode: In-App</PageHeaderBadge>}
        actions={
          <AddKidsAccountDialog
            triggerLabel="Add Kids Account"
            triggerVariant="default"
            triggerSize="default"
          />
        }
      />
      <KidsAccountsOverview />
    </div>
  )
}
