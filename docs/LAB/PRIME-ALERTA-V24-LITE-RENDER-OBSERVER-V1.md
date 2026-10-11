# PRIME ALERTA V2.4 LITE — Render LAB webhook observation (isolated)

**Scope:** ONLY future GPT Maker GABY LAB COMERCIAL events hitting the *existing* Render LAB story observer `/api/prime-control-story-hook-observer-v14c`.

- The LAB agent's `onNewMessage` already points to that observer. Do NOT edit it or GABY OFICIAL webhooks.
- Existing observer authorization, LAB agent allowlist, feature enablement and original response remain unchanged.
- Append only fixed-key, whitelist-only fields to the **existing** log line. Do not store arbitrary type strings, user content, client identifiers or secrets.
- No new log lines per request, no database/API/proxy reads, no polling, no Telegram and no operational alert change.
- No code changes to Render server routing, supplier tooling, onNewMessage production, V2.3, or the 10 paused V2.4 workflows.
- `v24_lite_notification_present`: at least one recognized *field location* has nonempty string. It does NOT mean confirmed transfer.
- `v24_lite_notification_type`: only TRANSFER_QUEUE / TRANSFER_AGENT / START_INTERACTION_HUMAN / START_INTERACTION_AGENT / FINISH_INTERACTION_AGENT / OTHER / MISSING.
- `v24_lite_notification_field`: fixed-source path identifier, never raw user input.
- Until a real post-deploy LAB event is captured, **there is NO evidence that onNewMessage sends TRANSFER_QUEUE**, and therefore NO approval to activate any fast handoff.
- To revert: roll back the one commit on render-lab. Do not roll back supplier changes.
- Tests: `node --test tests/prime-alert-v24-lite-webhook-fields.test.js`, 13/13 locally with Node.
