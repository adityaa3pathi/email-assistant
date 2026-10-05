import { createTRPCRouter, privateProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { EmailLabel, type Prisma } from "@prisma/client";
import { sendStatusCode } from "next/dist/server/api-utils";
import z from "zod";
import { searchSimilarEmails, hybridSearch, rerank } from "@/lib/embeddings";
import { sendEmail, getAuthedGmailClient } from "@/lib/gmail-client";
import { runInitialSync } from "@/lib/email-sync-service";
import { GmailAccount } from "@/lib/gmail-account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { simpleParser } from "mailparser";

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
                name: true,
                syncStatus: true,
                syncError: true,
                lastSyncedAt: true,
                _count: {
                    select: {
                        threads: true
                    }
                }
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

    // Auto-heal: If account is pending, trigger sync in the background
    const accRecord = await ctx.db.account.findUnique({
        where: { id: account.id },
        select: { syncStatus: true }
    });
    if (accRecord?.syncStatus === 'pending') {
        runInitialSync(account.id, ctx.auth.userId).catch(err => {
            console.error('[getThreads] Auto-heal sync error:', err);
        });
    } 

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
    to: [lastExternalEmail.from, ...lastExternalEmail.to.filter(to => to.address !== account.emailAddress)],
    cc: lastExternalEmail.cc.filter(cc => cc.address !== account.emailAddress),
    from: {name: account.name, address: account.emailAddress},
    id: lastExternalEmail.internetMessageId
    }

}),

semanticSearch: privateProcedure.input(z.object({
    accountId: z.string(),
    query: z.string().min(3),
    from: z.string().optional(),
    after: z.union([z.string(), z.date()]).optional(),
    before: z.union([z.string(), z.date()]).optional(),
    labels: z.array(z.string()).optional(),
    hasAttachments: z.boolean().optional(),
})).query(async ({ctx, input}) => {
    const account = await authorizeAccountAccess(input.accountId, ctx.auth.userId)
    
    const filters = {
      from: input.from,
      after: input.after ? new Date(input.after) : undefined,
      before: input.before ? new Date(input.before) : undefined,
      labels: input.labels,
      hasAttachments: input.hasAttachments
    }

    const results = await hybridSearch(account.id, input.query, filters, 10)
    const reranked = await rerank(input.query, results, 5)
    return reranked
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

syncAccount: privateProcedure.input(z.object({
    accountId: z.string(),
})).mutation(async ({ctx, input}) => {
    await authorizeAccountAccess(input.accountId, ctx.auth.userId);
    await runInitialSync(input.accountId, ctx.auth.userId);
    return { success: true };
}),

sendEmail: privateProcedure.input(z.object({
    accountId: z.string(),
    body: z.string(),
    subject: z.string(),
    from: z.object({ name: z.string().optional(), address: z.string() }).optional(),
    to: z.array(z.object({ name: z.string().optional(), address: z.string() })),
    cc: z.array(z.object({ name: z.string().optional(), address: z.string() })).optional(),
    bcc: z.array(z.object({ name: z.string().optional(), address: z.string() })).optional(),
    inReplyTo: z.string().optional(),
    references: z.string().optional(),
    threadId: z.string().optional(),
})).mutation(async ({ctx, input}) => {
    const account = await authorizeAccountAccess(input.accountId, ctx.auth.userId)
    const from = input.from || { name: account.name || undefined, address: account.emailAddress }

    const sent = await sendEmail({
        accountId: account.id,
        from,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        body: input.body,
        inReplyTo: input.inReplyTo,
        references: input.references,
        threadId: input.threadId,
    })

    // Immediately record sent email in database so Sent box and thread list update in real-time
    if (sent.id) {
        try {
            const gmail = await getAuthedGmailClient(account.id);
            const msgResponse = await gmail.users.messages.get({
                userId: "me",
                id: sent.id,
                format: "raw",
            });
            if (msgResponse.data.raw) {
                const mimeBuffer = Buffer.from(msgResponse.data.raw, "base64url");
                const parsed = await simpleParser(mimeBuffer);
                const gmailAccount = new GmailAccount(account.id);
                const mappedEmail = gmailAccount.mapToEmailMessage(parsed, msgResponse.data);
                await syncEmailsToDatabase([mappedEmail], account.id);
            }
        } catch (syncErr) {
            console.error("[sendEmail] Direct Gmail sync failed, saving fallback DB record:", syncErr);
            const finalThreadId = sent.threadId || input.threadId || sent.id;

            const fromAddr = await ctx.db.emailAddress.upsert({
                where: { accountId_address: { accountId: account.id, address: from.address } },
                update: { name: from.name },
                create: { accountId: account.id, address: from.address, name: from.name }
            });

            const toRecords = await Promise.all(
                input.to.map(t => ctx.db.emailAddress.upsert({
                    where: { accountId_address: { accountId: account.id, address: t.address } },
                    update: { name: t.name },
                    create: { accountId: account.id, address: t.address, name: t.name }
                }))
            );

            const thread = await ctx.db.thread.upsert({
                where: { id: finalThreadId },
                update: {
                    sentStatus: true,
                    lastMessageDate: new Date(),
                },
                create: {
                    id: finalThreadId,
                    accountId: account.id,
                    subject: input.subject,
                    done: false,
                    sentStatus: true,
                    inboxStatus: false,
                    draftStatus: false,
                    lastMessageDate: new Date(),
                    participantIds: [fromAddr.id, ...toRecords.map(r => r.id)]
                }
            });

            await ctx.db.email.upsert({
                where: { id: sent.id },
                update: {
                    sentAt: new Date(),
                    lastModifiedTime: new Date(),
                    emailLabel: 'sent',
                    sysLabels: ['sent'],
                    body: input.body,
                    subject: input.subject,
                },
                create: {
                    id: sent.id,
                    threadId: thread.id,
                    internetMessageId: sent.id ?? "",
                    emailLabel: 'sent',
                    sysLabels: ['sent'],
                    fromId: fromAddr.id,
                    to: { connect: toRecords.map(r => ({ id: r.id })) },
                    subject: input.subject,
                    body: input.body,
                    bodySnippet: input.body.slice(0, 100),
                    sentAt: new Date(),
                    receivedAt: new Date(),
                    createdTime: new Date(),
                    lastModifiedTime: new Date(),
                    hasAttachments: false,
                    keywords: [],
                    sysClassifications: [],
                }
            });

            await ctx.db.thread.update({
                where: { id: thread.id },
                data: { sentStatus: true }
            });
        }
    }

    return { success: true, messageId: sent.id, threadId: sent.threadId }
}),

})

