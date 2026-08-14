'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { LogOut } from 'lucide-react'

/**
 * Log out lives here rather than in the header and the mobile nav sheet.
 * It is a once-in-a-while action and does not need permanent chrome.
 */
export function AccountActions() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <Card id="account">
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Sign out of this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </CardContent>
    </Card>
  )
}
