# Relacionamento: Vercel vs Crons (agendamentos)

> **Snapshot:** 2026-07-08 · branch `main`
> **Fonte:** `docs/DEPLOY.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`, `vercel.json`

---

## 1. Visão geral

O sistema tem **dois mecanismos de agendamento paralelos** para jobs recorrentes, sem documentação explícita do porquê:

| Mecanismo | Onde é configurado | Tipo |
|---|---|---|
| **Vercel Cron Jobs** | `vercel.json` → `crons` | Nativo da plataforma |
| **GitHub Actions** | `.github/workflows/stuck-check.yml` | CI/CD externo |

---

## 2. Crons Vercel (vercel.json)

```json
"crons": [
  { "path": "/api/cron-diagnosis", "schedule": "0 12 * * *" },
  { "path": "/api/cron-diagnosis", "schedule": "0 18 * * *" }
]
```

| Job | Horário (UTC) | Frequência | Função |
|---|---|---|---|
| `cron-diagnosis` | 12:00 e 18:00 | 2x/dia | DealOnça — supervisor comercial: scoring, objeções, auditoria de agente, insights semanais, alerta leads quentes |

### Detalhes do cron-diagnosis

Executa em uma rodada completa (ver `docs/ARCHITECTURE.md` §6 — Fluxo C):
1. Classifica funil de cada conversa (QUENTE_FECHAR, DECISAO_OBJECAO, etc.)
2. Motor de objeções (regex) → tabela `objections`
3. Canal Silencioso — sem msg 3h+ em horário comercial → alerta queda
4. `refineScore` — IA corrige `buy_score` se discordar ≥25 pts
5. `auditAgentResponse` — rubrica 0-10 em respostas da Gabriela
6. `proposeAgentFix` — mesmo erro ≥3x hoje → propõe adendo
7. `checkIgnoredHotLeads` — cobra leads quentes 20-48h esfriados
8. Insight semanal (1x/semana) → `weekly_insights` + Telegram
9. Relatório diário → `diagnostics` + alerta CODEX

**Variáveis usadas:**
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY`
- `VITE_GPTMAKER_TOKEN` / `VITE_GPTMAKER_WORKSPACE`
- `VITE_GROQ_API_KEY`
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`

---

## 3. GitHub Actions (stuck-check)

```yaml
name: Verificar clientes sem resposta
on:
  schedule:
    - cron: "*/5 * * * *"     # a cada 5 minutos
  workflow_dispatch: {}
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: curl -s -f "https://ignite-webhook.vercel.app/api/cron-stuck-check"
```

| Job | Frequência | Função |
|---|---|---|
| `cron-stuck-check` | A cada 5 minutos | Detecta conversas sem resposta há 3-30 min → alerta Telegram |

### Por que GitHub e não Vercel?

O `cron-stuck-check` **não está no `vercel.json`** — o GitHub Action faz o ping. Motivo provável:

| Aspecto | Vercel Cron | GitHub Actions |
|---|---|---|
| **Granularidade mínima** | 1 dia (em plano Hobby) ou 1 hora | 1 minuto |
| **5 minutos** | ❌ Não suporta | ✅ Suporta |

O healthcheck precisa rodar a cada 5 minutos para detectar clientes sem resposta em tempo hábil. A Vercel não suporta essa granularidade, hence o GitHub Action como "pingador".

---

## 4. Comparação dos jobs

| Aspecto | `cron-diagnosis` | `cron-stuck-check` |
|---|---|---|
| **Frequência** | 2x/dia | A cada 5 min |
| **Executor** | Vercel Cron | GitHub Actions → curl → Vercel |
| **Complexidade** | Alta (797 linhas) | Baixa (healthcheck simples) |
| **Ação principal** | Análise + scoring + alertas | Detectar inatividade → alerta Telegram |
| **Variáveis Telegram** | ✅ (alertas) | ✅ (alertas) |
| **Usa Groq LLM** | ✅ (refineScore) | ❌ |

---

## 5. Funções API chamadas por agendamento

```
Vercel Cron (2x/dia)
    └── /api/cron-diagnosis.js (797 linhas)
        ├── Supabase: 16+ queries
        ├── Groq LLM: refineScore
        ├── Telegram: alertas
        └── GPT Maker: dados de conversas

GitHub Actions (5 min)
    └── curl /api/cron-stuck-check.js
        ├── Supabase: check conversas
        ├── Telegram: alerta inatividade
        └── GPT Maker: dados de conversas
```

---

## 6. Endpoints que NÃO são cron mas são chamados externamente

| Endpoint | Chamador | Quando |
|---|---|---|
| `/api/webhook` | GPT Maker (Step 2) | Toda mensagem do cliente |
| `/api/auto-photo` | GPT Maker | Quando cliente pede foto |
| `/api/knowledge` | GPT Maker | Consulta knowledge |
| `/api/gptmaker-credits` | Frontend (gptmakerCreditsService) | Ao abrir Dashboard |
| `/api/embed-knowledge` | Manual / pipeline | Embeddings Cohere |
| `/api/bagy-audit` | Manual / pipeline | Auditoria Bagy |
| `/api/cache-avatar` | Frontend (background) | Cache de avatares IG |
| `/api/log-history` | Frontend | Log de ações do catálogo |
| `/api/scraper` | Frontend | Scraping de produtos |

---

## 7. Riscos

| Risco | Sintoma | Mitigação |
|---|---|---|
| Vercel Cron não dispara | Diagnóstico diário não roda | Verificar `vercel.json` + status do deploy |
| GitHub Action parado | Healthcheck 5min falha | Verificar Actions tab no GitHub |
| Telegram token faltando na Vercel | Alertas silenciosos | `vercel env ls` → `TELEGRAM_BOT_TOKEN` |
| Cron diário em horário errado | Relatórios fora do horário comercial | Horários UTC: 12:00 = 09:00 BRT, 18:00 = 15:00 BRT |
| Conflito de cron com deploy | Cron dispara durante build → cold start | Aceitável (warm-up já existe no código) |

---

## 8. Horários convertidos (UTC → BRT)

| UTC | BRT | Job |
|---|---|---|
| 12:00 | 09:00 | cron-diagnosis (manhã) |
| 18:00 | 15:00 | cron-diagnosis (tarde) |
| */5 min | */5 min | cron-stuck-check |

---

**Gerado em:** 2026-07-08 · Fase 2 da reorganização.
