"use client"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Tooltip } from "@radix-ui/react-tooltip"
import React from "react"


    type Props = {
        defaultLayout: number[] | undefined
        navCollapsedSize: number
        defaultCollapsed: boolean
    }

   

const Mail = ({defaultLayout = [20, 32, 48], navCollapsedSize, defaultCollapsed}: Props) => {

     const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)

    return (
       <TooltipProvider delayDuration={0}>
        <ResizablePanelGroup
                onLayout={(sizes: number[]) => {
          // sizes[0] = nav panel
          setIsCollapsed(sizes[0] === navCollapsedSize || sizes[0] === 0)
        }}

        // direction='horizontal' onLayout={(sizes: number[]) => {
        //     console.log(sizes)
        // }}
         className='items-stretch h-full min-h-screen'
        >
            <ResizablePanel 
            defaultSize={defaultLayout[0]} collapsedSize={navCollapsedSize}
            collapsible={true}
            minSize={15}
            maxSize={40}
            className={cn(isCollapsed && 'min-w-[50px] transition-all duration-300 ease-in-out')}
            >
                <div className="flex flex-col h-full flex-1">
                <div className={cn("flex h-[52px] items-center justify-between", isCollapsed?'h-[52px]': 'px-2')}>
                    {/* Account Switcher */}
                    account Switcher
                </div>
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>

       </TooltipProvider>
    )
}

export default Mail