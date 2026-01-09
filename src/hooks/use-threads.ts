import { api } from "@/trpc/react"
import { useLocalStorage } from "usehooks-ts"
import {atom, useAtom} from 'jotai'



export const threadAtom = atom<string | null>(null)
const useThreads = () => {
    const {data: accounts} = api.account.getAccounts.useQuery()
    const [accountId] = useLocalStorage('accountId', '')
    const [tab] = useLocalStorage('email-assistant-tab', 'inbox')
    const [done] = useLocalStorage("email-assistant-done", false)
    const [threadId, setThreadId] = useAtom(threadAtom)

    const {data: threads, isFetching, refetch} = api.account.getThreads.useQuery({
        accountId,
        tab,
        done
    }, {
        enabled: !!accountId && !!tab, placeholderData: e => e, refetchInterval: 5000
    })

    console.log( "debug data", threads, tab ) // data is correct we just have to find why the ui is rendering the wrong data

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