'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface ConnectSheetModalProps {
  open: boolean
}

export function ConnectSheetModal({ open }: ConnectSheetModalProps) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(open)
  const [spreadsheetId, setSpreadsheetId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setShowModal(open)
  }, [open])

  const handleSave = async () => {
    const id = spreadsheetId.trim()
    if (!id) {
      toast.error('Please enter a Google Spreadsheet ID')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Not signed in')
        return
      }
      const { error } = await supabase
        .from('user_profiles')
        .update({
          google_spreadsheet_id: id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.info('Syncing data from your sheet…')
      const response = await fetch('/api/sync', { method: 'POST' })
      const result = await response.json().catch(() => ({}))
      if (response.ok && result.success) {
        toast.success('Data synced successfully')
        router.refresh()
        window.location.reload()
        return
      }
      if (!response.ok) {
        toast.error(result.error || 'Sync failed')
      } else {
        toast.warning(result.error || 'Sync completed with errors')
      }
      router.refresh()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Connect your Google Sheet</DialogTitle>
          <DialogDescription>
            Enter your Google Spreadsheet ID to load your data. Find it in the sheet URL:{' '}
            <span className="font-mono text-xs">docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="insights-spreadsheet-id">Google Spreadsheet ID</Label>
          <Input
            id="insights-spreadsheet-id"
            placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving & syncing…' : 'Save and start'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
