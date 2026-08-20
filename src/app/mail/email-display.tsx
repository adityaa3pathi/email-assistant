"use client"

import { Letter } from "react-letter"
import Avatar from "react-avatar"
import useThreads from "@/hooks/use-threads"
import { cn } from "@/lib/utils"
import type { RouterOutputs } from "@/trpc/react"
import { formatDistanceToNow } from "date-fns"
import { ChevronDown, ChevronUp } from "lucide-react"
import React from "react"

type Props = {
    email: RouterOutputs['account']['getThreads'][0]['emails'][0]
}

const EmailDisplay = ({ email }: Props) => {
    const { account } = useThreads()
    const isMe = account?.emailAddress === email.from.address
    const html = email.body?.trim()
    const fallbackText = email.bodySnippet?.trim()
    const [isCollapsed, setIsCollapsed] = React.useState(false)

    return (
        <div
            className={cn(
                'border rounded-lg p-4 transition-all min-w-0 max-w-full overflow-hidden w-full',
                'hover:shadow-sm',
                {
                    'border-l-4 border-l-purple-500 dark:border-l-purple-400': isMe,
                }
            )}
        >
            {/* Header — clickable to collapse */}
            <div
                className="flex items-center justify-between gap-2 cursor-pointer select-none min-w-0"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    {!isMe && (
                        <Avatar
                            name={email.from.name ?? email.from.address}
                            email={email.from.address}
                            size="35"
                            textSizeRatio={2}
                            round={true}
                        />
                    )}
                    {isMe && (
                        <div className="w-[35px] h-[35px] rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-medium shrink-0">
                            Me
                        </div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-medium text-sm truncate">
                            {isMe ? "Me" : (email.from.name || email.from.address)}
                        </span>
                        {!isMe && email.from.name && (
                            <span className="text-[11px] text-muted-foreground truncate">
                                {email.from.address}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(email.sentAt ?? new Date(), {
                            addSuffix: true,
                        })}
                    </p>
                    {isCollapsed ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                        <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                </div>
            </div>

            {/* Body — collapsible */}
            {!isCollapsed && (
                <>
                    <div className="h-3" />

                    {html ? (
                        <div className="w-full max-w-full overflow-hidden [overflow-wrap:anywhere] break-words [&_*]:max-w-full [&_table]:!max-w-full [&_table]:!w-full [&_td]:break-words [&_th]:break-words [&_img]:!max-w-full [&_img]:!h-auto [&_pre]:whitespace-pre-wrap [&_iframe]:!max-w-full">
                            <Letter
                                html={html}
                                className="rounded-md bg-white dark:bg-gray-950 text-black dark:text-gray-100 p-1 w-full max-w-full overflow-hidden break-words"
                            />
                        </div>
                    ) : fallbackText ? (
                        <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm w-full min-w-0 max-w-full break-words [overflow-wrap:anywhere] overflow-hidden">
                            {fallbackText}
                        </p>
                    ) : (
                        <p className="text-sm text-muted-foreground italic">
                            No body available for this email.
                        </p>
                    )}
                </>
            )}

            {/* Collapsed preview */}
            {isCollapsed && fallbackText && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-1 truncate min-w-0">
                    {fallbackText}
                </p>
            )}
        </div>
    )
}

export default EmailDisplay
