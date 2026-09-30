import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { BRIDGE_MODE } from "./policy.js";

const app = express();
app.use(express.json({ limit: "256kb" }));

const PORT = Number(process.env.PORT || 3000);
const OAUTH_ENABLED = process.env.OAUTH_ENABLED === "true";

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "prime-kapso-mcp-bridge",
    mode: BRIDGE_MODE,
    oauth_enabled: OAUTH_ENABLED,
    upstream_enabled: false,
    write_tools_enabled: false,
  });
});

app.all("/mcp", async (req, res) => {
  // Fail closed until OAuth 2.1 + token verification are implemented.
  if (!OAUTH_ENABLED) {
    return res.status(503).json({
      ok: false,
      error: "OAUTH_NOT_CONFIGURED",
      write_tools_enabled: false,
      upstream_enabled: false,
    });
  }

  const server = new McpServer({ name: "prime-kapso-mcp-bridge", version: "0.1.0" });

  // Safe self-test only. This tool never calls Kapso and cannot mutate state.
  server.tool(
    "bridge_status",
    "Return bridge safety state. No upstream calls.",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify({ mode: BRIDGE_MODE, upstream_enabled: false, write_tools_enabled: false }),
      }],
    }),
  );

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    event: "bridge_started",
    port: PORT,
    mode: BRIDGE_MODE,
    oauth_enabled: OAUTH_ENABLED,
    upstream_enabled: false,
    write_tools_enabled: false,
  }));
});
