# docs/SUPABASE.md — Banco de Dados e Storage

> **Snapshot:** 2026-07-08 · branch `main`
> **Fonte:** `supabase/migrations/*.sql` (10 arquivos) + uso observado em `api/` e `src/services/`.

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

## 3. Tabelas — Migrations versionadas (10 arquivos)

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
| 009 | `009_catalog_public_config.sql` | `catalog_public_config` | Config de visibilidade do catálogo público (`catalogo-publico/`) |
| 010 | `010_catalog_public_config_hidden_brands.sql` | (renomeia coluna `visible_brands` → `hidden_brands` na tabela acima) | idem |

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

#### `catalog_public_config` (009-010)
```sql
id             int pk default 1   -- linha única (config global, não por cliente)
hidden_brands  jsonb default '[]' -- lista de marcas escondidas do catálogo público
updated_at     timestamptz default now()
```
- Migration 009 criou a coluna como `visible_brands` (lista de permitidos); migration 010 **renomeou** para `hidden_brands`, invertendo a semântica: lista de permitidos faz pasta nova do Drive nascer invisível por padrão (exige ida manual à config toda vez que uma marca é criada); lista de escondidos faz o oposto — `[]` = nada escondido = tudo visível, inclusive pastas novas, e só se marca explicitamente o que **não** deve aparecer ainda.
- Lida/gravada por `src/services/catalogo/catalogPublicConfig.js` (painel interno, `DraftCatalogPage.jsx` → botão "Configurar catálogo") e por `catalogo-publico/index.html` (site estático, leitura direta via REST com a mesma anon/publishable key, sem passar pelo app React).
- RLS: mesma policy `allow all via service/anon key` usada nas demais tabelas (ver seção 4).

### 3.2 Tabelas referenciadas em código mas SEM migration versionada

Estas tabelas são lidas/escritas por `api/` e `src/services/` mas **não têm arquivo `.sql` em `supabase/migrations/`** — foram criadas diretamente no painel ou em momento anterior ao versionamento:

| Tabela | Quem usa | Propósito |
|---|---|---|
| `products` | `catalog.js`, `webhook.js`, `auto-photo.js`, vários | Catálogo (~538 itens) |
| `knowledge` | `knowledgeDB.js`, `webhook.js`, `embed-knowledge.js` | Base de conhecimento (entrada `knowledge_gabriela_supabase_completo`) |
| `customer_profiles` | `customerProfileService.js`, `_customerScoring.js`, `cron-diagnosis.js` | Scoring de cliente (`buy_score`, dispara `lead_quente` em ≥70). Ver nota sobre `context_id` abaixo. |
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

### 3.3 `customer_profiles.context_id` e `.telefone` — identidade automática por canal (migrations 011, 012)

`context_id` (migration 011, `text`, nullable, sem índice) e `telefone` (migration 012, `text`, nullable, sem índice). **Status: implementado, corrigido e validado em produção (Fase 2A, 2026-07-11).**

**Como funciona hoje:**
- `api/webhook.js` extrai `cliente_id`/`telefone`/`canal` de todo request do GPT Maker e chama `upsertIdentity()` ([api/_profileIdentity.js](../api/_profileIdentity.js)), fire-and-forget — nunca atrasa nem trava a resposta da Gabriela.
- **Reconciliação automática `conv_id` ↔ `context_id`:** a função busca primeiro por `context_id`; se não achar, busca por `conv_id = contextId` — isso **une** a linha já criada pelo caminho do painel (`ChatArea.jsx`/`DealOncaPage.jsx`, que só usa `conv_id`) com a identidade capturada automaticamente pelo webhook. Confirmado por teste real: `conv_id` e `context_id` coincidem no mesmo valor tanto em WhatsApp quanto em Instagram — por isso **não existem mais duas populações de perfil separadas** na prática; só se cria linha nova (`conv_id = context_id = contextId`) quando nenhuma das duas buscas encontra nada.
- **Tratamento do `$` residual:** o GPT Maker, ao substituir a variável de template `${contextId}`/`${whatsappPhone}` no `requestBody` da Ação "Buscar Produtos", deixa um `$` sobrando no início do valor (ex.: `${contextId}` → `"$3F306A8A...-..."`, não `"3F306A8A...-..."`). `api/webhook.js` remove esse caractere com `removerDollarInicial()` (remove só 1 `$` na posição inicial, nunca mexe em `$` no meio da string) antes de gravar.
- **Nunca sobrescreve campo existente com `null`/vazio** — `telefone`/`channel` só entram no `PATCH` quando o valor recebido é válido (string não-vazia).
- `canal` não é enviado pelo GPT Maker hoje (confirmado em auditoria) — fica `null` até isso mudar.

**Validado em produção:** teste oficial cronometrado (`"quero ver tênis masculino"`) confirmou `context_id` e `telefone` gravados limpos (sem `$`) numa linha pré-existente do painel (`created_at` de 21/06, `last_seen` atualizado no teste) — prova de reconciliação por `conv_id` funcionando de ponta a ponta.

**Não altera nenhum fluxo existente do painel:** `customerProfileService.js`, `ChatArea.jsx`, `DealOncaPage.jsx` continuam operando exclusivamente por `conv_id`, sem nenhuma modificação.

**Segurança:** toda chamada de `upsertIdentity()` é envolvida em try/catch com fallback silencioso (só loga erro) — uma falha de gravação nunca impede a resposta da Gabriela.

**Documentação histórica completa da investigação da Fase 2A** (linha do tempo, hipóteses descartadas, logs, causas raiz, evidências de produção): [`docs/investigations/2026-07-11-fase2a-context-id.md`](investigations/2026-07-11-fase2a-context-id.md).

### 3.4 Leitura de memória na resposta da Gabriela (Fase 2B)

**Status: implementado em 2026-07-11.** A partir da Fase 2B, os campos `size`, `interests` e `products_asked` de `customer_profiles` **são lidos de volta** e usados pra personalizar a resposta da Gabriela — não é mais só captura, agora tem uso real no atendimento.

**Como funciona:**
- `api/webhook.js` chama `getMemoryBlock(contextId)` ([api/_profileMemory.js](../api/_profileMemory.js)) **em paralelo** com a busca de produtos/conhecimento (`Promise.all`), nunca em sequência — não soma latência
- `getMemoryBlock()` busca o perfil (mesma reconciliação `context_id` → fallback `conv_id`, **duplicada deliberadamente** de `_profileIdentity.js` — ver `docs/ARCHITECTURE.md` §5) com timeout de 600ms; timeout, erro, perfil não encontrado, ou perfil sem nenhum campo permitido → retorna `''` em todos os casos, sem distinção
- Bloco resultante é **inserido dentro de `dados.informacao_adicional`**, entre o total de variações e o texto da base de conhecimento — reaproveita esse campo porque já é um contrato estável, lido de verdade pelo treinamento da Gabriela; **nenhuma configuração da Ação no GPT Maker foi alterada** (mesma lição da Fase 2A: mexer em template/Ação lá é frágil)

**Campos permitidos nesta primeira versão:** `size`, até 3 `interests` (mais recentes), até 3 `products_asked` (mais recentes). **Fora do escopo, propositalmente:** `notes`, `buy_score`, `tags`, `message_count`, `cep`, histórico completo — risco de vazar observação interna/estratégia comercial pro próprio cliente. Qualquer inclusão futura desses campos exige nova aprovação explícita.

**Limite de tamanho:** bloco de memória cortado em 400 caracteres (ajustado de 300 — ver "Reforço de privacidade" abaixo); base de conhecimento (500 caracteres) permanece intacta, sem disputa de espaço — são segmentos independentes dentro do mesmo campo de texto.

**A memória aqui é só contexto de personalização** — nunca influencia `buscarProdutos()`/`searchKnowledge()`, nunca altera preço, nunca filtra catálogo, nunca muda regra comercial. `api/_profileMemory.js` tem responsabilidade única de leitura; nunca escreve no banco.

#### Reforço de privacidade na instrução (2026-07-11)

O cabeçalho original do bloco (`"MEMÓRIA DO CLIENTE (NÃO REVELE AO CLIENTE)"`) permitiu, num teste real em produção, que a Gabriela respondesse **"Está registrado que você calça tamanho 40"** — revelando a existência de um registro, mesmo sem citar "memória" ou "banco de dados" literalmente. O cabeçalho foi reescrito pra ser mais explícito sobre o que nunca pode ser dito, e o limite do bloco subiu de 300 para 400 caracteres pra acomodar a instrução mais longa sem cortar os dados do cliente. Ver `api/_profileMemory.js` para o texto exato e os exemplos de uso correto/proibido documentados no código.

#### Validação em produção e encerramento da Fase 2B (2026-07-11)

**A Fase 2B foi validada em produção e está oficialmente encerrada**, com um risco residual conhecido e aceito, documentado abaixo.

**Teste real, três ocorrências da mesma pergunta do cliente ("Você sabe qual número eu uso?"), na ordem cronológica em que aconteceram na mesma conversa real:**

| # | Momento | Resposta da Gabriela | Resultado |
|---|---|---|---|
| 1 | Antes do reforço de instrução | *"Pelo que vi aqui no seu atendimento, **está registrado** que você calça tamanho 40"* | ❌ Reprovado — revelou "registrado" |
| 2 | Durante a transição (mesma conversa, minutos depois) | *"Pelo seu **histórico** aqui, você calça tamanho 41"* | ❌ Reprovado — usou literalmente "histórico", uma das palavras proibidas |
| 3 | Após o ajuste do cabeçalho | *"Pelo que **me lembro de conversas anteriores**, você calça 42, não é isso?"* | ✅ Aprovado |

A ocorrência 3 é considerada o padrão aceitável desta fase: **"pelo que me lembro de conversas anteriores" soa como lembrança natural de quem já conversou antes, e não revela banco de dados, cadastro, perfil ou sistema interno** — é exatamente o tipo de personalização que a Fase 2B pretendia alcançar.

**Conclusões registradas:**
- A memória foi validada em produção — o bloco é lido, formatado e chega à Gabriela corretamente, sem afetar produtos, preços, links ou a busca (`buscarProdutos()`/`searchKnowledge()` continuam intactos e sem influência da memória).
- O reforço de instrução (cabeçalho revisado) **melhorou o comportamento observável**, mas **a instrução de prompt é uma orientação de linguagem natural pro modelo, não um filtro determinístico** — reduz significativamente o risco de revelar a origem da memória, mas não garante 100% de conformidade.
- **Risco residual conhecido e aceito:** existe uma chance real, ainda que reduzida, de o modelo usar termos como "histórico", "registro", "cadastro", "perfil" ou "sistema" em alguma resposta futura, mesmo com a instrução reforçada.
- **Uma defesa determinística** (ex.: filtro de pós-processamento que reescreve/bloqueia a resposta se ela contiver essas palavras) **resolveria isso de forma mais confiável, mas exige uma nova arquitetura** — não entra no escopo da Fase 2B por decisão explícita, pra não ampliar a superfície da fase já encerrada.
- **Qualquer implementação futura desse filtro deve passar por auditoria própria**, específica, antes de implementar — um filtro de pós-processamento tem risco real de alterar ou bloquear respostas legítimas da Gabriela (ex.: um cliente perguntando literalmente sobre "histórico de pedidos" da própria loja, sem relação com a memória interna), e merece o mesmo cuidado de design que as fases anteriores tiveram.

**Documentação histórica completa da investigação da Fase 2A** (que criou toda a infraestrutura de identidade reaproveitada aqui): [`docs/investigations/2026-07-11-fase2a-context-id.md`](investigations/2026-07-11-fase2a-context-id.md).

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
