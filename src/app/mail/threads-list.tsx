import DOMPurify from "dompurify"
import React, { type ComponentProps } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { Sparkles } from "lucide-react"

import useThreads from "@/hooks/use-threads"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

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
  const { threads, threadId, setThreadId } = useThreads()

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
    <div className="max-w-full overflow-y-scroll max-h-[calc(100vh-120px)]">
      <div className="flex flex-col gap-2 p-4 pt-0">
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
                    "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all relative",
                    thread.id === threadId && "bg-accent"
                  )}
                >
                  <div className="flex flex-col w-full gap-1">
                    <div className="flex items-center">
                      <div className="font-semibold">
                        {lastEmail?.from?.name}
                      </div>

                      <div
                        className={cn(
                          "ml-auto text-xs",
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

                    <div className="text-xs font-medium">
                      {thread.subject}
                    </div>
                  </div>

                  {/* AI Summary or body snippet */}
                  {thread.summary ? (
                    <div className="text-xs line-clamp-2 text-muted-foreground flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" />
                      <span>{thread.summary}</span>
                    </div>
                  ) : (
                    <div
                      className="text-xs line-clamp-2 text-muted-foreground"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          lastEmail?.bodySnippet ?? "",
                          { USE_PROFILES: { html: true } }
                        ),
                      }}
                    />
                  )}

                  {/* AI Labels + System Labels */}
                  <div className="flex items-center gap-1.5 flex-wrap">
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
