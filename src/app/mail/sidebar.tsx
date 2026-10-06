"use client"

import type { FC } from "react"
import { useLocalStorage } from "usehooks-ts"
import { Nav } from "./nav"
import { File, Inbox, Send, Plus, Sparkles } from "lucide-react"
import { api } from "@/trpc/react"
import { useAtom } from "jotai"
import { isComposeOpenAtom } from "./compose-dialog"
import { AIChatButton } from "./ai-chat-panel"
import { ThemeToggle } from "../_components/toggle-theme"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface SidebarProps {
  isCollapsed: boolean
}

const Sidebar: FC<SidebarProps> = ({ isCollapsed }: SidebarProps) => {
  const [accountId] = useLocalStorage("accountId", "")
  const [tab] = useLocalStorage<"inbox" | "draft" | "sent">("email-assistant-tab", "inbox")
  const [_, setIsComposeOpen] = useAtom(isComposeOpenAtom)

  const { data: accounts } = api.account.getAccounts.useQuery()
  const validAccountId = accounts?.some((a) => a.id === accountId) ? accountId : ""

  const { data: inboxThreads } = api.account.getNumThreads.useQuery(
    { accountId: validAccountId, tab: "inbox" },
    { enabled: !!validAccountId }
  )
  const { data: draftThreads } = api.account.getNumThreads.useQuery(
    { accountId: validAccountId, tab: "draft" },
    { enabled: !!validAccountId }
  )
  const { data: sentThreads } = api.account.getNumThreads.useQuery(
    { accountId: validAccountId, tab: "sent" },
    { enabled: !!validAccountId }
  )

  return (
    <div className="flex flex-col h-full w-full overflow-hidden select-none">
      {/* ── Top Pinned Section: Primary Compose CTA ── */}
      <div className="p-2 shrink-0">
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setIsComposeOpen(true)}
                size="icon"
                className="h-9 w-9 mx-auto flex items-center justify-center rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-transform active:scale-95"
              >
                <Plus className="size-4" />
                <span className="sr-only">Compose email</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Compose (C)</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            onClick={() => setIsComposeOpen(true)}
            className="w-full justify-between font-semibold shadow-xs rounded-lg h-9 bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98] px-3"
          >
            <div className="flex items-center gap-2">
              <Plus className="size-4" />
              <span>Compose</span>
            </div>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary-foreground/20 text-primary-foreground">
              C
            </kbd>
          </Button>
        )}
      </div>

      <Separator className="shrink-0" />

      {/* ── Middle Scrollable Section: Navigation Folders ── */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        <Nav
          isCollapsed={isCollapsed}
          links={[
            {
              title: "Inbox",
              label: inboxThreads?.toString() ?? "0",
              icon: Inbox,
              variant: tab === "inbox" ? "default" : "ghost",
            },
            {
              title: "Draft",
              label: draftThreads?.toString() ?? "0",
              icon: File,
              variant: tab === "draft" ? "default" : "ghost",
            },
            {
              title: "Sent",
              label: sentThreads?.toString() ?? "0",
              icon: Send,
              variant: tab === "sent" ? "default" : "ghost",
            },
          ]}
        />
      </div>

      <Separator className="shrink-0" />

      {/* ── Bottom Pinned Section: AI Copilot & Controls ── */}
      <div className="p-2 shrink-0 flex flex-col gap-2 bg-sidebar/50">
        {/* Always-visible AI Assistant Trigger */}
        <AIChatButton isCollapsed={isCollapsed} />

        {/* Theme Toggle Button */}
        <div className="pt-0.5">
          <ThemeToggle isCollapsed={isCollapsed} />
        </div>
      </div>
    </div>
  )
}

export default Sidebar