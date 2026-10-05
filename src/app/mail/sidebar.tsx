

import type { FC } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { Nav } from './nav'
import { File, Inbox, Send, Plus, PenSquare } from 'lucide-react'
import { api } from '@/trpc/react'
import { useAtom } from 'jotai'
import { isComposeOpenAtom } from './compose-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface sidebarProps {
  isCollapsed: boolean
}

const Sidebar: FC<sidebarProps> = ({isCollapsed}: sidebarProps) => {

    const [accountId] = useLocalStorage('accountId', '')
    const [tab] = useLocalStorage<'inbox' | 'draft' | 'sent' >('email-assistant-tab', 'inbox')
    const [done] = useLocalStorage('email-assistant-done', false)
    const [_, setIsComposeOpen] = useAtom(isComposeOpenAtom)

    const {data: accounts} = api.account.getAccounts.useQuery()
    const validAccountId = accounts?.some(a => a.id === accountId) ? accountId : ''

    const {data: inboxThreads} = api.account.getNumThreads.useQuery({
      accountId: validAccountId,
      tab: 'inbox',
      
    }, { enabled: !!validAccountId }) 
    const {data: draftThreads} = api.account.getNumThreads.useQuery({
      accountId: validAccountId,
      tab: 'draft',
      
    }, { enabled: !!validAccountId }) 
    const {data: sentThreads} = api.account.getNumThreads.useQuery({
      accountId: validAccountId,
      tab: 'sent',
      
    }, { enabled: !!validAccountId }) 

  return (
    <div className="flex flex-col w-full">
      {/* Compose Button */}
      <div className="px-2 pt-2 pb-1">
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setIsComposeOpen(true)}
                size="icon"
                className="h-9 w-9 mx-auto flex items-center justify-center rounded-lg shadow-sm"
              >
                <Plus className="size-4" />
                <span className="sr-only">Compose</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Compose (C)</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            onClick={() => setIsComposeOpen(true)}
            className="w-full gap-2 font-medium shadow-sm rounded-lg"
          >
            <Plus className="size-4" />
            <span>Compose</span>
          </Button>
        )}
      </div>

      <Nav
      isCollapsed={isCollapsed}
    links={[
        {
            title: 'Inbox',
            label: inboxThreads?.toString() ?? '0',
            icon: Inbox,
            variant: tab === 'inbox' ? 'default' : "ghost"
        },
        {
            title: 'Draft',
            label: draftThreads?.toString() ?? '0',
            icon: File,
            variant: tab === 'draft' ? 'default' : 'ghost'
        },
        {
            title: 'Sent',
            label: sentThreads?.toString()  ?? '0',
            icon: Send,
            variant: tab === 'sent' ? "default" : 'ghost'
        },
      ]}
      />
    </div>
  )
}

export default Sidebar