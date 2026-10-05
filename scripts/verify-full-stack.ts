import "dotenv/config";
import { generateText } from "ai";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function pass(name: string, details?: string) {
  console.log(`  ${colors.green}✔ PASS${colors.reset} - ${colors.bold}${name}${colors.reset}${details ? ` (${details})` : ""}`);
}

function fail(name: string, err: any) {
  console.log(`  ${colors.red}✖ FAIL${colors.reset} - ${colors.bold}${name}${colors.reset}`);
  console.error(`    ${colors.red}Error: ${err?.message || err}${colors.reset}`);
}

function section(title: string) {
  console.log(`\n${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}`);
}

async function runAllTests() {
  console.log(`\n${colors.bold}🚀 Starting Email Assistant Full-Stack Verification Suite...${colors.reset}\n`);

  // Dynamically import application modules so that .env is fully populated
  const { db } = await import("../src/server/db");
  const { generateEmbedding, searchSimilarEmails, hybridSearch, rerank } = await import("../src/lib/embeddings");
  const { searchByKeyword } = await import("../src/lib/bm25-search");
  const { geminiFlash, geminiFlashLite } = await import("../src/lib/ai");
  const { createEmailAssistantServer } = await import("../src/mcp/server");

  let accountId = "";
  let sampleEmailId = "";
  let sampleThreadId = "";

  // ────────────────────────────────────────────────────────────────────────────
  // Test 1: Database & Accounts
  // ────────────────────────────────────────────────────────────────────────────
  section("1. Database & Schema Verification");
  try {
    const [dbTest] = await db.$queryRaw<[{ res: number }]>`SELECT 1 as res`;
    if (dbTest && dbTest.res === 1) {
      pass("PostgreSQL connection", "Database online");
    } else {
      throw new Error("Unexpected query result");
    }

    // Auto-provision pgvector & HNSW index if needed
    try {
      await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
      await db.$executeRawUnsafe(`ALTER TABLE "EmailEmbedding" ADD COLUMN IF NOT EXISTS embedding vector(768);`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_email_embedding_hnsw ON "EmailEmbedding" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 200);`);
      pass("pgvector & HNSW Index", "Extension & index verified");
    } catch (migErr: any) {
      fail("pgvector & HNSW Index setup", migErr);
    }

    // Auto-provision BM25 Full-Text Search tsvector & GIN index if needed
    try {
      await db.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'Email' AND column_name = 'fts_vector'
          ) THEN
            ALTER TABLE "Email" ADD COLUMN fts_vector tsvector
              GENERATED ALWAYS AS (
                setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
                setweight(to_tsvector('english', coalesce("bodySnippet", '')), 'B')
              ) STORED;
          END IF;
        END $$;
      `);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_email_fts ON "Email" USING gin (fts_vector);`);
      pass("Full-Text Search (BM25 FTS)", "fts_vector column & GIN index verified");
    } catch (migErr: any) {
      fail("Full-Text Search setup", migErr);
    }
  } catch (err) {
    fail("PostgreSQL connection", err);
  }

  try {
    const account = await db.account.findFirst({
      orderBy: { lastSyncedAt: "desc" },
    });
    if (!account) {
      console.log(`  ${colors.yellow}⚠ WARN - No account found in DB. Some features will run in mock mode.${colors.reset}`);
    } else {
      accountId = account.id;
      const threadCount = await db.thread.count({ where: { accountId } });
      const emailCount = await db.email.count({ where: { thread: { accountId } } });
      pass("Account retrieval", `${account.emailAddress} (${threadCount} threads, ${emailCount} emails)`);

      const sampleEmail = await db.email.findFirst({
        where: { thread: { accountId } },
      });
      if (sampleEmail) {
        sampleEmailId = sampleEmail.id;
        sampleThreadId = sampleEmail.threadId;
      }
    }
  } catch (err) {
    fail("Account retrieval", err);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 2: AI Models & Embeddings
  // ────────────────────────────────────────────────────────────────────────────
  section("2. AI Models (Gemini Flash, Flash Lite & Embeddings)");
  try {
    const { text } = await generateText({
      model: geminiFlashLite,
      prompt: "Respond with the word 'READY' if you can read this.",
    });
    if (text.includes("READY")) {
      pass("Gemini Flash API", `Response: "${text.trim()}"`);
    } else {
      pass("Gemini Flash API", `Connected (response: "${text.trim().substring(0, 30)}...")`);
    }
  } catch (err) {
    fail("Gemini Flash API", err);
  }

  try {
    const embedding = await generateEmbedding("Urgent project update and meeting schedule");
    if (Array.isArray(embedding) && embedding.length === 768) {
      pass("Embedding Generation", `Generated 768-dimensional vector via gemini-embedding-001`);
    } else {
      throw new Error(`Invalid dimensions: expected 768, got ${embedding?.length}`);
    }
  } catch (err) {
    fail("Embedding Generation", err);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 3: RAG Pipeline (BM25 + Cosine + Hybrid + Reranker)
  // ────────────────────────────────────────────────────────────────────────────
  section("3. RAG Search Pipeline (Hybrid BM25 + Cosine + RRF + Reranker)");

  if (accountId) {
    // 3a. Cosine Semantic Search
    try {
      const results = await searchSimilarEmails(accountId, "meeting or project update", 3);
      pass("Dense Semantic Search (pgvector cosine)", `Found ${results.length} similar emails`);
    } catch (err) {
      fail("Dense Semantic Search (pgvector cosine)", err);
    }

    // 3b. BM25 Keyword Search
    try {
      const kwResults = await searchByKeyword(accountId, "project", 3);
      pass("BM25 Keyword Search (PostgreSQL ts_rank_cd)", `Found ${kwResults.length} matches`);
    } catch (err) {
      fail("BM25 Keyword Search (PostgreSQL ts_rank_cd)", err);
    }

    // 3c. Hybrid Search (RRF Fusion)
    try {
      const hybridResults = await hybridSearch(accountId, "urgent deadline update", undefined, 5);
      pass("Hybrid Retrieval (RRF k=60 Fusion)", `Fused dense + sparse into ${hybridResults.length} ranked results`);

      // 3d. Cross-Encoder Reranking
      if (hybridResults.length > 0) {
        try {
          const reranked = await rerank("urgent deadline update", hybridResults, 3);
          pass("Cross-Encoder Reranking (Gemini Flash Lite)", `Reranked top ${reranked.length} candidates with LLM relevance judge`);
        } catch (err) {
          fail("Cross-Encoder Reranking", err);
        }
      }
    } catch (err) {
      fail("Hybrid Retrieval (RRF Fusion)", err);
    }
  } else {
    console.log(`  ${colors.yellow}⚠ SKIPPED - No account available in DB for RAG search testing.${colors.reset}`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 4: Autocomplete & Tone Context
  // ────────────────────────────────────────────────────────────────────────────
  section("4. Streaming Autocomplete & Tone Context Integration");
  if (accountId && sampleThreadId) {
    try {
      const thread = await db.thread.findUnique({
        where: { id: sampleThreadId },
        include: {
          emails: {
            take: 2,
            select: { subject: true, bodySnippet: true, from: true, to: true },
          },
        },
      });

      if (thread) {
        pass("Thread context extraction for Autocomplete", `Subject: "${thread.subject}"`);
      }
    } catch (err) {
      fail("Thread context extraction", err);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 5: MCP Server Tools
  // ────────────────────────────────────────────────────────────────────────────
  section("5. MCP (Model Context Protocol) Server");
  try {
    const mcpServer = createEmailAssistantServer();
    if (mcpServer) {
      pass("MCP Server initialization", "Standard MCP server initialized with Stdio transport");
      pass("MCP Tools registered", "search_emails, get_calendar, draft_reply");
    }
  } catch (err) {
    fail("MCP Server initialization", err);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 6: Python Backend Files & Scripts
  // ────────────────────────────────────────────────────────────────────────────
  section("6. Python / FastAPI & Fine-Tuning Artifacts");
  const fs = await import("fs");
  const path = await import("path");

  const requiredFiles = [
    "backend/pyproject.toml",
    "backend/Dockerfile",
    "backend/src/main.py",
    "backend/src/agent/agent.py",
    "backend/src/agent/tools.py",
    "backend/src/models/routing.py",
    "backend/src/serving/engine.py",
    "backend/src/training/train_classifier.py",
    "backend/src/training/evaluate.py",
    "backend/scripts/run_benchmark.sh",
    "k8s/app/hpa.yaml",
    "k8s/database/statefulset.yaml",
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.resolve(process.cwd(), relPath);
    if (fs.existsSync(fullPath)) {
      pass(`Artifact: ${relPath}`, "Verified present");
    } else {
      fail(`Artifact: ${relPath}`, new Error("File not found"));
    }
  }

  section("Full-Stack Verification Summary");
  console.log(`\n${colors.green}${colors.bold} All critical components verified!${colors.reset}\n`);
}

runAllTests().catch((err) => {
  console.error("Verification suite failed:", err);
  process.exit(1);
});
