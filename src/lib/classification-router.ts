import { generateText } from "ai"
import { geminiFlashLite } from "./ai"

const VALID_LABELS = [
  "urgent",
  "newsletter",
  "client-request",
  "internal",
  "meeting",
  "notification",
  "personal",
]

export interface ClassificationResult {
  labels: string[]
  modelUsed: string
  confidence?: number
}

/**
 * Classify an email using model routing:
 * 1. If FASTAPI_URL is configured, routes to the fine-tuned Mistral-7B model
 *    running on FastAPI / vLLM.
 * 2. If FASTAPI_URL is not set or the request fails, falls back gracefully to
 *    Gemini 2.0 Flash Lite via Vercel AI SDK.
 */
export async function classifyEmailWithRouting(
  sender: string,
  subject: string,
  bodySnippet: string
): Promise<ClassificationResult> {
  const fastApiUrl = process.env.FASTAPI_URL

  if (fastApiUrl) {
    try {
      const response = await fetch(`${fastApiUrl}/classify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender,
          subject,
          body_snippet: bodySnippet,
          use_finetuned: true,
        }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })

      if (response.ok) {
        const data = await response.json()
        return {
          labels: data.labels,
          modelUsed: data.model_used,
          confidence: data.confidence,
        }
      }
    } catch (err) {
      console.warn(
        "[classification-router] FastAPI routing failed, falling back to Gemini:",
        err instanceof Error ? err.message : err
      )
    }
  }

  // Fallback to Gemini 2.0 Flash Lite
  const { text } = await generateText({
    model: geminiFlashLite,
    prompt: `Classify this email into one or more categories. Return ONLY a JSON array of strings.
Valid categories: ${VALID_LABELS.join(", ")}

From: ${sender}
Subject: ${subject}
Body: ${bodySnippet || ""}

Return format: ["category1", "category2"]`,
  })

  let labels: string[] = []
  try {
    const cleaned = text.trim().replace(/```json\n?|```/g, "")
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) {
      labels = parsed.filter((l: string) => VALID_LABELS.includes(l))
    }
  } catch {
    console.warn(`[classification-router] Could not parse labels: ${text}`)
  }

  return {
    labels,
    modelUsed: "gemini-3.8-flash",
  }
}
