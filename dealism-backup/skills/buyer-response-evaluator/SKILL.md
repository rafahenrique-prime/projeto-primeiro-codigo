---
name: buyer-response-evaluator
description: "Use this skill in THREE situations: (1) at Stage 2 exit during onboarding (after user confirms or finishes one revision), OR immediately after any agent creation outside onboarding — output an anchor link so the user can click to open the test interface directly; (2) when you detect the user wants a simulated probe test — resolve the tryme session key via probe_buyer.py then send the test message via sessions_send; (3) immediately after receiving the BA reply from the tryme session — format and present the test result in the standard evaluation template."
metadata: {"openclaw":{"emoji":"🎭","requires":{}}}
---

# Buyer Response Evaluator Skill

Two ways to test a buyer agent. **Prefer Method A first.**

---

## Method A — Anchor Link (Preferred)

Output a clickable anchor so the user can jump directly into the BA test interface.

### When to use

- **Onboarding:** Output the anchor at Stage 2 exit — after the user confirms the agent looks good or finishes one revision round. The agent is created in Stage 1, but the anchor is withheld until Stage 2 confirmation.
- **Outside onboarding:** Immediately after any Buyer Agent is created or when the user asks to test/open their agent.
- When the user asks "how do I test my agent", "open my agent", or similar — and an agent already exists.

### How to get the agent-id

The `agent-id` is a **numeric ID** assigned by the backend (e.g. `24436`). It must come from the creation output or a list lookup.

**Case A — just created:** Parse from the bash output of `create_buyer_agent_config.py`. Look for this line:
```
✅ [SQL Sync] Buyer Agent '...' successfully synced! Agent ID: 24436
```
Extract the numeric value after `Agent ID: ` exactly.

**Case B — agent already exists (or as fallback):** Run:
```bash
python3 $PROJECT_ROOT/scripts/probe_buyer.py --list
```
The output is a JSON list of agents. Each entry includes `session_key`, `config_id`, and `agent_id` (numeric, if the agent has been registered in the backend). Use the `agent_id` of the target agent.

### Multiple agents — priority rule

1. **Prefer the just-created agent** (from current session context).
2. If the user says the wrong agent was linked or there are multiple agents: run `--list`, show all agents with their names and IDs, and ask the user to choose.

### Output format

Output the anchor message in the user's language. Keep the HTML tag exactly as shown:

```
Your AI sales agent is ready! Tap below to start testing 👇

<div agent-id='{numeric_agent_id}'>@{agent_name}</div>

Or let me know and I'll run a simulated buyer question to check the reply quality.
```

**CRITICAL rules for the HTML tag:**
- `agent-id` MUST be the numeric agent ID (e.g. `24436`) — no letters, no special characters
- `@{agent_name}` MUST match exactly the `agent_name` from the config
- Use **single quotes** around the `agent-id` value
- Output exactly ONE `<div agent-id>` per message
- Do NOT add any other HTML tags, markdown, or formatting around the div
- **NEVER replace this tag with a URL.** The Pre-Send Self-Check ID-stripping rule does NOT apply here — this tag is a UI component, not an internal ID. Output it verbatim.

### Example

```
Your AI sales agent is ready! Tap below to start testing 👇

<div agent-id='24436'>@SalesBot</div>

Or let me know and I'll run a simulated buyer question to check the reply quality.
```

---

## Method B — Probe via sessions_send (Deep quality evaluation)

Send a simulated buyer question to the BA's tryme session and evaluate the real reply.

### When to use

- User asks to "test a question", "what would it reply to X", "check this answer"
- During Stage 3 Path A (coming directly from Stage 2): 2-3 rounds of probe + evaluate + optimize
- Any time outside onboarding when the user wants to validate or improve the agent

**Note — Stage 3 Path B (user returns from anchor test with general feedback):** Do NOT start with a probe. First read the tryme session history (`buyer_agents/buyer_{buyer_id}__tryme_workspace/sessions/seller:{seller_id}:buyer:{buyer_id}:_tryme.jsonl`), then combine session findings with user feedback to fix directly. Only use probe if the user explicitly asks to replicate a specific question.

**Note — Stage 2 (onboarding, Feedback & Revise):** The agent was already created in Stage 1. When the user is satisfied or finishes one revision round, output the anchor via Method A and immediately enter Stage 3. Do NOT generate a tryme URL or any other link format.

### CRITICAL rules

1. **Always route through the BA's tryme session** — never simulate or imagine replies.
2. **Output the full evaluation template** once the BA reply arrives — no exceptions.
3. **Knowledge gap handling:** Guide user to provide missing info in this order:
   1) Upload files / documents
   2) Share links / URLs
   3) Concise spoken/written summary (last resort only)
4. **Use only the canonical script entrypoint**: `python3 $PROJECT_ROOT/scripts/probe_buyer.py ...` (`$PROJECT_ROOT` is injected by bash; do not substitute paths)
5. **Never path-hunt** for the probe script. Do not use `/app/scripts/...`, `workspace/skills/...`, `find /`, or `ls /app`.
6. **Testing is a separate step.** Do not jump into probe mode while the user is still in the middle of create/update/delete unless the current stage explicitly calls for testing.

### How to send a probe

**Step 1 — Resolve the tryme session key and agent name:**
```bash
python3 $PROJECT_ROOT/scripts/probe_buyer.py --config-id "{config_id}"
# Output example: {"session_key": "seller:29162:buyer:68774:_tryme", "agent_name": "iphone seller"}
```
Parse `session_key` (for routing) and `agent_name` (for display in the evaluation template).

**Step 2 — Send the test message via sessions_send:**
Use the `sessions_send` tool with `session_key` from Step 1 as the target.
The BA will process the message and reply back to you asynchronously.

**Step 3 — Inform the user:**
Tell the user the test has been sent and the reply is on its way.

**Step 4 — When the BA reply arrives:**
The BA's reply will arrive as an incoming message sourced from the tryme session (session key contains `:_tryme`). Since you just sent a probe and are waiting for a response, **any incoming message from a `_tryme` session is the BA's answer to your test question**. Once it arrives, immediately output the evaluation template below.

**List available agents:**
```bash
python3 $PROJECT_ROOT/scripts/probe_buyer.py --list
```

### Output template (required once BA reply arrives)

```
**Question:** {the test question you sent} \n\n
**{agent_name}:** {exact reply from BA} \n\n

**Evaluation:** {your 1-4 sentence assessment}
```

### Evaluation guidelines

- **Accuracy:** Contains correct product/service information?
- **Completeness:** Fully addresses the customer question?
- **Persuasiveness:** Guides the customer toward a purchase decision?
- **Personalization:** Feels tailored to the specific question?
- **Goal alignment:** Advances toward the sales goal?

If there is a knowledge gap:
- State clearly what information is missing
- Guide the user to provide it (files → links → verbal summary, in that order)

### Stage 3 testing workflow

**Path A (linear, coming from Stage 2):**
1. Propose 3 realistic test questions, let user pick one (or type their own)
2. Run probe immediately on selection
3. Output the full evaluation template
4. If knowledge gaps: guide user → add info → re-probe
5. Repeat 2-3 rounds, then move to Stage 4

**Path B (user returns from anchor test):**
1. Read tryme session history first (see Note above)
2. Combine session findings + user feedback → propose or apply fixes directly
3. After fixing, ask: "Want to run a test to verify?" or "Ready to go live?"
4. Only run probe if user chooses to verify

### Optional summary report (only when user explicitly requests)

```
=== Buyer Agent Test Report ===
Test target: {agent_name} (_tryme)
Questions tested: {count}

Q1: "{question}" \n\n
A1: "{actual reply}" \n\n
Score: {score}/5 — {brief reason}

Overall score: {average}/5

Strengths:
- {strength with excerpt}

Issues:
- {issue with excerpt}

Recommendations:
- {action}
```
