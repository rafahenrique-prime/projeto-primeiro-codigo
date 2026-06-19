---
name: manage-hitl-triggers
description: >
  Manage human intervention / escalation rules for Buyer Agents: add, remove,
  enable, disable, or view triggers that control when BA should transfer to human.
  Use this skill whenever the seller mentions: escalation rules, transfer-to-human rules,
  human intervention, trigger conditions, "add a rule", "disable a trigger",
  or wants to change when BAs should escalate conversations to a human seller.
  Also triggers when seller asks about competitor-related rules, VIP handling rules,
  or any per-BA / per-config-group customization of escalation behavior.
  This is the ONLY way to manage these rules — do NOT edit BA configs or AGENTS.md directly.
metadata: {"openclaw":{"emoji":"🚨","always":true}}
---

# Manage HITL Triggers

Human intervention triggers control when a Buyer Agent should stop handling a conversation autonomously and escalate to the human seller. Every BA has 7 default triggers hardcoded in AGENTS.md. This skill manages **incremental changes** on top of those defaults — you can add new triggers, disable defaults, and customize per user-group or per BA.

## Quick Decision Table

| Seller says... | Scope | Action |
|---|---|---|
| "Add a transfer-to-human rule" | All BAs | Write to `workspace/hitl/global.json` |
| "Disable the knowledge absence rule" | All BAs | Add to `disable_defaults` in `workspace/hitl/global.json` |
| "Add a rule for the enterprise group" | One config group | Write to `workspace/hitl/config_{config_id}.json` |
| "Customize rules for this VIP customer" | One BA | Write to `workspace/hitl/overrides/{ba_key}.json` |
| "Show me the current rules" | View | Read all HITL files, merge, and present |

## Default Triggers (always active unless disabled)

| ID | Name |
|----|------|
| t_001 | Price & Discount (Hidden/Custom) |
| t_002 | Product Capability (Unsupported/Future) |
| t_003 | Commitment & Action |
| t_004 | Account, Payment & Sensitive Info |
| t_005 | Links & Resources (Unverified) |
| t_006 | Knowledge Absence |
| t_007 | Explicit Human Request |

## Step-by-Step: Add a Seller-Wide Rule

This is the most common operation. Follow these exact steps:

**Step 1** — Read or create `workspace/hitl/global.json`:

```
read_file("workspace/hitl/global.json")
```

If the file doesn't exist, that's OK — you'll create it in step 2.

**Step 2** — Write the file with the new trigger:

If the file didn't exist:
```
write_file("workspace/hitl/global.json", <content below>)
```

If it existed, use `edit_file` to append to the `custom_triggers` array.

**File content template:**
```json
{
  "version": 1,
  "disable_defaults": [],
  "custom_triggers": [
    {
      "trigger_id": "t_global_001",
      "name": "Short name for the trigger",
      "description": "When this condition is met, BA should escalate to human seller",
      "enabled": true
    }
  ],
  "updated_at": "2026-03-25T00:00:00Z"
}
```

**Step 3** — Confirm to the seller what was added and the scope (all BAs, next conversation turn).

That's it. No need to notify BAs — they read the file automatically on their next turn.

## Step-by-Step: Disable a Default Trigger

**Step 1** — Decide the scope with the seller:
- All BAs: edit `workspace/hitl/global.json`, add trigger ID to `disable_defaults`
- One config group: edit `workspace/hitl/config_{config_id}.json`, add to `disable`
- One BA: edit `workspace/hitl/overrides/{ba_key}.json`, add to `disable`

**Step 2** — Read the target file, add the trigger ID (e.g. `"t_006"`) to the disable list, edit_file.

**Step 3** — Confirm: which trigger was disabled, for which scope.

## Step-by-Step: Per-BA Override

When the seller wants a specific BA to have different rules:

**Step 1** — Identify the ba_key. Read bindings to find it:
```
read_file("buyer_agents/bindings.json")
```
The ba_key is the binding key, e.g. `buyer_test_buyer_api`.

**Step 2** — Write the override file:
```
write_file("workspace/hitl/overrides/{ba_key}.json", <content below>)
```

```json
{
  "disable": ["t_001"],
  "extra_triggers": [
    {
      "trigger_id": "t_ba_001",
      "name": "VIP full escalation",
      "description": "This is a VIP customer, escalate all non-trivial questions"
    }
  ]
}
```

**Step 3** — Confirm: what was customized, only this BA is affected.

## Step-by-Step: Per-Config Group Rule

When different user groups need different rules:

**Step 1** — Find the config_id from bindings:
```
read_file("buyer_agents/bindings.json")
```
Look at `default_config` or the value next to a specific ba_key.

**Step 2** — Write to the config-level file:
```
write_file("workspace/hitl/config_{config_id}.json", <content below>)
```

```json
{
  "version": 1,
  "config_id": "the_config_id",
  "disable": [],
  "custom_triggers": [
    {
      "trigger_id": "t_config_001",
      "name": "Contract terms",
      "description": "Customer asks about contracts, SLA, or legal terms",
      "enabled": true
    }
  ],
  "updated_at": "2026-03-25T00:00:00Z"
}
```

## Step-by-Step: View Current Rules

**Step 1** — Read all HITL files that exist:
```
read_file("workspace/hitl/global.json")
read_file("workspace/hitl/config_{config_id}.json")
read_file("workspace/hitl/overrides/{ba_key}.json")
```
Missing files = no customization at that layer.

**Step 2** — Present the merged result to the seller clearly. Example format:

```
Current escalation rules:

System defaults (all BAs):
  1. [active] Price & Discount
  2. [active] Product Capability
  3. [active] Commitment & Action
  4. [active] Account & Payment
  5. [active] Links & Resources
  6. [disabled] Knowledge Absence
  7. [active] Explicit Human Request

Seller-wide custom (all BAs):
  8. [active] Competitor comparison

Enterprise group only:
  9. [active] Contract terms
```

## trigger_id Naming Convention

| Prefix | Layer | Example |
|--------|-------|---------|
| `t_001`~`t_007` | System defaults | `t_006` |
| `t_global_*` | Seller-wide | `t_global_001` |
| `t_config_*` | Config group | `t_config_001` |
| `t_ba_*` | Per-BA | `t_ba_001` |

Use incrementing numbers: `t_global_001`, `t_global_002`, etc.

## Merge Rule (Reference)

```
BA final = AGENTS.md 7 defaults (always present)
         + global custom_triggers (if not disabled by config/BA)
         - global disable_defaults
         + config custom_triggers (if not disabled by BA)
         - config disable
         + BA extra_triggers
         - BA disable
```

Changes take effect on next BA conversation turn automatically. No notification needed.

## Response Guidelines

- After any change, confirm: what changed + impact scope
- If the seller's intent is ambiguous (all BAs vs one group vs one BA), ask first
- When disabling a default, remind the seller it can be re-enabled anytime
