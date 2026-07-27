import { google } from "@ai-sdk/google"

// ─── LLM Models ──────────────────────────────────────────────────────────────

/** Primary model for autocomplete, replies, and agent reasoning */
export const geminiFlash = google("gemini-2.0-flash")

/** Lightweight model for classification and re-ranking (cheapest, fastest) */
export const geminiFlashLite = google("gemini-2.0-flash-lite")

// ─── Embedding Model ─────────────────────────────────────────────────────────

/** 768-dimensional embeddings for semantic search */
export const embeddingModel = google.textEmbeddingModel("text-embedding-004")
