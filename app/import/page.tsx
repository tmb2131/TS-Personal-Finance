import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CsvImportFlow } from '@/components/import/csv-upload'

export default async function ImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Import Transactions</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Upload a CSV file from your bank to import transactions
        </p>
      </div>
      <CsvImportFlow />
    </div>
  )
}
