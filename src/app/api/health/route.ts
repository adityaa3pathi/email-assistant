import { db } from "@/server/db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Verify database connectivity
    await db.$queryRaw`SELECT 1`

    return Response.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  } catch (error) {
    console.error("[health] Database health check failed:", error)
    return Response.json(
      {
        status: "error",
        db: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
