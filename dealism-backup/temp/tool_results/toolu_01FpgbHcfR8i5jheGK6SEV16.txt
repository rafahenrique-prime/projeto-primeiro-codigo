---
name: sales-summary
description: |
  Generate a sales summary or conversation performance analysis based on conversation and performance data.
  
  The summary should describe:
  - Overall performance
  - Funnel or conversion analysis (if applicable)
  - Customer insights (if available)
  - Actionable next steps
  
  The output should explain:
  - What happened
  - Why it happened
  - What should be done next
  
  Supports Dealism daily, weekly, and monthly reports.
  Also supports ad-hoc sales diagnostics, such as sales performance analysis, sales conversation quality review,
  and Agent conversation behavior/performance analysis.
  
  Follow the fixed Markdown report template. Section structure is fixed, content within each section is flexible. Focus on clarity, completeness, and usefulness.
metadata: {"openclaw":{"emoji":"📊"}}
---

# Sales Summary

Generate a professional performance summary for Sales Agents or Buyer Agents based on conversation data and performance metrics.

## When to Use

Use this skill when the user asks for:
- Performance summaries
- Conversation analysis
- Sales or activity reports
- Insights for stakeholders or internal review
- Dealism daily/weekly/monthly report
- Sales performance analysis (not necessarily report-format request)
- Sales dialogue quality/performance analysis
- Agent dialogue behavior/performance analysis

## Summary Structure

### 1. Overall Performance (must include)

Describe the overall situation during the given timeframe.

Focus on:
- General performance (good / bad / improving / stable)
- Key metrics if available (conversations, leads, conversion rate, revenue, etc.)
- Notable trends or changes compared to previous periods

---

### 2. Funnel Analysis (include when relevant)

Analyze the conversion funnel when there is enough data.

**Dynamic Stage Analysis:**

Do NOT use a fixed funnel template. Instead, analyze the actual conversation data and dynamically identify the stages that best describe the user's real customer journey. The stages should reflect what actually happened, not a theoretical model.

**How to determine stages:**

1. Read through all conversations and identify natural progression patterns
2. Group conversations by their furthest progress point
3. Label each stage based on actual observed behavior

**Signal reference (use as hints, not rigid rules):**

| Signal | How to detect |
|--------|---------------|
| Customer initiated contact | Conversation exists with inbound messages |
| Substantive engagement | inbound message count >= 2 (not just a single "hi") |
| Expressed interest/need | inbound messages include product/service intent; conversation turns >= 4 |
| Pricing discussion | inbound messages contain pricing keywords (price/cost/pricing/how much) |
| Human intervention needed | `metadata.agentHumanIntervention` = true |
| Customer progress tracked | `metadata.agentCustomerProgress` is not empty (for example: interested / qualified) |

**Output format:** Present the funnel as a progression with counts at each stage, and highlight where the biggest drop-off occurs.

Focus on:
- What stages naturally emerge from the data
- How many conversations reached each stage
- Where the biggest drop-off happens and why
- The main bottleneck and possible reasons

---

### 3. Customer Insights (include when available)

Extract insights from customer conversations.

Focus on:
- Customer interests and common questions
- Objections or concerns
- Behavioral patterns
- Types of customers (e.g., high-intent, price-sensitive, comparison-driven)

---

### 4. Next Steps (must include)

Provide clear and actionable recommendations.

Focus on:
- What should be done next
- What problems should be addressed
- What opportunities should be leveraged

Each recommendation should:
- Be specific
- Be actionable
- Be clearly linked to insights or performance issues
- Help improve outcomes

**Include Dealism platform actions where applicable:**

| Action | When to recommend | How |
|--------|-------------------|-----|
| **Send messages to potential churn users** | Found customers with unread messages, long inactive conversations, or unreadMessageCount > 0 | Recommend sending follow-up messages via Buyer Agent |
| **Update knowledge base** | Customers repeatedly ask similar questions but Agent answers poorly, or new questions Agent can't answer | Write high-frequency Q&A to `workspace/memory/knowledge/` |
| **Update sales strategy** | Customers have common objections (price, competitor comparison) but Agent lacks targeted responses | Write objection handling scripts to `workspace/memory/strategy/` |
| **Adjust Agent configuration** | AI reply rate too low or too high, poor reply quality, abnormal human intervention ratio | Adjust Buyer Agent reply strategy or trigger conditions |
| **Analyze response data** | Every report generation | Provide AI reply rate, human reply rate, avg response time trends |

---

## Output Format (Dynamic Template)

Every report MUST follow this Markdown structure. Sections are included based on data availability and business context.

**Portuguese (Brazil) Template:**
```markdown
# 📊 {Report Type} — {date range description}

> Fonte de Dados: {channels used} | Conversas: {N} | Mensagens: {M}

## Desempenho Geral

{1-3 sentences summarizing overall performance}

| Métrica | Contagem |
|---------|----------|
| Clientes Atendidos Hoje | {N} |
| Clientes Atendidos por IA | {ai_customers} |
| Mensagens Enviadas por IA | {ai_messages} |

## Análise de Funil

{Dynamic funnel stages based on actual business data}

| Estágio | Contagem | % |
|---------|----------|---|
| Novos Contatos | {new_customers} | {new_pct}% |
| Informações Coletadas | {info_collected} | {info_pct}% |
| Interessados | {interested} | {interested_pct}% |
| Prontos para Teste | {trial_ready} | {trial_pct}% |
| Prontos para Visita | {store_ready} | {store_pct}% |
| Prontos para Negócio | {deal_ready} | {deal_pct}% |
| Pós-Venda Consulta | {post_deal} | {post_pct}% |
| Transferência para Humano | {human_handoff} | {handoff_pct}% |

## Insights do Cliente

{Insights from funnel analysis}

## Próximos Passos

{Actionable recommendations}
```

**English Template:**
```markdown
# 📊 {Report Type} — {date range description}

> Data Source: {channels used} | Conversations: {N} | Messages: {M}

## Overall Performance

{1-3 sentences summarizing overall performance}

| Metric | Count |
|--------|-------|
| Customers Served Today | {N} |
| AI-Served Customers | {ai_customers} |
| AI Messages Sent | {ai_messages} |

## Funnel Analysis

{Dynamic funnel stages based on actual business data}

| Stage | Count | % |
|-------|-------|---|
| New Contacts | {new_customers} | {new_pct}% |
| Info Collected | {info_collected} | {info_pct}% |
| Interested | {interested} | {interested_pct}% |
| Trial Ready | {trial_ready} | {trial_pct}% |
| Store Visit Ready | {store_ready} | {store_pct}% |
| Deal Ready | {deal_ready} | {deal_pct}% |
| Post-Deal Consultation | {post_deal} | {post_pct}% |
| Human Handoff Required | {human_handoff} | {handoff_pct}% |

## Customer Insights

{Insights from funnel analysis}

## Next Steps

{Actionable recommendations}
```

**Rules:**
- Language lock (MUST follow): Use exactly ONE language for the entire report. Do not mix languages in headings, tables, labels, or recommendations.
- Multi-language examples in this skill are alternatives, not combined output. Do not copy mixed-language examples into final output.
- Language: Match user's language. Portuguese and English templates must be accurate and complete. Other languages should be matched as appropriate based on user context.
- Section order: Keep the same section order as the template. Headings must be localized to the user's language consistently.
- Summary line is mandatory and must be localized to the user's language.
- Metrics table is mandatory (use "N/A" for unavailable metrics)
- Funnel stages: Include only stages with actual data, dynamically adapt based on business context
- Customer Insights: Must connect to funnel analysis findings
- Next Steps: Must address specific insights and bottlenecks identified
- Localize all fixed labels in output (title, table headers, metric labels, stage names, notices). Never output bilingual or multilingual labels.

---

## Execution Workflow

### ⚠️ Critical Execution Rules

**RULE 1 — Timezone (MUST follow):**
- The user is in **UTC+8**. All API timestamps are **UTC+0 milliseconds**.
- When user says "today March 23", you MUST convert to UTC+8 boundaries first, then to UTC ms:
  - start = 2026-03-23 00:00:00 **UTC+8** → subtract 8h → 2026-03-22 16:00:00 UTC → ms
  - end = 2026-03-23 23:59:59 **UTC+8** → subtract 8h → 2026-03-23 15:59:59 UTC → ms
- **NEVER use naive datetime (without timezone). Always specify UTC+8.**

**RULE 2 — Use bash+python to get raw JSON data:**
- The `fetch_channel_data` tool returns a summary (conversation count, buyers, etc.) but NOT raw message data with timestamps.
- For sales summary, you **MUST use `bash` tool with Python code** to call the Channel API directly and get raw JSON.
- The code templates below are ready to copy-paste — just fill in `USER_ID`, `START_MS`, `END_MS`.

**RULE 3 — Validate after every data retrieval step:**
- After each bash call, immediately check the output before proceeding.
- Print sample timestamps and convert to human-readable UTC+8 to verify correctness.
- If timestamps don't match expected range → STOP and fix before continuing.

**RULE 4 — Maximum analysis window is 7 days (MUST follow):**
- The report can analyze **at most 7 days** of chat data (inclusive), for **any** 7-day period.
- Before Step 1, always compute the requested date span in UTC+8 calendar days.
- If user-requested range exceeds 7 days, **DO NOT continue data retrieval**.
- Reply and ask user to provide a new range within 7 days in the user's language:
  - If the user speaks English, use: `📊 This report can analyze at most 7 days of chat records at a time. Your requested range exceeds 7 days. Please provide a new date range within 7 days (any 7-day period is supported).`
  - If the user speaks Portuguese, use: `📊 Este relatório pode analisar no máximo 7 dias de conversas por vez. O período solicitado excede 7 dias. Por favor, informe um novo intervalo de até 7 dias (qualquer período de 7 dias é suportado).`
  - For any other language, generate the same over-limit message in that language (same meaning and constraints, localized wording).
  - Output only one language variant. Do not send multiple languages in the same response.
- **Proactively suggest a candidate 7-day window** when the user's range exceeds 7 days, to reduce back-and-forth. Examples:
  - If user asks for "last 30 days", suggest: "You can analyze the most recent 7 days (Mar 18–Mar 24). Reply to confirm or tell me a different 7-day window."
  - If user asks for "March 1 to March 31", suggest: "You can analyze the first 7 days of March (Mar 1–Mar 7). Reply to confirm or tell me a different 7-day window."
  - The candidate window should be derived from the user's original intent (recent 7 days, first 7 days of range, or last 7 days of range).

---

Follow these steps **in order** to generate a sales summary:

### Step -1: Authorization Pre-Check (MUST do first)

Before generating any report, **automatically** detect authorized channels. Do NOT wait for user to say "I authorized".

**Sub-step A — Extract `user_id` (try in order, stop at first success):**

1. Scan the current conversation for `[SYSTEM_EVENT:channel:authorized]` events:
   - Match any line starting with `[SYSTEM_EVENT:channel:authorized]:` — the payload contains a `channel` keyword (`instagram` or `whatsapp`, case-insensitive) and a `user_id: {user_id}` field
   - Works for both Instagram (older template: `... Data sync in progress ...`) and WhatsApp (new template: `... No action required — data syncing progress will be notified via subsequent ingest events.`)
   - Do NOT rely on specific trailing text such as "Instagram authorized successfully" or "Syncing..." — only the `[SYSTEM_EVENT:channel:authorized]` prefix + `channel` keyword + `user_id` field are stable across templates
2. If not found (auth message may have scrolled out of context window), read `workspace/USER.md` — it may contain the Dealism `user_id`
3. If still not found, check environment variable via bash: `bash({"command": "echo $SELLER_ID"})`

**If all above fail → user has no authorized channels.** Do NOT ask user for user_id. Stop with a message in the user's language:
- English: `📊 Unable to generate report: No connected sales account detected. Please authorize Instagram or WhatsApp on Dealism first.`
- Portuguese: `📊 Não foi possível gerar o relatório: Nenhuma conta de vendas conectada detectada. Por favor, autorize Instagram ou WhatsApp no Dealism primeiro.`
- For any other language, generate the same message in that language (same meaning, localized wording).
- Output only one language variant.

Extract the `user_id` value. If both channels have authorization messages, the `user_id` should be the same.

**Sub-step B — Validate channel authorization (using the extracted `user_id`):**

```
fetch_channel_data(user_id=<user_id>, channel="instagram")   # only Instagram goes through this tool
```

**Do NOT call `fetch_channel_data(channel="whatsapp")`** — the tool rejects WhatsApp (WhatsApp data is ingested via backend push; the tool returns `{"status": "error", "channel_linked": false, ...}`). For WhatsApp authorization status, rely on whether a `[SYSTEM_EVENT:channel:authorized]` event with `channel: whatsapp` was seen in Sub-step A.

Check the Instagram response's `channel_linked` field:

| Result | Action |
|--------|--------|
| `"channel_linked": true` | Instagram authorized and active |
| `"channel_linked": false` | Instagram unavailable — skip Instagram |

**After checking:**
- **Instagram `channel_linked=true` OR a WhatsApp `[SYSTEM_EVENT:channel:authorized]` was seen in Sub-step A** → at least one channel available, save `user_id`, continue to Step 0
- **No auth event AND Instagram `channel_linked=false`** → **STOP:** output one localized message in the user's language with this meaning: `📊 Unable to generate report: No authorized channels detected. Please complete Instagram or WhatsApp authorization on Dealism first.`

**Important:**
- **NEVER** call `fetch_channel_data` without `user_id` — it will fail
- Do NOT ask user "Have you authorized?" — scan session history first
- The `user_id` extracted here is used in ALL subsequent steps

---

### Step 0: Determine Report Type and Time Range

Identify the report type based on user request:

| Report Type | Keywords | Time Range |
|-------------|----------|------------|
| **Daily** | daily report | See daily rules below |
| **Weekly** | weekly report, this week, last week | Last 7 days or Current week Mon-Sun (UTC+8) |
| **Monthly** | monthly report, this month, last month | Not directly supported in full-month form; require selecting a 7-day slice within that month |
| **Custom** | custom date range | User-provided start and end dates (**must be ≤ 7 days**) |

Use equivalent report-type keywords in the user's language (not only English examples above).

**Daily report date rules (MUST follow):**
- User says "daily report" without date → use **yesterday** (today's data is incomplete)
- User says "today's report" / "today" → use **today** (up to current time)
- User says "yesterday's report" / "yesterday" → use **yesterday**
- User says specific date like "March 22" → use **that date**

Apply the same daily rules to equivalent phrases in the user's language.

**Default:** If no time range specified, default to last 7 days.

**Hard limit check (MUST run before Step 1):**
- Calculate inclusive day span in UTC+8: `day_span = (end_date - start_date).days + 1`
- If `day_span > 7`, stop and ask for a new date range within 7 days (do not fetch data).

---

### Step 1: Calculate Timestamp Range

Convert the user's date range (UTC+8) to UTC millisecond timestamps.

**For daily reports — replace `YYYY,MM,DD` with the target date:**
```
bash({"command": "python3 -c \"from datetime import datetime,timezone,timedelta; tz=timezone(timedelta(hours=8)); s=datetime(YYYY,MM,DD,0,0,0,tzinfo=tz); e=datetime(YYYY,MM,DD,23,59,59,tzinfo=tz); print(f'start_ms={int(s.timestamp()*1000)}'); print(f'end_ms={int(e.timestamp()*1000)}'); print(f'UTC+8 range: {s} to {e}')\""})
```

**For weekly/monthly/custom reports — replace `SY,SM,SD` (start) and `EY,EM,ED` (end):**
```
bash({"command": "python3 -c \"from datetime import datetime,timezone,timedelta; tz=timezone(timedelta(hours=8)); s=datetime(SY,SM,SD,0,0,0,tzinfo=tz); e=datetime(EY,EM,ED,23,59,59,tzinfo=tz); print(f'start_ms={int(s.timestamp()*1000)}'); print(f'end_ms={int(e.timestamp()*1000)}'); print(f'UTC+8 range: {s} to {e}')\""})
```

**Common weekly/monthly examples:**
- This week (Mon-Sun): `s=datetime(2026,3,23,...)`, `e=datetime(2026,3,29,...)`
- Last week: `s=datetime(2026,3,16,...)`, `e=datetime(2026,3,22,...)`
- This month: `s=datetime(2026,3,1,...)`, `e=datetime(2026,3,31,...)`
- Last 7 days: end = today, start = today - 6 days

Apply the same date-window logic for equivalent intents in the user's language.

> ✅ **CHECKPOINT:** Verify the printed UTC+8 range matches the user's request. If it says "2026-03-23" but user asked for "March 22", STOP and recalculate.

---

### Step 2: Retrieve & Filter Conversations (Dual-Channel)

Fetch conversations from both Instagram and WhatsApp, filter by date range, and output as raw JSON.

**Run via `bash` tool — replace `USER_ID`, `START_MS`, `END_MS` with values from Step -1 and Step 1:**
```
bash({"command": "python3 -c \"\nimport sys,os,json,asyncio\nsys.path.insert(0, os.environ.get('PROJECT_ROOT','.')+'/src')\nfrom tools.channel.dealism_channel_client import DealismChannelClient\nUSER_ID=<user_id>; START_MS=<start_ms>; END_MS=<end_ms>\nasync def main():\n    client=DealismChannelClient()\n    result=[]\n    for ch in ['instagram','whatsapp']:\n        try:\n            cursor=None; ch_count=0\n            while True:\n                data=await client.get_channel_conversations(USER_ID,ch,page_size=50,last_conversation_id=cursor)\n                for c in data.get('conversations',[]):\n                    t=c.get('lastMessageTime',0)\n                    if START_MS<=t<=END_MS:\n                        c['_channel']=ch; result.append(c); ch_count+=1\n                if not data.get('hasMore'): break\n                cursor=data.get('nextConversationId')\n                if not cursor: break\n            print(f'{ch}: {ch_count} in range')\n        except Exception as e: print(f'{ch}: skipped ({e})')\n    print('---JSON_START---')\n    print(json.dumps(result,indent=2,ensure_ascii=False))\n    await client.close()\nasyncio.run(main())\n\""})
```

**`user_id`:** Use the value extracted in Step -1. Do NOT re-derive it here.

**Error handling:**
- Channel not authorized → skipped automatically, continues with the other channel
- **Both** channels fail → inform user with one localized message in the user's language (same meaning): "No authorized channels found. Please connect Instagram or WhatsApp first."

> ✅ **CHECKPOINT:** Check the counts printed above `---JSON_START---`. If 0 conversations found but you expected data, verify:
> 1. Is the `user_id` correct?
> 2. Are the `START_MS`/`END_MS` timestamps correct (re-check timezone)?
> 3. Does the channel have any conversations at all (try without date filter)?

**Key fields in each conversation:**
- `conversationId` — unique ID (used in Step 3)
- `participantName` — customer name
- `participantPhone` — customer phone (WhatsApp)
- `lastMessageTime` — last message timestamp (ms, UTC+0)
- `unreadMessageCount` — unread count
- `metadata.agentHumanIntervention` — human intervention needed
- `metadata.agentCustomerProgress` — customer progress stage
- `_channel` — "instagram" or "whatsapp" (added by script)

---

### Step 3: Retrieve Messages for Each Conversation

For each filtered conversation from Step 2, fetch its messages and filter by date range.

**Sub-step A — Build `CONV_IDS` from Step 2 output:**

Parse the JSON from Step 2 (above `---JSON_START---`) to extract `conversationId` → `_channel` mapping:

```python
# Example: Build CONV_IDS from Step 2 result
CONV_IDS = {
    12345: "instagram",   # conversationId from Step 2
    67890: "whatsapp",    # conversationId from Step 2
    # ... add all conversation IDs from Step 2
}
```

**`user_id`:** Use the value extracted in Step -1 Sub-step A. Do NOT re-derive it here.

**Sub-step B — Run the bash command with the extracted `CONV_IDS`:**
```
bash({"command": "python3 -c \"\nimport sys,os,json,asyncio\nsys.path.insert(0, os.environ.get('PROJECT_ROOT','.')+'/src')\nfrom tools.channel.dealism_channel_client import DealismChannelClient\nUSER_ID=<user_id>; START_MS=<start_ms>; END_MS=<end_ms>\nCONV_IDS={<cid1>:'instagram', <cid2>:'whatsapp'}\nasync def main():\n    client=DealismChannelClient()\n    all_msgs={}\n    for cid,ch in CONV_IDS.items():\n        msgs=[]; cursor=None\n        while True:\n            data=await client.get_channel_messages(USER_ID,ch,cid,page_size=50,last_message_id=cursor)\n            page=data.get('messages',[])\n            if not page: break\n            for m in page:\n                if START_MS<=m.get('messageTime',0)<=END_MS: msgs.append(m)\n            if not data.get('hasMore'): break\n            cursor=page[-1].get('id')\n            if not cursor: break\n        all_msgs[str(cid)]={'channel':ch,'messages':msgs,'count':len(msgs)}\n    print(json.dumps(all_msgs,indent=2,ensure_ascii=False))\n    await client.close()\nasyncio.run(main())\n\""})
```

> ✅ **CHECKPOINT:** For the first conversation's messages, pick one `messageTime` and verify:
> ```
> python3 -c "from datetime import datetime,timezone,timedelta; print(datetime.fromtimestamp(<messageTime>/1000, tz=timezone(timedelta(hours=8))))"
> ```
> The printed time should be within the user's requested date range (UTC+8). If not, STOP.

**Key fields in each message:**
- `direction` — "inbound" (customer) or "outbound" (seller/agent)
- `source.from` — "user" (human) or "agent_auto_reply" (AI)
- `messageTime` — timestamp (ms, UTC+0)
- `content.text` — message text
- `messageType` — "text", "image", etc.

---

### Step 3.5: Data Sufficiency Check

After Step 3, calculate **total messages** across all conversations and choose the appropriate action:

| Situation | Action |
|-----------|--------|
| **0 conversations fetched in Step 2** | Output one localized message in the user's language with this meaning: `📊 Unable to generate report: No authorized channels found. Please connect Instagram or WhatsApp first.` |
| **0 messages after Step 3 filtering** | Output one localized message in the user's language with this meaning: `📊 No message records found for {start_date} to {end_date}. Possible reasons: no customer interactions during this period, or data sync pending. Try a different date range.` |
| **1-10 total messages** | Generate a **simplified report**: skip Funnel Analysis and detailed Customer Insights. Prefix with one localized notice in the user's language with this meaning: `⚠️ Only {N} messages in this period. Limited data - brief analysis below:` |
| **11+ total messages** | Generate the **full report** |

**How to calculate total messages:** Sum all `count` values from Step 3 output: `sum(c['count'] for c in all_msgs.values())`

**Per-channel empty handling:** If one channel has messages and the other is empty, generate the report with the available data and add one localized note in the user's language with this meaning: `ℹ️ No message records from {empty_channel} in this period. Data below is from {active_channel} only.`

---

### Step 4: Analyze and Generate Report

With the raw JSON data from Steps 2-3, analyze and generate the report using the 4-section Summary Structure:

1. **Overall Performance**: Total conversations, messages, per-channel breakdown
2. **Funnel Analysis**: Dynamically identify stages from actual data (see Funnel Analysis section)
3. **Customer Insights**: Analyze inbound message content for patterns, questions, objections
4. **Next Steps**: Recommendations including Dealism platform actions (see Next Steps section)

AI/Human reply metrics should still be computed and included in Overall Performance / Next Steps when relevant:
- AI reply: `direction == "outbound"` AND `source.from == "agent_auto_reply"`
- Human reply: `direction == "outbound"` AND `source.from == "user"`
- AI reply rate = AI reply count / total outbound count

---

### Step 4.5: Output Self-Check (MUST run before sending)

Before sending the final report, verify all checks below. If any check fails, regenerate the report and re-check.

1. **Single-language check**
   - The entire report uses exactly one language matching the user's language.
   - No mixed-language headings, table labels, notices, or recommendation bullets.

2. **Section structure check**
   - The report includes exactly these sections in order:
     - Overall Performance
     - Funnel Analysis (or omitted only when simplified report is required by Step 3.5)
     - Customer Insights (or simplified when data is limited)
     - Next Steps
   - The report must **NOT** include an `Actions Taken` section.

3. **Localization check**
   - Summary line, title, metric names, stage labels, warnings, and info notes are localized to the user's language.
   - No bilingual or multilingual alternatives are shown in final output.

4. **Data sufficiency check**
   - If total messages are `1-10`, output simplified report format per Step 3.5.
   - If total messages are `11+`, output full report format.
   - If there is no usable data, output one localized failure message only.

---

## Required Tools

| Tool | Purpose | When to use |
|------|---------|-------------|
| `bash` | **Primary data retrieval** — run Python code to call Channel API and get raw JSON | Steps 1-3: getting timestamps, conversations, messages |
| `fetch_channel_data` | Check channel authorization and get cached data summary (requires `user_id` from Step -1) | Step -1 authorization check |

**Important:** `fetch_channel_data` returns a summary (conversation count, buyers, etc.) but does NOT include raw message timestamps or metadata needed for analysis. **Always use `bash` + Python for the actual data retrieval.**

---

## Data Fields Reference

**Conversation object (raw JSON from API):**
```json
{
    "conversationId": 12345,
    "participantName": "Customer Name",
    "participantPhone": "+1234567890",
    "lastMessageTime": 1711180800000,
    "unreadMessageCount": 2,
    "status": "active",
    "metadata": {
        "agentHumanIntervention": false,
        "agentCustomerProgress": "interested"
    }
}
```

**Message object (raw JSON from API):**
```json
{
    "id": 67890,
    "direction": "inbound",
    "messageType": "text",
    "content": {"text": "Hello, I'm interested in..."},
    "source": {"from": "user"},
    "messageTime": 1711180800000
}
```

**`source.from` values:**
- `"user"` → human (customer inbound, or seller manual outbound)
- `"agent_auto_reply"` → AI auto-reply (outbound only)

---

## Notes

- **Timezone is the #1 source of errors.** Always convert UTC+8 → UTC before filtering. Always verify with a checkpoint.
- All API timestamps are **UTC+0 milliseconds**. The user sees and thinks in **UTC+8**.
- Use `source.from` to distinguish AI auto-replies from human replies.
- If pagination returns `hasMore: true`, use `nextConversationId` / last message `id` to fetch more pages.
- If both channels return 0 conversations, double-check the timestamp range before telling the user "no data".