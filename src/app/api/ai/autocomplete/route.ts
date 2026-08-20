import { streamText } from "ai"
import { geminiFlash } from "@/lib/ai"
import { db } from "@/server/db"
import { auth } from "@clerk/nextjs/server"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { prompt, context, threadSubject, threadId, accountId } = await req.json()

  // ─── Phase 5: Context-Aware Replies ──────────────────────────────────
  // If threadId + accountId are provided, fetch historical emails with the
  // same contact to match the user's writing tone.
  let toneContext = ""

  if (threadId && accountId) {
    try {
      // Get the thread to find who we're replying to
      const thread = await db.thread.findUnique({
        where: { id: threadId },
        include: {
          emails: {
            orderBy: { sentAt: "desc" },
            take: 3,
            select: {
              from: true,
              to: true,
              bodySnippet: true,
              subject: true,
            },
          },
        },
      })

      if (thread && thread.emails.length > 0) {
        // Get the account's email address
        const account = await db.account.findUnique({
          where: { id: accountId },
          select: { emailAddress: true },
        })

        if (account) {
          // Find the external contact(s)
          const contactAddresses = new Set<string>()
          for (const email of thread.emails) {
            if (email.from.address !== account.emailAddress) {
              contactAddresses.add(email.from.address)
            }
            for (const to of email.to) {
              if (to.address !== account.emailAddress) {
                contactAddresses.add(to.address)
              }
            }
          }

          if (contactAddresses.size > 0) {
            // Fetch the user's past emails to these contacts (sent BY the user)
            const pastEmails = await db.email.findMany({
              where: {
                thread: { accountId },
                from: { address: account.emailAddress },
                to: {
                  some: {
                    address: { in: Array.from(contactAddresses) },
                  },
                },
              },
              orderBy: { sentAt: "desc" },
              take: 5,
              select: {
                bodySnippet: true,
                subject: true,
              },
            })

            if (pastEmails.length > 0) {
              toneContext = `\n\nHere are the user's past emails with this contact. Match their writing tone and style:\n${pastEmails
                .map(
                  (e, i) =>
                    `--- Past Email ${i + 1} ---\nSubject: ${e.subject}\n${e.bodySnippet || ""}`
                )
                .join("\n")}`
            }
          }
        }
      }
    } catch (error) {
      console.error("[autocomplete] Failed to fetch context:", error)
      // Continue without context — degraded but functional
    }
  }

  try {
    const result = streamText({
      model: geminiFlash,
      system: `You are an AI email assistant helping the user compose emails.
Your job is to complete or generate email content based on what the user has typed so far.

Rules:
- Match the user's writing style and tone
- Be professional but natural
- Do NOT include subject lines or email headers — only the body content
- Do NOT wrap your response in quotes or markdown
- Continue naturally from where the user left off
${threadSubject ? `- This is a reply to an email thread about: "${threadSubject}"` : ""}
${context ? `- The user has typed so far: "${context}"` : ""}${toneContext}`,
      prompt: prompt || "Write a professional email reply.",
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error("[autocomplete] Stream error:", error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
