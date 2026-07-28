import { streamText, isStepCount } from "ai"
import { geminiFlash } from "@/lib/ai"
import { db } from "@/server/db"
import { searchSimilarEmails } from "@/lib/embeddings"
import { auth } from "@clerk/nextjs/server"
import { z } from "zod"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages, accountId, threadId } = await req.json()

  // Verify account access
  const account = await db.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, emailAddress: true, name: true },
  })

  if (!account) {
    return new Response("Account not found", { status: 404 })
  }

  const result = streamText({
    model: geminiFlash,
    system: `You are an AI email assistant for ${account.name} (${account.emailAddress}).
You help manage their inbox by searching emails, summarizing threads, drafting replies,
and classifying emails.

When using tools, explain what you're doing in a natural way.
When drafting replies, match the user's writing style based on their past emails.
Be concise and helpful. Always cite specific emails when referencing information.`,

    messages,
    stopWhen: isStepCount(5),

    tools: {
      searchEmails: {
        description:
          "Search the user's emails semantically. Use this when the user asks to find emails, asks about specific topics, or needs context for a reply.",
        inputSchema: z.object({
          query: z.string().describe("The search query — use natural language"),
          limit: z.number().optional().default(5).describe("Number of results to return"),
        }),
        execute: async ({ query, limit }: { query: string; limit: number }) => {
          const results = await searchSimilarEmails(account.id, query, limit)
          return results.map((r) => ({
            subject: r.subject,
            snippet: r.bodySnippet || r.content,
            sentAt: r.sentAt,
            similarity: Math.round(Number(r.similarity) * 100) + "%",
            threadId: r.threadId,
          }))
        },
      },

      getThreadDetails: {
        description:
          "Get full details of a specific thread including all emails. Use when the user asks about a specific thread or needs context for it.",
        inputSchema: z.object({
          threadId: z.string().describe("The thread ID to fetch."),
        }),
        execute: async ({ threadId: tid }: { threadId: string }) => {
          const thread = await db.thread.findUnique({
            where: { id: tid || threadId },
            include: {
              emails: {
                orderBy: { sentAt: "asc" as const },
                take: 10,
                select: {
                  subject: true,
                  bodySnippet: true,
                  sentAt: true,
                  from: { select: { name: true, address: true } },
                  to: { select: { name: true, address: true } },
                },
              },
            },
          })

          if (!thread) return { error: "Thread not found" }

          return {
            subject: thread.subject,
            summary: thread.summary,
            aiLabels: thread.aiLabels,
            emailCount: thread.emails.length,
            emails: thread.emails.map((e) => ({
              from: e.from.name || e.from.address,
              to: e.to.map((t) => t.name || t.address).join(", "),
              subject: e.subject,
              snippet: e.bodySnippet,
              sentAt: e.sentAt,
            })),
          }
        },
      },

      draftReply: {
        description:
          "Draft an email reply based on context. Returns the draft text for the user to review.",
        inputSchema: z.object({
          context: z.string().describe("What the reply should be about"),
          recipientName: z.string().optional().describe("Name of the person being replied to"),
        }),
        execute: async ({ context, recipientName }: { context: string; recipientName?: string }) => {
          const userEmails = await db.email.findMany({
            where: {
              thread: { accountId: account.id },
              from: { address: account.emailAddress },
            },
            orderBy: { sentAt: "desc" as const },
            take: 3,
            select: { bodySnippet: true },
          })

          const styleHint =
            userEmails.length > 0
              ? `\nUser's writing style samples:\n${userEmails.map((e) => e.bodySnippet).join("\n---\n")}`
              : ""

          return {
            type: "draft" as const,
            instruction: context,
            recipientName,
            styleHint,
            message: "I've prepared the context for drafting. I'll now write the reply.",
          }
        },
      },

      classifyThread: {
        description:
          "Classify a thread with AI labels. Categories: urgent, newsletter, client-request, internal, meeting, notification, personal.",
        inputSchema: z.object({
          threadId: z.string().describe("The thread ID to classify"),
          labels: z.array(z.string()).describe("Array of labels to apply"),
        }),
        execute: async ({ threadId: tid, labels }: { threadId: string; labels: string[] }) => {
          const validLabels = [
            "urgent", "newsletter", "client-request", "internal",
            "meeting", "notification", "personal",
          ]
          const filtered = labels.filter((l: string) => validLabels.includes(l))

          await db.thread.update({
            where: { id: tid },
            data: { aiLabels: filtered },
          })

          return { success: true, threadId: tid, appliedLabels: filtered }
        },
      },

      summarizeThread: {
        description: "Generate a one-line summary for a thread and save it.",
        inputSchema: z.object({
          threadId: z.string().describe("The thread ID to summarize"),
        }),
        execute: async ({ threadId: tid }: { threadId: string }) => {
          const thread = await db.thread.findUnique({
            where: { id: tid },
            include: {
              emails: {
                orderBy: { sentAt: "desc" as const },
                take: 3,
                select: {
                  subject: true,
                  bodySnippet: true,
                  from: { select: { name: true, address: true } },
                },
              },
            },
          })

          if (!thread) return { error: "Thread not found" }

          return {
            subject: thread.subject,
            emailCount: thread.emails.length,
            context: thread.emails
              .map((e) => `From: ${e.from.name || e.from.address}\n${e.bodySnippet || ""}`)
              .join("\n---\n"),
            instruction: "Generate a one-sentence summary (max 15 words) and I will save it.",
          }
        },
      },
    },
  })

  return result.toTextStreamResponse()
}
