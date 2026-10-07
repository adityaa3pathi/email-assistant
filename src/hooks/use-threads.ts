import { api } from "@/trpc/react"
import { useLocalStorage } from "usehooks-ts"
import { atom, useAtom } from "jotai"
import { useEffect, useMemo } from "react"

export const threadAtom = atom<string | null>(null)

const useThreads = () => {
    const { data: accounts, refetch: refetchAccounts } = api.account.getAccounts.useQuery(undefined, {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
    })
    const [accountId, setAccountId] = useLocalStorage('accountId', '')
    const [tab] = useLocalStorage('email-assistant-tab', 'inbox')
    const [done] = useLocalStorage("email-assistant-done", false)
    const [threadId, setThreadId] = useAtom(threadAtom)
    const utils = api.useUtils()

    // 1. Check for ?accountId= in URL query params (e.g. from OAuth redirect)
    useEffect(() => {
        if (typeof window !== "undefined" && accounts && accounts.length > 0) {
            const params = new URLSearchParams(window.location.search)
            const queryAccountId = params.get("accountId")
            if (queryAccountId && accounts.some(a => a.id === queryAccountId)) {
                setAccountId(queryAccountId)
                // Clean the query param from URL without page reload
                const newUrl = window.location.pathname
                window.history.replaceState({}, '', newUrl)
                return
            }
        }
    }, [accounts, setAccountId])

    // 2. Smart account selection:
    // If accountId is invalid, empty, or points to an empty pending account while another has threads, pick the best one
    useEffect(() => {
        if (accounts && accounts.length > 0) {
            const exists = accounts.some(a => a.id === accountId)
            const currentAcc = accounts.find(a => a.id === accountId)
            const hasSyncedAccount = accounts.find(a => (a._count?.threads ?? 0) > 0 || a.syncStatus === 'synced')

            if (!accountId || !exists) {
                // Pick synced account if available, otherwise first
                const target = hasSyncedAccount || accounts[0]!
                setAccountId(target.id)
            } else if (currentAcc && (currentAcc._count?.threads ?? 0) === 0 && currentAcc.syncStatus === 'pending' && hasSyncedAccount) {
                // If currently trapped on an empty pending account, auto-switch to synced one
                setAccountId(hasSyncedAccount.id)
            }
        }
    }, [accounts, accountId, setAccountId])

    // 3. Optimistic Account Resolution: fire queries in parallel without waiting for getAccounts
    const validAccountId = useMemo(() => {
        if (accounts && accounts.length > 0) {
            if (accounts.some(a => a.id === accountId)) return accountId
            const synced = accounts.find(a => (a._count?.threads ?? 0) > 0 || a.syncStatus === 'synced')
            return synced?.id ?? accounts[0]!.id
        }
        return accountId || ''
    }, [accounts, accountId])

    const currentAccount = accounts?.find(e => e.id === validAccountId)

    const { data: threads, isFetching, refetch } = api.account.getThreads.useQuery({
        accountId: validAccountId,
        tab,
        done
    }, {
        enabled: !!validAccountId && !!tab,
        staleTime: 10_000,
        placeholderData: e => e,
        refetchInterval: (currentAccount?.syncStatus === 'syncing' || currentAccount?.syncStatus === 'pending') ? 2000 : 8000
    })

    const syncMutation = api.account.syncAccount.useMutation({
        onSuccess: () => {
            utils.account.getAccounts.invalidate()
            utils.account.getThreads.invalidate()
        }
    })

    const syncCurrentAccount = async () => {
        if (!validAccountId) return
        return syncMutation.mutateAsync({ accountId: validAccountId })
    }

    return {
        threads,
        isFetching,
        refetch,
        accountId: validAccountId,
        setAccountId,
        threadId,
        setThreadId,
        account: currentAccount,
        accounts,
        syncCurrentAccount,
        isSyncing: currentAccount?.syncStatus === 'syncing' || syncMutation.isPending
    }
}

export default useThreads