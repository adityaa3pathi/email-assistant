"use client"

import React from 'react'
import EmailEditor from './email-editor'
import { api, type RouterOutputs } from '@/trpc/react'
import useThreads from '@/hooks/use-threads'

const ReplyBox = () => {


  const {threadId, accountId} = useThreads()
  const  {data: replyDetails} = api.account.getReplyDetails.useQuery({

    threadId: threadId ?? "",
    accountId: accountId ?? ""
  })

   if (!replyDetails) return null


  return (
    <div>
      <Component
    replyDetails={replyDetails!}
    />
    
    </div>
  )
}

const Component = ({replyDetails}: {replyDetails: RouterOutputs['account']['getReplyDetails'] }) => { 

  const {threadId, accountId }= useThreads() 

  const [subject, setSubject] = React.useState(replyDetails?.subject.startsWith("Re:") ? replyDetails.subject : `Re: ${replyDetails.subject}` )
    const [toValues, setToValues] = React.useState<{label: string | null, value: string}[]>(replyDetails.to.map((to) => ({label: to.name, value: to.address})) || [])
  const [ccValues, setccValues] = React.useState<{label: string | null, value: string}[]>(replyDetails.cc.map((cc) => ({label: cc.name, value: cc.address})) || [])

  React.useEffect(() => {
    if(!threadId || !replyDetails) return

    if(!replyDetails.subject.startsWith("Re:")) {
      setSubject(`Re: ${replyDetails.subject}`)
    }
    else {
      setSubject(replyDetails.subject)
    }

    setToValues(replyDetails.to.map((to) => ({label: to.name, value: to.address})))
    setccValues(replyDetails.cc.map((cc) => ({label: cc.name, value: cc.address})))
  }, [threadId, replyDetails])


  const handleSend = async (value: string) => { 
    console.log('Sending reply with body:', value)
  }

return (
  <EmailEditor
   subject={subject}
    setSubject={setSubject}
    //@ts-ignore 
    toValues={toValues}
    setToValues={setToValues}
    //@ts-ignore
    ccValues={ccValues}
    setCcValues={setccValues}
    to={replyDetails.to.map((to) => to.address)}
    handleSend={handleSend}
    isSending={false}
    threadId={threadId}
    accountId={accountId}
  />
)
}

export default ReplyBox 