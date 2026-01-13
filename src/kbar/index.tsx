"use client"


import {KBarAnimator, KBarPortal, KBarPositioner, KBarProvider, KBarSearch, type Action,  } from 'kbar'
import { Children } from 'react'
import { RenderResults } from './render-results'
import { useAtom } from 'jotai'
import { useLocalStorage } from 'usehooks-ts'
export default function KBar({children}: {children: React.ReactNode}) {


    const [tab, setTab] = useLocalStorage('email-asistant', 'inbox')
    const actions: Action[] = [

        {
            id: "inboxAction",
            name: "Inbox",
            shortcut: ['g', 'i'],
            section: 'Navigation',
            subtitle: 'View your inbox',
            perform: () => {
                setTab('inbox')
                
            }
        },
            {
            id: "draftsAction",
            name: "Drafts",
            shortcut: ['g', 'd'],
            keywords: "drafts",
            subtitle: "View your drafts",
            section: "Navigation",
            perform: () => {
                setTab('draft')
                console.log('set to drafts')    
            },
        },
        {
            id: "sentAction",
            name: "Sent",
            shortcut: ['g', "s"],
            keywords: "sent",
            section: "Navigation",
            subtitle: "View the sent",
            perform: () => {
                setTab('sent')
            },
        },
    ]
    return <KBarProvider actions={actions}>
            <ActualComponent >

                {children}
            </ActualComponent>
    </KBarProvider>
} 

const ActualComponent = ({children} : {children: React.ReactNode}) => {

    return <>
    <KBarPortal>
        <KBarPositioner className='fixed inset-0 bg-black/40 dark:bg:black/60 backdrop-blur-sm scrollbar-hide p-0! z-[999]'>
        <KBarAnimator className='max-w-[600px] !mt-64 w-full bg-white dark:bg-gray-800 text-foreground dark:text-gray-20 shadow-lg border dark:border-gray-600 rounded-lg overflow-hidden relative !translate-y-12 ' >
            <div className='bg-white dark:bg-gray-800'>
                <div className='border-x-0 border-b-2 dark:border-gray-700'>
                    <KBarSearch  className='PY-4 PX-6 TEXT-LG W-FULL BG-WHITE DARK:BG-GRAY-800  outline-none border-none focus:outline-none focus:ring-0 focus:offset-0'/>

                </div>
                <RenderResults/>
            </div>

        </KBarAnimator>

        </KBarPositioner>
    </KBarPortal>
    {children}
    </>
}