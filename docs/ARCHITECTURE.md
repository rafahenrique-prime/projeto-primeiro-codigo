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
│   └── services/    (49)       ← lista plana, sem hierarquia de domínio
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

### 4.1 Services mais consumidos (incoming — top fanout)

| Rank | Service | # consumers | Principais consumidores |
|---|---|---|---|
| 1 | `gptmaker` | 12 | AgentLab, AgentsPage, ChannelsPage, Contacts*, DealOncaPage, FollowUpPage, KnowledgePage, RelatoriosPage, ChatArea, RightPanel, App.jsx |
| 2 | `catalog` | 8 | DealOncaPage, ExtractorPage, ImageExtractorPage, SimuladorCliente, ChatArea, RightPanel, App.jsx, main.jsx |
| 3 | `groq` | 7 | AgentLab, DealOncaPage, KnowledgePage, SimuladorCliente, ChatArea, RightPanel |
| 4 | `customerProfileService` | 6 | Contacts*, DealOncaPage, ChatArea, App.jsx |
| 5 | `knowledgeDB` | 4 | ContactsNew, DealOncaPage, KnowledgePage, ChatArea |
| 6 | `photoHistory` | 4 | SimuladorCliente, ChatArea, PhotoHistoryPanel, RightPanel |
| 7 | `followUpService` | 3 | DealOncaPage, FollowUpPage, App.jsx |

### 4.2 Hub interno (services que importam muitos services)
- **`opsHealthService`** importa **10** services — é o agregador de inteligência operacional: `bagyAuditService, systemHealthService, knowledgeAuditService, learningsAuditService, whatsappAuditService, instagramAuditService, agentAuditService, knowledgeDB, agentLearningsService, gptmaker`.

### 4.3 Dependências service→service (grafo interno)
```
catalog            → gptmaker
catalogSyncService → knowledgeGenerator
contactAnalysisService → deepseek
deepseek           → tokenLoggingService
followUpService    → gptmaker, groq
groq               → customerProfileService, stageHistory, deepseek
importBackupService → catalog
instagramAuditService → gptmaker
knowledgeAuditService → knowledgeDB, deepseek
knowledgeExtractor → catalog
learningsAuditService → agentLearningsService, deepseek
opsHealthService   → (10 services — ver acima)
photoFlowService   → photoCacheService
photoMatchingService → catalog
systemHealthService → gptmaker
whatsappAuditService → gptmaker
```
O grafo é **DAG** (sem ciclos). `catalog → gptmaker` e `groq → customerProfileService` não fecham loop.

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

## 7. Agrupamento funcional dos serviços (49 arquivos)

| Domínio | Services |
|---|---|
| **Chat** | gptmaker, messageHistoryService, interactionsService |
| **Catálogo** | catalog, catalogSyncService, googleDriveCatalog, scraperService, scrapingService, importBackupService |
| **Cliente/CRM** | customerProfileService, contactAnalysisService, followUpService, cobrancasService, stageHistory |
| **Conhecimento** | knowledgeDB, searchKnowledge, knowledgeGenerator, knowledgeParser, knowledgeExtractor, knowledgeTimestamps |
| **Foto** | photoFlowService, photoMatchingService, photoCacheService, photoHistory, photoRecognitionService, ocrService, awsRekognitionService, imageExtractor, imageReviewService |
| **Auditoria** | agentAuditService, codexAuditService, codexAlertsService, agentLearningsService, learningsAuditService, knowledgeAuditService, whatsappAuditService, instagramAuditService, bagyAuditService |
| **IA** | groq, deepseek, deepseekBalanceService |
| **Plataforma/Util** | supabaseStorage, systemHealthService, opsHealthService, diagnosticService, avatarCacheService, tokenLoggingService, gptmakerCreditsService, weeklyInsightService |

> Atualmente todos estão em `src/services/` sem subpastas. O agrupamento acima é **lógico** (para entendimento), não reflete a estrutura física.

---

## 8. Pontos de atenção arquitetural

1. **Sem camada compartilhada** entre frontend e serverless → regras duplicadas (seção 5).
2. **`src/services/` plano** → 49 arquivos sem hierarquia dificultam navegação eownership clara.
3. **DealOnça é o módulo mais acoplado** (importa 14 services) → qualquer refator de services exige cuidado extra em `DealOncaPage.jsx`.
4. **Dois sistemas de agendamento paralelos** (cron Vercel + cron GitHub) sem documentação do porquê.
5. **ServerlessFunctions monolíticas** — `auto-photo.js` (635 linhas) e `cron-diagnosis.js` (797 linhas) concentram muita lógica.

---

**Gerado em:** 2026-07-08 · apenas com dados do repositório.
