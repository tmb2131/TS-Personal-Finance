'use client'

import { useState } from 'react'
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
import { MessageCircle, X, Send, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const chatHelpers = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })
  const { messages, sendMessage, setMessages } = chatHelpers
  const isLoading = (chatHelpers as any).isLoading ?? (chatHelpers as any).status === 'loading'

  // Use local state for input - this ensures it always works
  const [localInput, setLocalInput] = useState('')

  // Handler for input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalInput(e.target.value)
  }

  // Custom submit handler using sendMessage (v3 API)
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const valueToSubmit = localInput.trim()
    if (!valueToSubmit || isLoading) return

    setLocalInput('') // Clear input immediately so it feels snappy
    if (sendMessage) {
      await sendMessage({ text: valueToSubmit })
    }
  }

  // Clear chat history
  const handleClearChat = () => {
    setMessages([])
  }

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

          {/* Messages Area - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4 min-h-full">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-12">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-base font-medium">Ask me about your finances!</p>
                  <p className="text-sm mt-2">Try: &quot;What are my account balances?&quot;</p>
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
                    {message.role === 'assistant' && toolParts.length > 0 && (
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        {toolParts.map((tool, idx) => (
                          <div key={idx} className="flex items-center gap-1 text-xs italic">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Using {toolName(tool)}...</span>
                          </div>
                        ))}
                      </div>
                    )}
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
                    {!displayText && message.role === 'assistant' && toolParts.length > 0 && (
                      <div className="text-xs text-muted-foreground italic flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Processing tool results...</span>
                      </div>
                    )}
                    {!displayText && message.role === 'assistant' && toolParts.length === 0 && parts.length > 0 && (
                      <div className="text-xs text-muted-foreground italic">
                        (Message has {parts.length} parts but no text content)
                      </div>
                    )}
                  </div>
                )
              })}
              
              {/* Thinking State - Show immediately after user message */}
              {isLoading && messages.length > 0 && (
                <div className="flex items-start gap-2">
                  <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2 animate-pulse">
                    <div className="flex gap-1">
                      <div className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">AI is thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Area - Pinned to Bottom */}
          <form onSubmit={handleSubmit} className="border-t px-6 py-4 bg-background/50 backdrop-blur-sm">
            <div className="flex gap-2">
              <Input
                value={localInput}
                onChange={handleInputChange}
                placeholder="Ask about your finances..."
                className="flex-1"
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
