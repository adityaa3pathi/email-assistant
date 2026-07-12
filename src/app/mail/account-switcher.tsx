import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue  } from "@/components/ui/select"
import { getGoogleAuthUrl } from "@/lib/actions"
import { cn } from "@/lib/utils"
import { api } from "@/trpc/react"
import { Plus, Trash2 } from "lucide-react"
import React from "react"
import  { useLocalStorage } from "usehooks-ts"

type Props = {
    isCollapsed: boolean
}


const AccountSwitcher = ({ isCollapsed }: Props) => {

    const { data } = api.account.getAccounts.useQuery()
    const [accountId, setAccountId] = useLocalStorage("accountId", '')
    const utils = api.useUtils()
    const deleteAccount = api.account.deleteAccount.useMutation({
        onSuccess: () => {
             utils.account.getAccounts.invalidate()
        },
        onError: (e) => {
             alert(e.message)
        }
    })


    if(!data) return null
    return (

        <Select defaultValue={accountId} onValueChange={setAccountId}>
            <SelectTrigger
          className={cn(
            "flex w-full flex-1 items-center gap-2 [&>span]:line-clamp-1 [&>span]:flex [&>span]:w-full [&>span]:items-center [&>span]:gap-1 [&>span]:truncate [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
            isCollapsed &&
            "flex h-9 w-9 shrink-0 items-center justify-center p-0 [&>span]:w-auto [&>svg]:hidden"
          )}
          aria-label="Select account"
        >

                <SelectValue placeholder="Select an Account">
                    <span className={cn({ 'hidden': !isCollapsed})}>
                        {data.find(account => account.id === accountId)?.emailAddress[0]}
                    </span>
                    <span className={cn({ 'hidden': isCollapsed, 'ml-2': true })}>
                            {data.find(account => account.id === accountId)?.emailAddress}
                    </span>
                </SelectValue>
            </SelectTrigger>
            <SelectContent >
                {data.map((account) => {
                    return (
                        <div key={account.id} className="relative flex w-full items-center">
                            <SelectItem value={account.id} className="w-full pr-12">
                                {account.emailAddress}
                            </SelectItem>
                            <div 
                                className="absolute right-2 p-1 rounded-sm hover:bg-red-100 text-red-500 cursor-pointer z-50"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if(confirm("Are you sure you want to delete this account?")) {
                                        if (accountId === account.id) {
                                            setAccountId('')
                                        }
                                        deleteAccount.mutate({ accountId: account.id })
                                    }
                                }}
                            >
                                <Trash2 className="size-4" />
                            </div>
                        </div>
                    )
                })}
        <AddAccountButton />
            </SelectContent>

            
        </Select>
     
    )
}

const AddAccountButton = () => {
    const [isLinking, setIsLinking] = React.useState(false)

    return (
        <div
            onClick={async () => {
                if (isLinking) return
                setIsLinking(true)
                try {
                    const authUrl = await getGoogleAuthUrl()
                    window.location.href = authUrl
                } catch (error) {
                    console.error('Failed to get auth URL:', error)
                    setIsLinking(false)
                }
            }}
            className='flex relative hover:bg-gray-50 dark:hover:bg-gray-800 w-full cursor-pointer items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent'
        >
            {isLinking ? (
                <svg className="size-4 mr-1 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            ) : (
                <Plus className="size-4 mr-1"/>
            )}
            {isLinking ? 'Connecting...' : 'Add Account'}
        </div>
    )
}

export default AccountSwitcher

