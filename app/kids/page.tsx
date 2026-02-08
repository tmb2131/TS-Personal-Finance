import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KidsAccountsOverview } from '@/components/kids/kids-accounts-overview'
import { AddKidsAccountDialog } from '@/components/kids/add-kids-account-dialog'

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Kids Accounts</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Overview of kids account balances
          </p>
        </div>
        <AddKidsAccountDialog />
      </div>
      <KidsAccountsOverview />
    </div>
  )
}
