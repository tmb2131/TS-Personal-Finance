import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TransactionsList } from '@/components/transactions/transactions-list'
import { PageHeader } from '@/components/ui/page-header'

export default async function TransactionsPage() {
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
        title="Transactions"
        description="Search, filter, and review your synced and imported transactions."
        accent="blue"
      />
      <TransactionsList />
    </div>
  )
}
