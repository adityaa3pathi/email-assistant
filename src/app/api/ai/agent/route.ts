import { streamText, tool, isStepCount, convertToModelMessages } from "ai"
import { geminiFlash } from "@/lib/ai"
import { auth } from "@clerk/nextjs/server"
import { db } from "@/server/db"
import { z } from "zod"
import { hybridSearch } from "@/lib/embeddings"
import { getCalendarEvents } from "@/lib/calendar"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages, accountId, threadId } = await req.json()

  // Verify account ownership
  const account = await db.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, emailAddress: true, name: true },
  })

  if (!account) {
    return new Response("Account not found", { status: 404 })
  }

  // ─── Route to Python LangGraph Agent if FASTAPI_URL is configured ──────────
  const fastApiUrl = process.env.FASTAPI_URL
  if (fastApiUrl) {
    try {
      const pyResponse = await fetch(`${fastApiUrl}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, accountId, threadId }),
      })

      if (pyResponse.ok && pyResponse.body) {
        const reader = pyResponse.body.getReader()
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          async start(controller) {
            let buffer = ""
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n\n")
                buffer = lines.pop() || ""

                for (const line of lines) {
                  const trimmed = line.trim()
                  if (!trimmed.startsWith("data:")) continue
                  try {
                    const jsonStr = trimmed.slice(5).trim()
                    const ev = JSON.parse(jsonStr)
                    if (ev.type === "text" && ev.content) {
                      controller.enqueue(encoder.encode(ev.content))
                    } else if (ev.type === "tool_start") {
                      controller.enqueue(encoder.encode(`\n> 🛠️ *Agent invoking tool: \`${ev.tool}\`...*\n\n`))
                    } else if (ev.type === "error" && ev.message) {
                      controller.enqueue(encoder.encode(`\n*(Agent Error: ${ev.message})*`))
                    }
                  } catch {
                    // Ignore malformed chunks
                  }
                }
              }
            } catch (err) {
              controller.error(err)
            } finally {
              controller.close()
            }
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        })
      }
    } catch (err) {
      console.warn(
        "[agent] Python LangGraph backend unavailable, falling back to Next.js agent:",
        err instanceof Error ? err.message : err
      )
    }
  }

  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: geminiFlash,
    system: `You are an AI email assistant for ${account.name} (${account.emailAddress}).

You have access to tools to search emails, check calendar, classify threads, and draft replies.
Always use the searchEmails tool before answering questions about email content.
When referencing emails, always cite them using [Email:ID] format with the actual emailId.
Never make up or hallucinate email content — only reference emails returned by your tools.
Be concise and helpful. If you need multiple steps, explain what you're doing.

Current date: ${new Date().toISOString().split('T')[0]}`,
    messages: modelMessages,
    tools: {
      searchEmails: tool({
        description: "Search the user's emails using semantic similarity. Use this to find emails about a topic, from a person, or matching a query.",
        inputSchema: z.object({
          query: z.string().describe("The search query — describe what you're looking for"),
        }),
        execute: async ({ query }) => {
          const results = await hybridSearch(account.id, query, undefined, 10)
          return results.map((r) => ({
            emailId: r.emailId,
            subject: r.subject,
            bodySnippet: r.bodySnippet || r.content,
            sentAt: r.sentAt,
            threadId: r.threadId,
            similarity: Math.round(Number(r.similarity) * 100) + "%",
          }))
        },
      }),

      getCalendarEvents: tool({
        description: "Look up the user's Google Calendar events. Use this to check availability, find meetings, or schedule context.",
        inputSchema: z.object({
          startDate: z.string().describe("Start date in ISO format (e.g., 2024-01-15)"),
          endDate: z.string().describe("End date in ISO format (e.g., 2024-01-16)"),
        }),
        execute: async ({ startDate, endDate }) => {
          try {
            const events = await getCalendarEvents(
              account.id,
              new Date(startDate),
              new Date(endDate)
            )
            return events.length > 0
              ? events
              : [{ message: "No events found in the specified time range" }]
          } catch (error) {
            return [{ error: "Could not access calendar. The user may need to re-authorize with calendar permissions." }]
          }
        },
      }),

      getThreadDetails: tool({
        description: "Get the full details of an email thread including all messages. Use this to understand the full context of a conversation.",
        inputSchema: z.object({
          threadId: z.string().describe("The thread ID to fetch details for"),
        }),
        execute: async ({ threadId: tid }) => {
          const thread = await db.thread.findUnique({
            where: { id: tid },
            include: {
              emails: {
                orderBy: { sentAt: "asc" },
                select: {
                  id: true,
                  subject: true,
                  bodySnippet: true,
                  sentAt: true,
                  from: true,
                  to: true,
                  sysLabels: true,
                },
              },
            },
          })
          if (!thread) return { error: "Thread not found" }
          
          const subject = thread.emails[0]?.subject || "No subject"
          
          return {
            subject: subject,
            summary: thread.summary,
            aiLabels: thread.aiLabels,
            emails: thread.emails.map((e) => ({
              emailId: e.id,
              from: `${e.from.name || ''} <${e.from.address}>`.trim(),
              to: e.to.map((t) => `${t.name || ''} <${t.address}>`.trim()).join(", "),
              subject: e.subject,
              bodySnippet: e.bodySnippet,
              sentAt: e.sentAt,
            })),
          }
        },
      }),

      classifyThread: tool({
        description: "Classify an email thread into categories like urgent, newsletter, client-request, internal, meeting, notification, personal.",
        inputSchema: z.object({
          threadId: z.string().describe("The thread ID to classify"),
        }),
        execute: async ({ threadId: tid }) => {
          const thread = await db.thread.findUnique({
            where: { id: tid },
            select: { aiLabels: true, summary: true },
          })
          if (!thread) return { error: "Thread not found" }
          if (thread.aiLabels.length > 0) {
            return {
              threadId: tid,
              labels: thread.aiLabels,
              summary: thread.summary,
              message: "Thread is already classified",
            }
          }
          return {
            threadId: tid,
            labels: [],
            message: "Thread not yet classified. Classification runs in the background via the ingestion pipeline.",
          }
        },
      }),

      draftReply: tool({
        description: "Draft an email reply for a thread. Returns a suggested reply body that the user can edit before sending.",
        inputSchema: z.object({
          threadId: z.string().describe("The thread ID to reply to"),
          instructions: z.string().describe("Instructions for the reply — what to say, tone, key points"),
          tone: z.enum(["formal", "casual", "friendly", "professional"]).optional().describe("Desired tone"),
        }),
        execute: async ({ threadId: tid, instructions, tone }) => {
          // Get thread context
          const thread = await db.thread.findUnique({
            where: { id: tid },
            include: {
              emails: {
                orderBy: { sentAt: "desc" },
                take: 3,
                select: {
                  subject: true,
                  bodySnippet: true,
                  from: true,
                  to: true,
                },
              },
            },
          })

          if (!thread || thread.emails.length === 0) {
            return { error: "Thread not found or has no emails" }
          }
          
          const subject = thread.emails[0]?.subject || "No subject"

          // Get tone context from past emails (same pattern as autocomplete)
          const contactAddresses = new Set<string>()
          for (const email of thread.emails) {
            if (email.from.address !== account.emailAddress) {
              contactAddresses.add(email.from.address)
            }
          }

          let toneContext = ""
          if (contactAddresses.size > 0) {
            const pastEmails = await db.email.findMany({
              where: {
                thread: { accountId: account.id },
                from: { address: account.emailAddress },
                to: { some: { address: { in: Array.from(contactAddresses) } } },
              },
              orderBy: { sentAt: "desc" },
              take: 3,
              select: { bodySnippet: true, subject: true },
            })
            if (pastEmails.length > 0) {
              toneContext = `\nPast emails to this contact (match their style):\n${pastEmails.map((e, i) => `${i + 1}. Subject: ${e.subject}\n${e.bodySnippet || ""}`).join("\n")}`
            }
          }

          // Generate the draft using Gemini
          const { generateText } = await import("ai")
          const { text: draft } = await generateText({
            model: geminiFlash,
            prompt: `Draft a reply email for the following thread.

Thread subject: ${subject}
Recent messages:
${thread.emails.map((e, i) => `--- Email ${i + 1} ---\nFrom: ${e.from.name || ''} <${e.from.address}>\nSubject: ${e.subject}\n${e.bodySnippet || ""}`).join("\n")}

User instructions: ${instructions}
${tone ? `Tone: ${tone}` : ""}
${toneContext}

Rules:
- Write ONLY the email body (no subject line, no headers)
- Be ${tone || "professional"} and concise
- Match the user's historical writing style if available`,
          })

          return {
            draft,
            threadId: tid,
            subject: `Re: ${subject}`,
            to: thread.emails[0]!.from.address,
          }
        },
      }),
    },
    stopWhen: isStepCount(5), // Cap at 5 steps to bound cost and latency
  })

  return result.toTextStreamResponse()
}
