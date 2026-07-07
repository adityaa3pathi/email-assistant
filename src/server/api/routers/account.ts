import { createTRPCRouter, privateProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { EmailLabel, type Prisma } from "@prisma/client";
import { sendStatusCode } from "next/dist/server/api-utils";
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
       filter.accountId = account.id
       if(input.tab === 'inbox') {
        filter.inboxStatus = true
       }
        else if(input.tab === 'draft') {
        filter.draftStatus = true
       }
      else if(input.tab === 'sent') {
        filter.sentStatus = true
       }


       console.log("the thread is:", ctx.db.thread.count)
       return await ctx.db.thread.count({
        where: filter
       })
}),

getThreads: privateProcedure.input(z.object({
    accountId: z.string(),
    tab: z.string(),
    done: z.boolean()
})).query(async ({ctx, input}) => {
    const account = await authorizeAccountAccess(input.accountId, ctx.auth.userId) 

     let filter: Prisma.ThreadWhereInput = {}
       filter.accountId = account.id
       if(input.tab === 'inbox') {
        filter.inboxStatus = true
       }
        else if(input.tab === 'draft') {
        filter.draftStatus = true
       }
        else if(input.tab === 'sent') {
        filter.sentStatus = true
       }

       filter.done = {
        equals: input.done
       }

       return  await ctx.db.thread.findMany({
        where: filter,
            include: {
                emails: {
                    orderBy: {
                        sentAt: 'asc'
                    },
                    select: {
                        from: true,
                        body: true,
                        bodySnippet: true,
                        emailLabel: true,
                        sysLabels: true,
                        id: true,
                        sentAt: true,
                        subject: true,
                    }
                },
            },
            take: 15,
            orderBy: {
                lastMessageDate: 'desc'
            }
        
       })
}),
getSuggessions: privateProcedure.input(z.object({
    accountId: z.string(), 
}) ).query(async ({ctx, input}) => {
    const account = await authorizeAccountAccess(input.accountId, ctx.auth.userId)
    return await ctx.db.emailAddress.findMany({
        where: {
            accountId: account.id
        },
    select: {
            address: true,
            name: true,
            
    }}) 
}),



getReplyDetails: privateProcedure.input(z.object({
    threadId: z.string(),
    accountId: z.string()
})).query(async ({ctx, input}) => {
    const account = await authorizeAccountAccess(input.accountId, ctx.auth.userId)

    const thread = await ctx.db.thread.findFirst({
        where: {
            id: input.threadId,
            accountId: account.id,
        },
        include: {
            emails: {
                orderBy: {
                    sentAt: 'asc'
                },
                select: {
                    from: true,
                    to: true,
                    cc: true,
                    bcc: true,
                    sentAt: true,
                    subject: true,
                    internetMessageId: true,
        }
    }
}
    })

    if(!thread || thread.emails.length === 0) {
        throw new Error('Thread not found')
    }
    
    const lastExternalEmail = thread.emails.reverse().find((email) => email.from.address !== account.emailAddress)

    if(!lastExternalEmail) {
        throw new Error('No external email found in thread')
    }

    return {
    subject: lastExternalEmail.subject,
    to: [lastExternalEmail.from], ...lastExternalEmail.to.filter(to => to.address !== account.emailAddress),
    cc: lastExternalEmail.cc.filter(cc => cc.address !== account.emailAddress),
    from: {name: account.name, address: account.emailAddress},
    id: lastExternalEmail.internetMessageId
    }

}),

deleteAccount: privateProcedure.input(z.object({
    accountId: z.string()
})).mutation(async ({ctx, input}) => {
    await authorizeAccountAccess(input.accountId, ctx.auth.userId)
    await ctx.db.account.delete({
        where: {
            id: input.accountId
        }
    })
    return true
}),

})

