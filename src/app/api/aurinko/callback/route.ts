import { exchangeCodeForAccessToken, getAccountDetails } from "@/lib/actions"
import { db } from "@/server/db"
import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import axios from "axios"


export const GET = async (req: NextRequest) => {
    const {userId} = await auth()

    if(!userId) return NextResponse.json({message: 'unauthorized'}, {status: 401})
        
        const params = req.nextUrl.searchParams

        const status = params.get('status')
        if(status != "success") return NextResponse.json({message: 'failed to link account'}, {status: 400})


            //getting code to exchange it for the access token 
        const code = params.get('code')
        if(!code) return NextResponse.json({message: 'no code provided'}, {status: 400})

            const token = await exchangeCodeForAccessToken(code)
            if(!token) return NextResponse.json({message: 'failed to exchange code for the access token'}, {status: 400})

    const accountDetails = await getAccountDetails(token.accessToken)

    if(!accountDetails){
        console.error("failed to retrieve account details for token", token.accessToken)
        return
    }

    await db.account.upsert({
        where: {
            id: token.accountId.toString()
        }, 
        update: {
            accessToken: token.accessToken,
        },
        create: {
            id: token.accountId.toString(),
            userId,
            emailAddress: accountDetails.email,
            name: accountDetails.name,
            accessToken: token.accessToken,

        }
    })

    waitUntil(
        axios.post(`${process.env.NEXT_PUBLIC_URL}/api/initial-sync`, {
            accountId: token.accountId.toString(),
            userId
        }).then(response => {
            console.log('Initial sync triggered', response.data)
        }).catch(error => {
            console.log('failed to trigger initial sync', error)
        })
    )

    return NextResponse.redirect(new URL('/mail', req.url))
}