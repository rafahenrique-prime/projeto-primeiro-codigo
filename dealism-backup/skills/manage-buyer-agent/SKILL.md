---
name: manage-buyer-agent
description: >
  Manage Buyer Agent (BA) configs: create, update, or delete.
  Use this skill when the user asks to create, modify, or remove a buyer agent.
metadata: {"openclaw":{"emoji":"🤖","always":true}}
---

# Manage Buyer Agent Config

## Which Operation?

| User says... | Operation | Script |
|---|---|---|
| "Create a new agent" / "Add another agent" | **Create** | `create_buyer_agent_config.py` |
| "Change the goal" / "Update the tone" / "Rename agent" | **Update** | `update_buyer_agent_config.py` |
| "Delete this agent" / "Remove agent X" | **Delete** | `delete_buyer_agent_config.py` |

**CRITICAL: Always use the correct script. NEVER use `write_file` or `edit_file` to modify config files directly. NEVER use the create script to modify an existing agent.**

## Execution Guardrails

- Use exactly one BA operation per user request unless the user explicitly changes the request.
- Do not switch from create -> update/delete, or update -> create/delete, just because the first command failed.
- Do not jump from BA config management into probe/testing unless the user asked to test, or the current stage explicitly requires testing.
- Use only `$PROJECT_ROOT/scripts/<script>.py`.
- Do not use `/app/scripts/...`, `workspace/skills/...`, `find /`, or `ls /app` to hunt for script paths.

## BA Config JSON Schema

**STRICT: Only these keys are allowed. Do NOT add, rename, or invent new keys.**

| Field | Type | Required |
|-------|------|----------|
| `agent_name` | string | **Yes** |
| `company_name` | string | Yes |
| `selling_products` | string | Yes |
| `sales_goal` | string | Yes |
| `industry` | string | Yes |
| `role` | string | Optional |
| `tone` | string | Optional |
| `max_reply_words` | number | Optional |
| `playbook` | string | Optional — flat string with `\n`, NOT array |
| `others` | string | Optional — flat string of bullet points, NOT array |
| `web_search_summary_info` | string | Optional |

---

## Create

1. **Check memory first**: `memory_search(query="company product industry", category="knowledge")` — pre-fill from existing data
2. **Collect required fields** one at a time: company_name, selling_products, sales_goal, industry, agent_name (generate one if user doesn't care)
3. **Collect optional fields** only if relevant context is available: tone, playbook, others
4. **Confirm** all fields with user, then run:

```bash
python3 $PROJECT_ROOT/scripts/create_buyer_agent_config.py \
  --config '{"agent_name":"...","company_name":"...","selling_products":"...","sales_goal":"...","industry":"..."}'
```

During first-time onboarding (BOOTSTRAP.md is active), add `--first-run`.

The script handles: config file creation (with auto-generated ID), default binding, Role Play Agent generation.
With `--first-run`, it also: updates onboarding state, deletes BOOTSTRAP.md.

---

## Update

1. **Find the config**: `list_dir({"path": "buyer_agent_configs"})`
2. **Identify which config** to update (ask user if multiple)
3. **Run** with only the changed fields:

```bash
python3 $PROJECT_ROOT/scripts/update_buyer_agent_config.py \
  --config-id "小布_n5l88F9m" \
  --fields '{"sales_goal":"新目标"}'
```

Renaming agent_name automatically renames the file and updates bindings.

---

## Delete

1. **Confirm** which agent to delete
2. **Run**:

```bash
python3 $PROJECT_ROOT/scripts/delete_buyer_agent_config.py \
  --config-id "小布_n5l88F9m"
```

The script handles: delete config file, clean up bindings, auto-set new default if needed.
