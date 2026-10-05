"use client"

import React from "react"
import { Search, X, Sparkles, Loader2, SlidersHorizontal } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import useThreads from "@/hooks/use-threads"
import { api } from "@/trpc/react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

const AI_LABELS = [
  "urgent",
  "newsletter",
  "client-request",
  "internal",
  "meeting",
  "notification",
  "personal",
]

const AI_LABEL_COLORS: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  newsletter: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30",
  "client-request": "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  internal: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
  meeting: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  notification: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  personal: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
}

const SearchBar = () => {
  const { accountId, setThreadId } = useThreads()
  const [query, setQuery] = React.useState("")
  const [debouncedQuery, setDebouncedQuery] = React.useState("")
  const [isOpen, setIsOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const [showFilters, setShowFilters] = React.useState(false)
  const [filterFrom, setFilterFrom] = React.useState("")
  const [filterAfter, setFilterAfter] = React.useState("")
  const [filterBefore, setFilterBefore] = React.useState("")
  const [filterLabels, setFilterLabels] = React.useState<string[]>([])
  const [filterHasAttachments, setFilterHasAttachments] = React.useState(false)

  const activeFiltersCount = 
    (filterFrom ? 1 : 0) +
    (filterAfter ? 1 : 0) +
    (filterBefore ? 1 : 0) +
    (filterLabels.length > 0 ? 1 : 0) +
    (filterHasAttachments ? 1 : 0)

  const handleClearFilters = () => {
    setFilterFrom("")
    setFilterAfter("")
    setFilterBefore("")
    setFilterLabels([])
    setFilterHasAttachments(false)
  }

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
    { 
      accountId: accountId ?? "", 
      query: debouncedQuery,
      from: filterFrom || undefined,
      after: filterAfter || undefined,
      before: filterBefore || undefined,
      labels: filterLabels.length > 0 ? filterLabels : undefined,
      hasAttachments: filterHasAttachments || undefined,
    },
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
      <div className="flex items-center gap-2 relative">
        <div className="relative flex-1">
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
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "p-2 rounded-md hover:bg-accent transition-colors relative",
            showFilters && "bg-accent"
          )}
        >
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-blue-500 border-2 border-background" />
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mt-2 p-4 bg-accent/50 rounded-lg border text-sm flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input 
                value={filterFrom} 
                onChange={e => setFilterFrom(e.target.value)} 
                placeholder="Sender email or name" 
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Date Range</label>
              <div className="flex items-center gap-2">
                <Input 
                  type="date" 
                  value={filterAfter} 
                  onChange={e => setFilterAfter(e.target.value)} 
                  className="h-8 text-xs flex-1"
                />
                <span className="text-muted-foreground text-xs">-</span>
                <Input 
                  type="date" 
                  value={filterBefore} 
                  onChange={e => setFilterBefore(e.target.value)} 
                  className="h-8 text-xs flex-1"
                />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Labels</label>
            <div className="flex flex-wrap gap-1.5">
              {AI_LABELS.map(label => {
                const isActive = filterLabels.includes(label)
                return (
                  <Badge
                    key={label}
                    variant="outline"
                    className={cn(
                      "cursor-pointer transition-colors",
                      isActive ? AI_LABEL_COLORS[label] : "hover:bg-accent",
                      isActive ? "" : "text-muted-foreground"
                    )}
                    onClick={() => {
                      if (isActive) {
                        setFilterLabels(filterLabels.filter(l => l !== label))
                      } else {
                        setFilterLabels([...filterLabels, label])
                      }
                    }}
                  >
                    {label}
                  </Badge>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input 
                type="checkbox" 
                checked={filterHasAttachments} 
                onChange={e => setFilterHasAttachments(e.target.checked)}
                className="rounded border-input h-3.5 w-3.5"
              />
              Has attachments
            </label>
            
            {activeFiltersCount > 0 && (
              <button 
                onClick={handleClearFilters}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

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
