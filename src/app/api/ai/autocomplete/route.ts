import { streamText } from "ai"
import { geminiFlash } from "@/lib/ai"
import { auth } from "@clerk/nextjs/server"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { prompt, context, threadSubject } = await req.json()

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
${context ? `- The user has typed so far: "${context}"` : ""}`,
    prompt: prompt || "Write a professional email reply.",
  })

  return result.toDataStreamResponse()
}
