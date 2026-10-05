"use client"

import React from "react"
import { atom, useAtom } from "jotai"
import { X, Minimize2, Square } from "lucide-react"
import EmailEditor from "./email-editor"
import { api } from "@/trpc/react"
import useThreads from "@/hooks/use-threads"
import { cn } from "@/lib/utils"

export const isComposeOpenAtom = atom<boolean>(false)

export const ComposeDialog = () => {
  const [isOpen, setIsOpen] = useAtom(isComposeOpenAtom)
  const { accountId, account } = useThreads()
  const [subject, setSubject] = React.useState("")
  const [toValues, setToValues] = React.useState<{ label: string | null; value: string }[]>([])
  const [ccValues, setCcValues] = React.useState<{ label: string | null; value: string }[]>([])
  const [isMinimized, setIsMinimized] = React.useState(false)

  const utils = api.useUtils()
  const sendEmail = api.account.sendEmail.useMutation({
    onSuccess: () => {
      alert("Email sent successfully!")
      setIsOpen(false)
      setSubject("")
      setToValues([])
      setCcValues([])
      void utils.account.getThreads.invalidate()
      void utils.account.getNumThreads.invalidate()
      void utils.account.getAccounts.invalidate()
    },
    onError: (error) => {
      console.error("Failed to send email:", error)
      alert(`Failed to send email: ${error.message}`)
    },
  })

  const handleSend = async (value: string) => {
    if (!accountId) {
      alert("No active account selected.")
      return
    }
    if (toValues.length === 0) {
      alert("Please specify at least one recipient in 'To'.")
      return
    }
    if (!value || !value.trim()) {
      alert("Please enter a message body.")
      return
    }

    await sendEmail.mutateAsync({
      accountId,
      subject: subject || "(no subject)",
      body: value,
      from: account ? { name: account.name, address: account.emailAddress } : undefined,
      to: toValues.map((t) => ({ name: t.label ?? undefined, address: t.value })),
      cc: ccValues.map((c) => ({ name: c.label ?? undefined, address: c.value })),
    })
  }

  if (!isOpen) return null

  return (
    <div
      className={cn(
        "fixed z-50 transition-all duration-200 shadow-2xl border bg-background rounded-t-xl overflow-hidden",
        isMinimized
          ? "bottom-0 right-8 w-72 h-11"
          : "bottom-0 right-8 w-[620px] max-w-[calc(100vw-32px)] h-[580px] max-h-[calc(100vh-60px)] flex flex-col"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/70 border-b select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">New Message</span>
          {account && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
              from {account.emailAddress}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground shrink-0">
          <button
            type="button"
            title={isMinimized ? "Expand" : "Minimize"}
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:text-foreground hover:bg-accent rounded"
          >
            {isMinimized ? <Square className="size-3.5" /> : <Minimize2 className="size-3.5" />}
          </button>
          <button
            type="button"
            title="Close"
            onClick={() => setIsOpen(false)}
            className="p-1 hover:text-foreground hover:bg-accent rounded"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex-1 flex flex-col overflow-y-auto">
          <EmailEditor
            subject={subject}
            setSubject={setSubject}
            //@ts-ignore
            toValues={toValues}
            setToValues={setToValues}
            //@ts-ignore
            ccValues={ccValues}
            setCcValues={setCcValues}
            to={toValues.map((t) => t.value)}
            handleSend={handleSend}
            isSending={sendEmail.isPending}
            defaultToolbarExpanded={true}
            accountId={accountId}
          />
        </div>
      )}
    </div>
  )
}

export default ComposeDialog
