"use client"

import * as React from "react"

import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon } from "lucide-react"

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme()

    const toggleTheme = () => {
        setTheme(theme === "light" ? "dark" : "light")
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className={className || "h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"}
        >
            <SunIcon className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <MoonIcon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
    )
}

