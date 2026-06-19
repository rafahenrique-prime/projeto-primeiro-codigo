---
name: channel-diagnosis
description: >
  Run channel conversation diagnosis to analyze response quality, calculate revenue loss,
  and generate profile analysis with personalized openings. Use this skill after
  fetch_channel_data has been called and cached data is available. Supports Instagram
  and WhatsApp channels. Use --mode to control output scope.
metadata: {"openclaw":{"emoji":"","requires":{}}}
---

# Channel Diagnosis Skill

Analyze channel conversation data to diagnose sales performance issues.

## Prerequisites

`fetch_channel_data` must have been called first (data is read from its temp cache).
If the script reports "no cached data", call `fetch_channel_data(user_id=..., channel=..., refresh=true)` first.

## How to Call

**Full diagnosis (analyze + loss + profile):**
```bash
python3 $PROJECT_ROOT/scripts/run_diagnosis.py \
  --channel instagram
```

**Analyze only (conversation quality metrics):**
```bash
python3 $PROJECT_ROOT/scripts/run_diagnosis.py \
  --channel instagram --mode analyze
```

**Loss calculation only:**
```bash
python3 $PROJECT_ROOT/scripts/run_diagnosis.py \
  --channel instagram --mode loss --industry beauty
```

**Profile analysis only (business profile + personalized opening):**
```bash
python3 $PROJECT_ROOT/scripts/run_diagnosis.py \
  --channel instagram --mode profile --style balanced
```

## Parameters

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `--channel` | yes | - | `instagram` or `whatsapp` |
| `--seller-id` | no | `$SELLER_ID` env | Override seller ID (auto-injected by bash) |
| `--mode` | no | `full` | `full`, `analyze`, `loss`, or `profile` |
| `--industry` | no | `default` | Industry for loss benchmarks (education, healthcare, beauty, fashion, etc.) |
| `--style` | no | `balanced` | Opening message style: `aggressive`, `balanced`, or `soft` |

## Output

Results are printed to stdout. The script also auto-persists results to `workspace/memory/knowledge/`.

### Analyze mode output
- Reply rate, missed conversations, avg response time
- Quality score (0-100), completion rate
- Issue list

### Loss mode output
- Estimated monthly/annual revenue loss
- Industry benchmark comparison

### Profile mode output
- Business category, tone, interests
- Personalized opening messages (full/short/formal versions)
