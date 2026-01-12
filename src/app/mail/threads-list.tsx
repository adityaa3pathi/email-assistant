
import DOMpurify from 'dompurify'
import useThreads from '@/hooks/use-threads'
import React, { type ComponentProps } from 'react'
import {format, formatDistanceToNow } from 'date-fns' 
import type { Thread } from '@prisma/client'
import { date } from 'zod'
import { cn } from '@/lib/utils'
import { threadId } from 'worker_threads'
import { Item } from '@radix-ui/react-select'
import { Badge } from '@/components/ui/badge'




const ThreadList  = ({}) => {
    const {threads, threadId, setThreadId} = useThreads() 

    const groupedThreads = threads?.reduce((acc, thread) => {
        const date = format(thread.emails[0]?.sentAt ?? new Date(), 'yyyy-MM-dd')

        if(!acc[date]) {
            acc[date] = []
        }
        acc[date].push(thread)
        return acc
    }, {} as Record<string, typeof threads>)
  return (

    <div className='max-w-full overflow-y-scroll max-h-[calc(100vh -120px)]'>
        <div className='flex flex-col gap-2 p-4 pt-0'>
                {Object.entries(groupedThreads ?? {}).map(([date, threads]) => {
                    return <React.Fragment key={date}>
                            <div className='text-xs font-medium text-muted-foreground mt-5 first:mt-0'>
                                {date}
                            </div>
                            {threads.map(thread => {
                                return <button key={thread.id}
                                onClick={() => setThreadId(thread.id)} className={
                                    cn('flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all relative', {
                                        'bg-accent': thread.id === threadId
                                    })
                                } >
                                    <div className='flex flex-col w-full gap-2'>
                                        <div className='flex items-center'>
                                            <div className='flex items-center gap-2'>
                                                <div className='font-semibold'>
                                                {thread.emails.at(-1)?.from.name}
                                                </div>
                                            </div>
                                        <div 
                                        className={cn(
                                            "ml-auto text-xs"
                                        )}>
                                            {formatDistanceToNow(thread.emails.at(-1)?.sentAt ?? new Date(), {addSuffix: true})}
                                        </div>
                                        </div>
                                            <div className='text-sm font-medium'>{thread.subject}</div>
                                    </div>
                                <div className='text-sm line-clamp-2 text-muted-foreground'
                                dangerouslySetInnerHTML={{

                                    __html: DOMpurify.sanitize(thread.emails.at(-1)?.bodySnippet ?? "", {
                                        USE_PROFILES: {html: true}
                                    })
                                }}></div>
                                {thread.emails[0]?.sysLabels.map(label => {
                                    return <Badge key={label} className='text-xs font-medium'
                                    variant={getBadgeVariantFromLabel(label)}
                                    >{label}</Badge>
                                })}
                                </button>

                            })}
                    </React.Fragment>
                })}
        </div>

    </div>
  )
}

function getBadgeVariantFromLabel(label: string): ComponentProps<typeof Badge>['variant'] {
    if (['work'].includes(label.toLowerCase())) {
        return 'default'
    }
    return 'secondary'
}

export default ThreadList