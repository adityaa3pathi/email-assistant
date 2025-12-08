"use client"

import { getAurinkoAuthUrl } from '@/lib/actions'
import React from 'react'


const LinkAccountButton = ({}) => {
  return (
  <button onClick={async () => {
    const authUrl = await getAurinkoAuthUrl('Google')
    console.log(authUrl)
  }}>
Link Account
  </button>)
}

export default LinkAccountButton