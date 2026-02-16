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
      <div className="rounded-xl border border-l-[3px] border-l-indigo-500 bg-gradient-to-r from-muted/50 to-muted/30 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold">Kids Accounts</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Track each child&apos;s balances, purpose, and notes with in-app editing.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border bg-background px-2.5 py-1 font-medium">Input Mode: In-App</span>
            </div>
          </div>
          <div className="w-full md:w-auto md:min-w-[220px]">
            <AddKidsAccountDialog
              triggerLabel="Add Kids Account"
              triggerVariant="default"
              triggerSize="default"
              triggerClassName="w-full"
            />
          </div>
        </div>
      </div>
      <KidsAccountsOverview />
    </div>
  )
}
