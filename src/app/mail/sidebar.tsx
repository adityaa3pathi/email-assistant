

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
    const [tab] = useLocalStorage<'inbox' | 'draft' | 'sent' >('email-assistant-tab', 'inbox')
    const [done] = useLocalStorage('email-assistant-done', false)

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
    >

    </Nav>
  )
}

export default Sidebar