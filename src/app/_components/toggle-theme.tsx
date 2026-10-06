"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Moon, Sun, Monitor } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  className?: string
  isCollapsed?: boolean
  showLabel?: boolean
}

export function ThemeToggle({ className, isCollapsed = false, showLabel }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === "dark" : false

  const toggleTheme = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setTheme(isDark ? "light" : "dark")
  }

  // Fallback placeholder before hydration to avoid layout shift
  if (!mounted) {
    if (isCollapsed) {
      return (
        <div className={cn("size-8 flex items-center justify-center rounded-lg text-muted-foreground", className)}>
          <Sun className="size-4 opacity-50" />
        </div>
      )
    }
    return (
      <div className={cn("flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-xs text-muted-foreground", className)}>
        <div className="flex items-center gap-2">
          <Sun className="size-4 opacity-50" />
          <span>Theme</span>
        </div>
      </div>
    )
  }

  // Collapsed Variant (icon only)
  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            className={cn(
              "size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all",
              className
            )}
          >
            {isDark ? (
              <Moon className="size-4 text-purple-400 fill-purple-400/20 transition-transform duration-200 active:rotate-45" />
            ) : (
              <Sun className="size-4 text-amber-500 fill-amber-500/20 transition-transform duration-200 active:rotate-45" />
            )}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {isDark ? "Switch to light theme" : "Switch to dark theme"}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Expanded Variant (Full Interactive Row)
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "group flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-all select-none border border-transparent hover:border-border/50",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isDark ? (
          <Moon className="size-4 text-purple-400 fill-purple-400/20 transition-transform group-hover:scale-110" />
        ) : (
          <Sun className="size-4 text-amber-500 fill-amber-500/20 transition-transform group-hover:scale-110" />
        )}
        <span className="truncate">{isDark ? "Dark Theme" : "Light Theme"}</span>
      </div>

      {/* Pill Toggle Switch Indicator */}
      <div
        className={cn(
          "w-8 h-4 rounded-full p-0.5 transition-colors flex items-center shrink-0",
          isDark ? "bg-purple-600 justify-end" : "bg-muted-foreground/30 justify-start"
        )}
      >
        <div className="size-3 rounded-full bg-white shadow-xs transition-all" />
      </div>
    </button>
  )
}
