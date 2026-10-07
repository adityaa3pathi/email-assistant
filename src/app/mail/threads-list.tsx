import DOMPurify from "dompurify"
import React, { type ComponentProps } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { Sparkles, RefreshCw, AlertCircle, Inbox, MailCheck } from "lucide-react"

import useThreads from "@/hooks/use-threads"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// ─── AI Label Color Mapping ──────────────────────────────────────────────────
const AI_LABEL_COLORS: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  newsletter: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30",
  "client-request": "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  internal: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
  meeting: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  notification: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  personal: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
}

const ThreadList = () => {
  const { threads, threadId, setThreadId, account, syncCurrentAccount, isSyncing } = useThreads()

  // 1. Syncing State (when account is actively fetching from Gmail)
  if (isSyncing || account?.syncStatus === "syncing" || (account?.syncStatus === "pending" && (!threads || threads.length === 0))) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px] gap-3 text-muted-foreground">
        <RefreshCw className="size-8 animate-spin text-primary opacity-80" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-foreground text-sm">Syncing with Gmail...</p>
          <p className="text-xs text-muted-foreground max-w-[260px]">
            Fetching recent emails for {account?.emailAddress || "your account"}. They will appear here in just a moment.
          </p>
        </div>
      </div>
    )
  }

  // 2. Failed Sync State
  if (account?.syncStatus === "failed") {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center h-full min-h-[300px] gap-3">
        <AlertCircle className="size-8 text-destructive" />
        <p className="font-semibold text-sm text-destructive">Sync Error</p>
        <p className="text-xs text-muted-foreground max-w-[280px]">
          {account.syncError || "Could not sync emails from Gmail."}
        </p>
        <Button size="sm" variant="outline" onClick={() => syncCurrentAccount()} className="gap-2 mt-2">
          <RefreshCw className="size-3.5" />
          Retry Sync
        </Button>
      </div>
    )
  }

  // 3. Loading Skeleton State (when threads are loading for the first time)
  if (!threads) {
    return (
      <div className="w-full p-4 pt-2 flex flex-col gap-2.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-lg border p-3.5 bg-card/40 animate-pulse"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="h-4 w-32 bg-muted rounded-md" />
              <div className="h-3 w-16 bg-muted/70 rounded-md" />
            </div>
            <div className="h-3.5 w-3/4 bg-muted/80 rounded-md" />
            <div className="h-3 w-full bg-muted/50 rounded-md" />
            <div className="flex items-center gap-1.5 pt-1">
              <div className="h-4 w-14 bg-muted/60 rounded-sm" />
              <div className="h-4 w-12 bg-muted/40 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 4. Empty State (synced but no threads)
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px] gap-3 text-muted-foreground">
        <Inbox className="size-10 stroke-1 opacity-50" />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground text-sm">No emails in this folder</p>
          <p className="text-xs text-muted-foreground">Your inbox is all caught up.</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => syncCurrentAccount()}
          disabled={isSyncing}
          className="gap-2 text-xs text-muted-foreground hover:text-foreground mt-1"
        >
          <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} />
          Check for new emails
        </Button>
      </div>
    )
  }

  const groupedThreads = threads?.reduce((acc, thread) => {
    const date = format(
      thread.emails.at(-1)?.sentAt ?? new Date(),
      "yyyy-MM-dd"
    )

    if (!acc[date]) acc[date] = []
    acc[date].push(thread)
    return acc
  }, {} as Record<string, typeof threads>)

  return (
    <div className="w-full max-w-full p-4 pt-2">
      <div className="flex flex-col gap-2 w-full min-w-0">
        {Object.entries(groupedThreads ?? {}).map(([date, threads]) => (
          <React.Fragment key={date}>
            {/* Date header */}
            <div className="text-xs font-medium text-muted-foreground mt-4 first:mt-0">
              {format(new Date(date), "MMMM d, yyyy")}
            </div>

            {threads.map((thread) => {
              const lastEmail = thread.emails.at(-1)

              return (
                <button
                  key={thread.id}
                  onClick={() => setThreadId(thread.id)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all relative w-full min-w-0 max-w-full overflow-hidden",
                    thread.id === threadId && "bg-accent"
                  )}
                >
                  <div className="flex flex-col w-full min-w-0 gap-1">
                    <div className="flex items-center w-full min-w-0 gap-2">
                      <div className="font-semibold truncate min-w-0 flex-1">
                        {lastEmail?.from?.name || lastEmail?.from?.address}
                      </div>

                      <div
                        className={cn(
                          "ml-auto text-xs shrink-0 whitespace-nowrap",
                          thread.id === threadId
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {formatDistanceToNow(
                          lastEmail?.sentAt ?? new Date(),
                          { addSuffix: true }
                        )}
                      </div>
                    </div>

                    <div className="text-xs font-medium truncate w-full min-w-0">
                      {thread.subject}
                    </div>
                  </div>

                  {/* AI Summary or body snippet */}
                  {thread.summary ? (
                    <div className="text-xs line-clamp-2 text-muted-foreground flex items-start gap-1.5 w-full min-w-0 break-words [overflow-wrap:anywhere]">
                      <Sparkles className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" />
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{thread.summary}</span>
                    </div>
                  ) : (
                    <div
                      className="text-xs line-clamp-2 text-muted-foreground w-full min-w-0 break-words [overflow-wrap:anywhere] overflow-hidden"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          lastEmail?.bodySnippet ?? "",
                          { USE_PROFILES: { html: true } }
                        ),
                      }}
                    />
                  )}

                  {/* AI Labels + System Labels */}
                  <div className="flex items-center gap-1.5 flex-wrap w-full min-w-0">
                    {/* AI classification labels */}
                    {thread.aiLabels?.map((label: string) => (
                      <span
                        key={`ai-${label}`}
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
                          AI_LABEL_COLORS[label] || "bg-gray-500/15 text-gray-600 border-gray-500/30"
                        )}
                      >
                        {label}
                      </span>
                    ))}

                    {/* System labels */}
                    {thread.emails[0]?.sysLabels.map((label) => (
                      <Badge
                        key={label}
                        variant={getBadgeVariantFromLabel(label)}
                      >
                        {label}
                      </Badge>
                    ))}
                  </div>
                </button>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function getBadgeVariantFromLabel(
  label: string
): ComponentProps<typeof Badge>["variant"] {
  if (["work"].includes(label.toLowerCase())) return "default"
  if (["personal"].includes(label.toLowerCase())) return "outline"
  return "secondary"
}

export default ThreadList
