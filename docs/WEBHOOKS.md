# docs/WEBHOOKS.md — Endpoints Serverless

> **Snapshot:** 2026-07-08 · branch `main`
> **Fonte:** assinaturas extraídas dos 15 arquivos em `api/`.

---

## 1. Visão geral

O backend é **serverless na Vercel** (funções em `api/`). Cada arquivo vira uma rota `/api/<nome>` — exceto os que começam com `_`, que são **helpers internos** (importados por outras funções, não viram rota pública).

### Convenções observadas no código
- Todas exportam `export default async function handler(req, res)`.
- **CORS manual**: funções chamadas pelo browser tratam `OPTIONS` retornando `200` (ex.: `auto-photo.js:406`, `webhook.js:313`).
- **Method guard**: cada função valida `req.method` e devolve `405 Method not allowed` se inadequado.
- **Auth Supabase**: via header `apikey` + `Authorization: Bearer` com `VITE_SUPABASE_KEY` (lê de `process.env`, não do client).

---

## 2. Endpoints públicos (rotas `/api/*`)

### `/api/webhook` — Busca de conhecimento para a Gabriela
- **Arquivo:** `api/webhook.js` (399 linhas)
- **Método:** `POST` (recusa outro com `405`)
- **Quem chama:** GPT Maker (como ferramenta/Step de conhecimento)
- **Payload de entrada** (lê em cascata, campo `prompt` é o principal):
  ```
  req.body.prompt || req.body.pergunta || req.body.message || req.body.conversas[última]
  ```
  Validação em `:239`: se faltar `pergunta`, retorna `{valido: false, erro: 'Campo "pergunta" obrigatório'}`.
- **O que faz:**
  1. Warm-up Supabase paralelo (evita cold start) — `:73`, `:325`
  2. `buscarProdutos(pergunta)` — keywords + score de similaridade, top 5; **retry até 5x** (2s cada) se achar 0 — `:94`
  3. `buscarKnowledge(pergunta)` — entrada `knowledge_gabriela_supabase_completo` — `:159`
  4. `formatarRespostaGPT()` — monta contexto estruturado
- **Resposta 200** (`:389`):
  ```json
  {
    "contexto": "...",
    "dados": {
      "produtos": [ {top 5} ],
      "informacao_adicional": "...inclui total real de variações..."
    }
  }
  ```
- **Erros:** `400` para payload inválido (`:357`, `:378`); catch geral loga e retorna erro.
- **⚠️ Não retorna:** `imageUrl`, `productName`, `productPrice` (causariam "Imagem: null" no template da Gabriela).

---

### `/api/auto-photo` — Envio automático de fotos
- **Arquivo:** `api/auto-photo.js` (635 linhas)
- **Método:** `POST` (`:407` recusa não-POST)
- **Quem chama:** GPT Maker (webhook de automação)
- **Payload:** `{ chat_id }`
- **Fluxo:**
  1. Busca última mensagem do chat via GPT Maker
  2. `detectProductRequest()` — regex de intenção ("manda foto", "me manda imagem"…)
  3. `detectMultiplePhotoRequest()` — "foto dos 2", emoji 1️⃣2️⃣ → múltiplos produtos
  4. `findProductInText()` — matching 2 fases + filtro de categoria (`PALAVRAS_GENERICAS`)
  5. `getCatalog()` — Supabase; em falha usa `CATALOG_FALLBACK` hardcoded (~50 produtos) + alerta CODEX **crítico**
  6. `sendMessage()` — POST imagem no GPT Maker
  7. `await 1000ms` (rate-limit)
  8. `sendMessage()` — preço + link (guarda `link` nulo)
  9. Registra em `photo_history`
- **Respostas de skip (200)** — sai cedo sem erro:
  - `{ok:true, skipped:'agent message'}` (`:417`)
  - `{ok:true, skipped:'no recent photo request found'}` (`:432`)
  - `{ok:true, skipped:'no client message found in chat'}` (`:449`)
  - `{ok:true, skipped:'not a photo request', message: <slice 50>}` (`:457`)
  - `{ok:true, skipped:'could not extract multiple product names'}` (`:475`)
- **Integrações:** GPT Maker (envio + histórico), Supabase (`products`, `photo_history`, `codex_alerts`).

---

### `/api/cron-diagnosis` — DealOnça (supervisor, cron 2x/dia)
- **Arquivo:** `api/cron-diagnosis.js` (797 linhas)
- **Método:** aceita chamada direta; handler em `:553`
- **Agendamento:** `vercel.json` → `0 12 * * *` e `0 18 * * *` (12:00 e 18:00 UTC)
- **Pré-condição:** se faltar variável de ambiente → `500 {ok:false, error:'Variáveis de ambiente faltando'}` (`:557`)
- **Skip:** se 0 conversas → `200 {ok:true, analyzed:0, skipped:'nenhuma conversa encontrada'}` (`:563`)
- **O que faz em uma rodada** (detalhe em `docs/ARCHITECTURE.md` Fluxo C):
  1. Classificação de funil (`detectFunnelStage`)
  2. Motor de objeções (regex) → `objections`
  3. Canal Silencioso → alerta queda WhatsApp
  4. `refineScore` — corrige `buy_score` (trava anti-chute)
  5. `auditAgentResponse` — rubrica 0-10 → `agent_audits`
  6. `proposeAgentFix` — propõe correção de prompt (não auto-aplica) → `agent_learnings`
  7. `checkIgnoredHotLeads` — cobra leads esfriados 20-48h
  8. Insight semanal (1x/semana) → `weekly_insights` + Telegram
  9. Relatório diário → `diagnostics` + alerta CODEX
- **Resposta 200** (`:780`): `{ok:true, analyzed, ...}`
- **Integrações:** GPT Maker, Groq (4 tipos de chamada LLM), Supabase (7 tabelas), Telegram, `_codexAlerts`.

---

### `/api/cron-stuck-check` — Healthcheck de conversas travadas
- **Arquivo:** `api/cron-stuck-check.js` (105 linhas)
- **Método:** handler em `:63`
- **Agendamento:** **NÃO está no `vercel.json`** — roda via **GitHub Action** `.github/workflows/stuck-check.yml` (cron `*/5 * * * *`) que faz `curl -s -f https://ignite-webhook.vercel.app/api/cron-stuck-check`.
- **O que faz:** lista chats do GPT Maker, detecta conversas com cliente sem resposta há 3-30min (Gabriela travada ou GPT Maker fora) → alerta via Telegram.
- **Respostas:**
  - `{ok:true, skipped:'failed to list chats'}` (`:71`)
  - `{ok:true, checked:<n>, alertados:<n>}` (`:100`)
  - `500 {error}` (`:103`)

---

### `/api/scraper` — Scraping server-side
- **Arquivo:** `api/scraper.js` (197 linhas)
- **Método:** `GET` (`:7` recusa não-GET)
- **Query param:** `?url=<url da página do produto>` — obrigatório (`:14` devolve `400` se ausente)
- **O que faz:** busca HTML da URL, extrai nome/preço/imagem via regex/meta tags (loja `primestoremen.com.br`).
- **Respostas:** `200 {dados}` (`:39`); `400` fetch falhou (`:29`); `500` erro (`:42`).
- **Uso:** chamado por `src/services/scraperService.js` para contornar CORS do browser.

---

### `/api/telegram-alert` — **removido em 2026-07-11**
Existiu para centralizar alertas Telegram vindos de intenções do GPT Maker, mas auditoria ao vivo (`GET /v2/agent/{id}/intentions` nos 4 agentes do workspace) confirmou que **nenhuma** intenção apontava pra essa rota — as 5 intenções de alerta (Pedido grande, Cliente Insatisfeito, Novo Lead, Venda Confirmada, Alerta rafael) sempre chamaram `api.telegram.org` **diretamente**, com o token do bot embutido na própria URL configurada no painel. `cron-diagnosis.js` e `cron-stuck-check.js` também chamam `api.telegram.org` direto, sem passar por essa rota. Órfão confirmado, removido sem impacto — alertas continuam funcionando normalmente pelos caminhos diretos.

**Atualização 2026-08-13:** a intention "Alerta rafael" deixou de chamar `api.telegram.org` direto **só no agente GABY LAB** — passou a chamar `?tool=alerta-inteligente` em `api/system-tools.js` (Alerta Inteligente V1, homologado). Os outros 4 tipos de alerta e a Gabriela de produção continuam exatamente como descrito acima. Ver `docs/integrations/ALERTA-INTELIGENTE.md`.

---

### `/api/bagy-audit` — Auditoria da loja Bagy/Dooca
- **Arquivo:** `api/bagy-audit.js` (210 linhas)
- **Método:** handler em `:116`
- **Query params:** `runId`, `offset` (default 0), `limit` (default 25, máx 50), `finalize=1` — processa em lotes.
- **Pré-condição:** se Supabase não configurado → `500` (`:118`).
- **O que faz:** compara `sitemap.xml` da loja vs catálogo interno; acha divergências de preço/nome, produtos sumidos ou órfãos.
- **Respostas:** `200 {done:true, finalized:true, missingInBagy}` (`:152`); `200 {offset, ...}` (`:199`) para paginação.

### `/api/bagy-audit-ignore` — Marcar divergência como ignorada
- **Arquivo:** `api/bagy-audit-ignore.js` (34 linhas)
- **Método:** `POST` (`:11` recusa não-POST)
- **Payload:** `{id}` — obrigatório (`:16`)
- **Resposta:** `200 {success:true}` (`:30`); `500` Supabase (`:29`, `:32`).

---

### `/api/cache-avatar` — Bypass CORS para avatares
- **Arquivo:** `api/cache-avatar.js` (63 linhas)
- **Método:** `POST` (`:18` recusa não-POST)
- **Payload:** `{contactId, url}` — obrigatórios (`:24` devolve `400`)
- **O que faz:** baixa foto de perfil server-to-server (bypass do CORS do CDN do Instagram), salva no bucket `avatars` do Supabase.
- **Fallback gracioso:** se download ou upload falhar, devolve a URL original sem quebrar o app (`:29`, `:44`).
- **Resposta:** `200 {url}` — sempre a URL a ser usada (`:58`).

---

### `/api/embed-knowledge` — Indexação semântica (RAG)
- **Arquivo:** `api/embed-knowledge.js` (93 linhas)
- **Método:** `POST` (`:43`)
- **Pré-condição:** `COHERE_API_KEY` — se ausente → `500` (`:45`).
- **O que faz:** indexa entradas da tabela `knowledge` com embeddings Cohere (`embed-multilingual-v3.0`) para busca vetorial.
- **Skip:** se tudo já tem embedding → `200 {message:'Todas as entradas já têm embedding', total:0}` (`:57`).
- **Resposta:** `200 {total, ...}` (`:83`).
- **Uso:** execução manual pontual (não é cron).

---

### `/api/gptmaker-credits` — Saldo de créditos do GPT Maker
- **Arquivo:** `api/gptmaker-credits.js` (48 linhas)
- **Método:** `GET` (`:9` recusa não-GET)
- **Pré-condição:** token configurado — senão `500` (`:6`).
- **O que faz:** proxy GET para checar saldo de créditos do GPT Maker.
- **Fallback mockado:** se falhar, retorna `1584` (mock) para não quebrar o card do dashboard (`:35`).
- **Resposta:** `200 {créditos}` (`:25` real / `:35` mock).

---

### `/api/log-history` — Log de ações do catálogo
- **Arquivo:** `api/log-history.js` (56 linhas)
- **Método:** `POST` (`:8` recusa não-POST)
- **Payload:** `{action, produto_nome}` — obrigatórios (`:15`)
- **O que faz:** registra add/edit/delete na tabela `catalog_history`.
- **Comportamento resiliente:** mesmo em erro, retorna `200 {success:true, logged:false, error}` (`:44`, `:54`) — o log nunca derruba a ação do usuário.

---

## 3. Helpers internos (prefixo `_` — não viram rota)

| Arquivo | Exporta | Usado por |
|---|---|---|
| `_codexAlerts.js` | `logCodexAlert()` — grava em `codex_alerts`; **fail-safe** (nunca quebra quem chama) | `auto-photo.js`, `cron-diagnosis.js`, `_customerScoring.js` |
| `_customerScoring.js` | Atualiza `customer_profiles` por mensagem + dispara alerta `lead_quente` quando `buy_score` cruza 70 | (importado por orquestrador) |
| `_scoring.js` | `calcBuyScore(text, msgCount)` + extração de features (CEP, tamanho, marcas, tags) | `_customerScoring.js`. **Cópia de** `src/services/customerProfileService.js:179` |

---

## 4. Agendamentos (crons)

| Função | Onde agendado | Schedule |
|---|---|---|
| `cron-diagnosis` | `vercel.json` | `0 12 * * *` e `0 18 * * *` (12h e 18h UTC) |
| `cron-stuck-check` | **GitHub Action** (não Vercel) | `*/5 * * * *` (a cada 5 min) |

> **Atenção:** dois sistemas de agendamento paralelos. O `cron-stuck-check` roda via GitHub porque não está no `vercel.json`.

---

## 5. Tabelas Supabase tocadas pelo serverless

`products`, `knowledge`, `photo_history`, `objections`, `diagnostics`, `agent_audits`, `agent_learnings`, `weekly_insights`, `customer_profiles`, `codex_alerts`, `bagy_audit_log`, `avatar_cache`, `catalog_history`.

(Detalhe de schema e RLS em `docs/SUPABASE.md`.)

---

## 6. Rate-limits e guardas críticos

| Regra | Onde | Por quê |
|---|---|---|
| **1000ms entre imagem e preço** | `auto-photo.js` (fluxo B) | GPT Maker throttle após 6 msgs em <500ms; erros silenciosos |
| **Retry 5x com 2s** se 0 produtos | `webhook.js:142` | Evita resposta vazia por cold start/índice |
| **`logCodexAlert` fail-safe** | `_codexAlerts.js` | Alerta nunca derruba o fluxo principal |
| **`log-history` sempre 200** | `log-history.js` | Log falho não bloqueia ação do usuário |
| **`cache-avatar` fallback URL original** | `cache-avatar.js:29,44` | Avatar sem cache não quebra UI |
| **`gptmaker-credits` mock 1584** | `gptmaker-credits.js:35` | Card não trava em "Carregando..." |

---

**Gerado em:** 2026-07-08 · apenas com dados do repositório (`api/*.js`).
