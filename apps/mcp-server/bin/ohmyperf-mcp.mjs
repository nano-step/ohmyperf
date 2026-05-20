#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOhmyperfMcpServer } from "../dist/index.js";

const maxReportsRaw = process.env.OHMYPERF_MCP_MAX_REPORTS;
const maxReports = maxReportsRaw && /^[0-9]+$/.test(maxReportsRaw)
  ? Number.parseInt(maxReportsRaw, 10)
  : undefined;

const server = createOhmyperfMcpServer({
  ...(process.env.OHMYPERF_MCP_REPORTS_DIR
    ? { reportsDir: process.env.OHMYPERF_MCP_REPORTS_DIR }
    : {}),
  ...(maxReports !== undefined ? { maxReports } : {}),
});
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("ohmyperf-mcp: ready (stdio)\n");
