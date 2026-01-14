"use client"


import { EditorContent, useEditor } from '@tiptap/react'
import {StarterKit} from '@tiptap/starter-kit'
import React from 'react'
import { Text } from '@tiptap/extension-text'
import EditorMenuBar from './editor-menubar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import TagInput from './tag-input'
import { Input } from '@/components/ui/input'

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
}

const EmailEditor  = ({subject, setSubject, toValues, setToValues, ccValues, setCcValues, to, handleSend, isSending, defaultToolbarExpanded}: Props) => {

    const [value, setValue] = React.useState('')
    const [expanded, setExpanded] = React.useState(defaultToolbarExpanded || false)

    const customText = Text.extend({
        addKeyboardShortcuts() {
                return  {
                    'Meta-j': () => {
                        console.log('Meta-j pressed')
                        return true
                    }
                }

        }}) 


    const editor = useEditor({
        immediatelyRender: false,
        autofocus: false,
        extensions: [StarterKit, customText],
        onUpdate: ({editor}) => {
            setValue(editor.getHTML())
        }
    })

    if(!editor) {
        return null
    }
  return (
    <div>
        <div className='flex p-y py-2 border-b'>
    <EditorMenuBar editor={editor}/></div>

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
                 <Input id='subject' value={subject} placeholder='subject' onChange={(e) => setSubject(e.target.value)}/>

            </>
        )}

        <div className='flex items-center gap-2'>
            <div className='cursor-pointer ' onClick={() => setExpanded(!expanded)}>
                <span>
                     Draft {" "}
                </span>
                    <span>
                        to .join(', ')
                    </span>
            </div>

        </div>
    </div>
    <div className='prose w-full px-4'> 
    <EditorContent editor={editor} value={value}/>
    </div>

    <Separator/>
     <div className="py-3 px-4 flex items-center justify-between">
                <span className="text-sm">
                    Tip: Press{" "}
                    <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">
                        Cmd + J
                    </kbd>{" "}
                    for AI autocomplete
                </span>
                <Button onClick={ async () => {
                        editor?.commands?.clearContent()
                    await handleSend(value)
                }} 
                disabled={isSending}>
                    Send
                </Button>
            </div>


    
    </div>
  )
}

export default EmailEditor