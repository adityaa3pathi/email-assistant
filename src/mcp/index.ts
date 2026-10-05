#!/usr/bin/env node

/**
 * Email Assistant MCP Server
 *
 * Standalone entry point for running the MCP server via stdio transport.
 * Compatible with Claude Desktop, Cursor, and any MCP-compatible client.
 *
 * Usage:
 *   npx tsx src/mcp/index.ts
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "email-assistant": {
 *         "command": "npx",
 *         "args": ["tsx", "src/mcp/index.ts"],
 *         "cwd": "/path/to/email-assistant"
 *       }
 *     }
 *   }
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createEmailAssistantServer } from "./server"

async function main() {
  const server = createEmailAssistantServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Email Assistant MCP server started on stdio")
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error)
  process.exit(1)
})
