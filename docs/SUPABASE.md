# docs/SUPABASE.md — Banco de Dados e Storage

> **Snapshot:** 2026-07-08 · branch `main`
> **Fonte:** `supabase/migrations/*.sql` (8 arquivos) + uso observado em `api/` e `src/services/`.

---

## 1. Como o Supabase é acessado

O projeto **não usa a CLI do Supabase nem migrations automatizadas**. Cada arquivo `.sql` em `supabase/migrations/` começa com o comentário:

> *"Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas)"*

Ou seja, `supabase/migrations/` é um **registro versionado de SQL aplicado à mão**, não um pipeline de migrate.

### Padrão de acesso (REST via fetch)
O acesso é direto à REST API do Supabase com header `apikey` + `Authorization: Bearer`:

```
GET/POST https://<projeto>.supabase.co/rest/v1/<tabela>
Headers: { apikey: VITE_SUPABASE_KEY, Authorization: 'Bearer ' + VITE_SUPABASE_KEY }
```

- **Frontend (`src/services/*`):** lê `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY`.
- **Serverless (`api/*`):** lê `process.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` (variáveis de produção na Vercel).

> O boilerplate do header está **duplicado em 11 das 12 funções** `api/` — candidato futuro a `api/lib/supabaseClient.js`.

---

## 2. Variáveis de ambiente

| Variável | Onde usada |
|---|---|
| `VITE_SUPABASE_URL` | Frontend + serverless |
| `VITE_SUPABASE_KEY` | Frontend + serverless (anon/publishable key) |

> Observação: o `CLAUDE.md` menciona `VITE_SUPABASE_ANON_KEY` em uma seção, mas o `.env` e `.env.local` reais usam `VITE_SUPABASE_KEY`. **`VITE_SUPABASE_KEY` é a chave efetiva.**

---

## 3. Tabelas — Migrations versionadas (8 arquivos)

### 3.1 Tabelas definidas em `supabase/migrations/`

| # | Arquivo | Tabela | Domínio |
|---|---|---|---|
| 001 | `001_codex_alerts.sql` | `codex_alerts` | Alertas do supervisor CODEX |
| 002 | `002_objections.sql` | `objections` | Motor de objeções |
| 003 | `003_system_health.sql` | `system_health_runs` | Saúde técnica do sistema |
| 004 | `004_knowledge_audit.sql` | `knowledge_audit_findings` | Auditoria da base de conhecimento |
| 005 | `005_learnings_audit.sql` | `learnings_audit_findings` | Auditoria de aprendizados do agente |
| 006 | `006_whatsapp_audit.sql` | `whatsapp_audit_findings` | Auditoria de conversas WhatsApp |
| 007 | `007_instagram_audit.sql` | `instagram_audit_findings` | Auditoria de conversas Instagram |
| 008 | `008_codex_audit.sql` | `codex_audit_findings` | Auditoria de código do projeto |

### Detalhe de cada tabela

#### `codex_alerts` (001)
```sql
id          uuid pk default gen_random_uuid()
type        text not null     -- 'gap_conhecimento'|'produto_fallback'|'conversa_abandonada'|'lead_quente'|'objecao'|'produto_problema'
severity    text default 'info' -- 'info'|'atencao'|'critico'
conversation_id text
message     text not null
data        jsonb
resolved    boolean default false
created_at  timestamptz default now()
-- Index: (resolved, created_at desc), (type, created_at desc)
```

#### `objections` (002)
```sql
id              uuid pk default gen_random_uuid()
category        text not null -- 'preco'|'frete'|'confianca'|'estoque_tamanho'|'pagamento'|'concorrencia'
conversation_id text
channel         text
raw_excerpt     text
created_at      timestamptz default now()
-- Index: (category, created_at desc), (created_at desc)
```

#### `system_health_runs` (003)
```sql
id          uuid pk
run_id      text not null
check_id    text not null   -- 'supabase'|'whatsapp'|'instagram'|'groq'|'webhook'|'filas'
label       text not null
status      text not null   -- 'ok'|'error'|'warn'|'n/a'
detail      text
latency_ms  integer
created_at  timestamptz default now()
-- Index: (run_id), (check_id, created_at desc)
```

#### `*_audit_findings` (004-007) — padrão comum
Todas seguem o mesmo molde:
```sql
id          uuid pk
run_id      text not null
type        text not null     -- varia por auditoria
... (campos específicos: chat_id, contact_name, entry_id_a/b, title_a/b, etc.)
score       numeric           -- só knowledge/learnings
ignored     boolean default false
created_at  timestamptz default now()
```
- **knowledge_audit_findings** (004): `type` = `duplicado|semelhante|obsoleto|muito_curto|contraditario`; tem `entry_id_a/b bigint`, `title_a/b`, `score`.
- **learnings_audit_findings** (005): `type` = `duplicada|conflitante|muito_curta`; tem `entry_id_a uuid`, `content_a/b`, `score`.
- **whatsapp_audit_findings** (006): `type` = `sem_resposta|contato_duplicado|sem_nome|abandonada|sem_interacao_recente`; tem `chat_id`, `contact_name`, `phone`.
- **instagram_audit_findings** (007): idem mas com `username` em vez de `phone`.
- **codex_audit_findings** (008): `type` = `arquivo_orfao|funcao_sem_uso|componente_duplicado|rota_morta|tabela_sem_uso`; tem `path`. **Diferencial:** os achados são gerados pelo Claude Code analisando o repo (não rodam no app) e gravados manualmente.

### 3.2 Tabelas referenciadas em código mas SEM migration versionada

Estas tabelas são lidas/escritas por `api/` e `src/services/` mas **não têm arquivo `.sql` em `supabase/migrations/`** — foram criadas diretamente no painel ou em momento anterior ao versionamento:

| Tabela | Quem usa | Propósito |
|---|---|---|
| `products` | `catalog.js`, `webhook.js`, `auto-photo.js`, vários | Catálogo (~538 itens) |
| `knowledge` | `knowledgeDB.js`, `webhook.js`, `embed-knowledge.js` | Base de conhecimento (entrada `knowledge_gabriela_supabase_completo`) |
| `customer_profiles` | `customerProfileService.js`, `_customerScoring.js`, `cron-diagnosis.js` | Scoring de cliente (`buy_score`, dispara `lead_quente` em ≥70) |
| `photo_history` | `photoHistory.js`, `auto-photo.js` | Histórico de fotos enviadas |
| `diagnostics` | `diagnosticService.js`, `cron-diagnosis.js` | Relatórios diários do DealOnça |
| `agent_audits` | `agentAuditService.js`, `cron-diagnosis.js` | Auditoria da Gabriela (rubrica 0-10) |
| `agent_learnings` | `agentLearningsService.js`, `cron-diagnosis.js` | Aprendizados/correções propostas |
| `weekly_insights` | `weeklyInsightService.js`, `cron-diagnosis.js` | Insight semanal |
| `bagy_audit_log` | `bagy-audit.js`, `bagyAuditService.js` | Log da auditoria da loja Bagy |
| `avatar_cache` | `avatarCacheService.js`, `cache-avatar.js` | Cache de avatares |
| `catalog_history` | `log-history.js`, `catalog.js` | Auditoria de add/edit/delete do catálogo |
| `training_data` | (mencionado no `CLAUDE.md`) | Treinamentos de agentes |

> **Lacuna documentada:** o schema exato destas 12 tabelas não está no repositório. Para recriá-las do zero seria necessário consultar o painel do Supabase.

---

## 4. RLS (Row Level Security)

**Todas as 8 tabelas versionadas** seguem o mesmo padrão (literais do SQL):

```sql
alter table <nome> enable row level security;

create policy "allow all via service/anon key"
  on <nome> for all
  using (true)
  with check (true);
```

Ou seja: **RLS está habilitada, mas a policy é `allow all`** — qualquer request com a `anon key` (que está no frontend) pode ler e escrever tudo. É um padrão *permissivo por design* (app cliente precisa escrever diretamente), não uma defesa real.

> **Implicação de segurança:** a `VITE_SUPABASE_KEY` (anon) é exposta no bundle do frontend. A policy `allow all` significa que qualquer um com a URL+key (extraível do app) tem acesso total de leitura/escrita a essas tabelas. Não há segregação por usuário.

---

## 5. Storage (Buckets)

| Bucket | Acesso | Uso | Quem escreve |
|---|---|---|---|
| `produtos` | **PUBLIC** | Imagens de catálogo (scrapeadas `og:image`) | `catalog.js` (`importBackupService.js` arquivado em 2026-07-10, sem consumidor ativo — ver `docs/AUDITORIA-ORFAOS-SERVICES.md`) |
| `avatars` | (usado por `cache-avatar.js`) | Foto de perfil WhatsApp/Instagram (bypass CORS do CDN IG) | `cache-avatar.js`, `avatarCacheService.js` |

> Observação do `CLAUDE.md`: o bucket é citado em alguns lugares como `productos` (sem acento, ES) — vale confirmar o nome exato no painel antes de operar.

---

## 6. Índices (resumo das migrations versionadas)

| Tabela | Índices |
|---|---|
| `codex_alerts` | `(resolved, created_at desc)`, `(type, created_at desc)` |
| `objections` | `(category, created_at desc)`, `(created_at desc)` |
| `system_health_runs` | `(run_id)`, `(check_id, created_at desc)` |
| `*_audit_findings` (5 tabelas) | `(run_id)`, `(type, created_at desc)` |

Todas as tabelas de auditoria seguem o padrão de índice em `run_id` (para listar a rodada) + `(type, created_at desc)` (para filtrar por tipo de achado).

---

## 7. Lacunas e riscos identificados

1. **Sem migrate automatizado** — todo DDL é manual via SQL Editor. Não há `supabase link`/`db push`. Risco de drift entre ambientes.
2. **Schema de 12 tabelas não versionado** — `products`, `knowledge`, `customer_profiles`, etc. só existem no painel.
3. **RLS `allow all`** — policy permissiva em todas as tabelas versionadas; a anon key do frontend dá acesso total.
4. **Boilerplate duplicado** — header Supabase replicado em 11 funções `api/`.
5. **Nome de bucket ambíguo** (`produtos` vs `productos`) — confirmar antes de operar.
6. **Sem seeds/fixtures** — não há dados de exemplo para setup local.

---

**Gerado em:** 2026-07-08 · apenas com dados do repositório (`supabase/migrations/`, `api/`, `src/services/`, `CLAUDE.md`).
