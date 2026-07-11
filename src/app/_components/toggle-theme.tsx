"use client"

import * as React from "react"

import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon } from "lucide-react"

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()

    const toggleTheme = () => {
        setTheme(theme === "light" ? "dark" : "light")
    }

    return (
        <Button
            variant="outline"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="size-14 rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-2"
        >
            <SunIcon className="size-7 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <MoonIcon className="absolute size-7 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
    )
}

