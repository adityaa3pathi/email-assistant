"use client"

import { EditorContent, useEditor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import React from 'react'
import { Text } from '@tiptap/extension-text'
import { useCompletion } from '@ai-sdk/react'
import EditorMenuBar from './editor-menubar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import TagInput from './tag-input'
import { Input } from '@/components/ui/input'
import { Sparkles, Loader2 } from 'lucide-react'

type Props = {
    subject: string
    setSubject: (value: string) => void

    toValues: {label: string; value: string}[]
    setToValues: (values: {label: string; value: string}[]) => void

    ccValues: {label: string; value: string}[]
    setCcValues: (values: {label: string; value: string}[]) => void

    to: string[]
    handleSend: (value: string) => void
    isSending: boolean

    defaultToolbarExpanded?: boolean
    threadId?: string | null
    accountId?: string
}

const EmailEditor = ({ subject, setSubject, toValues, setToValues, ccValues, setCcValues, to, handleSend, isSending, defaultToolbarExpanded, threadId, accountId }: Props) => {

    const [value, setValue] = React.useState('')
    const [expanded, setExpanded] = React.useState(defaultToolbarExpanded || false)

    // ─── AI Autocomplete ─────────────────────────────────────────────────
    const { complete, completion, isLoading: isAiLoading, stop, setCompletion } = useCompletion({
        api: '/api/ai/autocomplete',
        onResponse: () => {
            prevCompletionLenRef.current = 0
            editorRef.current?.commands.focus('end')
        },
        onError: (error) => {
            console.error('AI autocomplete error:', error)
        },
    })

    // Track the previous completion length so we only insert NEW tokens
    const prevCompletionLenRef = React.useRef(0)
    // Ref to hold the editor instance for use in callbacks defined before useEditor
    const editorRef = React.useRef<ReturnType<typeof useEditor>>(null)

    const triggerAiComplete = React.useCallback(() => {
        const ed = editorRef.current
        if (!ed) return
        setCompletion('')
        prevCompletionLenRef.current = 0

        const currentContent = ed.getText()
        ed.commands.focus('end')
        complete(currentContent, {
            body: {
                context: currentContent,
                threadSubject: subject,
                threadId: threadId ?? undefined,
                accountId: accountId ?? undefined,
            },
        })
    }, [complete, setCompletion, subject, threadId, accountId])

    const customText = Text.extend({
        addKeyboardShortcuts() {
            return {
                'Meta-j': () => {
                    triggerAiComplete()
                    return true
                },
                'Escape': () => {
                    if (isAiLoading) {
                        stop()
                        return true
                    }
                    return false
                },
            }
        }
    })

    const editor = useEditor({
        immediatelyRender: false,
        autofocus: false,
        extensions: [StarterKit, customText],
        onUpdate: ({ editor }) => {
            setValue(editor.getHTML())
        }
    })

    // Keep the ref in sync with the editor instance
    editorRef.current = editor

    React.useEffect(() => {
        if (!editor || !completion) return

        // Insert only the newly streamed portion
        const newText = completion.slice(prevCompletionLenRef.current)
        if (newText) {
            editor.commands.focus('end').insertContent(newText)
            prevCompletionLenRef.current = completion.length
        }
    }, [completion, editor])

    if (!editor) {
        return null
    }

    return (
        <div>
            <div className='flex p-y py-2 border-b'>
                <EditorMenuBar editor={editor} />
            </div>

            <div className='p-4 pb-0 space-y-2'>
                {expanded && (
                    <>
                        <TagInput
                            label='To'
                            onChange={setToValues}
                            placerholder='Add recipients'
                            value={toValues}
                        />
                        <TagInput
                            label='Cc'
                            onChange={setCcValues}
                            placerholder='Add recipients'
                            value={ccValues}
                        />
                        <Input id='subject' value={subject} placeholder='subject' onChange={(e) => setSubject(e.target.value)} />
                    </>
                )}

                <div className='flex items-center gap-2'>
                    <div className='cursor-pointer' onClick={() => setExpanded(!expanded)}>
                        <span>Draft {" "}</span>
                        <span>{to.join(', ')}</span>
                    </div>
                </div>
            </div>

            <div className='prose w-full px-4'>
                <EditorContent editor={editor} value={value} />
            </div>

            <Separator />
            <div className="py-3 px-4 flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                    {isAiLoading ? (
                        <>
                            <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                            <span className="text-purple-500">AI is writing... Press <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-gray-100 border border-gray-200 rounded">Esc</kbd> to stop</span>
                        </>
                    ) : (
                        <>
                            Tip: Press{" "}
                            <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">
                                Cmd + J
                            </kbd>{" "}
                            for AI autocomplete
                        </>
                    )}
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={triggerAiComplete}
                        disabled={isAiLoading}
                        className="gap-1.5"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Complete
                    </Button>
                    <Button
                        onClick={async () => {
                            editor?.commands?.clearContent()
                            await handleSend(value)
                        }}
                        disabled={isSending}
                    >
                        Send
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default EmailEditor