

import { FC } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { Nav } from './nav'
import { File, Inbox, Send } from 'lucide-react'
import { api } from '@/trpc/react'

interface sidebarProps {
  isCollapsed: boolean
}

const Sidebar: FC<sidebarProps> = ({isCollapsed}: sidebarProps) => {

    const [accountId] = useLocalStorage('accountId', '')
    const [tab] = useLocalStorage<'inbox' | 'draft' | 'sent'>('email-assistant-tab', 'inbox')

    const {data: inboxThreads} = api.account.getNumThreads.useQuery({
      accountId,
      tab: 'inbox'
    }) 
    const {data: draftThreads} = api.account.getNumThreads.useQuery({
      accountId,
      tab: 'draft'
    }) 
    const {data: sentThreads} = api.account.getNumThreads.useQuery({
      accountId,
      tab: 'sent '
    }) 

  return (
    
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
            label: draftThreads?.toString() ,
            icon: File,
            variant: tab === 'draft' ? 'default' : 'ghost'
        },
        {
            title: 'sent',
            label: sentThreads?.toString() ,
            icon: Send,
            variant: tab === 'sent' ? "default" : 'ghost'
        },
    ]}
    >

    </Nav>
  )
}

export default Sidebar