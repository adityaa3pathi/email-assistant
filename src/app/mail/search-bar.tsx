"use client"

import React from "react"
import { Search, X, Sparkles, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import useThreads from "@/hooks/use-threads"
import { api } from "@/trpc/react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

const SearchBar = () => {
  const { accountId, setThreadId } = useThreads()
  const [query, setQuery] = React.useState("")
  const [debouncedQuery, setDebouncedQuery] = React.useState("")
  const [isOpen, setIsOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Debounce the search query
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Close dropdown on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const { data: results, isLoading } = api.account.semanticSearch.useQuery(
    { accountId: accountId ?? "", query: debouncedQuery },
    {
      enabled: !!accountId && debouncedQuery.length >= 3,
    }
  )

  const handleSelect = (threadId: string) => {
    setThreadId(threadId)
    setIsOpen(false)
    setQuery("")
  }

  return (
    <div ref={containerRef} className="relative px-4 py-2 border-b">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search emails with AI..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-9 pr-9 h-9 text-sm"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setIsOpen(false) }}
            className="absolute right-2.5 top-2.5"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && debouncedQuery.length >= 3 && (
        <div className="absolute left-0 right-0 top-full z-50 mx-4 mt-1 max-h-[400px] overflow-y-auto rounded-lg border bg-popover shadow-lg">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching with AI...
            </div>
          ) : results && results.length > 0 ? (
            <div className="py-1">
              <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-purple-400" />
                Semantic Search Results
              </div>
              {results.map((result) => (
                <button
                  key={result.emailId}
                  onClick={() => handleSelect(result.threadId)}
                  className="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium line-clamp-1">
                      {result.subject}
                    </span>
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ml-2",
                      Number(result.similarity) > 0.8
                        ? "bg-green-500/15 text-green-600"
                        : Number(result.similarity) > 0.6
                        ? "bg-yellow-500/15 text-yellow-600"
                        : "bg-gray-500/15 text-gray-600"
                    )}>
                      {Math.round(Number(result.similarity) * 100)}%
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {result.bodySnippet || result.content}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(result.sentAt), { addSuffix: true })}
                  </span>
                </button>
              ))}
            </div>
          ) : debouncedQuery.length >= 3 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No matching emails found
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default SearchBar
