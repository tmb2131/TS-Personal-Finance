'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Monitor, Sun, Moon } from 'lucide-react'

const themes = [
  { value: 'system', label: 'System', icon: Monitor, description: 'Follow your OS setting' },
  { value: 'light', label: 'Light', icon: Sun, description: 'Light background' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Dark background' },
] as const

export function AppearanceForm() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how the app looks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[88px]" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how the app looks. System follows your device preference.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Label>Theme</Label>
        <div className="grid grid-cols-3 gap-3">
          {themes.map(({ value, label, icon: Icon, description }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                theme === value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground text-center">{description}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
