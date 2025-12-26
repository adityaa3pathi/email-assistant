
import { Account } from "@/lib/aurinko-api-client";
import { db } from "@/server/db";
import { NextRequest, NextResponse } from "next/server";


export const POST = async (req: NextRequest) => {
    const {accountId, userId} = await req.json()

    if(!accountId || !userId) return NextResponse.json({message: 'Missing account id or user id'}, {status: 400})

        const dbAccount = await db.account.findUnique({
            where: {
                id: accountId,
                userId
            }
        })
        if(!dbAccount) return NextResponse.json({message: 'Account not found'}, {status: 400})

           //p const emails = await perfomI
           const account = new Account(dbAccount.accessToken)

           const response  = await account.performInitialSync()

           if(!response) {
            return NextResponse.json({error: 'failed to perform initial sync'}, {status: 500})
           }

           const {emails, deltaToken} = response

           await db.account.update({
            where: {
                id: accountId
            },
            data: {
                nextDeltaToken: deltaToken
            }
           })
  
           console.log('emails', emails)
           console.log('sync completed', deltaToken)
           return NextResponse.json({success: true}, {status: 200}) 
           // kal se padhai chalu
           



}