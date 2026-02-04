'use client'

import { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MessageCircle, X, Send, Loader2, Trash2, HelpCircle, ChevronDown, ChevronUp, Copy, Check, AlertCircle, ArrowDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

const EMAIL_TO_DISPLAY_NAME: Record<string, string> = {
  'thomas.brosens@gmail.com': 'Tom',
  'sriya.sundaresan@gmail.com': 'Sriya',
  'frank.brosens@gmail.com': 'Frank',
  'deenie.brosens@gmail.com': 'Deenie',
  'cbrosens2010@gmail.com': 'Charlie',
  'jbrosens92@gmail.com': 'John',
  'pbb2102@gmail.com': 'Pete',
}

/**
 * Guess display name from email for welcome screen.
 * Uses known mappings first; otherwise derives from local part (e.g. lindsay.casson@... → Lindsay).
 */
function getDisplayNameForEmail(email: string | undefined): string | null {
  if (!email) return null
  const key = email.toLowerCase().trim()
  const mapped = EMAIL_TO_DISPLAY_NAME[key]
  if (mapped) return mapped
  const local = key.split('@')[0]
  if (!local) return null
  // Use segment before first dot (e.g. lindsay.casson → Lindsay), or whole local part
  const segment = local.includes('.') ? local.split('.')[0]! : local
  // Capitalize: first letter upper, rest lower (strip trailing digits for cleaner fallback)
  const name = segment.replace(/\d+$/, '').trim() || segment
  if (!name) return null
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

// Tool name to display name mapping
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'get_financial_snapshot': 'Fetching financial snapshot',
  'analyze_spending': 'Analyzing spending data',
  'get_budget_vs_actual': 'Calculating budget comparison',
  'analyze_forecast_evolution': 'Analyzing forecast evolution',
  'get_financial_health_summary': 'Analyzing financial health',
  'analyze_monthly_category_trends': 'Analyzing monthly trends',
  'get_net_worth_trend': 'Analyzing net worth trends',
  'get_cash_runway': 'Calculating cash runway',
  'search_web': 'Searching the web for comparative data',
}

export function ChatWidget() {
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [activeTools, setActiveTools] = useState<Set<string>>(new Set())
  const [messageTimestamps, setMessageTimestamps] = useState<Map<string, Date>>(new Map())
  const [collapsedHelpSections, setCollapsedHelpSections] = useState<Set<string>>(new Set())
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[]>([])
  const [swipingMessageId, setSwipingMessageId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [dialogSwipeOffset, setDialogSwipeOffset] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastUserMessageRef = useRef<string>('')
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const dialogTouchStartRef = useRef<{ y: number; scrollTop: number } | null>(null)
  const activeSwipeMessageRef = useRef<string | null>(null)
  const swipeDirectionLockedRef = useRef<boolean>(false)
  
  const chatHelpers = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: (error) => {
      console.error('[ChatWidget] Error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to get response. Please try again.'
      setError(errorMessage)
      toast.error('Chat Error', {
        description: errorMessage,
        action: {
          label: 'Retry',
          onClick: () => {
            setError(null)
            // Retry last message if available
            if (lastUserMessageRef.current && sendMessage) {
              sendMessage({ text: lastUserMessageRef.current })
            }
          },
        },
      })
    },
  })
  const { messages, sendMessage, setMessages } = chatHelpers
  const isLoading = (chatHelpers as any).isLoading ?? (chatHelpers as any).status === 'loading'

  // Track timestamps for new messages
  useEffect(() => {
    messages.forEach((message) => {
      if (!messageTimestamps.has(message.id)) {
        setMessageTimestamps((prev) => {
          const next = new Map(prev)
          next.set(message.id, new Date())
          return next
        })
      }
    })
  }, [messages, messageTimestamps])

  // Use local state for input - this ensures it always works
  const [localInput, setLocalInput] = useState('')
  // When suggested prompt buttons are clicked, we set this so handleSubmit uses it (same path as form submit)
  const suggestedPromptRef = useRef<string | null>(null)
  // Show "Thinking..." immediately on submit, before hook's isLoading updates (avoids lag)
  const [showThinking, setShowThinking] = useState(false)

  // Reset swipe states when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setDialogSwipeOffset(0)
      setSwipeOffset(0)
      setSwipingMessageId(null)
      touchStartRef.current = null
      dialogTouchStartRef.current = null
      activeSwipeMessageRef.current = null
      swipeDirectionLockedRef.current = false
      // Also close help panel when dialog closes
      setShowHelp(false)
    }
  }, [isOpen])

  // Track active tools from messages
  useEffect(() => {
    const tools = new Set<string>()
    messages.forEach((message) => {
      if (message.role === 'assistant') {
        const parts = message.parts ?? []
        parts.forEach((p: any) => {
          const toolName = p.toolName || (p.type?.startsWith('tool-') ? p.type.replace(/^tool-/, '') : null)
          if (toolName && !p.result) {
            // Tool is being executed (no result yet)
            tools.add(toolName)
          }
        })
      }
    })
    setActiveTools(tools)
  }, [messages])

  // Auto-scroll to bottom when new messages arrive (only if already near bottom)
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    if (isNearBottom || messages.length <= 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      setShowScrollButton(false)
    }
  }, [messages])

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      setShowScrollButton(!isNearBottom && messages.length > 0)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [messages.length])

  // Generate suggested follow-ups based on last assistant message
  useEffect(() => {
    if (messages.length === 0) {
      setSuggestedFollowUps([])
      return
    }

    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== 'assistant') {
      setSuggestedFollowUps([])
      return
    }

    const parts = lastMessage.parts ?? []
    const textParts = parts.filter((p: any) => p.type === 'text')
    const textContent = textParts
      .map((p: any) => p.text || '')
      .filter(Boolean)
      .join('')

    if (!textContent || textContent.length < 50) {
      setSuggestedFollowUps([])
      return
    }

    // Generate contextual follow-ups based on message content
    const followUps: string[] = []
    const lowerContent = textContent.toLowerCase()

    if (lowerContent.includes('net worth') || lowerContent.includes('balance')) {
      followUps.push('Show me spending trends')
      followUps.push('What is my cash runway?')
    } else if (lowerContent.includes('spending') || lowerContent.includes('expense')) {
      followUps.push('How does this compare to my budget?')
      followUps.push('Show me monthly trends')
    } else if (lowerContent.includes('budget') || lowerContent.includes('forecast')) {
      followUps.push('What drove the forecast change?')
      followUps.push('Show me category breakdown')
    } else {
      followUps.push('Tell me more about this')
      followUps.push('What are the key trends?')
    }

    setSuggestedFollowUps(followUps.slice(0, 2))
  }, [messages])

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure dialog is fully rendered
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Clear error when new message is sent
  useEffect(() => {
    if (localInput.trim() && !isLoading) {
      setError(null)
    }
  }, [localInput, isLoading])

  // Clear showThinking when loading finishes or when last message is assistant with text (response arrived)
  useEffect(() => {
    if (!isLoading) {
      setShowThinking(false)
      setError(null)
    }
  }, [isLoading])
  useEffect(() => {
    if (!messages.length || !showThinking) return
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return
    const parts = last.parts ?? []
    const hasText = parts.some((p: { type?: string; text?: string }) => {
      if (p.type === 'text' && typeof (p as { text?: string }).text === 'string') return (p as { text: string }).text.length > 0
      return false
    })
    if (hasText) setShowThinking(false)
  }, [messages, showThinking])

  // Handler for input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalInput(e.target.value)
  }

  // Custom submit handler using sendMessage (v3 API). Reads from suggestedPromptRef when set (by suggested buttons).
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const valueToSubmit = (suggestedPromptRef.current ?? localInput).trim()
    suggestedPromptRef.current = null
    if (!valueToSubmit || isLoading) return

    // Store last user message for retry functionality
    lastUserMessageRef.current = valueToSubmit
    
    setError(null) // Clear any previous errors
    setShowThinking(true) // Show thinking immediately, before any async work
    setLocalInput('') // Clear input immediately so it feels snappy
    if (sendMessage) {
      try {
        await sendMessage({ text: valueToSubmit })
      } catch (err) {
        // Error is handled by onError callback, but we can also handle here
        console.error('[ChatWidget] Submit error:', err)
      }
    }
  }

  // Copy message to clipboard
  const handleCopyMessage = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (err) {
      toast.error('Failed to copy')
      console.error('Copy error:', err)
    }
  }

  // Format timestamp for message
  const formatMessageTime = (messageId: string) => {
    const timestamp = messageTimestamps.get(messageId)
    if (!timestamp) return null
    try {
      return formatDistanceToNow(timestamp, { addSuffix: true })
    } catch {
      return null
    }
  }

  // Toggle help section collapse
  const toggleHelpSection = (section: string) => {
    setCollapsedHelpSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  // Scroll to bottom manually
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape closes dialog
    if (e.key === 'Escape' && !isLoading) {
      setIsOpen(false)
      return
    }
    
    // Cmd/Ctrl + K focuses input
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      inputRef.current?.focus()
      return
    }
  }

  // Swipe gesture handlers for messages (swipe left to delete)
  const handleMessageTouchStart = (e: React.TouchEvent, messageId: string) => {
    // Only enable swipe on touch devices
    if (!('ontouchstart' in window)) return

    const touch = e.touches[0]
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    }
    activeSwipeMessageRef.current = messageId
    swipeDirectionLockedRef.current = false
    setSwipingMessageId(messageId)
  }

  const handleMessageTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !activeSwipeMessageRef.current) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    // Once we've committed to horizontal (lock), follow finger for the rest of the gesture
    // so vertical drift doesn't freeze or cancel the swipe.
    if (swipeDirectionLockedRef.current) {
      const offset = Math.max(-120, Math.min(deltaX, 0))
      setSwipeOffset(offset)
      e.preventDefault()
      return
    }

    // Decide to lock: horizontal dominates and we've moved at least 20px horizontally
    if (absX > 20 && absX > absY) {
      swipeDirectionLockedRef.current = true
      const offset = Math.max(-120, Math.min(deltaX, 0))
      setSwipeOffset(offset)
      e.preventDefault()
      return
    }

    // Before lock: only treat as horizontal swipe if clearly horizontal and minimal vertical
    if (absX > absY && absY < 40 && deltaX < 0) {
      const maxSwipe = -120
      setSwipeOffset(Math.max(deltaX, maxSwipe))
      e.preventDefault()
    } else if (deltaX > 0 && swipeOffset < 0) {
      // Swiping back right to cancel
      setSwipeOffset(Math.min(deltaX, 0))
      e.preventDefault()
    }
  }

  const handleMessageTouchEnd = (e: React.TouchEvent) => {
    const messageId = activeSwipeMessageRef.current
    if (!touchStartRef.current || !messageId) {
      setSwipeOffset(0)
      setSwipingMessageId(null)
      activeSwipeMessageRef.current = null
      swipeDirectionLockedRef.current = false
      return
    }

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaTime = Date.now() - touchStartRef.current.time

    if (deltaX < -80 || (deltaX < -40 && deltaTime < 300)) {
      const messageToDelete = messages.find((m) => m.id === messageId)
      if (messageToDelete) {
        const newMessages = messages.filter((m) => m.id !== messageId)
        setMessages(newMessages)
        setMessageTimestamps((prev) => {
          const next = new Map(prev)
          next.delete(messageId)
          return next
        })
        toast.success('Message deleted')
      }
    }

    setTimeout(() => {
      setSwipeOffset(0)
      setSwipingMessageId(null)
      touchStartRef.current = null
      activeSwipeMessageRef.current = null
      swipeDirectionLockedRef.current = false
    }, 200)
  }

  // Swipe down to close dialog (on mobile, swipe from header)
  const handleDialogTouchStart = (e: React.TouchEvent) => {
    // Don't start dialog swipe if already swiping a message
    if (swipingMessageId) return
    
    const touch = e.touches[0]
    const container = messagesContainerRef.current
    dialogTouchStartRef.current = {
      y: touch.clientY,
      scrollTop: container?.scrollTop || 0,
      time: Date.now(),
    } as any
  }

  const handleDialogTouchMove = (e: React.TouchEvent) => {
    // Don't handle dialog swipe if swiping a message
    if (swipingMessageId) return
    if (!dialogTouchStartRef.current) return

    const touch = e.touches[0]
    const container = messagesContainerRef.current
    const deltaY = touch.clientY - dialogTouchStartRef.current.y
    const deltaX = Math.abs(touch.clientX - (dialogTouchStartRef.current as any).x || 0)

    // Only allow swipe down if:
    // 1. Scrolled to top (or very close) OR swiping from header
    // 2. Swiping down (positive deltaY) and vertical movement > horizontal
    // 3. On mobile (narrow screen)
    const isAtTop = (container?.scrollTop || 0) < 10
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const target = e.target as HTMLElement
    const isHeader = target.closest('[role="dialog"] > div:first-child') !== null

    if (isMobile && (isAtTop || isHeader) && deltaY > 0 && deltaY > deltaX && deltaY < 300) {
      setDialogSwipeOffset(deltaY)
      // Only prevent default if swiping from header or if already swiping
      if (isHeader || dialogSwipeOffset > 0) {
        e.preventDefault() // Prevent scrolling while swiping
      }
    }
  }

  const handleDialogTouchEnd = (e: React.TouchEvent) => {
    // Don't handle dialog swipe if swiping a message
    if (swipingMessageId) return
    if (!dialogTouchStartRef.current) return

    const touch = e.changedTouches[0]
    const deltaY = touch.clientY - dialogTouchStartRef.current.y
    const deltaTime = Date.now() - (dialogTouchStartRef.current as any).time || 500

    // Require a deliberate swipe to close (less sensitive on mobile):
    // - Long swipe: at least 180px down, or
    // - Quick flick: at least 120px down in under 250ms
    if (deltaY > 180 || (deltaY > 120 && deltaTime < 250)) {
      setIsOpen(false)
    }

    // Reset swipe state with animation
    setTimeout(() => {
      setDialogSwipeOffset(0)
      dialogTouchStartRef.current = null
    }, 200)
  }

  // Clear chat history
  const handleClearChat = () => {
    setMessages([])
    setMessageTimestamps(new Map())
    setError(null)
  }

  // Resolve display name from current user email (for personalized welcome)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const name = getDisplayNameForEmail(session?.user?.email)
      setDisplayName(name)
    })
  }, [])

  // On mobile: size/position dialog to visual viewport so it "lifts" above the keyboard (no zoom)
  const [mobileDialogStyle, setMobileDialogStyle] = useState<React.CSSProperties | null>(null)
  useEffect(() => {
    if (!isOpen) {
      setMobileDialogStyle(null)
      return
    }
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768
    if (!isNarrow || typeof window === 'undefined' || !window.visualViewport) {
      return
    }
    const vv = window.visualViewport
    const inset = 8
    const update = () => {
      setMobileDialogStyle({
        top: vv.offsetTop + inset,
        height: vv.height - inset * 2,
        maxHeight: vv.height - inset * 2,
      })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setMobileDialogStyle(null)
    }
  }, [isOpen])

  // Render markdown content with proper formatting
  const renderMessageContent = (text: string) => {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Style tables with borders
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full divide-y divide-border border border-border rounded-md">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
            th: ({ children }) => (
              <th className="px-4 py-2 text-left text-sm font-semibold border-b border-border">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-2 text-sm border-b border-border">
                {children}
              </td>
            ),
            // Style code blocks
            code: ({ className, children, ...props }) => {
              const isInline = !className
              return isInline ? (
                <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            },
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <>
      {/* Floating Action Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 md:bottom-4 h-14 w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90"
        size="icon"
        aria-label="Open the AI Financial Assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* Chat Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          style={{
            ...(mobileDialogStyle ?? {}),
            transform: dialogSwipeOffset > 0 ? `translateY(${dialogSwipeOffset}px)` : undefined,
            opacity: dialogSwipeOffset > 0 ? Math.max(0.7, 1 - dialogSwipeOffset / 300) : undefined,
            transition: dialogSwipeOffset === 0 ? 'transform 0.2s ease-out, opacity 0.2s ease-out' : 'none',
          }}
          className={cn(
            'p-0 flex flex-col',
            'rounded-2xl backdrop-blur-md bg-background/95',
            'border border-border/50 shadow-2xl',
            '[&>button]:hidden', // Hide default close button since we have custom header
            // Mobile: most of screen height with minimal inset; reset base Dialog centering so box stays on-screen
            'fixed left-2 right-2 top-2 h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] translate-x-0 translate-y-0',
            'md:left-[50%] md:right-auto md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] md:h-[80vh] md:max-h-[80vh] md:w-full md:max-w-3xl'
          )}
          onKeyDown={handleKeyDown}
          onTouchStart={handleDialogTouchStart}
          onTouchMove={handleDialogTouchMove}
          onTouchEnd={handleDialogTouchEnd}
        >
          {/* Header - Swipeable on mobile */}
          <DialogHeader 
            className="px-6 py-4 border-b flex flex-row items-center justify-between space-y-0 touch-none select-none"
            onTouchStart={handleDialogTouchStart}
            onTouchMove={handleDialogTouchMove}
            onTouchEnd={handleDialogTouchEnd}
          >
            {/* Swipe indicator */}
            {dialogSwipeOffset > 0 && (
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-muted-foreground/30 rounded-full" />
            )}
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <MessageCircle className="h-5 w-5 text-primary" />
              The AI Financial Assistant
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHelp(!showHelp)}
                className="h-8 text-xs"
                aria-label="Toggle help"
              >
                <HelpCircle className="h-4 w-4 mr-1" />
                Help
              </Button>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearChat}
                  className="h-8 w-8"
                  aria-label="Clear chat"
                  title="Clear chat"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          {/* Help Panel */}
          {showHelp && (
            <div className="px-6 py-4 border-b bg-muted/30 max-h-[40vh] overflow-y-auto animate-in slide-in-from-top duration-200">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {displayName ? (
                        <>Hello, {displayName}! What can I help you with?</>
                      ) : (
                        <>Hello! What can I help you with?</>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ask me anything about our finances: balances, spending, budget, or trends.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowHelp(false)}
                    className="h-6 w-6"
                    aria-label="Close help"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {[
                    {
                      id: 'financial-health',
                      title: 'Financial Health',
                      items: [
                        { prompt: 'Summarise my financial health', label: 'Summarise my financial health' },
                        { prompt: 'How am I doing overall? Account values, budget, and spending trends', label: 'How am I doing overall?' },
                        { prompt: 'Show me account values and trends', label: 'Show me account values and trends' },
                      ],
                    },
                    {
                      id: 'spending-analysis',
                      title: 'Spending Analysis',
                      items: [
                        { prompt: 'How much did I spend last month? Give a breakdown by category', label: 'How much did I spend last month?' },
                        { prompt: 'Show spending by category', label: 'Show spending by category' },
                        { prompt: 'How has my Bills spending changed month by month?', label: 'Monthly trends for [category]' },
                      ],
                    },
                    {
                      id: 'budget-forecast',
                      title: 'Budget & Forecast',
                      items: [
                        { prompt: 'What is my current annual spend gap to budget?', label: "What's my annual spend gap to budget?" },
                        { prompt: 'How has my annual spend gap changed over the past week?', label: 'How has my forecast changed vs last week?' },
                        { prompt: 'What drove the increase in my forecasted spend vs last month?', label: 'What drove the forecast increase?' },
                      ],
                    },
                    {
                      id: 'net-worth',
                      title: 'Net Worth & Accounts',
                      items: [
                        { prompt: "What's my net worth?", label: "What's my net worth?" },
                        { prompt: 'Show me my current GBP vs USD breakdown', label: 'Show my GBP vs USD breakdown' },
                        { prompt: "What's my cash runway?", label: "What's my cash runway?" },
                      ],
                    },
                  ].map((section) => {
                    const isCollapsed = collapsedHelpSections.has(section.id)
                    return (
                      <div key={section.id} className="space-y-2">
                        <button
                          onClick={() => toggleHelpSection(section.id)}
                          className="flex items-center justify-between w-full font-semibold text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span>{section.title}</span>
                          {isCollapsed ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronUp className="h-3 w-3" />
                          )}
                        </button>
                        {!isCollapsed && (
                          <ul className="space-y-1.5 animate-in slide-in-from-top duration-200">
                            {section.items.map((item, idx) => (
                              <li
                                key={idx}
                                className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                onClick={() => {
                                  suggestedPromptRef.current = item.prompt
                                  setShowHelp(false)
                                  handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                                }}
                              >
                                • {item.label}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Messages Area - Scrollable */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-6 py-4 relative"
          >
            {/* Scroll to bottom button */}
            {showScrollButton && (
              <div className="sticky bottom-4 flex justify-end mb-2 z-10">
                <Button
                  onClick={scrollToBottom}
                  className="h-10 w-10 rounded-full shadow-lg bg-primary hover:bg-primary/90 animate-in fade-in slide-in-from-bottom-4 duration-200"
                  size="icon"
                  aria-label="Scroll to bottom"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="space-y-4 min-h-full">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4 animate-in fade-in duration-300">
                  <div className="rounded-full bg-primary/10 p-6 mb-6 animate-in zoom-in duration-500">
                    <MessageCircle className="h-12 w-12 text-primary" aria-hidden />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {displayName ? `Hello, ${displayName}!` : 'Welcome to the AI Financial Assistant'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md">
                    Ask me anything about your finances. I can help with balances, spending analysis, budget tracking, and forecast insights.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
                    {[
                      { prompt: "What's my net worth?", title: 'Net Worth', desc: 'View current balances' },
                      { prompt: 'How much did I spend last month?', title: 'Spending', desc: 'Analyze expenses' },
                      { prompt: 'What is my current annual spend gap to budget?', title: 'Budget', desc: 'Check budget status' },
                      { prompt: 'Summarise my financial health', title: 'Overview', desc: 'Financial summary' },
                    ].map((card, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          suggestedPromptRef.current = card.prompt
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                        className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-all text-left group animate-in fade-in slide-in-from-bottom-4 duration-300"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">{card.title}</div>
                        <div className="text-xs text-muted-foreground">{card.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((message) => {
                // Debug: log message structure
                if (process.env.NODE_ENV === 'development') {
                  console.log('[ChatWidget] Message:', {
                    id: message.id,
                    role: message.role,
                    parts: message.parts,
                    hasContent: 'content' in message,
                    content: (message as { content?: string }).content,
                  })
                }

                // AI SDK v3 uses message.parts (array of { type, text?, ... }) instead of message.content
                const parts = message.parts ?? []
                
                // Extract text from all text parts - handle both complete and streaming states
                const textParts = parts.filter((p) => {
                  const partType = typeof p.type === 'string' ? p.type : (p as any).type
                  return partType === 'text'
                })
                const textContent = textParts
                  .map((p: any) => {
                    // Handle different possible structures
                    if (p.text && typeof p.text === 'string') {
                      return p.text
                    }
                    if (p.content && typeof p.content === 'string') {
                      return p.content
                    }
                    // Check for nested text property
                    if (p.parts && Array.isArray(p.parts)) {
                      return p.parts
                        .filter((sub: any) => sub.type === 'text')
                        .map((sub: any) => sub.text || '')
                        .join('')
                    }
                    return ''
                  })
                  .filter(Boolean)
                  .join('')
                
                // Debug: log if we have parts but no text
                if (process.env.NODE_ENV === 'development' && parts.length > 0 && !textContent) {
                  console.warn('[ChatWidget] Parts found but no text extracted:', {
                    partsCount: parts.length,
                    partsTypes: parts.map((p: any) => p.type || typeof p),
                    partsStructure: parts.map((p: any) => Object.keys(p)),
                  })
                }
                
                const toolParts = parts.filter(
                  (p) => 
                    (typeof p.type === 'string' && p.type.startsWith('tool-')) || 
                    p.type === 'dynamic-tool' ||
                    (p as { type?: string }).type === 'dynamic-tool'
                )
                const toolName = (p: (typeof parts)[number]) => {
                  if ('toolName' in p && typeof p.toolName === 'string') {
                    return p.toolName
                  }
                  if ('type' in p && typeof p.type === 'string') {
                    return p.type.replace(/^tool-/, '').replace(/^dynamic-tool/, 'dynamic-tool')
                  }
                  return 'unknown-tool'
                }

                // Fallback: check if message has content property (for backwards compatibility)
                const fallbackContent = (message as { content?: string }).content
                const displayText = textContent || fallbackContent || ''

                // Get message timestamp
                const messageTime = formatMessageTime(message.id)

                const isSwiping = swipingMessageId === message.id
                const deleteThreshold = -80
                const shouldDelete = swipeOffset < deleteThreshold

                return (
                  <div
                    key={message.id}
                    className={cn(
                      'flex flex-col gap-1.5 group animate-in fade-in slide-in-from-bottom-2 duration-300',
                      message.role === 'user' ? 'items-end' : 'items-start',
                      'relative touch-pan-y' // Allow vertical scroll; we take over for horizontal swipe
                    )}
                    style={{
                      transform: isSwiping ? `translateX(${swipeOffset}px)` : undefined,
                      opacity: isSwiping ? Math.max(0.5, 1 + swipeOffset / 200) : undefined,
                      transition: isSwiping ? 'none' : 'transform 0.2s ease-out, opacity 0.2s ease-out',
                    }}
                    onTouchStart={(e) => handleMessageTouchStart(e, message.id)}
                    onTouchMove={handleMessageTouchMove}
                    onTouchEnd={handleMessageTouchEnd}
                  >
                    {/* Delete indicator */}
                    {isSwiping && swipeOffset < 0 && (
                      <div
                        className={cn(
                          'absolute right-0 top-0 bottom-0 flex items-center justify-center px-4',
                          'bg-destructive text-destructive-foreground rounded-xl',
                          'transition-opacity duration-200',
                          shouldDelete ? 'opacity-100' : 'opacity-50'
                        )}
                        style={{ width: Math.abs(swipeOffset) }}
                      >
                        <Trash2 className={cn('h-5 w-5', shouldDelete && 'scale-110')} />
                      </div>
                    )}
                    {displayText && (
                      <div className="flex flex-col gap-1 max-w-[85%] relative z-10">
                        <div
                          className={cn(
                            'rounded-xl px-4 py-3 text-sm shadow-sm relative',
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted prose prose-sm dark:prose-invert max-w-none',
                            isSwiping && 'pointer-events-none' // Disable interactions while swiping
                          )}
                        >
                          {message.role === 'assistant' ? (
                            <div className="relative">
                              {renderMessageContent(displayText)}
                              {/* Copy button - shows on hover for assistant messages */}
                              <button
                                onClick={() => handleCopyMessage(displayText, message.id)}
                                className={cn(
                                  'absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity',
                                  'bg-background/80 hover:bg-background border border-border/50',
                                  'text-muted-foreground hover:text-foreground'
                                )}
                                aria-label="Copy message"
                                title="Copy to clipboard"
                              >
                                {copiedMessageId === message.id ? (
                                  <Check className="h-3.5 w-3.5 text-green-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            displayText
                          )}
                        </div>
                        {/* Timestamp */}
                        {messageTime && (
                          <span className="text-xs text-muted-foreground px-1">
                            {messageTime}
                          </span>
                        )}
                        {/* Suggested follow-ups for assistant messages */}
                        {message.role === 'assistant' && 
                         message.id === messages[messages.length - 1]?.id && 
                         suggestedFollowUps.length > 0 && 
                         !isLoading && (
                          <div className="flex flex-wrap gap-2 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {suggestedFollowUps.map((followUp, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  suggestedPromptRef.current = followUp
                                  handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                                }}
                                className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                              >
                                {followUp}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {!displayText && message.role === 'assistant' && parts.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" strokeWidth={2} />
                          <span>Thinking...</span>
                        </div>
                        {/* Show active tool indicators */}
                        {activeTools.size > 0 && (
                          <div className="flex flex-col gap-1.5 mt-1">
                            {Array.from(activeTools).map((toolName) => (
                              <div
                                key={toolName}
                                className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5"
                              >
                                <Loader2 className="h-3 w-3 animate-spin shrink-0" strokeWidth={2} />
                                <span>{TOOL_DISPLAY_NAMES[toolName] || `Running ${toolName}...`}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              
              {/* Single loading indicator – shows immediately on submit (showThinking) and until response (isLoading) */}
              {(showThinking || isLoading) && messages.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <div
                      className="flex items-center justify-center rounded-full border border-border/60 bg-muted/40 p-3 shadow-sm"
                      aria-label="Loading"
                    >
                      <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" strokeWidth={2} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">Processing your request...</span>
                      {/* Show active tool indicators */}
                      {activeTools.size > 0 && (
                        <div className="flex flex-col gap-1.5 mt-1">
                          {Array.from(activeTools).map((toolName) => (
                            <div
                              key={toolName}
                              className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5"
                            >
                              <Loader2 className="h-3 w-3 animate-spin shrink-0" strokeWidth={2} />
                              <span>{TOOL_DISPLAY_NAMES[toolName] || `Running ${toolName}...`}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Error message display */}
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/50 bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-destructive mb-1">Error</div>
                    <div className="text-sm text-muted-foreground">{error}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setError(null)
                        if (lastUserMessageRef.current && sendMessage) {
                          sendMessage({ text: lastUserMessageRef.current })
                        }
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area - Pinned to Bottom. text-[16px] prevents iOS zoom on focus; touch-action avoids double-tap zoom */}
          <form onSubmit={handleSubmit} className="border-t px-6 py-4 bg-background/50 backdrop-blur-sm touch-manipulation">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={localInput}
                onChange={handleInputChange}
                placeholder={isMobile ? 'Ask about your finances...' : 'Ask about your finances... (Press Cmd+K to focus)'}
                className="flex-1 text-base min-[768px]:text-sm"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e as any)
                  }
                  // Escape clears input
                  if (e.key === 'Escape' && localInput) {
                    e.preventDefault()
                    setLocalInput('')
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={isLoading || !localInput.trim()}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
