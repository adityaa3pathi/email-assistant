import useThreads from '@/hooks/use-threads'
import React from 'react'
import {format } from 'date-fns' 
import type { Thread } from '@prisma/client'
import { date } from 'zod'
import { cn } from '@/lib/utils'


const ThreadList  = ({}) => {
    const {threads} = useThreads() 

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
                                return <button key={thread.id} className={
                                    cn('flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all relative')
                                } >
                                    <div className='flex felx-col w-full gap-2'>
                                        <div className='flex items-center'>
                                            <div className='flex items-center gap-2'>
                                                <div className='font-semibold'>
                                                {thread.emails.at(-1)?.from.name}
                                                </div>

                                            </div>

                                        </div>

                                    </div>
                                </button>
                            })}
                    </React.Fragment>
                })}
        </div>

    </div>
  )
}

export default ThreadList