# PROJECT_CONTEXT.md — IGNITE PRIME CRM

> **Status do repositório no momento desta documentação:** 2026-07-08
> **Snapshot-base:** branch `main`, commit `dff7619`
> **Fonte de dados:** apenas arquivos do próprio repositório (código, configs, migrações, CLAUDE.md). Nada inferido de conhecimento externo.

---

## 1. O que é este projeto

**IGNITE PRIME CRM** é um painel de atendimento comercial para a loja de moda masculina **PRIME STORE**. O coração do sistema é a IA-vendedora **"Gabriela"**, que atende clientes em **WhatsApp** e **Instagram**, orquestrada pelo **GPT Maker** (conectado à **Z-API** para WhatsApp). Um supervisor comercial chamado **"DealOnça"** audita o desempenho da Gabriela.

Não é um e-commerce com check-out: é um **CRM conversacional** cujo objetivo é converter conversas em vendas, com suporte humano em copilot quando necessário.

### Repositório Git
- **Origin:** `https://github.com/rafahenrique-prime/projeto-primeiro-codigo.git`
- **Mantenedor:** Rafael Henrique (`rafa_henrique@icloud.com`)
- **Branch principal:** `main`
- **Total de branches no snapshot:** 34 (maoria `claude/*` de worktrees efêmeras)

---

## 2. Componentes do repositório

O repositório contém **três produtos distintos** que convivem na mesma árvore:

| Componente | Caminho | O que é | Deploy |
|---|---|---|---|
| **App principal (CRM)** | `src/`, `api/`, `supabase/` | Painel React + funções serverless | Vercel (`ignite-webhook`) |
| **Catálogo público** | `catalogo-publico/` | Site HTML estático que lê fotos do Google Drive | Vercel (`catalogo-publico`, projeto separado) |
| **Backup de referência** | `dealism-backup/` | Snapshot estático de outro produto (Dealism), 101 MB | Não é deployado |

> **Relação entre os três:** o app principal e o catálogo público compartilham o repositório mas têm projetos Vercel independentes. O `dealism-backup` é material de referência histórica (engenharia reversa do produto que inspirou o IGNITE PRIME) e **não é referenciado em runtime** — zero imports de `src/` ou `api/`.

---

## 3. Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19.2 + Vite 8 (`@vitejs/plugin-react`) |
| Roteamento (client) | Sem framework — switch por `page` em `src/App.jsx` |
| Charts | `recharts` 3.9 |
| Ícones | `lucide-react` 1.18 |
| Backend serverless | Vercel Functions (Node, 15 arquivos em `api/`) |
| Banco de dados | Supabase (PostgreSQL + Storage + REST) |
| ORM/SDK | `@base44/sdk` 0.8 (usado em `cobrancasService`); acesso Supabase via `fetch` direto à REST API |
| Scraping | `playwright` 1.61 (devDependency) |
| Testes | `vitest` 2.0 |

**Observações do `package.json`:**
- `"type": "module"` — todo `.js` é tratado como ESM.
- Não há framework de UI (Material/Tailwind/etc.) — estilos são inline (`style={{...}}`) com tokens de `src/theme.jsx`.
- Há dependências que parecem de servidor (`express`, `cors`, `aws-sdk`) — `express`/`cors` servem ao `token-receiver.js` (servidor local de dev), e `aws-sdk` ao `awsRekognitionService.js`.

---

## 4. Integrações externas

| Integração | Propósito | Onde mora a configuração |
|---|---|---|
| **GPT Maker** (`api.gptmaker.ai`) | Orquestra a Gabriela: chats, modos autopilot/copilot, envio de mensagens, créditos | `VITE_GPTMAKER_*` |
| **Z-API** | Ponte WhatsApp — chega via GPT Maker | (transparente) |
| **Instagram** | DMs — chegam via GPT Maker | (transparente) |
| **Supabase** | Postgres + Storage (avatars, fotos de catálogo) | `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` |
| **Groq** (`api.groq.com`) | LLM do DealOnça: diagnóstico, auditoria, insights, fallback de modelos | `VITE_GROQ_API_KEY` |
| **DeepSeek** | Análise de contato | `VITE_DEEPSEEK_API_KEY` |
| **Cohere** | Embeddings da base de conhecimento (RAG) | `COHERE_API_KEY` |
| **Telegram Bot API** | Alertas (lead quente, canal caído, relatório semanal) | (token via variável) |
| **AWS Rekognition** | Reconhecimento de foto do cliente | `VITE_AWS_*` |
| **Google Drive** | Catálogo rascunho (fotos) + catálogo público | `VITE_GOOGLE_DRIVE_*` / `GOOGLE_OAUTH_*` |
| **Bagy/Dooca** | Loja online (`primestoremen.com.br`) — auditoria de sitemap + scraping | (sem credencial própria, scraping público) |
| **Base44** | Serviço de cobranças | `@base44/sdk` |

---

## 5. Domínio funcional (o que o sistema faz)

1. **Inbox inteligente** — lista conversas do WhatsApp/Instagram, prioriza por: humano-aguardando > score de compra alto > lead esfriando. Refresh a cada 30s, follow-up a cada 60s, cache de avatares em background.
2. **Atendimento em tempo real** — cliente escreve → GPT Maker chama `/api/webhook` → busca produtos + base de conhecimento no Supabase → devolve contexto estruturado → Gabriela responde.
3. **Auto-foto** — quando o cliente pede "manda foto", `/api/auto-photo` detecta a intenção, faz matching de produto e envia imagem + preço + link sozinho, com delay mínimo de 1000ms entre imagem e preço (rate-limit do GPT Maker).
4. **Scoring de cliente** — cada mensagem recalcula `buy_score`; ao cruzar 70 dispara alerta de lead quente (Telegram + painel DealOnça).
5. **Supervisor comercial (DealOnça)** — cron 2x/dia classifica funil, audita respostas da Gabriela com rubrica 0-10, corrige scores, propõe correções no prompt dela (nunca auto-aplica), cobra leads esfriados, gera insight semanal.
6. **Catálogo** — CRUD de produtos no Supabase, sincronização, importação via scraping, catálogo rascunho via Google Drive, catálogo público via Google Drive.
7. **Inteligência operacional** — auditorias de WhatsApp, Instagram, knowledge base, aprendizados, código e loja Bagy, consolidadas num painel (`IntelligenceOpsPage`).

---

## 6. Convenções e regras críticas (resumo)

Extraídas do `CLAUDE.md`. Detalhes completos estão lá; aqui só o essencial para contexto:

- **Token GPTMaker expira ~24h** e vive em `.env.local`, nunca em `.env`.
- **Workspace ID é imutável:** `3F300E7C6105E0123A946E0E9A5EC274`.
- **Rate-limit de imagens: 1000ms mínimo** entre imagem e preço/link (GPT Maker throttles após 6 msgs em <500ms, com erros silenciosos).
- **Antes de `git push origin main`:** sincronizar `.env` com variáveis de produção da Vercel.
- **Catálogo:** ~538 produtos no Supabase; integridade do `catalog_history` deve ser conferida antes de push.
- **Worktrees:** cada sessão abre pasta de trabalho separada; `.env.local` deve ser copiado manualmente para worktrees novas (senão o app carrega vazio, sem erros).
- **Catálogo público** é HTML estático sem build; credenciais do Drive ficam hardcoded no `<script>`.
- **Fotos novas no Drive** precisam de permissão "Qualquer pessoa com o link" — corrigir em massa com `scripts/fix-drive-permissions.mjs`.

---

## 7. Mapa de documentação

| Documento | Conteúdo |
|---|---|
| `PROJECT_CONTEXT.md` (este) | Visão geral, stack, integrações, domínio |
| `docs/ARCHITECTURE.md` | Camadas, fluxos de dados, dependências entre módulos |
| `docs/WEBHOOKS.md` | Endpoints serverless: assinaturas, payloads, respostas |
| `docs/SUPABASE.md` | Tabelas, Storage, RLS, migrations |
| `docs/DEPLOY.md` | Vercel, variáveis de ambiente, catálogo público, runbooks |
| `CLAUDE.md` | Regras operacionais e checklists (já existente, fonte viva) |
| `docs/INDEX.md` | Índice de troubleshooting (já existente) |

---

## 8. Estado de organização (honesto)

No momento desta documentação, o repositório apresenta:
- **22 arquivos `.md`** e **24 scripts** soltos na raiz (fora de `docs/` e `scripts/`).
- `dealism-backup/` (101 MB) committado no repo, sem uso em runtime.
- `src/services/` com 49 arquivos em lista plana, sem hierarquia de domínio.
- Regras de negócio duplicadas entre `api/` e `src/services/` (scoring, funil, objeções).
- `.env` e `.env.local` com conjuntos de chaves divergentes; sem `.env.example`.

Estes pontos estão documentados para orientar uma futura reorganização — **não foram alterados** para gerar este documento.

---

**Gerado em:** 2026-07-08
**Com base apenas em:** estado atual do repositório (código, configs, migrations, `CLAUDE.md`)
