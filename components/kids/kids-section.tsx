'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KidsAccountsOverview } from '@/components/kids/kids-accounts-overview'
import { AddKidsAccountDialog } from '@/components/kids/add-kids-account-dialog'

/**
 * Kids accounts as a section of /position, preserving the hide-when-empty
 * behaviour the retired /kids nav item had: households with no kids data never
 * see the heading at all.
 */
export function KidsSection() {
  const [hasKidsData, setHasKidsData] = useState<boolean | null>(null)

  useEffect(() => {
    const cached = sessionStorage.getItem('findash:hasKidsData')
    if (cached !== null) {
      setHasKidsData(cached === 'true')
      return
    }
    const supabase = createClient()
    supabase
      .from('kids_accounts')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => {
        const has = (count ?? 0) > 0
        setHasKidsData(has)
        sessionStorage.setItem('findash:hasKidsData', String(has))
      })
  }, [])

  if (!hasKidsData) return null

  return (
    <section id="kids" className="scroll-mt-24 border-t pt-4 md:pt-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title">Kids accounts</h2>
        <AddKidsAccountDialog triggerLabel="Add kids account" triggerVariant="outline" />
      </div>
      <KidsAccountsOverview />
    </section>
  )
}
