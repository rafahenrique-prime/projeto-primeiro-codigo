# Relacionamento: GPT Maker vs Webhooks (Serverless Functions)

> **Snapshot:** 2026-07-08 · branch `main`
> **Fonte:** `docs/ARCHITECTURE.md`, `docs/WEBHOOKS.md`, `docs/DEPLOY.md`, `CLAUDE.md`

---

## 1. Visão geral

O **GPT Maker** (`api.gptmaker.ai`) é o orquestrador central do CRM. Ele recebe mensagens de WhatsApp/Instagram, chama webhooks no app para buscar contexto, e envia a resposta final ao cliente. A IA "Gabriela" é um agente configurada dentro do GPT Maker.

```
Cliente (WhatsApp/Instagram)
       │ mensagem
       ▼
┌──────────────────────────────────────────┐
│          GPT Maker (nuvem)               │
│  • Recebe mensagem                       │
│  • Gabriela (agente IA) processa        │
│  • Dispara webhooks para buscar dados   │
│  • Monta resposta final                 │
│  • Envia resposta ao cliente            │
└──┬──────────┬──────────────┬─────────────┘
   │          │              │
   ▼          ▼              ▼
/api/webhook  /api/auto-photo  /api/knowledge
   │          │              │
   ▼          ▼              ▼
 Supabase   Supabase +     Supabase
            GPT Maker      (texto puro)
```

---

## 2. Webhook: `/api/webhook` — Busca de contexto

**Gatilho:** O GPT Maker chama este webhook como **Step 2** (configurado no painel do GPT Maker) para **toda mensagem** do cliente.

**Variáveis usadas:**
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` — buscar knowledge + produtos
- `VITE_GPTMAKER_TOKEN` / `VITE_GPTMAKER_WORKSPACE` — identificar workspace

**O que faz:**
1. Warm-up do Supabase (evita cold start)
2. `buscarProdutos()` — keywords + score de similaridade, top 5, retry 5x se 0 resultados
3. `buscarKnowledge()` — busca entrada `knowledge_gabriela_supabase_completo`
4. `formatarRespostaGPT()` → retorna `{contexto, dados: {produtos, informacao_adicional}}`

**REGRA CRÍTICA:** NÃO retorna `imageUrl`, `productName`, `productPrice` — isso causa "Imagem: null" na resposta.

---

## 3. Webhook: `/api/auto-photo` — Envio automático de fotos

**Gatilho:** O GPT Maker chama quando detecta que o cliente pediu foto ("manda foto", "me manda imagem", etc).

**Variáveis usadas:**
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` — buscar produto
- `VITE_GPTMAKER_TOKEN` / `VITE_GPTMAKER_WORKSPACE` / `VITE_GPTMAKER_USER_TOKEN` — enviar mensagens
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — alerta de erros

**O que faz:**
1. `detectProductRequest()` — regex para identificar pedido de foto
2. `detectMultiplePhotoRequest()` — "foto dos 2", emojis 1️⃣2️⃣
3. `findProductInText()` — matching 2 fases + filtro de categoria
4. `getCatalog()` — Supabase; fallback `CATALOG_FALLBACK` se cair
5. `sendMessage()` — envia imagem ao cliente via GPT Maker
6. **`await 1000ms`** — rate-limit obrigatório
7. `sendMessage()` — preço + link
8. Registra em `photo_history`

**REGRA CRÍTICA:** Delay de **1000ms mínimo** entre imagem e preço. <1000ms gera 429.

---

## 4. Webhook: `/api/knowledge` — Consulta base de conhecimento

**Gatilho:** Configurado como Step no GPT Maker para consultas à base de conhecimento.

**O que faz:** Retorna texto puro com informações adicionais e produtos relevantes.

**REGRA CRÍTICA:** Mesma regra do webhook — não retorna imageUrl.

---

## 5. Autenticação GPT Maker

O sistema usa **dois tipos de token** do GPT Maker:

| Token | Variável | Expira | Uso |
|---|---|---|---|
| **API Token** | `VITE_GPTMAKER_TOKEN` | Não expira | Autenticação de API (serverless + frontend) |
| **User Token** | `VITE_GPTMAKER_USER_TOKEN` | ~24h | Sessão do usuário (card de créditos, busca de chats) |

**Risco:** O User Token expira diariamente. Sem ele:
- Card de créditos mostra "Token expirado"
- App carrega com "0 conversas"
- Sintoma silencioso (sem erro no console)

---

## 6. Compartilhamento de variáveis entre frontend e serverless

As funções `api/` usam `process.env.VITE_*` (o Vercel injeta tanto `VITE_*` quanto `process.env.*`). O mesmo nome de variável serve para ambos os lados:

| Variável | `src/` (import.meta.env) | `api/` (process.env) |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ 25 arquivos | ✅ 11 arquivos |
| `VITE_SUPABASE_KEY` | ✅ 25 arquivos | ✅ 11 arquivos |
| `VITE_GPTMAKER_TOKEN` | ✅ 2 arquivos | ✅ 4 arquivos |
| `VITE_GPTMAKER_WORKSPACE` | ✅ 2 arquivos | ✅ 3 arquivos |

> **Nota:** No Vercel, variáveis `VITE_*` definidas no painel são acessíveis como `process.env.VITE_*` no serverless. Por isso os arquivos `api/` usam `process.env.VITE_SUPABASE_URL` etc.

---

## 7. Fluxo de erro

```
Webhook recebe request
       │
       ├── Supabase cai? → CATALOG_FALLBACK (json hardcoded) + alerta CODEX
       ├── Rate-limit 429? → Erro logado + alerta Telegram
       ├── Token expirado? → "Erro ao mudar modo. Token pode ter expirado"
       └── Produto não encontrado? → Busca fuzzy com score de similaridade
```

---

## 8. Riscos

| Risco | Sintoma | Mitigação |
|---|---|---|
| Token GPTMaker expirado | Card créditos quebra, 0 conversas | Renovar diariamente no .env.local + Vercel |
| Delay <1000ms no auto-photo | 429 silencioso, fotos não chegam | Regra obrigatória de 1000ms |
| CATALOG_FALLBACK desatualizado | Produtos errados enviados | Manter sync com Supabase |
| Webhook retorna imageUrl | "Imagem: null" na resposta | NUNCA retornar imageUrl do webhook |
| Supabase cold start | Primeira request lenta | Warm-up no webhook.js |

---

**Gerado em:** 2026-07-08 · Fase 2 da reorganização.
