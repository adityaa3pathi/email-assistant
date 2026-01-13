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
import EmailDisplay from "./email-display"

const ThreadDisplay = () => {
  const { threadId, threads } = useThreads()
  const thread = threads?.find((t) => t.id === threadId)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center p-2">
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
        <div className="flex flex-col flex-1 overflow-scroll">
          {/* Header */}
          <div className="flex items-start p-4">
            <div className="flex items-start gap-4 text-sm">
              <Avatar>
                <AvatarImage alt="avatar" />
                <AvatarFallback>
                  {thread.emails[0]?.from?.name
                    ?.split(" ")
                    .map((c) => c[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>

              <div className="grid gap-1">
                <div className="font-semibold">
                  {thread.emails[0]?.from?.name}
                </div>
                <div className="text-xs line-clamp-1">
                  {thread.emails[0]?.subject}
                </div>
                <div className="text-xs line-clamp-1">
                  <span className="font-medium">Reply-To:</span>{" "}
                  {thread.emails[0]?.from?.address}
                </div>
              </div>
            </div>

            {thread.emails[0]?.sentAt && (
              <div className="ml-auto text-xs text-muted-foreground">
                {format(new Date(thread.emails[0].sentAt), "PPpp")}
              </div>
            )}
          </div>

          <Separator />

          {/* Emails */}
          <div className="max-h-[calc(100vh-500px)] overflow-scroll">
            <div className="p-6 flex flex-col gap-4">
              {thread.emails.map((email) => (
                <EmailDisplay key={email.id} email={email} />
              ))}
            </div>
          </div>

          <div className="flex-1" />

          <Separator className="mt-auto" />

          {/* Reply box placeholder */}
          {/* <ReplyBox /> */}
        </div>
      ) : (
        <div className="p-8 text-center text-muted-foreground">
          No message selected
        </div>
      )}
    </div>
  )
}

export default ThreadDisplay
