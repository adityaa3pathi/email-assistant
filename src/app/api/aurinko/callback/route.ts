import { exchangeCodeForAccessToken, getAccountDetails } from "@/lib/actions"
import { inngest } from "@/inngest/client"
import { db } from "@/server/db"
import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"


export const GET = async (req: NextRequest) => {
    const {userId} = await auth()

    if(!userId) return NextResponse.json({message: 'unauthorized'}, {status: 401})
        
        const params = req.nextUrl.searchParams

        const status = params.get('status')
        if(status && status != "success") return NextResponse.json({message: 'failed to link account'}, {status: 400})


            //getting code to exchange it for the access token 
        const code = params.get('code')
        if(!code) return NextResponse.json({message: 'no code provided'}, {status: 400})

            const token = await exchangeCodeForAccessToken(code)
            if(!token) return NextResponse.json({message: 'failed to exchange code for the access token'}, {status: 400})

    const accountDetails = await getAccountDetails(token.accessToken)

    if(!accountDetails){
        console.error("failed to retrieve account details for token", token.accessToken)
        return NextResponse.json({message: 'failed to retrieve account details'}, {status: 400})
    }

    const accountName = accountDetails.name ?? accountDetails.email.split("@")[0] ?? accountDetails.email

    // Check if this user already has an account with the same email — reuse it
    const existingAccount = await db.account.findFirst({
        where: {
            userId,
            emailAddress: accountDetails.email,
        }
    })

    if (existingAccount) {
        // Update the existing account with the fresh token
        await db.account.update({
            where: { id: existingAccount.id },
            data: {
                accessToken: token.accessToken,
                name: accountName,
            }
        })
    } else {
        // Create a new account
        await db.account.create({
            data: {
                id: token.accountId.toString(),
                userId,
                emailAddress: accountDetails.email,
                name: accountName,
                accessToken: token.accessToken,
                syncStatus: "pending",
            }
        })
    }

    const accountId = existingAccount?.id ?? token.accountId.toString()

    // Enqueue sync as a background job — redirect user IMMEDIATELY
    await inngest.send({
        name: "email/sync.initial",
        data: { accountId, userId }
    })

    return NextResponse.redirect(new URL('/mail', req.url))
}
