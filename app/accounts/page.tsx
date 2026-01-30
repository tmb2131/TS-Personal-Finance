import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountsOverview } from '@/components/accounts/accounts-overview'

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
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Accounts Overview</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Detailed view of all account balances
        </p>
      </div>
      <AccountsOverview />
    </div>
  )
}
