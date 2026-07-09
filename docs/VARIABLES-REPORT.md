# Relatório de Variáveis de Ambiente — Divergências, Órfãs e Riscos

> **Snapshot:** 2026-07-08 · branch `main`
> **Metodologia:** grep `import.meta.env.` em `src/` + `process.env.` em `api/` + `scripts/` + `vite.config.js`
> **Fontes cruzadas:** `.env`, `.env.local`, `CLAUDE.md`, `docs/DEPLOY.md §3`, `vercel.json`

---

## 1. Classificação completa (27 variáveis)

### ✅ CONFIRMADAS (usadas no código — grep positivo): 22

| # | Variável | `.env` | `.env.local` | CLAUDE.md | Grep | Onde |
|---|---|---|---|---|---|---|
| 1 | `VITE_SUPABASE_URL` | ✅ | ✅ | ✅ | ✅ 41 refs | src/ (25) + api/ (16) |
| 2 | `VITE_SUPABASE_KEY` | ✅ | ✅ | ✅ | ✅ 41 refs | src/ (25) + api/ (16) |
| 3 | `VITE_GPTMAKER_TOKEN` | ✅ | ✅ | ✅ | ✅ 6 refs | src/ (2) + api/ (4) |
| 4 | `VITE_GPTMAKER_USER_TOKEN` | ✅ | ✅ | ✅ | ✅ 3 refs | src/ (2) + api/ (1) |
| 5 | `VITE_GPTMAKER_WORKSPACE` | ✅ | ✅ | ✅ | ✅ 5 refs | src/ (2) + api/ (3) |
| 6 | `VITE_GPTMAKER_URL` | — | ✅ | — | ✅ 2 refs | src/ (1) + api/ (1) |
| 7 | `VITE_GROQ_API_KEY` | — | ✅ | ✅ | ✅ 5 refs | src/ (4) + api/ (1) |
| 8 | `VITE_DEEPSEEK_API_KEY` | — | ✅ | ✅ | ✅ 2 refs | src/ (2) |
| 9 | `VITE_GOOGLE_DRIVE_API_KEY` | — | ✅ | ✅ | ✅ 1 ref | src/ (1) |
| 10 | `VITE_GOOGLE_DRIVE_FOLDER_ID` | — | ✅ | ✅ | ✅ 2 refs | src/ (1) + scripts/ (1) |
| 11 | `COHERE_API_KEY` | — | ✅ | ✅ | ✅ 1 ref | api/ (1) |
| 12 | `VITE_AWS_ACCESS_KEY` | ✅ | — | — | ✅ 2 refs | src/ (2) |
| 13 | `VITE_AWS_SECRET_KEY` | ✅ | — | — | ✅ 1 ref | src/ (1) |
| 14 | `VITE_AWS_REGION` | ✅ | — | — | ✅ 1 ref | src/ (1) |
| 15 | `VITE_OPENROUTER_KEY` | ✅ | — | — | ✅ 2 refs | src/ (2) |
| 16 | `VITE_BASE44_APP_ID` | — | ✅ | ✅ | ✅ 1 ref | src/ (1) |
| 17 | `GOOGLE_OAUTH_CLIENT_ID` | — | ✅ | ✅ | ✅ 1 ref | scripts/ (1) |
| 18 | `GOOGLE_OAUTH_CLIENT_SECRET` | — | ✅ | ✅ | ✅ 1 ref | scripts/ (1) |
| 19 | `TELEGRAM_BOT_TOKEN` | — | — | — | ✅ 3 refs | api/ (3) |
| 20 | `TELEGRAM_CHAT_ID` | — | — | — | ✅ 3 refs | api/ (3) |
| 21 | `BAGY_STORE_URL` | — | — | — | ✅ 1 ref | api/ (1) |
| 22 | `VITE_GOOGLE_VISION_KEY` | — | — | — | ✅ 1 ref | src/ (1) |
| 23 | `VITE_OPENAI_API_KEY` | — | — | — | ✅ 1 ref | src/ (1) |

### ⚠️ ÓRFÃS PARCIAIS (nos env mas sem grep direto — usadas indiretamente): 3

| # | Variável | `.env` | `.env.local` | CLAUDE.md | Grep | Explicação |
|---|---|---|---|---|---|---|
| 24 | `VITE_GPTMAKER_EMAIL` | ✅ | ✅ | ✅ | ❌ 0 refs | Usada por scripts operacionais (`token-receiver.js`, `renovar-token.sh`) que provavelmente leem `.env` via dotenv ou hardcode. NÃO é import.meta.env/process.env. |
| 25 | `VITE_GPTMAKER_PASSWORD` | ✅ | ✅ | ✅ | ❌ 0 refs | Mesma situação — scripts operacionais. |
| 26 | `VITE_BASE44_API_KEY` | — | ✅ | ✅ | ❌ 0 refs | Possivelmente usada em runtime dinâmico via SDK Base44, não capturada pelo grep simples. |

### 🏗️ BUILD-TIME (injetadas pela Vercel, não definidas manualmente): 2

| # | Variável | Fonte | Virá | Grep |
|---|---|---|---|---|
| 27 | `VERCEL` | Vercel auto-injeta | `__IS_VERCEL__` | vite.config.js |
| 28 | `VERCEL_GIT_COMMIT_SHA` | Vercel auto-injeta | `__COMMIT_SHA__` | vite.config.js |

---

## 2. Divergências entre `.env` e `.env.local`

### 2.1 🔴 CRÍTICA: Workspace ID divergente

| Variável | `.env` | `.env.local` | CLAUDE.md (correto) |
|---|---|---|---|
| `VITE_GPTMAKER_WORKSPACE` | `3F300E7C**5D0E**4105BE046E0E9A5EC274` | `3F300E7C**6105**E0123A946E0E9A5EC274` | `3F300E7C**6105**E0123A946E0E9A5EC274` |

**O `.env` tem um workspace diferente** — `5D0E` vs `6105`. O `.env.local` e o CLAUDE.md concordam no valor `...C6105E0123A946E...`. O `.env` provavelmente tem um **ID antigo ou com typo**.

**Risco:** Se o `.env` tiver prioridade em algum contexto (ex.: script que não carrega `.env.local`), o sistema se conecta ao workspace errado.

**Recomendação:** Corrigir o `.env` para bater com o `.env.local`.

### 2.2 Valores divergentes legítimos (tokens que expiram)

| Variável | `.env` | `.env.local` | Explicação |
|---|---|---|---|
| `VITE_GPTMAKER_TOKEN` | JWT diferente | JWT diferente | São tokens de sessão diferentes — a `.env.local` é mais recente. |
| `VITE_GPTMAKER_USER_TOKEN` | JWT diferente | JWT diferente | Mesmo caso — tokens diferentes por período. |

**Não é bug** — é esperado que os tokens divergam entre os arquivos (expirem e sejam renovados).

### 2.3 Variáveis só no `.env` (não no `.env.local`)

| Variável | Explicação |
|---|---|
| `VITE_AWS_ACCESS_KEY` | Credenciais AWS — só no `.env` (não migradas para `.env.local`) |
| `VITE_AWS_SECRET_KEY` | Idem |
| `VITE_AWS_REGION` | Idem |
| `VITE_OPENROUTER_KEY` | Key OpenRouter — só no `.env` |

**Risco:** Se o `.env` for deletado ou ignorado, AWS Rekognition e OpenRouter param de funcionar.

### 2.4 Variáveis só no `.env.local` (não no `.env`)

| Variável | Explicação |
|---|---|
| `VITE_GROQ_API_KEY` | Adicionada depois — não foi propagada para `.env` |
| `VITE_DEEPSEEK_API_KEY` | Idem |
| `VITE_GOOGLE_DRIVE_API_KEY` | Idem |
| `VITE_GOOGLE_DRIVE_FOLDER_ID` | Idem |
| `COHERE_API_KEY` | Idem |
| `VITE_GPTMAKER_URL` | Idem |
| `VITE_BASE44_APP_ID` | Idem |
| `VITE_BASE44_API_KEY` | Idem |
| `GOOGLE_OAUTH_CLIENT_ID` | Scripts locais — não precisa ir para `.env` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Idem |

**Risco:** O `.env` está **desatualizado** — não reflete as variáveis adicionadas após a criação inicial. Em ambientes sem `.env.local`, várias funcionalidades quebram.

---

## 3. Variáveis FALTANTES (usadas no código, em nenhum `.env` local)

Estas variáveis são referenciadas no código mas **não existem em `.env` nem `.env.local`**. Provavelmente existem apenas como variáveis de ambiente na Vercel:

| # | Variável | Arquivos que usam | Prefixo | Onde provavelmente existe |
|---|---|---|---|---|
| 1 | `TELEGRAM_BOT_TOKEN` | telegram-alert.js, cron-diagnosis.js, cron-stuck-check.js | Sem VITE_ | **Vercel only** |
| 2 | `TELEGRAM_CHAT_ID` | telegram-alert.js, cron-diagnosis.js, cron-stuck-check.js | Sem VITE_ | **Vercel only** |
| 3 | `BAGY_STORE_URL` | bagy-audit.js | Sem VITE_ | **Vercel only** |
| 4 | `VITE_GOOGLE_VISION_KEY` | photoRecognitionService.js | Com VITE_ | **Vercel only** (?) |
| 5 | `VITE_OPENAI_API_KEY` | photoRecognitionService.js | Com VITE_ | **Vercel only** (?) |

**Risco:** Se alguém clonar o repo e criar um `.env` a partir do `.env.example`, as funcionalidades que dependem dessas variáveis quebrarão localmente (Telegram alerts, Bagy audit, Google Vision, OpenAI).

---

## 4. Variáveis no CLAUDE.md que não constam nos `.env`

| Variável | CLAUDE.md §8 menciona | `.env` | `.env.local` | Status |
|---|---|---|---|---|
| `VITE_SUPABASE_ANON_KEY` | ✅ listada como exemplo | — | — | **Provavelmente é a mesma que `VITE_SUPABASE_KEY`** — nome alternativo no CLAUDE.md |
| `NEXT_PUBLIC_VERCEL_URL` | ✅ listada | — | — | **Órfã** — não encontrada em nenhum grep |

---

## 5. Resumo final

### Matriz consolidada

| Categoria | Quantidade | Lista |
|---|---|---|
| **Confirmadas (grep +)** | 23 | #1–#23 acima |
| **Órfãs parciais** | 3 | `VITE_GPTMAKER_EMAIL`, `VITE_GPTMAKER_PASSWORD`, `VITE_BASE44_API_KEY` |
| **Faltantes nos env locais** | 5 | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `BAGY_STORE_URL`, `VITE_GOOGLE_VISION_KEY`, `VITE_OPENAI_API_KEY` |
| **Build-time** | 2 | `VERCEL`, `VERCEL_GIT_COMMIT_SHA` |
| **Divergência crítica** | 1 | `VITE_GPTMAKER_WORKSPACE` (ID diferente no `.env`) |
| **Total** | **28** | (incluindo build-time) |

---

## 6. Ações recomendadas (NÃO executar automaticamente)

| # | Ação | Prioridade | Risco se não fizer |
|---|---|---|---|
| 1 | **Corrigir `VITE_GPTMAKER_WORKSPACE` no `.env`** para bater com `.env.local` (`...C6105E0123A946E...`) | 🔴 Alta | Workspace errado em contextos sem `.env.local` |
| 2 | **Propagar variáveis do `.env.local` para o `.env`** (Groq, DeepSeek, Drive, Cohere, Base44, GPTMaker URL) | 🟡 Média | `.env` desatualizado — referencia incompleta |
| 3 | **Adicionar `VITE_SUPABASE_ANON_KEY` como alias** ou remover do CLAUDE.md (provavelmente é `VITE_SUPABASE_KEY`) | 🟡 Média | Confusão de nomenclatura |
| 4 | **Remover `NEXT_PUBLIC_VERCEL_URL` do CLAUDE.md** se não é usada | 🟢 Baixa | Documentação enganosa |
| 5 | **Documentar variáveis Vercel-only** (`TELEGRAM_*`, `BAGY_STORE_URL`, `VITE_GOOGLE_VISION_KEY`, `VITE_OPENAI_API_KEY`) no `.env.example` com comentário "Vercel only" | 🟡 Média | Já feito neste relatório e no `.env.example` |
| 6 | **Verificar se `VITE_BASE44_API_KEY` é usada em runtime** (SDK Base44 pode fazer acesso dinâmico) | 🟢 Baixa | Pode ser órfã de verdade |

---

## 7. Riscos consolidados

| Risco | Severidade | Detalhe |
|---|---|---|
| Workspace ID errado no `.env` | 🔴 Alto | Conexão ao workspace GPT Maker errado |
| `.env` desatualizado (7 vars faltando) | 🟡 Médio | Referência incompleta para novos desenvolvedores |
| 5 variáveis só na Vercel | 🟡 Médio | Funcionalidades quebram localmente |
| Token User expira silenciosamente | 🟡 Médio | 0 conversas sem erro no console |
| Prefixo `VITE_` em secrets server-side | 🟡 Médio | `VITE_AWS_*` vazam pro navegador — AWS keys expostas |
| `COHERE_API_KEY` sem prefixo `VITE_` no `.env.local` | 🟢 Baixo | Correto — é server-side only (api/embed-knowledge.js) |

---

**Gerado em:** 2026-07-08 · Fase 2 da reorganização.
**Metodologia:** grep direcionado em `src/`, `api/`, `scripts/`, `vite.config.js`. Sem alteração de código.
