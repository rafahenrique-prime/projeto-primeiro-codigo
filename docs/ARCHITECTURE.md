# docs/ARCHITECTURE.md — Arquitetura do IGNITE PRIME CRM

> **Snapshot:** 2026-07-08 · branch `main`
> **Fonte:** apenas código do repositório (`src/`, `api/`, `supabase/`, configs).

---

## 1. Camadas do sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CLIENTE (WhatsApp / Instagram)                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ mensagem
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│   GPT Maker (api.gptmaker.ai)  ──orquestra a Gabriela (IA)──        │
│   • recebe msg  • chama webhooks  • envia resposta  • modos         │
└──────┬───────────────────────┬──────────────────────┬───────────────┘
       │ /api/webhook          │ /api/auto-photo       │ REST (chats)
       ▼                       ▼                       ▼
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────────┐
│  webhook.js        │ │  auto-photo.js     │ │  App.jsx (frontend)    │
│  busca catálogo +  │ │  detecta "foto" →  │ │  Inbox/Chat/DealOnça   │
│  knowledge → ctx   │ │  envia img+preço   │ │  consome gptmaker.js   │
└─────────┬──────────┘ └─────────┬──────────┘ └──────────┬─────────────┘
          │                       │                       │
          ▼                       ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       SUPABASE (Postgres + Storage)                  │
│  products · knowledge · customer_profiles · codex_alerts ·           │
│  objections · diagnostics · agent_audits · agent_learnings ·         │
│  weekly_insights · *_audit_findings · system_health_runs ·           │
│  catalog_history · photo_history · avatar_cache                      │
└──────────────────────────────────────────────────────────────────────┘
          ▲                       ▲                       ▲
          │                       │                       │
┌─────────┴──────────┐ ┌─────────┴──────────┐ ┌──────────┴─────────────┐
│  cron-diagnosis.js │ │  telegram-alert.js │ │  src/services/*        │
│  (2x/dia) DealOnça │ │  alertas           │ │  (frontend)            │
│  usa Groq LLM      │ └────────────────────┘ └────────────────────────┘
└────────────────────┘
```

### Separação frontend × serverless

**Importante:** `api/` (serverless) e `src/` (frontend) **compartilham o banco Supabase, mas não compartilham código**. O serverless é autossuficiente — **zero imports** de `src/services/`. Onde a mesma regra de negócio é necessária nos dois lados, ela foi **copiada à mão** (ver seção 5).

---

## 2. Estrutura de diretórios (estado atual)

```
PROJETO DO CLAUDECODE/
├── src/
│   ├── App.jsx                 ← roteador por `page` (switch) + Inbox
│   ├── main.jsx                ← entry point
│   ├── theme.jsx               ← tokens de cor (PRIME LIGHT V1)
│   ├── index.css
│   ├── api/                    ← cliente HTTP do frontend
│   ├── components/   (14)      ← UI (ChatArea, RightPanel, Sidebar, cards…)
│   ├── pages/        (30+)     ← uma página por funcionalidade
│   ├── data/
│   │   ├── catalog.json        ← catálogo bundled (fallback)
│   │   └── mockData.js
│   └── services/    (49)       ← 41 organizados em 8 domínios (Fases 3A+3B) + 8 na raiz (candidatos Fase 3C)
│       ├── auditoria/    (9)   ├── catalogo/     (5)   ├── chat/  (2)
│       ├── conhecimento/ (5)   ├── crm/          (3)   ├── foto/  (8)
│       ├── ia/           (2)   ├── plataforma/   (7)
│       └── (raiz, 8): catalog, customerProfileService, followUpService,
│           gptmaker, groq, knowledgeDB, opsHealthService, photoHistory
│
├── api/            (15)        ← serverless Vercel (rotas /api/*)
│   ├── webhook.js              ← busca conhecimento p/ Gabriela
│   ├── auto-photo.js           ← envio automático de fotos
│   ├── cron-diagnosis.js       ← DealOnça (cron 2x/dia)
│   ├── cron-stuck-check.js     ← healthcheck (GitHub Action 5min)
│   ├── scraper.js              ← scraping server-side
│   ├── telegram-alert.js       ← alertas Telegram
│   ├── bagy-audit.js (+ ignore)← auditoria da loja Bagy
│   ├── cache-avatar.js         ← bypass CORS p/ avatares IG
│   ├── embed-knowledge.js      ← embeddings Cohere
│   ├── gptmaker-credits.js     ← saldo de créditos
│   ├── log-history.js          ← log de ações do catálogo
│   └── _*.js (3)               ← helpers internos (não viram rota)
│
├── supabase/migrations/ (8)    ← SQL aplicado manualmente no SQL Editor
├── catalogo-publico/           ← projeto Vercel SEPARADO (HTML estático)
├── dealism-backup/ (101MB)     ← referência, sem uso em runtime
├── scripts/                    ← ferramentas operacionais
├── docs/ · knowledge/ · strategy/  ← documentação
└── .github/workflows/stuck-check.yml
```

---

## 3. Roteamento do frontend

`src/App.jsx` mantém o estado `page` e renderiza a página correspondente num `switch`-like de condicionais (não há React Router). As 25+ páginas incluem:

| `page` | Componente | Função |
|---|---|---|
| `inbox` | InboxList + ChatArea + RightPanel | Atendimento principal |
| `dealonca` | DealOncaPage | Supervisor comercial (CODEX) |
| `dashboard` / `reports` / `relatorios` | Dashboard*Page, RelatoriosPage | Relatórios |
| `catalogo` / `catalogo-rascunho` / `importar` / `importar-backup` | CatalogPage, DraftCatalogPage, ImportCatalogPage, ImportReviewPage | Catálogo |
| `photo` / `extrator` / `image-extractor` | PhotoRecognitionPage, ExtractorPage, ImageExtractorPage | Foto/scraping |
| `agents` / `lab` / `knowledge` / `simulador` | AgentsPage, AgentLabPage, KnowledgePage, SimuladorClientePage | IA/conhecimento |
| `intelligence-ops` / `bagy-audit` | IntelligenceOpsPage | Auditorias consolidadas |
| `contacts` / `contacts-new` / `cobrancas` / `followup` | ContactsPage, ContactsNewPage, CobrancasPage, FollowUpPage | CRM |
| `channels` | ChannelsPage | Canais |

### Ciclos de background no App.jsx
- **30s** — `loadChats()` rebusca conversas no GPT Maker; detecta novas mensagens (beep + notificação do browser).
- **60s** — `runFollowUpCheck()` motor de follow-up.
- **60s** — `getAllProfiles()` recarrega scores para priorizar a fila do Inbox.
- Em paralelo, `cacheAvatarsInBackground()` garante avatar de cada contato no Storage Supabase.

---

## 4. Matriz de dependências dos serviços (`src/services/`)

> **Status da reorganização (2026-07-10):** Fases 3A e 3B concluídas — 41 dos 49 arquivos já vivem em subpastas por domínio (`auditoria/`, `catalogo/`, `chat/`, `conhecimento/`, `crm/`, `foto/`, `ia/`, `plataforma/`). Os 8 arquivos que restam na raiz são exatamente os de maior fan-in — candidatos à Fase 3C. Ver `docs/POS-FASE3B-AUDITORIA.md` para o levantamento completo.

### 4.1 Services mais consumidos (incoming — fan-in, contagem por arquivo consumidor distinto)

| Rank | Service | # consumers | Localização |
|---|---|---|---|
| 1 | `gptmaker` | 18 | raiz (candidato 3C) |
| 2 | `catalog` | 11 | raiz (candidato 3C) |
| 3 | `groq` | 7 | raiz (candidato 3C) |
| 4 | `knowledgeDB` | 6 | raiz (candidato 3C) |
| 5 | `customerProfileService` | 6 | raiz (candidato 3C) |
| 6 | `photoHistory` | 4 | raiz (candidato 3C) |
| 7 | `deepseek` | 4 | `ia/` |
| 8 | `followUpService` | 3 | raiz (candidato 3C) |
| 9 | `agentLearningsService` | 3 | `auditoria/` |
| 10 | `agentAuditService` | 3 | `auditoria/` |

Os 7 primeiros lugares batem quase exatamente com os 8 candidatos à Fase 3C — confirma que são estruturalmente os serviços mais centrais do sistema.

### 4.2 Hub interno (services que importam muitos services)
- **`opsHealthService`** (raiz) importa **10** services — é o agregador de inteligência operacional: `auditoria/bagyAuditService, plataforma/systemHealthService, auditoria/knowledgeAuditService, auditoria/learningsAuditService, auditoria/whatsappAuditService, auditoria/instagramAuditService, auditoria/agentAuditService, knowledgeDB, auditoria/agentLearningsService, gptmaker`.

### 4.3 Dependências service→service (grafo interno, 30 arestas)
```
catalog                 → gptmaker
catalogo/catalogSyncService → conhecimento/knowledgeGenerator
catalogo/importBackupService → catalog
conhecimento/knowledgeExtractor → catalog
crm/contactAnalysisService → ia/deepseek
followUpService         → gptmaker, groq
foto/photoFlowService   → foto/photoCacheService (mesma pasta)
foto/photoMatchingService → catalog
groq                    → customerProfileService, crm/stageHistory, ia/deepseek
ia/deepseek             → plataforma/tokenLoggingService
auditoria/instagramAuditService → gptmaker
auditoria/knowledgeAuditService → knowledgeDB, ia/deepseek
auditoria/learningsAuditService → auditoria/agentLearningsService (mesma pasta), ia/deepseek
auditoria/whatsappAuditService → gptmaker
plataforma/systemHealthService → gptmaker
opsHealthService        → (10 services — ver 4.2)
```
O grafo continua **DAG** (sem ciclos), confirmado na auditoria pós-3B. Os 8 arquivos da raiz concentram 19 das 30 arestas como destino — reforça que devem ser os últimos a mover.

### 4.4 Services órfãos (0 consumers externos)
`awsRekognitionService`, `deepseek`, `importBackupService`, `photoMatchingService`, `photoRecognitionService`, `searchKnowledge` — importados apenas por outros services ou não referenciados. Não são necessariamente mortos (podem ser usados só indiretamente ou ser código preparado).

---

## 5. Duplicação de regra de negócio (api/ × src/services/)

Estas regras existem **como cópia** nos dois lados, não como import compartilhado:

| Regra | `src/services/` | `api/` | Risco |
|---|---|---|---|
| **Scoring de cliente** (`calcBuyScore`) | `customerProfileService.js:179` | `_scoring.js:54` | Score do painel pode divergir do que dispara alerta `lead_quente` |
| **Estágios de funil** (`detectFunnelStage`) | `groq.js:106` | `cron-diagnosis.js:34` (comentário confirma "cópia fiel") | Classificação do diagnóstico ≠ classificação do painel |
| **Motor de objeções** (`OBJECTION_PATTERNS`) | `groq.js` | `cron-diagnosis.js` | Padrão novo no frontend não entra no relatório diário |
| **Busca de conhecimento** | `searchKnowledge.js` | `webhook.js` (`buscarKnowledge`+`buscarProdutos`) | Algoritmo de similaridade divergente |
| **Catálogo fallback** | `src/data/catalog.json`, `photoRecognitionService.js` | `auto-photo.js` (`CATALOG_FALLBACK`) | 3 fontes de verdade do catálogo |
| **Boilerplate Supabase** | (em cada service) | replicado em **11 das 12** funções `api/` | Mudança de auth toca 11 arquivos |

> **Recomendação registrada (não executada):** unificar scoring/funil/objections num módulo compartilhado e extrair `api/lib/supabaseClient.js`. Exige análise de impacto prévia.

---

## 6. Fluxos end-to-end

### Fluxo A — Atendimento em tempo real
```
1. Cliente escreve no WhatsApp/Instagram
2. GPT Maker recebe → chama webhook POST /api/webhook com {prompt, ...}
3. webhook.js:
   a. warm-up Supabase (evita cold start)
   b. buscarProdutos() — keywords + score de similaridade, top 5, retry 5x se 0
   c. buscarKnowledge() — entrada 'knowledge_gabriela_supabase_completo'
   d. formatarRespostaGPT() → {contexto, dados:{produtos, informacao_adicional}}
4. GPT Maker incorpora contexto → Gabriela responde
5. Paralelamente: se cliente pediu foto → Fluxo B
```

### Fluxo B — Auto-foto
```
1. /api/auto-photo recebe POST com chat_id
2. detectProductRequest() — regex ("manda foto", "me manda imagem"...)
3. detectMultiplePhotoRequest() — "foto dos 2", emoji 1️⃣2️⃣
4. findProductInText() — matching 2 fases + filtro de categoria
   (cascata: msg atual → contexto do cliente → contexto da Gabriela)
5. getCatalog() — Supabase; se cair, usa CATALOG_FALLBACK + alerta CODEX crítico
6. sendMessage() — POST imagem no GPT Maker
7. await 1000ms (rate-limit)
8. sendMessage() — preço + link
9. Registra em photo_history
```

### Fluxo C — DealOnça (supervisor, cron 2x/dia)
`/api/cron-diagnosis` (agendado `0 12 * * *` e `0 18 * * *` em `vercel.json`) executa em uma rodada:
1. `detectFunnelStage` — classifica funil (QUENTE_FECHAR, DECISAO_OBJECAO, …)
2. Motor de objeções (regex) → tabela `objections` + ranking 7 dias
3. Canal Silencioso — sem msg há 3h+ em horário comercial → alerta queda WhatsApp
4. `refineScore` — IA relê até 20 conversas, corrige `buy_score` se discordar ≥25 pts (trava anti-chute)
5. `auditAgentResponse` — rubrica 0-10 em até 15 respostas da Gabriela → `agent_audits`
6. `proposeAgentFix` — mesmo erro ≥3x hoje → propõe adendo ao prompt (NUNCA auto-aplica) → `agent_learnings`
7. `checkIgnoredHotLeads` — cobra leads quentes 20-48h esfriados
8. Insight semanal (1x/semana) → `weekly_insights` + Telegram
9. Relatório diário → `diagnostics` + alerta CODEX

### Fluxo D — Inbox inteligente
Priorização em `App.jsx::conversationPriority`:
```
0  humano aguardando (copilot + unread)
1  buy_score >= 70
2  buy_score >= 30 E inativo > 30min
3  buy_score >= 30
4  resto
```
Tiebreaker: mensagem mais recente sobe (comportamento WhatsApp).

### Fluxo E — Healthcheck de conversas travadas
- **Não está no `vercel.json`.** Roda via **GitHub Action** (`.github/workflows/stuck-check.yml`, cron `*/5 * * * *`) que faz `curl` para `/api/cron-stuck-check`.
- Detecta conversas sem resposta há 3-30min → alerta Telegram.

---

## 7. Agrupamento funcional dos serviços (49 arquivos) — estrutura física real

| Domínio (pasta) | Services | Arquivos |
|---|---|---|
| **`chat/`** | messageHistoryService, interactionsService | 2 |
| **`catalogo/`** | catalogSyncService, googleDriveCatalog, scraperService, scrapingService, importBackupService | 5 |
| **`crm/`** | contactAnalysisService, cobrancasService, stageHistory | 3 |
| **`conhecimento/`** | searchKnowledge, knowledgeGenerator, knowledgeParser, knowledgeExtractor, knowledgeTimestamps | 5 |
| **`foto/`** | photoFlowService, photoMatchingService, photoCacheService, photoRecognitionService, ocrService, awsRekognitionService, imageExtractor, imageReviewService | 8 |
| **`auditoria/`** | agentAuditService, codexAuditService, codexAlertsService, agentLearningsService, learningsAuditService, knowledgeAuditService, whatsappAuditService, instagramAuditService, bagyAuditService | 9 |
| **`ia/`** | deepseek, deepseekBalanceService | 2 |
| **`plataforma/`** | supabaseStorage, systemHealthService, diagnosticService, avatarCacheService, tokenLoggingService, gptmakerCreditsService, weeklyInsightService | 7 |
| **raiz (candidatos Fase 3C)** | catalog, customerProfileService, followUpService, gptmaker, groq, knowledgeDB, opsHealthService, photoHistory | 8 |

> **Atualizado 2026-07-10:** esta tabela agora reflete a **estrutura física real** (Fases 3A + 3B concluídas), não mais um agrupamento lógico teórico. Único ponto em aberto: `photoHistory` semanticamente pertenceria a `foto/`, mas ainda não foi movido — decisão de pasta pendente para a Fase 3C (ver `docs/POS-FASE3B-AUDITORIA.md §6`).

---

## 8. Pontos de atenção arquitetural

1. **Sem camada compartilhada** entre frontend e serverless → regras duplicadas (seção 5). Continua verdadeiro após a Fase 3B — a reorganização não mexeu nisso por design.
2. ~~`src/services/` plano~~ → **Resolvido em 83,7%** (Fases 3A+3B): 41 dos 49 arquivos já organizados em 8 domínios. Restam 8 na raiz, candidatos à Fase 3C (ver `docs/POS-FASE3B-AUDITORIA.md`).
3. **DealOnça é o módulo mais acoplado** (importa serviços de 5 dos 8 domínios já organizados, mais vários da raiz) → qualquer refator de services exige cuidado extra em `DealOncaPage.jsx`. Confirmado repetidamente durante a Fase 3B.
4. **Dois sistemas de agendamento paralelos** (cron Vercel + cron GitHub) sem documentação do porquê.
5. **ServerlessFunctions monolíticas** — `auto-photo.js` (635 linhas) e `cron-diagnosis.js` (797 linhas) concentram muita lógica.
6. **`src/services/__tests__/syncCatalog.test.js` não é um teste seguro** — grava dados reais na tabela `products` de produção quando executado via `npm test`. Descoberto durante a Fase 3B (2026-07-10), não corrigido — ver `docs/FASE3B-RELATORIO-IMPACTO.md §4` (risco #7).

---

**Gerado em:** 2026-07-08 · apenas com dados do repositório.
**Atualizado em:** 2026-07-10 · pós-Fase-3B, reflete a estrutura física real de `src/services/`.
