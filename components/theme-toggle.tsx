'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'
  const nextTheme = isDark ? 'light' : 'dark'

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => setTheme(nextTheme)}
      className={cn('h-9 w-9 shrink-0', className)}
      aria-label={mounted ? `Switch to ${nextTheme} mode` : 'Toggle color theme'}
      title={mounted ? `Switch to ${nextTheme} mode` : 'Toggle color theme'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
