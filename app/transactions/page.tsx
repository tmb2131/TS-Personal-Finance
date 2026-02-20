import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TransactionsList } from '@/components/transactions/transactions-list'

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
      <TransactionsList />
    </div>
  )
}
