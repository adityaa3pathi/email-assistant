"use client"

import {Letter } from "react-letter"
import Avatar  from "react-avatar"
import useThreads from "@/hooks/use-threads"
import { cn } from "@/lib/utils"
import type { RouterOutputs } from "@/trpc/react"
import { formatDistanceToNow } from "date-fns"



type Props = {
    email: RouterOutputs['account']['getThreads'][0]['emails'][0]
}


const EmailDisplay = ({email}: Props) => {
    
    const {account} = useThreads() 
    const isMe = account?.emailAddress === email.from.address   
    const html = email.body?.trim()
    const fallbackText = email.bodySnippet?.trim()

    return (
        <div  className={
            cn('border rounded-md p-4 transition-all hover:translate-x-2', {
                'border-1-gray-900 border-1-4': isMe
            })
        }>
            <div className=" flex items-center justify-between gap-2">
                <div className=" flex items-center justify-between gap-2">
                    {!isMe && <Avatar name={email.from.name ?? email.from.address} email={email.from.address} size="35" textSizeRatio={2} round={true} />}
                        <span className="font-medium">
                    {isMe ? "Me" : email.from.address }
                        </span>
                </div>
                <p className="text-xm text-muted-foreground">
{formatDistanceToNow(email.sentAt ?? new Date(), {
    addSuffix: true
})}
                </p>

            </div>

            <div className="h-4">
            </div>
            {html ? (
                <Letter html={html} className="rounded-md bg-white text-black" />
            ) : fallbackText ? (
                <p className="whitespace-pre-wrap rounded-md bg-white p-3 text-sm text-black">
                    {fallbackText}
                </p>
            ) : (
                <p className="text-sm text-muted-foreground">No body available for this email.</p>
            )}
                
        </div>
    )
}

export default EmailDisplay
