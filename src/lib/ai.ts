import { google } from "@ai-sdk/google"

// ─── LLM Models ──────────────────────────────────────────────────────────────

/** Primary model for autocomplete, replies, and agent reasoning */
export const geminiFlash = google("gemini-3.5-flash-lite")

/** Lightweight model for classification and re-ranking (cheapest, fastest) */
export const geminiFlashLite = google("gemini-3.5-flash-lite")

// ─── Embedding Model ─────────────────────────────────────────────────────────

/** 768-dimensional embeddings for semantic search */
export const embeddingModel = google.textEmbeddingModel("gemini-embedding-001")
