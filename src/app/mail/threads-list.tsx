import DOMPurify from "dompurify"
import React, { type ComponentProps } from "react"
import { format, formatDistanceToNow } from "date-fns"

import useThreads from "@/hooks/use-threads"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

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

  return (  <div className="max-w-full overflow-y-scroll max-h-[calc(100vh-120px)]">
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

                  <div
                    className="text-xs line-clamp-2 text-muted-foreground"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(
                        lastEmail?.bodySnippet ?? "",
                        { USE_PROFILES: { html: true } }
                      ),
                    }}
                  />

                  {thread.emails[0]?.sysLabels.length ? (
                    <div className="flex items-center gap-2">
                      {thread.emails[0].sysLabels.map((label) => (
                        <Badge
                          key={label}
                          variant={getBadgeVariantFromLabel(label)}
                        >
                          {label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
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
