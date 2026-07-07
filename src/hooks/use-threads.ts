import { api } from "@/trpc/react"
import { useLocalStorage } from "usehooks-ts"
import {atom, useAtom} from 'jotai'
import { useEffect } from "react"



export const threadAtom = atom<string | null>(null)
const useThreads = () => {
    const {data: accounts} = api.account.getAccounts.useQuery()
    const [accountId, setAccountId] = useLocalStorage('accountId', '')
    const [tab] = useLocalStorage('email-assistant-tab', 'inbox')
    const [done] = useLocalStorage("email-assistant-done", false)
    const [threadId, setThreadId] = useAtom(threadAtom)

    // Auto-correct stale accountId if the stored account no longer exists
    useEffect(() => {
        if (accounts && accountId) {
            const exists = accounts.some(a => a.id === accountId)
            if (!exists) {
                // Switch to first available account, or clear
                setAccountId(accounts.length > 0 ? accounts[0]!.id : '')
            }
        }
    }, [accounts, accountId, setAccountId])

    const validAccountId = accounts?.some(a => a.id === accountId) ? accountId : ''

    const {data: threads, isFetching, refetch} = api.account.getThreads.useQuery({
        accountId: validAccountId,
        tab,
        done
    }, {
        enabled: !!validAccountId && !!tab, placeholderData: e => e, refetchInterval: 5000
    })

    return {
        threads,
        isFetching,
        refetch,
        accountId,
        threadId,
        setThreadId,
        account: accounts?.find(e => e.id === accountId)
    }

}

export default useThreads