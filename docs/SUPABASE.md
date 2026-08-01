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
| `SUPABASE_SECRET_KEY` | Só serverless (`api/_profileLearning.js`, `api/system-tools.js?tool=qwen-health`) — Secret key, autentica como `service_role`, ignora RLS. Configurada na Vercel Production **e** Preview, **nunca** em `.env.local`, **nunca** com prefixo `VITE_`. Não estava documentada nesta tabela antes de 2026-07-25, apesar de já em uso desde a Fase 2C — gap pré-existente, corrigido naquela edição. |
| `NEX_SYNC_SECRET` | Só serverless (`api/system-tools.js?tool=nex-sync-clientes`/`nex-cliente`/`nex-health`) — segredo dedicado à integração NEX (Fase 6C), isolado de todos os outros segredos do projeto. Configurado **somente** em Vercel Production (não em Preview, não em `.env.local`, sem prefixo `VITE_`), marcado Sensitive/Encrypted. Cópia de recuperação em cofre local protegido do macOS. Ver `docs/integrations/NEX-INTEGRATION.md §3`. |

> Observação: o `CLAUDE.md` menciona `VITE_SUPABASE_ANON_KEY` em uma seção, mas o `.env` e `.env.local` reais usam `VITE_SUPABASE_KEY`. **`VITE_SUPABASE_KEY` é a chave efetiva.**

---

## 3. Tabelas — Migrations versionadas (14 documentadas nesta seção — cabeçalho corrigido nesta edição; contagem anterior de "10" já estava desatualizada antes da 016, gap pré-existente não relacionado à Fase 6C)

**Contagem real verificada por filesystem (2026-07-31):** `supabase/migrations/` contém **18 arquivos**, numerados `001` a `018`, **sem lacunas** na sequência. As 14 linhas da tabela abaixo cobrem `001`–`016` (escopo CRM/NEX deste documento). `017_bridge_message_processing.sql` e `018_bridge_operation_logs.sql` **existem no filesystem, mas são da PRIME Bridge** (`poc/zap-gptmaker-bridge/`, Fase 2B.2) — fora do escopo deste documento, **ainda não commitadas** no momento desta edição, não listadas na tabela abaixo.

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
| 013 | `013_profile_learning_audit.sql` | `profile_learning_audit` | Aprendizado automático de `size` (ver §3.5) |
| 014 | `014_profile_learning_audit_select_policy.sql` | (policy de SELECT em `profile_learning_audit`, sem tabela nova) | idem |
| 015 | `015_qwen_health_state.sql` | `qwen_health_state` + função `claim_qwen_health_check` | Health check do QwenCloud, Operations Center (ver §3.6) |
| 016 | `016_nex_clientes.sql` | `nex_clientes` + `nex_sync_eventos` | Staging de clientes NEX, isolado do Base44 (ver §3.7). **Versionada e aplicada manualmente no Supabase Production em 2026-07-31** (código do endpoint na Vercel ainda pendente de deploy — ver `docs/integrations/NEX-INTEGRATION.md`). |

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

### 3.5 Aprendizado automático de `size` — `profile_learning_audit` + `apply_profile_size_learning` (Fase 2C, migration 013)

**Status: migration 013 aplicada em produção em 2026-07-12**, testada isoladamente via transação `BEGIN`/`ROLLBACK` (10 cenários A-J, sem resíduo) antes de qualquer código de aplicação usá-la.

**`profile_learning_audit`** — tabela de auditoria nova:
```sql
id, conv_id, context_id, message_id, field, old_value, new_value,
source_text (truncado em 200 chars), rule_matched, confidence,
channel, applied, created_at, reverted_at
-- constraint uq_profile_learning_event unique (message_id, field)
-- constraints de integridade: field='size', confidence='high',
-- channel in ('WHATSAPP','INSTAGRAM') ou null, new_value entre 33-46,
-- coerência applied/reverted_at — old_value SEM constraint de faixa
-- (precisa aceitar valores legados não-numéricos como 'M'/'G'/'GG')
```

**`apply_profile_size_learning(...)`** — função transacional, `SECURITY INVOKER`, chamada só por `service_role`:
- **Deduplicação dupla:** checagem rápida de `(message_id, field)` antes do lock (atalho) **e** depois do `SELECT ... FOR UPDATE` (defesa real contra corrida — duas chamadas quase simultâneas com o mesmo `message_id` podem passar pela checagem rápida antes de qualquer uma commitar). A constraint `UNIQUE(message_id, field)` + `INSERT ... ON CONFLICT DO NOTHING` é a garantia final, independente das checagens em código.
- **`FOR UPDATE`** na leitura de `customer_profiles.size` — serializa duas atualizações simultâneas do mesmo perfil, garante que `old_value` gravado na auditoria é sempre o valor real imediatamente anterior à mudança, nunca uma leitura obsoleta.
- **Status possíveis:** `applied` (mudança real, 1 linha de auditoria), `duplicate` (mesmo evento já processado), `unchanged` (valor já era esse, nenhuma auditoria gravada), `profile_not_found` (a função nunca cria perfil — isso continua exclusivo de `upsertIdentity()`), `invalid_input` (com `reason`: `campo_obrigatorio_ausente`, `size_formato_invalido`, `size_fora_da_faixa`, `channel_invalido`, `confidence_nao_suportada`), `error` (interno — só `SQLSTATE` vai pro log do Postgres, nunca `SQLERRM` no retorno).
- **Só `size`** — `field` é literal fixo dentro da função, não parâmetro; não há como usar essa RPC pra escrever em nenhum outro campo.

**Permissões:** `RLS` habilitada em `profile_learning_audit`. Originalmente **sem nenhuma policy** (`anon`/`authenticated`/`public` não conseguiam ler nem escrever via REST direto). **Migration 014** (`014_profile_learning_audit_select_policy.sql`) adicionou uma policy de **SELECT apenas** para `anon`/`authenticated` — libera leitura para o painel React sem abrir escrita. `INSERT`/`UPDATE`/`DELETE` continuam exclusivos de `service_role` (sem policy para essas operações). `service_role` ignora RLS por natureza própria da role. `REVOKE ALL`/`GRANT EXECUTE` explícitos na função `apply_profile_size_learning`, restritos a `service_role`.

**Tela:** aba "Aprendizado de Perfil" dentro de `IntelligenceOpsPage.jsx` (menu "Inteligência Operacional"), lida por `src/services/auditoria/profileLearningAuditService.js` (`getProfileLearningEvents`, só leitura) e renderizada por `src/pages/ProfileLearningAuditTab.jsx`.

**Credencial:** `SUPABASE_SECRET_KEY` (nova Secret key do Supabase, formato `sb_secret_...`, autentica como `service_role`) — configurada só na Vercel (`Production`, tipo `Sensitive`), **nunca** em `.env.local`/arquivo do workspace, **nunca** com prefixo `VITE_` (garante que o Vite nunca embute no bundle do frontend). Usada exclusivamente dentro de `api/_profileLearning.js`, em todas as suas chamadas (leituras de perfil e a RPC) — nenhum outro módulo do projeto a referencia.

**Header testado empiricamente (2026-07-12):** confirmado que a Secret Key autentica corretamente usando **só o header `apikey`** — `Authorization: Bearer` **não é necessário** e foi removido de `api/_profileLearning.js` depois da confirmação (teste real: `anon` → `401`/`permission_denied`/`42501`; `service_role` com só `apikey` → `200`/execução real da função).

**Documentação histórica completa das investigações que validaram o gatilho `onNewMessage`** (schema real do payload, estabilidade de `contextId`/`messageId`, achado `role: "tool"`): [`docs/investigations/2026-07-11-fase2c0-onnewmessage-relatorio.md`](investigations/2026-07-11-fase2c0-onnewmessage-relatorio.md) e [`docs/investigations/2026-07-11-fase2c1-segunda-janela-relatorio.md`](investigations/2026-07-11-fase2c1-segunda-janela-relatorio.md).

#### Validação em produção e encerramento da Fase 2C (2026-07-12)

**A Fase 2C foi validada em produção e está oficialmente encerrada**, com `onNewMessage` ativo apontando para `api/onnewmessage.js`.

**Incidente descoberto e corrigido durante a validação:** o primeiro teste controlado em produção (perfil sintético) retornou `profile_not_found_after_identity` mesmo com o perfil existindo — investigação com instrumentação temporária (removida depois, nunca commitada) isolou a causa em `findByContextId`/`findByConvId`: ambas as buscas retornavam **HTTP 401**, que o código converte silenciosamente em `null` (mesmo comportamento hoje, sem alteração de lógica). Causa raiz: **a `SUPABASE_SECRET_KEY` configurada em Production na Vercel estava incorreta/desatualizada.** Correção: variável recriada em Production com o valor correto — sem nenhuma mudança de código, migration ou permissão no banco.

**Sequência de testes controlados em produção, todos aprovados após a correção da credencial:**
- `applied` — perfil sintético (`size` inicial `G`) → declaração de tamanho `41` → `customer_profiles.size` atualizado, 1 linha gravada em `profile_learning_audit` (`old_value='G'`, `new_value='41'`, `confidence='high'`, `applied=true`).
- `duplicate` — reenvio do mesmo `message_id` → nenhuma nova auditoria, `size` inalterado.
- `unchanged` — novo `message_id`, mesmo valor de tamanho → nenhuma nova auditoria, `size` inalterado.
- Dados sintéticos removidos ao final (`profile_learning_audit`/`customer_profiles` do `conv_id` de teste), contagem zero confirmada.

**Teste real de ponta a ponta (WhatsApp, perfil real, não sintético):** mensagem neutra ("Oi") corretamente ignorada pelo aprendizado (sem sinal de tamanho, nenhum I/O); declaração real de tamanho processada com sucesso (`rpc_applied`); `customer_profiles.size` do perfil real confirmado atualizado para `41` no horário exato do teste. Conversa com a Gabriela seguiu normalmente, sem qualquer interferência perceptível — confirma que o aprendizado é silencioso, como desenhado.

**Status final: `onNewMessage` ativo em produção**, apontando para `https://ignite-webhook.vercel.app/api/onnewmessage`. Nenhum outro campo de webhook do GPT Maker foi alterado.

---

### 3.6 Health check do QwenCloud — `qwen_health_state` + `claim_qwen_health_check` (Fase 2A.1, migration 015)

**Contexto:** Fase 2A implementou um health check real do QwenCloud pro Operations Center, mas com cache/rate-limit só em memória do processo serverless — auditoria de segurança (2026-07-25) apontou que isso não é confiável nem seguro na Vercel (memória reseta a cada cold start, não é compartilhada entre instâncias/regiões, e a rota é pública sem autenticação). Fase 2A.1 substitui o cache em memória por persistência real no Supabase, com trava atômica.

**`qwen_health_state`** — tabela single-row (`id` fixo = 1, `constraint chk_qwen_health_single_row check (id = 1)`):
```sql
id, provider, available, model, latency_ms,
input_tokens, output_tokens, total_tokens,
error_code, last_checked_at, next_allowed_at, updated_at
```
**Nunca armazena:** API key, prompt, resposta gerada pelo modelo, headers ou payload bruto do provedor — só metadados operacionais.

**`claim_qwen_health_check(p_min_interval_seconds)`** — função transacional, `SECURITY INVOKER`, chamada só por `service_role`. **Atomicidade:** um único `UPDATE ... WHERE next_allowed_at <= now() RETURNING *` — o Postgres serializa duas transações concorrentes tentando esse UPDATE na mesma linha via lock de linha padrão (READ COMMITTED); a segunda só reavalia sua cláusula `WHERE` depois que a primeira já committou (com `next_allowed_at` já avançado), e por isso nunca "casa" — garantindo que só uma reivindicação vence, mesmo sob chamadas simultâneas de múltiplas instâncias/regiões da Vercel. Não depende de advisory lock nem `SERIALIZABLE`. Retorna `{claimed: boolean, state: {...}}` — quando `claimed=false`, `state` já é o último resultado persistido, pronto pra devolver ao cliente sem nenhuma consulta extra.

**Fluxo do endpoint (`api/system-tools.js?tool=qwen-health` — migrado de `api/qwen-health.js` em 2026-07-27, ver nota abaixo):**
- **GET** — só lê `qwen_health_state` (`select *`). **Nunca chama o QwenCloud.** Custo externo zero, seguro pra rodar em toda montagem de página/F5/navegação da SPA.
- **POST** — chama `claim_qwen_health_check`. Se `claimed=false`, devolve o estado persistido (`throttled: true`), sem chamar o QwenCloud. Se `claimed=true` (a trava já foi atomicamente avançada nesse mesmo statement, antes de qualquer chamada externa), chama o QwenCloud uma vez com `enable_thinking: false` (evita gastar tokens de raciocínio num modelo híbrido — confirmado por teste: sem essa flag, uma chamada mínima gastou 394 tokens; com a flag, caiu pra ~14), grava o resultado via `PATCH` na mesma linha, e devolve o resultado atualizado.

**Intervalo mínimo configurável:** `QWEN_HEALTH_MIN_INTERVAL_SECONDS` (env var opcional, fallback **1800s/30min**). Lido só dentro do endpoint (`api/system-tools.js`, funções `qwenHealth*`), passado como parâmetro pra `claim_qwen_health_check` — nenhum outro arquivo (frontend incluído) conhece ou decide esse valor.

**Permissões:** `RLS` habilitada em `qwen_health_state`, **zero policy** — `anon`/`authenticated`/`public` não conseguem ler nem escrever via REST direto, mesmo com a `anon key` exposta no bundle do frontend. `service_role` ignora RLS por natureza própria da role. `REVOKE ALL`/`GRANT EXECUTE` explícitos em `claim_qwen_health_check`, restritos a `service_role`. Header usado: só `apikey` (mesmo padrão já confirmado empiricamente em `api/_profileLearning.js` — `Authorization: Bearer` não é necessário com a Secret key).

**Risco residual aceito nesta fase:** o **POST continua público, sem autenticação de usuário** — o projeto não tem nenhuma camada de login hoje. A trava atômica persistida é o que impede abuso (sem ela, seria chamadas ilimitadas; com ela, o pior caso é 1 chamada real por `QWEN_HEALTH_MIN_INTERVAL_SECONDS`, de qualquer origem, para sempre). Quando o projeto ganhar autenticação de usuário, adicionar checagem de sessão/token na função `qwenHealth()` (dentro de `api/system-tools.js`) antes de chamar `qwenHealthClaim()` — a arquitetura já foi desenhada considerando esse passo futuro.

**Testado (2026-07-25):** GET sem registro / com registro, POST negado pela trava (`throttled: true`, zero chamadas reais), POST autorizado (1 chamada real, `enable_thinking:false` confirmado no corpo enviado, consumo caiu de 394 para 14 tokens), duas chamadas POST concorrentes simuladas (só 1 chamada real, a outra recebeu `throttled: true`), variáveis ausentes, erro 401 do provedor, timeout — todos via mocks do Supabase (a Secret key não existe em `.env.local` neste ambiente de desenvolvimento, só em Production, por padrão do projeto) + exatamente 2 chamadas reais ao QwenCloud no total (o mínimo necessário para validar `enable_thinking` isoladamente **e** o comportamento sob concorrência, que são duas propriedades distintas). A atomicidade do `UPDATE ... RETURNING` em si é garantida por construção do Postgres (mesmo mecanismo já usado e documentado em `apply_profile_size_learning`, migration 013).

**Migrado em 2026-07-27:** `api/qwen-health.js` (arquivo próprio) foi removido e a lógica movida integralmente para dentro de `api/system-tools.js` como `?tool=qwen-health` — o deploy em Preview falhou com *"No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan"* (esse era o 13º arquivo roteável em `api/`). Consolidação seguiu o mesmo padrão já usado pelas outras tools deste arquivo (`vercel-status`, `sync-lyra`, etc.) — comportamento idêntico, nenhuma mudança de lógica, só de localização. Nova URL: `/api/system-tools?tool=qwen-health` (GET e POST). `SUPABASE_URL` reaproveitada da constante já existente em `system-tools.js`; `SUPABASE_SECRET_KEY` adicionada como constante nova só para esta tool.

---

### 3.7 `nex_clientes` + `nex_sync_eventos` — staging de clientes NEX (Fase 6C, migration 016)

**Contexto:** importação de clientes do sistema NEX (loja física) para o Supabase, em tabelas de staging isoladas, sem nunca escrever no Base44 (`Cliente`/`Venda`/`Parcela`/`HistoricoAtividade`). Origem dos dados: sistema Windows externo (`PrimeIntegracaoNex`, fora deste repositório), autenticado via `NEX_SYNC_SECRET`. Detalhe completo da arquitetura, segurança e endpoints em [`docs/integrations/NEX-INTEGRATION.md`](integrations/NEX-INTEGRATION.md).

**`nex_clientes`** — chave natural composta `(origem_loja, nex_codigo)`, `UNIQUE`:
```sql
id                  uuid pk default gen_random_uuid()
origem_loja         text not null    -- parte da chave natural
nex_codigo          text not null    -- parte da chave natural
nome                text not null
cpf_cnpj            text
telefone            text
celular             text
email               text
endereco            text
saldo_debito_nex    numeric(12,2)
saldo_credito_nex   numeric(12,2)
valor_liquido_nex   numeric(12,2)
data_snapshot       date
observacao_original varchar(500)     -- truncado no banco, validado em código
metadados           jsonb default '{}'
content_hash        text not null    -- hash do payload normalizado (idempotência)
ausente_desde       timestamptz      -- soft-delete: NULL = presente na última exportação
created_at          timestamptz not null default now()
updated_at          timestamptz not null default now()
-- Constraint: unique (origem_loja, nex_codigo)
```

**`nex_sync_eventos`** — histórico de auditoria, uma linha por evento por cliente por lote:
```sql
id              uuid pk default gen_random_uuid()
lote_id         text not null
correlation_id  text
origem_loja     text not null
nex_codigo      text not null
tipo            text not null   -- 'criado'|'atualizado'|'sem_alteracao'|'ausente_na_exportacao'
valor_anterior  jsonb
valor_novo      jsonb
created_at      timestamptz not null default now()
```

**Idempotência:** `content_hash` (SHA256 do payload normalizado, exclui a chave natural) evita comparação campo a campo — hash igual ao já armazenado classifica como `sem_alteracao` e **não escreve evento novo** em `nex_sync_eventos`.

**Soft-delete:** `ausente_desde` nullable — nunca há `DELETE` automático de um cliente vindo do NEX, apenas marcação de ausência.

**Migration status:** versionada em `supabase/migrations/016_nex_clientes.sql`, **aplicada manualmente no Supabase Production em 2026-07-31** via SQL Editor (`Success. No rows returned`) — projeto não usa CLI de migrations automatizada, mesmo padrão de `017`/`018`. Tabelas criadas vazias, RLS habilitada, validação estrutural feita antes de avançar. **Isso é diferente do deploy do código:** os handlers de `api/system-tools.js` (`nex-sync-clientes`/`nex-cliente`/`nex-health`) ainda não foram publicados na Vercel.

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

> **Exceções (não corrigidas nesta edição, só documentadas):** quatro tabelas do projeto não seguem o padrão `allow all` acima — mas não são homogêneas entre si:
> - **`profile_learning_audit`** (013/014) — RLS habilitada **com uma policy**: `SELECT` liberado para `anon`/`authenticated` (migration 014). `INSERT`/`UPDATE`/`DELETE` continuam exclusivos de `service_role`. **Não é zero-policy.**
> - **`qwen_health_state`** (015), **`nex_clientes`** e **`nex_sync_eventos`** (016, Fase 6C) — RLS habilitada com **zero policies** (nenhuma, nem `SELECT`). Qualquer operação sem `service_role`/`SUPABASE_SECRET_KEY` retorna `permission_denied`. **Estas três são literalmente zero-policy.**
>
> São, portanto, quatro tabelas com postura mais restritiva que `allow all`, das quais três são zero-policy (correção desta edição: a nota anterior dizia "as únicas duas tabelas... zero-policy", o que já estava impreciso mesmo antes da 016, porque agrupava `profile_learning_audit` — que tem policy de SELECT — junto com `qwen_health_state` — que não tem policy nenhuma).

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
| `nex_clientes` | `unique (origem_loja, nex_codigo)` — índice automático da constraint, nenhum outro necessário nesta fase |
| `nex_sync_eventos` | `(lote_id)`, `(origem_loja, nex_codigo, created_at desc)`, `(origem_loja, created_at desc)` |

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
