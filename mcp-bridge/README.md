# PRIME KAPSO MCP BRIDGE — LAB

Status: **FAIL-CLOSED / READ-ONLY LAB**

Purpose: allow ChatGPT to authenticate with OAuth 2.1 and later access a strictly read-only subset of the official Kapso MCP through a controlled bridge.

## V1 invariants

- No Kapso API key in source code.
- No outbound WhatsApp messages.
- No create/update/delete webhook operations.
- No configuration mutations.
- No production commercial runtime activation.
- Upstream Kapso access stays disabled until OAuth and tool allowlisting are validated.
- The read-only allowlist starts empty (deny-all).

## Planned runtime

ChatGPT -> OAuth 2.1 -> PRIME KAPSO MCP BRIDGE -> Bearer KAPSO_API_KEY -> Kapso MCP

The ChatGPT-facing token and the Kapso project API key are separate credentials.
