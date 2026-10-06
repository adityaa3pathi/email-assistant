"use client"

import React from "react"
import { atom, useAtom } from "jotai"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport, type UIMessage } from "ai"
import {
  Send,
  Sparkles,
  Loader2,
  Search,
  Tag,
  FileText,
  Bot,
  X,
  Trash2,
  Calendar,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import useThreads from "@/hooks/use-threads"

export const isAIChatOpenAtom = atom<boolean>(false)

interface AIChatButtonProps {
  isCollapsed?: boolean
  className?: string
}

/**
 * Clean, always-visible trigger button to open the AI Assistant drawer.
 */
export const AIChatButton = ({ isCollapsed, className }: AIChatButtonProps) => {
  const [isOpen, setIsOpen] = useAtom(isAIChatOpenAtom)

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={cn(
              "flex items-center justify-center h-9 w-9 mx-auto rounded-lg transition-all",
              isOpen
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20",
              className
            )}
          >
            <Sparkles className="w-4 h-4" />
            <span className="sr-only">Ask AI Assistant</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Ask AI Assistant</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className={cn(
        "flex items-center justify-between w-full px-3 py-2 rounded-lg transition-all text-xs font-medium",
        isOpen
          ? "bg-purple-600 text-white shadow-sm"
          : "bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-teal-500/10 hover:from-purple-500/20 hover:to-blue-500/20 border border-purple-500/20 text-foreground",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
        <span>Ask AI Assistant</span>
      </div>
      <Badge
        variant="secondary"
        className="text-[9px] px-1.5 py-0 h-4 font-semibold uppercase tracking-wider bg-purple-500/20 text-purple-700 dark:text-purple-300 border-0"
      >
        Agent
      </Badge>
    </button>
  )
}

/**
 * Slide-out AI Copilot Drawer (pinned to right side, full height, zero page-scroll disturbance).
 */
export const AIChatDrawer = () => {
  const { accountId, threadId, account } = useThreads()
  const [isOpen, setIsOpen] = useAtom(isAIChatOpenAtom)
  const [inputValue, setInputValue] = React.useState("")
  const [isExpandedWidth, setIsExpandedWidth] = React.useState(false)

  const { messages, status, sendMessage, setMessages } = useChat({
    transport: new TextStreamChatTransport({
      api: "/api/ai/agent",
      body: {
        accountId,
        threadId,
      },
    }),
    onError: (error: Error) => {
      console.error("AI agent error:", error)
    },
  })

  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const isLoading = status === "streaming" || status === "submitted"

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading) return
    sendMessage({ text: inputValue })
    setInputValue("")
  }

  const handleQuickPrompt = (promptText: string) => {
    if (isLoading) return
    sendMessage({ text: promptText })
  }

  if (!isOpen) return null

  return (
    <>
      {/* Optional Backdrop on small screens */}
      <div
        className="fixed inset-0 z-40 bg-background/30 backdrop-blur-[1px] md:hidden"
        onClick={() => setIsOpen(false)}
      />

      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-screen bg-background border-l shadow-2xl flex flex-col transition-all duration-300 ease-in-out",
          isExpandedWidth
            ? "w-[560px] max-w-full"
            : "w-[390px] sm:w-[420px] max-w-[calc(100vw-20px)]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-transparent select-none shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-7 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <Bot className="size-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold truncate">AI Copilot</span>
                <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded font-medium">
                  LangGraph
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground truncate">
                {account?.emailAddress || "Grounded Email Agent"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-muted-foreground shrink-0">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 hover:text-foreground"
                title="Clear conversation"
                onClick={() => setMessages([])}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="size-7 hover:text-foreground hidden sm:flex"
              title={isExpandedWidth ? "Standard width" : "Expand width"}
              onClick={() => setIsExpandedWidth(!isExpandedWidth)}
            >
              {isExpandedWidth ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="size-7 hover:text-foreground"
              title="Close assistant"
              onClick={() => setIsOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-4 py-8">
              <div className="size-12 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 flex items-center justify-center border border-purple-500/20">
                <Sparkles className="size-6 text-purple-500" />
              </div>
              <div className="space-y-1 max-w-[260px]">
                <p className="text-sm font-semibold text-foreground">How can I help you?</p>
                <p className="text-xs text-muted-foreground">
                  I can search your emails, summarize threads, check calendar events, and draft grounded replies.
                </p>
              </div>

              {/* Quick Suggestion Pills */}
              <div className="w-full flex flex-col gap-1.5 pt-2 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  Suggested Actions
                </p>
                {[
                  { text: "Find emails about job applications & updates", icon: Search },
                  { text: "Summarize recent important emails", icon: FileText },
                  { text: "What meetings or calendar events do I have?", icon: Calendar },
                  { text: "Draft a professional reply to the active thread", icon: Sparkles },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickPrompt(item.text)}
                    className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground text-xs text-foreground transition-all group"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <item.icon className="size-3.5 text-purple-500 shrink-0" />
                      <span className="truncate">{item.text}</span>
                    </div>
                    <ChevronRight className="size-3 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message: UIMessage) => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-1.5",
                message.role === "user" ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "p-3 rounded-xl text-xs leading-relaxed max-w-[90%] shadow-xs",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-xs"
                    : "bg-muted/80 border rounded-bl-xs text-foreground"
                )}
              >
                {/* Render message parts */}
                {message.parts?.map((part, i: number) => {
                  if (part.type === "text") {
                    return (
                      <div key={i} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {part.text}
                      </div>
                    )
                  }
                  if (part.type.startsWith("tool-")) {
                    const toolPart = part as { type: string; toolCallId: string; toolName?: string; state?: string }
                    const toolName = toolPart.toolName || "tool"
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5 pb-1.5 border-b border-border/50"
                      >
                        {toolName === "searchEmails" && <Search className="size-3 text-blue-500" />}
                        {toolName === "classifyThread" && <Tag className="size-3 text-teal-500" />}
                        {toolName === "summarizeThread" && <FileText className="size-3 text-purple-500" />}
                        {toolName === "getThreadDetails" && <FileText className="size-3 text-amber-500" />}
                        {toolName === "draftReply" && <Sparkles className="size-3 text-pink-500" />}
                        <span>
                          {toolPart.state === "result" ? `Ran ${toolName}` : `Invoking ${toolName}...`}
                        </span>
                      </div>
                    )
                  }
                  return null
                })}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border text-xs text-muted-foreground animate-pulse">
              <Loader2 className="size-3.5 animate-spin text-purple-500" />
              <span>Agent reasoning and retrieving tools...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <form onSubmit={handleSubmit} className="p-3 border-t bg-card/50 shrink-0">
          <div className="flex items-center gap-2 bg-background border rounded-lg px-3 py-2 shadow-xs focus-within:ring-1 focus-within:ring-purple-500/50">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask anything about your emails..."
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              variant="default"
              className="size-7 shrink-0 rounded-md bg-purple-600 hover:bg-purple-700 text-white"
              disabled={isLoading || !inputValue.trim()}
            >
              <Send className="size-3" />
            </Button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1.5 px-1">
            <span>Press Enter to send</span>
            <span>Grounded with citations</span>
          </div>
        </form>
      </div>
    </>
  )
}

// Default export for backward compatibility
const AIChatPanel = ({ isCollapsed }: { isCollapsed?: boolean }) => {
  return (
    <>
      <AIChatButton isCollapsed={isCollapsed} />
      <AIChatDrawer />
    </>
  )
}

export default AIChatPanel
