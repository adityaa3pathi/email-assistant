"use client"


import {KBarAnimator, KBarPortal, KBarPositioner, KBarProvider, KBarSearch, type Action,  } from 'kbar'
import { Children } from 'react'
import { RenderResults } from './render-results'
import { useAtom } from 'jotai'
import { useLocalStorage } from 'usehooks-ts'
import useThemeSwitching from './use-theme-switching'
import useAccountSwitching from './use-account-switching'
export default function KBar({children}: {children: React.ReactNode}) {


    const [tab, setTab] = useLocalStorage<'inbox' | 'draft' | 'sent' >('email-assistant-tab', 'inbox')
    const [done, setDone] = useLocalStorage('email-assistant-done', false)
    const actions: Action[] = [

        {
            id: "inboxAction",
            name: "Inbox",
            shortcut: ['g', 'i'],
            section: 'Navigation',
            subtitle: 'View your inbox',
            perform: () => {
                setTab('inbox')
                console.log('set to inbox')
                
            }
        },
            {
            id: "draftAction",
            name: "Draft",
            shortcut: ['g', 'd'],
            keywords: "draft",
            section: 'Navigation',
            subtitle: 'View your Draft',
            perform: () => {
                setTab('draft')
                console.log('set to draft')
                
            }
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
                console.log('set to sent')  

            },
        },
         {
            id: "pendingAction",
            name: "See done",
            shortcut: ['g', "d"],
            keywords: "done",
            section: "Navigation",
            subtitle: "View the done emails",
            perform: () => {
                setDone(true)
            },
        },
        {
            id: "doneAction",
            name: "See Pending",
            shortcut: ['g', "u"],
            keywords: 'pending, undone, not done',
            section: "Navigation",
            subtitle: "View the pending emails",
            perform: () => {
                setDone(false)
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

    useThemeSwitching()
    useAccountSwitching()

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