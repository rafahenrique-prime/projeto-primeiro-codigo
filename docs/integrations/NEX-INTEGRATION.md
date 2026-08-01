# NEX Integration — Fase 6C

**Status:** Código e testes locais concluídos nas Fases 6C.3 (helper `api/_nexClientes.js` + testes) e 6C.4 (endpoints/handlers em `api/system-tools.js`). Segredo `NEX_SYNC_SECRET` configurado na Fase 6C.5. Migration `016_nex_clientes.sql` aplicada manualmente no Supabase Production em 2026-07-31. Deploy do código na Vercel, POC controlada em Production e cleanup ainda pendentes (Fase 6C.6-7).

## 1. Objetivo

Importar dados de clientes do sistema NEX (usado pela loja física) para o Supabase do IGNITE PRIME, em tabelas de staging isoladas, sem jamais escrever no Base44 (`Cliente`/`Venda`/`Parcela`/`HistoricoAtividade`). O NEX passa a ter uma cópia sincronizada e rastreável no Supabase, consultável pelo painel e por integrações futuras, sem qualquer risco para os dados financeiros já em produção no Base44.

Origem dos dados: um sistema Windows (`PrimeIntegracaoNex`, fora deste repositório) fará chamadas HTTP autenticadas para sincronizar lotes de clientes.

## 2. Arquitetura

### Tabelas (Supabase, migration `016_nex_clientes.sql`)

**`nex_clientes`** — staging de clientes, chave natural composta:
```sql
id                  uuid primary key default gen_random_uuid()
origem_loja         text not null   -- parte da chave natural
nex_codigo          text not null   -- parte da chave natural
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
observacao_original varchar(500)    -- truncado no banco, validado em código
metadados           jsonb default '{}'
content_hash        text not null   -- hash do payload normalizado (idempotência)
ausente_desde       timestamptz     -- soft-delete: NULL = presente na última exportação
created_at          timestamptz not null default now()
updated_at          timestamptz not null default now()

constraint uq_nex_clientes_origem_codigo unique (origem_loja, nex_codigo)
```

**`nex_sync_eventos`** — histórico de auditoria, uma linha por evento por cliente por lote:
```sql
id              uuid primary key default gen_random_uuid()
lote_id         text not null
correlation_id  text
origem_loja     text not null
nex_codigo      text not null
tipo            text not null   -- 'criado' | 'atualizado' | 'sem_alteracao' | 'ausente_na_exportacao'
valor_anterior  jsonb
valor_novo      jsonb
created_at      timestamptz not null default now()
```

**Chave natural:** `(origem_loja, nex_codigo)` — não usa `id` sequencial do NEX como identificador único; `origem_loja` permite múltiplas lojas/origens no futuro sem colisão de código.

**Idempotência:** `content_hash` (SHA256 do payload normalizado, excluindo a chave natural). Classificação sem comparação campo a campo:
- sem cliente existente → `criado`
- hash igual ao anterior → `sem_alteracao` (nenhum evento é escrito em `nex_sync_eventos`)
- hash diferente → `atualizado`

**Soft-delete:** `ausente_desde` é um `timestamptz` nullable. Nunca há `DELETE` automático de um cliente que veio do NEX — apenas marcação de ausência para auditoria.

**Migration status:** `016_nex_clientes.sql` está versionada no repositório e foi **aplicada manualmente no Supabase Production em 2026-07-31** via SQL Editor (`Success. No rows returned`) — projeto não usa CLI de migrations automatizada, mesmo padrão de `017`/`018`. Tabelas criadas vazias, RLS habilitada, validação estrutural feita antes de avançar.

**Diferença importante:** migration do banco (aplicada) ≠ código do endpoint (ainda não deployado). Os 3 handlers em `api/system-tools.js` continuam só no working tree local — a Vercel Production ainda serve a versão anterior do arquivo, sem as tools NEX.

### Endpoints (`api/system-tools.js`, dispatcher por `?tool=`)

| Tool | Método | Autenticação | Propósito |
|------|--------|--------------|-----------|
| `nex-sync-clientes` | POST | `Bearer NEX_SYNC_SECRET` (sempre obrigatório) | Recebe lote de clientes (máx. 500), delega a `processarLote` |
| `nex-cliente` | GET | `Bearer NEX_SYNC_SECRET` (sempre obrigatório) | Consulta um cliente + últimos 5 eventos (sem `content_hash`) |
| `nex-health` (sem `?force=true`) | GET | **Nenhuma — totalmente público** | Agregados (contagens), serve do cache de até 3 min, zero PII |
| `nex-health?force=true` | GET | `Bearer NEX_SYNC_SECRET` (obrigatório só nesta variante) | Ignora o cache, força nova consulta ao Supabase |

Confirmado por leitura direta do código (`api/system-tools.js`, função `nexHealth`): o `GET` normal não tem nenhuma checagem de autenticação — só `?force=true` valida `Authorization: Bearer` contra `NEX_SYNC_SECRET`, retornando `401` se ausente ou incorreto.

**Zero Serverless Functions novas** — os 3 endpoints são `case` dentro do dispatcher já existente (`api/system-tools.js`), mesmo padrão de consolidação já usado por `qwen-health`, `sync-lyra`, `stuck-check`, `codex-openrouter` etc., para respeitar o teto de 12 funções do plano Hobby da Vercel.

**Limite de 500 registros por chamada:** `processarLote` rejeita lotes acima do limite com erro estruturado, sem processamento parcial.

**Rate limit:** best-effort, `Map` em memória por IP (20 req/min). **Não é garantia de segurança** — é resetado em cold start e não é compartilhado entre instâncias da Vercel. A proteção real do endpoint é a autenticação por `NEX_SYNC_SECRET`.

### Helper privado (`api/_nexClientes.js`)

314 linhas, 100% da lógica de negócio (validação, normalização, cálculo de hash, classificação, upsert, processamento de lote) isolada do dispatcher — mesmo padrão já usado por `_profileIdentity.js`, `_gerarCobrancaLyra.js`, `_mensagemManualProxy.js`. `api/system-tools.js` só valida a requisição HTTP e delega.

### Isolamento do Base44

`api/_nexClientes.js` e as tabelas NEX não têm nenhuma referência a `Cliente`, `Venda`, `Parcela`, `HistoricoAtividade` ou ao SDK Base44. Confirmado por auditoria estrutural (grep) antes da Fase 6C.6.

## 3. Segurança

**`NEX_SYNC_SECRET`** — segredo dedicado, isolado de todos os outros segredos do projeto (`CRON_SECRET`, `LYRA_WEBHOOK_SECRET`, `GERAR_COBRANCA_SECRET`, etc.):
- Configurado **somente** em Vercel Production (não em Preview, não em `.env.local`, sem prefixo `VITE_`)
- Marcado como Sensitive/Encrypted na Vercel
- Cópia de recuperação armazenada em cofre local protegido do macOS, para uso sem depender de `.env.local` (procedimento operacional exato fora do escopo deste documento)
- Regenerado uma vez durante a Fase 6C.5 — o valor antigo foi removido da Vercel e nunca reutilizado
- Nunca exposto em tela, log, histórico de terminal, clipboard, Git, documentação ou frontend — nenhum valor, comando de recuperação ou conteúdo do segredo é registrado neste documento

**RLS:** `nex_clientes` e `nex_sync_eventos` têm Row Level Security habilitada com **zero policies** — mesmo padrão de `qwen_health_state` (015). (`profile_learning_audit`, 013/014, é mais restritiva que o padrão `allow all` do resto do projeto, mas **não** é zero-policy — tem uma policy de `SELECT` liberada; ver `docs/SUPABASE.md §4` para a distinção completa.) Sem `service_role`, qualquer `SELECT`/`INSERT`/`UPDATE`/`DELETE` em `nex_clientes`/`nex_sync_eventos` retorna `permission_denied` (código `42501`). Acesso exclusivo via `SUPABASE_SECRET_KEY`. **Validação real com `anon key` contra Production ainda não foi executada** — só a leitura da migration confirma a intenção; falta o teste empírico (ver seção 8).

## 4. Testes locais executados

**55/55 testes PASSING** (`npx vitest run`, modo não-watch):
- `api/__tests__/nexClientes.test.js` — 31 testes (validação, normalização, hash determinístico, classificação de tipo, upsert, processamento de lote, 4 cenários E2E com mock de Supabase)
- `api/__tests__/systemToolsNex.test.js` — 24 testes (validação de método/Content-Type/Authorization/payload nos 3 handlers, estrutura de resposta sem PII em `nex-health`)

Todos os testes usam mock de Supabase — nenhuma chamada real a banco de dados ou à Vercel foi feita nesta etapa.

## 5. POC controlada

**PENDENTE — POC ainda não executada.**

## 6. Cleanup e rollback

**PENDENTE — cleanup e rollback ainda não executados.**

## 7. Lições aprendidas

**PENDENTE — a preencher após a execução da POC.**

## 8. Próxima fase

**Fase 6C.6-7 — POC controlada em Production:**
1. Auditoria pré-Git final e commit isolado (somente os arquivos NEX aprovados)
2. Deploy em Vercel Production (branch `main`, sem Preview — `NEX_SYNC_SECRET` só existe em Production)
3. Validação real de RLS com `anon key` (SELECT/INSERT devem falhar)
4. Sequência fechada de 7 cenários (A–G): zero registros iniciais, criação, atualização, sem-alteração, erro de validação, segurança (auth ausente/inválida, `nex-cliente`, `nex-health`), idempotência — com dados exclusivamente fictícios (`origem_loja='primestore-udi-poc-teste'`)
5. Limpeza manual dos dados de POC, com aprovação explícita antes de qualquer `DELETE`
6. Preenchimento das seções 5, 6 e 7 deste documento com os resultados reais
