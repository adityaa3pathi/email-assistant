"use client"

import React from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

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

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          setIsCollapsed(
            sizes[0] === navCollapsedSize || sizes[0] === 0
          )
        }}
        className="h-full min-h-screen items-stretch"
      >
        {/* Sidebar */}
        <ResizablePanel
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible
          minSize={15}
          maxSize={40}
          className={cn(
            isCollapsed &&
              "min-w-[50px] transition-all duration-300 ease-in-out"
          )}
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div
              className={cn(
                "flex h-[52px] items-center justify-center",
                !isCollapsed && "px-2"
              )}
            >
              Account Switcher
            </div>

            <Separator />

            {/* Sidebar content */}
            <div className="px-2 py-2">Sidebar</div>

            <div className="flex-1" />

            {/* Ask AI */}
            <div className="px-2 pb-2">Ask AI</div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Thread list */}
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          <Tabs defaultValue="inbox" className="h-full">
            {/* Tabs header */}
            <div className="flex items-center px-4 py-2">
              <h1 className="text-xl font-bold">Inbox</h1>
              <TabsList className="ml-auto">
                <TabsTrigger
                  value="inbox"
                  className="text-zinc-600 dark:text-zinc-200"
                >
                  Inbox
                </TabsTrigger>
                <TabsTrigger value="" className="text-zinc-800 dark:text-zinc-200" >
                    Done
                </TabsTrigger>
              </TabsList>
            </div>

            <Separator />
            Search Bar
            <TabsContent value="inbox">
                inbox
            </TabsContent>
            <TabsContent value="done">
                done
            </TabsContent>
        
          </Tabs>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[2]} minSize={30} > thread display</ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  )
}

export default Mail
