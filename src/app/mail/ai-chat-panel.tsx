"use client"

import React from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport, type UIMessage } from "ai"
import { Send, Sparkles, Loader2, Search, Tag, FileText, Bot, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import useThreads from "@/hooks/use-threads"

const AIChatPanel = () => {
  const { accountId, threadId } = useThreads()
  const [isOpen, setIsOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")

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
  const isLoading = status === "streaming" || status === "submitted"

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading) return
    sendMessage({ text: inputValue })
    setInputValue("")
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 mx-2 mb-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 hover:from-purple-500/20 hover:to-blue-500/20 border border-purple-500/20 transition-all text-sm"
      >
        <Sparkles className="w-4 h-4 text-purple-500" />
        <span className="font-medium">Ask AI</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col border-t bg-background" style={{ height: "350px" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gradient-to-r from-purple-500/5 to-blue-500/5">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium">AI Assistant</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
            <Sparkles className="w-8 h-8 text-purple-400/50" />
            <div className="text-xs space-y-1">
              <p className="font-medium">Ask me anything about your emails</p>
              <p className="text-[10px]">Try: &quot;Find emails about the project deadline&quot;</p>
              <p className="text-[10px]">Try: &quot;Draft a reply to this thread&quot;</p>
              <p className="text-[10px]">Try: &quot;Classify this thread&quot;</p>
            </div>
          </div>
        )}

        {messages.map((message: UIMessage) => (
          <div
            key={message.id}
            className={cn(
              "flex flex-col gap-1",
              message.role === "user" ? "items-end" : "items-start"
            )}
          >
            <div
              className={cn(
                "px-3 py-2 rounded-lg text-xs max-w-[85%]",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {/* Render message parts */}
              {message.parts?.map((part, i: number) => {
                if (part.type === "text") {
                  return <div key={i} className="whitespace-pre-wrap">{part.text}</div>
                }
                if (part.type.startsWith("tool-")) {
                  const toolPart = part as { type: string; toolCallId: string; toolName?: string; state?: string }
                  const toolName = toolPart.toolName || "tool"
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5 pb-1.5 border-b border-border/50"
                    >
                      {toolName === "searchEmails" && <Search className="w-3 h-3" />}
                      {toolName === "classifyThread" && <Tag className="w-3 h-3" />}
                      {toolName === "summarizeThread" && <FileText className="w-3 h-3" />}
                      {toolName === "getThreadDetails" && <FileText className="w-3 h-3" />}
                      {toolName === "draftReply" && <FileText className="w-3 h-3" />}
                      <span>
                        {toolPart.state === "result"
                          ? `Used ${toolName}`
                          : `Using ${toolName}...`}
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-3 py-2 border-t">
        <div className="flex items-center gap-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about your emails..."
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            disabled={isLoading || !inputValue.trim()}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </form>
    </div>
  )
}

export default AIChatPanel
