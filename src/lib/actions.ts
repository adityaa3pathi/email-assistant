"use server"

import { auth } from "@clerk/nextjs/server"
import axios from "axios"
import type { EmailMessage, SyncResponse, SyncUpdatedResponse } from "./types"
import { env } from "@/env"


type AurinkoServiceType = "Google" | "Office365" | "IMAP"

const getAurinkoScopes = (serviceType: AurinkoServiceType) => {
    if(env.AURINKO_SCOPES) return env.AURINKO_SCOPES

    if(serviceType === "IMAP") return "Mail.ReadWrite Mail.Send"

    return "Mail.ReadWrite Mail.Send Mail.Drafts"
}

const getAurinkoAccountAuthParams = (serviceType: AurinkoServiceType) => {
    const params = new URLSearchParams({
        clientId: env.AURINKO_CLIENT_ID,
        serviceType,
        scopes: getAurinkoScopes(serviceType),
        responseType: 'code',
        returnUrl: `${env.NEXT_PUBLIC_URL}/api/aurinko/callback`
    })

    const provider = env.AURINKO_AUTH_PROVIDER
    if(provider) params.set("provider", provider)

    return params
}

export const getAurinkoAuthUrl = async(serviceType?: AurinkoServiceType): Promise<string> => {

    try{

    const {userId} = await auth()
    if(!userId) throw new Error("Unauthorized")

        const params = getAurinkoAccountAuthParams(
            serviceType ?? env.AURINKO_SERVICE_TYPE
        )

        return `https://api.aurinko.io/v1/auth/authorize?${params.toString()}`
} 

catch(error) {
    console.log("error", error)
    throw error
}
}

export const exchangeCodeForAccessToken = async (code: string ) => {
    try {
        const response = await axios.post(`https://api.aurinko.io/v1/auth/token/${code}`, {}, {
            auth:  {
                username: env.AURINKO_CLIENT_ID,
                password: env.AURINKO_CLIENT_SECRET
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
        name?: string
    }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.log('Error fetching account details', error.response?.data)
        } console.error('Unexpected error fetching account details', error)
    }
}
