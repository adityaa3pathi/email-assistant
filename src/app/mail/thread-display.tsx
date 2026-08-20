"use client"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import useThreads from "@/hooks/use-threads"
import {
  Archive,
  ArchiveX,
  Clock,
  MoreVertical,
  Trash2,
  Reply,
  ReplyAll,
  Forward,
  Sparkles,
  Mail,
  ArrowRight,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import EmailDisplay from "./email-display"
import ReplyBox from "./reply-box"

// ─── AI Label Color Mapping ──────────────────────────────────────────────────
const AI_LABEL_STYLES: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  newsletter: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30",
  "client-request": "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  internal: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
  meeting: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  notification: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  personal: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
}

const ThreadDisplay = () => {
  const { threadId, threads } = useThreads()
  const thread = threads?.find((t) => t.id === threadId)

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center p-2 shrink-0">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <Archive className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archive</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <ArchiveX className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move to junk</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <Clock className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Snooze</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <Reply className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <ReplyAll className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply all</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <Forward className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-2" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread}>
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Mark as unread</DropdownMenuItem>
              <DropdownMenuItem>Star thread</DropdownMenuItem>
              <DropdownMenuItem>Add label</DropdownMenuItem>
              <DropdownMenuItem>Mute thread</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Separator />

      {/* Body */}
      {thread ? (
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          {/* Thread Header */}
          <div className="flex items-start p-4 min-w-0 gap-4">
            <div className="flex items-start gap-4 text-sm min-w-0 flex-1">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage alt="avatar" />
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-xs font-medium">
                  {thread.emails[0]?.from?.name
                    ?.split(" ")
                    .map((c) => c[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>

              <div className="grid gap-1 min-w-0 flex-1">
                <div className="font-semibold truncate">
                  {thread.emails[0]?.from?.name}
                </div>
                <div className="text-xs line-clamp-2 font-medium break-words [overflow-wrap:anywhere]">
                  {thread.subject}
                </div>
                <div className="text-xs truncate text-muted-foreground">
                  <span className="font-medium">Reply-To:</span>{" "}
                  {thread.emails[0]?.from?.address}
                </div>
              </div>
            </div>

            <div className="ml-auto flex flex-col items-end gap-2 shrink-0">
              {thread.emails[0]?.sentAt && (
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(thread.emails[0].sentAt), "PPpp")}
                </div>
              )}
              {/* Email count badge */}
              <div className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full whitespace-nowrap">
                {thread.emails.length} {thread.emails.length === 1 ? "email" : "emails"}
              </div>
            </div>
          </div>

          {/* ── AI Insights Card ────────────────────────────────────────── */}
          {(thread.summary || (thread.aiLabels && thread.aiLabels.length > 0)) && (
            <div className="mx-4 mb-3 rounded-lg border bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-teal-500/5 p-3 min-w-0 overflow-hidden">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                  AI Insights
                </span>
              </div>

              {/* Summary */}
              {thread.summary && (
                <p className="text-xs text-muted-foreground leading-relaxed mb-2 break-words [overflow-wrap:anywhere]">
                  {thread.summary}
                </p>
              )}

              {/* AI Labels */}
              {thread.aiLabels && thread.aiLabels.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {thread.aiLabels.map((label: string) => (
                    <span
                      key={label}
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border",
                        AI_LABEL_STYLES[label] || "bg-gray-500/15 text-gray-600 border-gray-500/30"
                      )}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Emails */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
            <div className="p-6 flex flex-col gap-4 min-w-0 w-full">
              {thread.emails.map((email) => (
                <EmailDisplay key={email.id} email={email} />
              ))}
            </div>
          </div>

          <div className="flex-1" />

          <Separator className="mt-auto shrink-0" />

          {/* Reply box */}
          <div className="shrink-0 min-w-0">
            <ReplyBox /> 
          </div>
        </div>
      ) : (
        /* ── Empty State ──────────────────────────────────────────────── */
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 flex items-center justify-center">
              <Mail className="w-10 h-10 text-purple-400/60" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/10 to-teal-500/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-400/60" />
            </div>
          </div>

          <h3 className="text-lg font-semibold mb-1">No message selected</h3>
          <p className="text-sm text-muted-foreground max-w-[240px] mb-4">
            Select a thread from the list to view its contents and AI insights
          </p>

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            <span>Cmd+J for AI autocomplete</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      )}
    </div>
  )
}

export default ThreadDisplay
