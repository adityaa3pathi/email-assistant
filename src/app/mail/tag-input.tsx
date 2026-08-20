"use client"

import Select from 'react-select'
import useThreads from '@/hooks/use-threads';
import { api } from '@/trpc/react';
import React from 'react'
import Avatar from 'react-avatar';


type Props = {
   
    placerholder?: string
    label?: string

    onChange?: (values: {label: string; value: string}[]) => void
    value?: {label: string; value: string}[]
}
const TagInput = ({ placerholder, label, onChange, value}: Props) => {

    const accountId = useThreads().accountId
    const {data: suggestions} = api.account.getSuggessions.useQuery({accountId: accountId!})

      const [inputValue, setInputValue] = React.useState('')

    const options = suggestions?.map((suggestion) => ({
      label: suggestion.address,
      value: suggestion.address
    })) || []
  return (
    <div className='border rounded-md flex items-center'>
            <span className='mt-3 text-sm text-gray-500'>
        {label} 
            </span>
            <Select
            onInputChange={setInputValue}
            onChange={(values) => onChange?.(values as { label: string; value: string }[])}
             value={value} 
             className='W-FULL flex-1  '
            options={inputValue ? options.concat([{label: inputValue, value: inputValue}]) : options}
            placeholder={placerholder}
            isMulti
            formatOptionLabel={(option: { label: string; value: string }) => (
              <span className='flex items-center gap-2'>
                <Avatar name={option.value} size='25' textSizeRatio={2} round={true}/>
                {option.label}
              </span>
            )}
            classNames={{
                control: () => {
                    return '!border-none !outline-none !ring-0 !shadow-none focus:border-none focus:outline-none focus:ring-0 focus:shadow-none dark:bg-transparent'
                },
                multiValue: () => {
                    return 'dark:!bg-gray-700'
                },
                multiValueLabel: () => {
                    return 'dark:text-white dark:bg-gray-700 rounded-md'
                }
            }}
            classNamePrefix="select"/>

    </div>
  )
}

export default TagInput