"use server"

import { auth } from "@clerk/nextjs/server"
import axios, {Axios} from "axios"
import type { EmailMessage, SyncResponse, SyncUpdatedResponse } from "./types"


export const getAurinkoAuthUrl = async(serviceType: 'Google' | 'Office365') => {

    try{

    const {userId} = await auth()
    if(!userId) throw new Error("Unauthorized")

        const params = new URLSearchParams({
            clientId: process.env.AURINKO_CLIENT_ID as string,
            serviceType,
            scopes: "Mail.ReadWrite Mail.Send Mail.Drafts Mail.All",
            responseType: 'code',
            returnUrl: `${process.env.NEXT_PUBLIC_URL}/api/aurinko/callback`
        })

        return `https://api.aurinko.io/v1/auth/authorize?${params.toString()}`
} 

catch(error) {
    console.log("error", error)
}
}

export const exchangeCodeForAccessToken = async (code: string ) => {
    try {
        const response = await axios.post(`https://api.aurinko.io/v1/auth/token/${code}`, {}, {
            auth:  {
                username: process.env.AURINKO_CLIENT_ID as string,
                password: process.env.AURINKO_CLIENT_SECRET as string
            }
        })

        return response.data as {
            accountId: number,
            accessToken: string,
            userId: string,
            userSession: string
        }
    }
    catch(error) {
        if (axios.isAxiosError(error)) {
            console.error(error.response?.data)
        }
        console.error(error)
    }
}

export const getAccountDetails = async (accessToken: string) => {
    try {
        const response = await axios.get('https://api.aurinko.io/v1/account', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
    return response.data as {
        email: string,
        name: string
    }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.log('Error fetching account details', error.response?.data)
        } console.error('Unexpected error fetching account details', error)
    }
}

