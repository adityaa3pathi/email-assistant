import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { searchSimilarEmails } from "../lib/embeddings"
import { db } from "../server/db"

/**
 * Email Assistant MCP Server
 *
 * Exposes email search, calendar lookup, and reply drafting as
 * standardized MCP tools compatible with any MCP client.
 */
export function createEmailAssistantServer() {
  const server = new McpServer({
    name: "email-assistant",
    version: "1.0.0",
  })

  // ─── Tool: search_emails ─────────────────────────────────────────────────
  server.tool(
    "search_emails",
    "Search emails using semantic similarity. Finds emails matching a natural language query.",
    {
      accountId: z.string().describe("The account ID to search within"),
      query: z.string().describe("Natural language search query"),
      limit: z.number().optional().default(10).describe("Maximum number of results to return"),
    },
    async ({ accountId, query, limit }) => {
      try {
        const results = await searchSimilarEmails(accountId, query, limit)

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No emails found matching: "${query}"`,
              },
            ],
          }
        }

        const formatted = results
          .map(
            (r, i) =>
              `${i + 1}. [${Math.round(Number(r.similarity) * 100)}% match] ${r.subject}\n` +
              `   Sent: ${new Date(r.sentAt).toLocaleDateString()}\n` +
              `   ${r.bodySnippet || r.content}\n` +
              `   Thread: ${r.threadId} | Email: ${r.emailId}`
          )
          .join("\n\n")

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} matching emails:\n\n${formatted}`,
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching emails: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        }
      }
    }
  )

  // ─── Tool: get_calendar ──────────────────────────────────────────────────
  server.tool(
    "get_calendar",
    "Look up Google Calendar events. Check availability, find meetings, or get schedule context.",
    {
      accountId: z.string().describe("The account ID to check calendar for"),
      startDate: z.string().describe("Start date in ISO format (e.g., 2024-01-15)"),
      endDate: z.string().describe("End date in ISO format (e.g., 2024-01-16)"),
    },
    async ({ accountId, startDate, endDate }) => {
      try {
        // Dynamic import to avoid circular dependencies
        const { getCalendarEvents } = await import("../lib/calendar")
        const events = await getCalendarEvents(
          accountId,
          new Date(startDate),
          new Date(endDate)
        )

        if (events.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No calendar events found between ${startDate} and ${endDate}`,
              },
            ],
          }
        }

        const formatted = events
          .map(
            (e: any, i: number) =>
              `${i + 1}. ${e.summary}\n` +
              `   Time: ${e.start} — ${e.end}\n` +
              (e.location ? `   Location: ${e.location}\n` : "") +
              (e.attendees && e.attendees.length > 0 ? `   Attendees: ${e.attendees.join(", ")}\n` : "") +
              `   Status: ${e.status}`
          )
          .join("\n\n")

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${events.length} calendar events:\n\n${formatted}`,
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching calendar: ${error instanceof Error ? error.message : "Unknown error"}. The user may need to re-authorize with calendar permissions.`,
            },
          ],
          isError: true,
        }
      }
    }
  )

  // ─── Tool: draft_reply ───────────────────────────────────────────────────
  server.tool(
    "draft_reply",
    "Draft an AI-generated reply for an email thread. Uses the user's writing style from past emails.",
    {
      accountId: z.string().describe("The account ID"),
      threadId: z.string().describe("The thread ID to reply to"),
      instructions: z.string().describe("What to say in the reply"),
      tone: z.enum(["formal", "casual", "friendly", "professional"]).optional().describe("Desired tone"),
    },
    async ({ accountId, threadId, instructions, tone }) => {
      try {
        const { generateText } = await import("ai")
        const { geminiFlash } = await import("../lib/ai")

        // Get account info
        const account = await db.account.findUniqueOrThrow({
          where: { id: accountId },
          select: { emailAddress: true, name: true },
        })

        // Get thread context
        const thread = await db.thread.findUnique({
          where: { id: threadId },
          include: {
            emails: {
              orderBy: { sentAt: "desc" },
              take: 3,
              select: {
                subject: true,
                bodySnippet: true,
                from: { select: { name: true, address: true } },
                to: { select: { name: true, address: true } },
              },
            },
          },
        })

        if (!thread || thread.emails.length === 0) {
          return {
            content: [{ type: "text" as const, text: "Thread not found or has no emails" }],
            isError: true,
          }
        }

        // Get tone context from past emails to same contact
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
              thread: { accountId },
              from: { address: account.emailAddress },
              to: { some: { address: { in: Array.from(contactAddresses) } } },
            },
            orderBy: { sentAt: "desc" },
            take: 3,
            select: { bodySnippet: true, subject: true },
          })
          if (pastEmails.length > 0) {
            toneContext = `\nPast emails to this contact (match style):\n${pastEmails.map((e: any, i: number) => `${i + 1}. ${e.subject}: ${e.bodySnippet || ""}`).join("\n")}`
          }
        }

        const { text: draft } = await generateText({
          model: geminiFlash as any,
          prompt: `Draft a reply email.\n\nThread: ${thread.subject}\nRecent messages:\n${thread.emails.map((e: any, i: number) => `${i + 1}. From: ${e.from.name} <${e.from.address}>\n${e.bodySnippet || ""}`).join("\n")}\n\nInstructions: ${instructions}\n${tone ? `Tone: ${tone}` : ""}${toneContext}\n\nWrite ONLY the email body. Be ${tone || "professional"} and concise.`,
        })

        return {
          content: [
            {
              type: "text" as const,
              text: `Draft reply for "${thread.subject}":\n\n${draft}\n\n---\nTo: ${thread.emails[0]!.from.address}\nSubject: Re: ${thread.subject}`,
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error drafting reply: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        }
      }
    }
  )

  return server
}
