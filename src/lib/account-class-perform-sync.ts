import axios, {Axios} from "axios"
import type { EmailMessage, SyncResponse, SyncUpdatedResponse } from "./types"


export class Account { 
    private token: string;

    constructor(token: string) {
        this.token = token
        
    }

    async startSync(daysWithin?: number) {
        let params: Record<string, string | number> = {
            bodyType: 'html'
        }
        if (daysWithin !== undefined) {
            params.daysWithin = daysWithin
        }

        const response = await axios.post<SyncResponse>('https://api.aurinko.io/v1/email/sync', {}, {
            headers: {
                Authorization: `Bearer ${this.token}`
            },
            params,
            timeout: 60000 // 60 second timeout
        })
        return response.data
    }

    async getUpdatedEmails({deltaToken, pageToken}: {deltaToken?: string, pageToken?: string }) {

        let params: Record<string, string> = {
            bodyType: 'html'
        }
        if (deltaToken) params.deltaToken = deltaToken
        if (pageToken) params.pageToken = pageToken
    
    const response = await axios.get<SyncUpdatedResponse>('https://api.aurinko.io/v1/email/sync/updated', {
        headers: {
            Authorization: `Bearer ${this.token}`
        },
        params,
        timeout: 60000 // 60 second timeout
    })

    return response.data
    }

    async performInitialSync(daysWithin?: number) {
        try {
            let syncResponse = await this.startSync(daysWithin)
            while (!syncResponse.ready) {
                await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2s between polls
                syncResponse = await this.startSync(daysWithin)
            }


            //get the bookmark delta token
            let storedDeltaToken: string = syncResponse.syncUpdatedToken

            let updatedResponse = await this.getUpdatedEmails({deltaToken: storedDeltaToken})

            if(updatedResponse.nextDeltaToken) {
                //sync has completed
                storedDeltaToken = updatedResponse.nextDeltaToken
            }

                let allEmails : EmailMessage[] = updatedResponse.records

                while (updatedResponse.nextPageToken) {
                    updatedResponse = await this.getUpdatedEmails({pageToken: updatedResponse.nextPageToken})
                    allEmails = allEmails.concat(updatedResponse.records)
                    if(updatedResponse.nextDeltaToken) {
                        //sync has ended
                        storedDeltaToken = updatedResponse.nextDeltaToken
                    }
                }

                console.log('initial sync completed, we have synced', allEmails.length, 'emails')
                //store the latest delta token for future incremental syncs

                return {
                    emails: allEmails,
                    deltaToken: storedDeltaToken
                }
        }
        catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Error during sync:', JSON.stringify(error.response?.data, null, 2))
        } else {
            console.error('Unexpected error during sync:', error)
        }
        throw error
    }
    }

}
