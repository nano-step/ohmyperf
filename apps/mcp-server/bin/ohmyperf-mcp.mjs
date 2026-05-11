#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOhmyperfMcpServer } from "../dist/index.js";

const server = createOhmyperfMcpServer({
  ...(process.env.OHMYPERF_MCP_REPORTS_DIR
    ? { reportsDir: process.env.OHMYPERF_MCP_REPORTS_DIR }
    : {}),
});
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("ohmyperf-mcp: ready (stdio)\n");
