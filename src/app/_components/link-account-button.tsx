"use client"

import { getGoogleAuthUrl } from '@/lib/actions'
import React from 'react'


const LinkAccountButton = ({}) => {
  return (
  <button onClick={async () => {
    const authUrl = await getGoogleAuthUrl()
    console.log(authUrl)
    window.location.href = authUrl
  }}>
Link Account
  </button>)
}

export default LinkAccountButton
