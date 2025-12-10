import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"


export const GET = async (req: NextRequest) => {
    const {userId} = await auth()

    if(!userId) return NextResponse.json({message: 'unauthorized'}, {status: 401})
        
        const params = req.nextUrl.searchParams

    console.log('userId is', userId)
    return NextResponse.json({message: 'hello world'})
}