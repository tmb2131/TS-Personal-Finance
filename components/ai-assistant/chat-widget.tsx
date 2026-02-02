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
import { MessageCircle, X, Send, Loader2, Trash2, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/utils/cn'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createClient } from '@/lib/supabase/client'

const EMAIL_TO_DISPLAY_NAME: Record<string, string> = {
  'thomas.brosens@gmail.com': 'Tom',
  'sriya.sundaresan@gmail.com': 'Sriya',
  'frank.brosens@gmail.com': 'Frank',
}

function getDisplayNameForEmail(email: string | undefined): string | null {
  if (!email) return null
  return EMAIL_TO_DISPLAY_NAME[email.toLowerCase()] ?? null
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const chatHelpers = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })
  const { messages, sendMessage, setMessages } = chatHelpers
  const isLoading = (chatHelpers as any).isLoading ?? (chatHelpers as any).status === 'loading'

  // Use local state for input - this ensures it always works
  const [localInput, setLocalInput] = useState('')
  // When suggested prompt buttons are clicked, we set this so handleSubmit uses it (same path as form submit)
  const suggestedPromptRef = useRef<string | null>(null)
  // Show "Thinking..." immediately on submit, before hook's isLoading updates (avoids lag)
  const [showThinking, setShowThinking] = useState(false)

  // Show help by default when chat opens and there are no messages
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setShowHelp(true)
    }
  }, [isOpen, messages.length])

  // Clear showThinking when loading finishes or when last message is assistant with text (response arrived)
  useEffect(() => {
    if (!isLoading) setShowThinking(false)
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

    setShowThinking(true) // Show thinking immediately, before any async work
    setLocalInput('') // Clear input immediately so it feels snappy
    if (sendMessage) {
      await sendMessage({ text: valueToSubmit })
    }
  }

  // Clear chat history
  const handleClearChat = () => {
    setMessages([])
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
    const inset = 12
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
        aria-label="Open AI Assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* Chat Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          style={mobileDialogStyle ?? undefined}
          className={cn(
            'p-0 flex flex-col',
            'rounded-2xl backdrop-blur-md bg-background/95',
            'border border-border/50 shadow-2xl',
            '[&>button]:hidden', // Hide default close button since we have custom header
            // Mobile: nearly full screen with small inset; reset base Dialog centering so box stays on-screen
            'fixed left-3 right-3 top-3 h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] translate-x-0 translate-y-0',
            'md:left-[50%] md:right-auto md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] md:h-[80vh] md:max-h-[80vh] md:w-full md:max-w-3xl'
          )}
        >
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between space-y-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <MessageCircle className="h-5 w-5 text-primary" />
              Financial Assistant
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
            <div className="px-6 py-4 border-b bg-muted/30 max-h-[40vh] overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">What can I help you with?</h3>
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
                  <div className="space-y-2">
                    <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Financial Health</h4>
                    <ul className="space-y-1.5">
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'Summarise my financial health'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • Summarise my financial health
                      </li>
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'How am I doing overall? Account values, budget, and spending trends'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • How am I doing overall?
                      </li>
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'Show me account values and trends'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • Show me account values and trends
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Spending Analysis</h4>
                    <ul className="space-y-1.5">
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'How much did I spend last month? Give a breakdown by category'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • How much did I spend last month?
                      </li>
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'Show spending by category'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • Show spending by category
                      </li>
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'How has my Bills spending changed month by month?'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • Monthly trends for [category]
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Budget & Forecast</h4>
                    <ul className="space-y-1.5">
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'What is my current annual spend gap to budget?'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • What's my annual spend gap to budget?
                      </li>
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'How has my annual spend gap changed over the past week?'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • How has my forecast changed vs last week?
                      </li>
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'What drove the increase in my forecasted spend vs last month?'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • What drove the forecast increase?
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Net Worth & Accounts</h4>
                    <ul className="space-y-1.5">
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = "What's my net worth?"
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • What's my net worth?
                      </li>
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = 'Show me my current GBP vs USD breakdown'
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • Show my GBP vs USD breakdown
                      </li>
                      <li 
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={() => {
                          suggestedPromptRef.current = "What's my cash runway?"
                          setShowHelp(false)
                          handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                        }}
                      >
                        • What's my cash runway?
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Messages Area - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4 min-h-full">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
                  <div className="rounded-full bg-primary/10 p-4 mb-5">
                    <MessageCircle className="h-10 w-10 text-primary" aria-hidden />
                  </div>
                  <p className="text-lg font-semibold text-foreground mb-1">
                    {displayName ? (
                      <>Hi {displayName}, I&apos;m here to help!</>
                    ) : (
                      <>Hi, I&apos;m here to help!</>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Ask me anything about your finances—balances, spending, budget, or trends.
                  </p>
                  <p className="text-xs text-muted-foreground/80 mt-4 mb-2">
                    Try:
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={isLoading}
                      onClick={() => {
                        suggestedPromptRef.current = 'Summarise my financial health'
                        handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                      }}
                    >
                      Summarise my financial health
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={isLoading}
                      onClick={() => {
                        suggestedPromptRef.current = 'How much did I spend last month? Give a breakdown by category and compare to the previous 3 month average.'
                        handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                      }}
                    >
                      How much did I spend last month?
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={isLoading}
                      onClick={() => {
                        suggestedPromptRef.current = 'What is my current annual spend gap to budget? How has it changed over the past week, and what were the main drivers of that change?'
                        handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)
                      }}
                    >
                      What's my annual spend gap to budget?
                    </Button>
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

                return (
                  <div
                    key={message.id}
                    className={cn(
                      'flex flex-col gap-2',
                      message.role === 'user' ? 'items-end' : 'items-start'
                    )}
                  >
                    {displayText && (
                      <div
                        className={cn(
                          'rounded-lg px-4 py-3 max-w-[85%] text-sm',
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted prose prose-sm dark:prose-invert max-w-none'
                        )}
                      >
                        {message.role === 'assistant' ? renderMessageContent(displayText) : displayText}
                      </div>
                    )}
                    {!displayText && message.role === 'assistant' && parts.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" strokeWidth={2} />
                        <span>Thinking...</span>
                      </div>
                    )}
                  </div>
                )
              })}
              
              {/* Single loading indicator – shows immediately on submit (showThinking) and until response (isLoading) */}
              {(showThinking || isLoading) && messages.length > 0 && (
                <div className="flex items-start gap-2">
                  <div
                    className="flex items-center justify-center rounded-full border border-border/60 bg-muted/40 p-3 shadow-sm"
                    aria-label="Loading"
                  >
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" strokeWidth={2} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Area - Pinned to Bottom. text-[16px] prevents iOS zoom on focus; touch-action avoids double-tap zoom */}
          <form onSubmit={handleSubmit} className="border-t px-6 py-4 bg-background/50 backdrop-blur-sm touch-manipulation">
            <div className="flex gap-2">
              <Input
                value={localInput}
                onChange={handleInputChange}
                placeholder="Ask about your finances..."
                className="flex-1 text-base min-[768px]:text-sm"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e as any)
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
