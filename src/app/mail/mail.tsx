"use client"

import React from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import AccountSwitcher from "./account-switcher"
import Sidebar from "./sidebar"
import ThreadList from "./threads-list"
import ThreadDisplay from "./thread-display"
import SearchBar from "./search-bar"
import { AIChatDrawer } from "./ai-chat-panel"
import ComposeDialog, { isComposeOpenAtom } from "./compose-dialog"
import { Plus } from "lucide-react"

import { useLocalStorage } from "usehooks-ts"
import { useSetAtom } from "jotai"

type Props = {
  defaultLayout?: number[]
  navCollapsedSize: number
  defaultCollapsed: boolean
}

const Mail = ({
  defaultLayout = [20, 32, 48],
  navCollapsedSize,
  defaultCollapsed,
}: Props) => {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
  const [tab] = useLocalStorage<"inbox" | "draft" | "sent">("email-assistant-tab", "inbox")
  const [done, setDone] = useLocalStorage("email-assistant-done", false)
  const setIsComposeOpen = useSetAtom(isComposeOpenAtom)

  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-screen max-h-screen w-screen overflow-hidden flex flex-col bg-background">
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes: number[]) => {
            setIsCollapsed(
              sizes[0] === navCollapsedSize || sizes[0] === 0 || (sizes[0] !== undefined && sizes[0] < 10)
            )
          }}
          className="h-full w-full overflow-hidden items-stretch"
        >
          {/* ── 1. Left Sidebar Panel (Sticky Header, Pinned Top Compose, Sticky Footer AI & Theme) ── */}
          <ResizablePanel
            defaultSize={defaultLayout[0]}
            collapsedSize={navCollapsedSize}
            collapsible
            minSize={12}
            maxSize={28}
            className={cn(
              "h-full overflow-hidden border-r bg-sidebar/40 flex flex-col",
              isCollapsed && "min-w-[50px] transition-all duration-300 ease-in-out"
            )}
          >
            {/* Account Switcher Header (Pinned 52px) */}
            <div
              className={cn(
                "flex h-[52px] shrink-0 items-center justify-center border-b px-2",
                isCollapsed && "px-1"
              )}
            >
              <AccountSwitcher isCollapsed={isCollapsed} />
            </div>

            {/* Sidebar Body (Sticky Compose at top, nav in middle, Sticky Ask AI & Theme at bottom) */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <Sidebar isCollapsed={isCollapsed} />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── 2. Middle Thread List Panel (Header, Search, Scrollable Threads) ── */}
          <ResizablePanel defaultSize={defaultLayout[1]} minSize={25} className="min-w-0 h-full overflow-hidden">
            <Tabs
              value={done ? "done" : "inbox"}
              onValueChange={(v) => setDone(v === "done")}
              className="h-full flex flex-col min-w-0 w-full overflow-hidden"
            >
              {/* Header (Aligned 52px height) */}
              <div className="flex items-center px-4 h-[52px] shrink-0 border-b justify-between">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold capitalize tracking-tight">{tab}</h1>
                </div>

                <div className="flex items-center gap-2">
                  {/* Quick Compose Icon when Sidebar is collapsed */}
                  {isCollapsed && (
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setIsComposeOpen(true)}
                          className="size-8 rounded-lg"
                        >
                          <Plus className="size-4" />
                          <span className="sr-only">Compose (C)</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Compose (C)</TooltipContent>
                    </Tooltip>
                  )}

                  <TabsList className="h-8">
                    <TabsTrigger value="inbox" className="text-xs px-2.5">
                      Inbox
                    </TabsTrigger>
                    <TabsTrigger value="done" className="text-xs px-2.5">
                      Done
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>

              {/* Search Bar (Pinned) */}
              <div className="shrink-0 p-2 border-b bg-background/50">
                <SearchBar />
              </div>

              {/* Thread list content (Scrollable container) */}
              <TabsContent value="inbox" className="m-0 flex-1 min-h-0 overflow-y-auto">
                <ThreadList />
              </TabsContent>
              <TabsContent value="done" className="m-0 flex-1 min-h-0 overflow-y-auto">
                <ThreadList />
              </TabsContent>
            </Tabs>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── 3. Right Thread Display Panel (Email reading & reply) ── */}
          <ResizablePanel defaultSize={defaultLayout[2]} minSize={30} className="min-w-0 h-full overflow-hidden">
            <ThreadDisplay />
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Global Floating Modals & Drawers */}
        <ComposeDialog />
        <AIChatDrawer />
      </div>
    </TooltipProvider>
  )
}

export default Mail
