"use server"

import { auth } from "@clerk/nextjs/server"
import axios, {Axios} from "axios"
import type { EmailMessage, SyncResponse, SyncUpdatedResponse } from "./types"


export const getAurinkoAuthUrl = async(serviceType: 'Google' | 'Office365') => {


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


// export class Account {
//     private token: string;

//     constructor(token: string) {
//         this.token = token
//     }

//     private async startSync() {
//         const response = await axios.post<SyncResponse>('https://api.aurinko.io/v1/email/sync', {}, {
//             headers: {
//                 Authorization: `Bearer ${this.token}`
//             },
//             params: {
//                 daysWithin: 2,
//                 bodyType: 'html'
//             }
//         })
//         return response.data
//     }

//     async getUpdatedEmails({deltaToken, pageToken}: {deltaToken?: string, pageToken?: string }) {

//         let params: Record<string, string> = {}
//         if (deltaToken) params.deltaToken = deltaToken
//         if (pageToken) params.pageToken = pageToken
    
//     const response = await axios.get<SyncUpdatedResponse>('https://api.aurinko.io/v1/email/sync/updated', {
//         headers: {
//             Authorization: `Bearer ${this.token}`
//         },
//         params
//     })

//     return response.data
//     }

//     async performInitialSync() {
//         try {
//             let syncResponse = await this.startSync()
//             while (!syncResponse.ready) {
//                 await new Promise(resolve => setTimeout(resolve, 1000))
//                 syncResponse = await  this.startSync()
//             }


//             //get the bookmark delta token
//             let storedDeltaToken: string = syncResponse.syncUpdatedToken

//             let updatedResponse = await this.getUpdatedEmails({deltaToken: storedDeltaToken})

//             if(updatedResponse.nextDeltaToken) {
//                 //sync has completed
//                 storedDeltaToken = updatedResponse.nextDeltaToken
//             }

//                 let allEmails : EmailMessage[] = updatedResponse.records

//                 while (updatedResponse.nextPageToken) {
//                     updatedResponse = await this.getUpdatedEmails({pageToken: updatedResponse.nextPageToken})
//                     allEmails = allEmails.concat(updatedResponse.records)
//                     if(updatedResponse.nextDeltaToken) {
//                         //sync has ended
//                         storedDeltaToken = updatedResponse.nextDeltaToken
//                     }
//                 }

//                 console.log('initial sync completed, we have synced', allEmails.length, 'emails')
//                 //store the latest delta token for future incremental syncs

//                 return {
//                     emails: allEmails,
//                     deltaToken: storedDeltaToken
//                 }
//         }
//         catch (error) {
//         if (axios.isAxiosError(error)) {
//             console.log('Error during sync:', JSON.stringify(error.response?.data, null, 2))
//         } console.error('Unexpected error fetching account details', error)
//     }
//     }

// }