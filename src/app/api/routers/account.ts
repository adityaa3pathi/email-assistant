import { createTRPCRouter, privateProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";
import z from "zod";


export const authorizeAccountAccess = async (accountId: string, userId: string) => {

    const account = await db.account.findFirst({
        where: {
            id: accountId,
            userId
        }, select: {
                id: true, emailAddress: true, name: true, accessToken: true
        }
    })
        if(!account) throw new Error('Account not found')
                return account
}

export const accountRouter = createTRPCRouter({
    getAccounts:  privateProcedure.query(async ({ctx}) => {

        return await ctx.db.account.findMany({
            where: {
                userId: ctx.auth.userId
            },
            select: {
                id: true,
                emailAddress: true,
                name: true
            }
        })
    }),


getNumThreads: privateProcedure.input(z.object({
    accountId: z.string(),
    tab: z.string()
})).query(async ({ctx, input}) => {
       const account = await authorizeAccountAccess(input.accountId, ctx.auth.userId)
       let filter: Prisma.ThreadWhereInput = {}
       if(input.tab === 'inbox') {
        filter.inboxStatus = true
       }
        else if(input.tab === 'draft') {
        filter.draftStatus = true
       }
        if(input.tab === 'sent') {
        filter.sentStatus = true
       }

       return await ctx.db.thread.count({
        where: {
            accountId: account.id,
           ...filter
        }
       })
})

getThreads: privateProcedure.input(z.object({
    accountId: z.string(),
    tab: z.string
}))
}) 

