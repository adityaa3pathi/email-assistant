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


  const utils = api.useUtils()
  const sendEmail = api.account.sendEmail.useMutation({
    onSuccess: () => {
      alert("Email sent successfully!")
      void utils.account.getThreads.invalidate()
      void utils.account.getNumThreads.invalidate()
      void utils.account.getAccounts.invalidate()
    },
    onError: (error) => {
      console.error("Failed to send email:", error)
      alert(`Failed to send email: ${error.message}`)
    }
  })

  const handleSend = async (value: string) => { 
    if (!accountId) {
      alert("No active account selected.")
      return
    }
    if (!value || !value.trim()) {
      alert("Please enter a message body.")
      return
    }
    await sendEmail.mutateAsync({
      accountId,
      threadId: threadId ?? undefined,
      body: value,
      subject,
      from: replyDetails.from,
      to: toValues.map((to) => ({ name: to.label ?? undefined, address: to.value })),
      cc: ccValues.map((cc) => ({ name: cc.label ?? undefined, address: cc.value })),
      inReplyTo: replyDetails.id,
      references: replyDetails.id,
    })
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
    isSending={sendEmail.isPending}
    threadId={threadId}
    accountId={accountId}
  />
)
}

export default ReplyBox 