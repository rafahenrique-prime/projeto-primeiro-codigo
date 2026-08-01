# NEX Integration — Fase 6C

**Status:** Fase 6C **concluída e validada em Production**. Código e testes locais concluídos nas Fases 6C.3 (helper `api/_nexClientes.js` + testes) e 6C.4 (endpoints/handlers em `api/system-tools.js`). Segredo `NEX_SYNC_SECRET` configurado na Fase 6C.5. Migration `016_nex_clientes.sql` aplicada manualmente no Supabase Production em 2026-07-31. Um bug real de Production foi encontrado e corrigido na Fase 6C.6 (ver §5). POC controlada executada com sucesso em Production na Fase 6C.7, com cleanup confirmado (ver §6-§7). Commits: `faffb99` (código inicial) e `a595ab5` (hotfix).

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

**RLS:** a migration `016_nex_clientes.sql` define Row Level Security habilitada com **zero policies** em `nex_clientes` e `nex_sync_eventos` — mesmo padrão de `qwen_health_state` (015). (`profile_learning_audit`, 013/014, é mais restritiva que o padrão `allow all` do resto do projeto, mas **não** é zero-policy — tem uma policy de `SELECT` liberada; ver `docs/SUPABASE.md §4` para a distinção completa.) Pela definição da migration, sem `service_role` qualquer `SELECT`/`INSERT`/`UPDATE`/`DELETE` em `nex_clientes`/`nex_sync_eventos` deveria retornar `permission_denied` (código `42501`).

**O que foi validado empiricamente vs. o que não foi:**
- ✅ **Acesso via `service_role` (REST, `apikey: SUPABASE_SECRET_KEY`) foi validado em Production** — toda a POC da Fase 6C.7 (criação, atualização, idempotência, consultas) rodou com sucesso usando esse caminho.
- ❌ **O teste explícito de `SELECT`/`INSERT` com `anon key` contra `nex_clientes`/`nex_sync_eventos` não foi executado** — a sequência A-G aprovada para a POC não incluiu esse cenário.
- **Isso permanece uma pendência de segurança de baixa complexidade** (validar é uma chamada REST simples com a chave anon, já documentada em `docs/SUPABASE.md §1`) — não um risco confirmado, já que a definição da migration está correta e o padrão é idêntico ao de `qwen_health_state`, já validado anteriormente (`docs/SUPABASE.md §3.6`).
- **Essa pendência não invalida a POC funcional dos endpoints autenticados** — a autenticação por `NEX_SYNC_SECRET` nos 3 endpoints foi testada e funciona corretamente independente do resultado desse teste de RLS específico.

**Formato da `SUPABASE_SECRET_KEY`:** não foi possível classificar formalmente (novo `sb_secret_...` vs. legado JWT `service_role`) — variável Sensitive/Encrypted na Vercel, sem caminho de leitura via CLI (`vercel env pull` devolve valor vazio por design) nem MCP do Supabase (só expõe chaves publishable/anon). Na prática, isso deixou de ser uma incerteza bloqueante: os headers `apikey`-only (mesmo padrão de `_profileLearning.js`/`qwenHealthSupabaseHeaders()`) foram **validados empiricamente contra Production durante toda a POC da Fase 6C.7** (criação, atualização, idempotência, consultas) — funcionam corretamente independentemente do formato exato da chave.

## 4. Testes automatizados

**70/70 testes PASSING** (`npx vitest run`, modo não-watch):
- `api/__tests__/nexClientes.test.js` — 42 testes (31 originais de validação/normalização/hash/classificação/upsert/lote + 4 cenários E2E, mais 11 testes de regressão adicionados na Fase 6C.6 após o bug de Production — ver §5)
- `api/__tests__/systemToolsNex.test.js` — 28 testes (24 originais de validação de forma de request/response, mais 4 **testes comportamentais** que exercitam o `default export` real de `system-tools.js`)

**Cobertura comportamental dos handlers reais (Fase 6C.6):** os 4 testes novos em `systemToolsNex.test.js` não simulam apenas o formato de request/response — eles importam e executam a função real que trata `nex-sync-clientes`, `nex-cliente` e `nex-health` (via `vi.resetModules()` + import dinâmico, com `@base44/sdk` e `api/_nexClientes.js` mockados). Isso garante que:
- os 3 handlers montam corretamente um `supabaseConfig` (`{baseUrl, headers}`) e delegam a `processarLote`/`obterClienteComEventos`/`obterAgregados`;
- nenhum dos 3 chama `createClient` do `@base44/sdk`;
- se o bug de Production voltar a acontecer (reintrodução do `createClient` errado), a suíte quebra imediatamente, sem depender de deploy pra descobrir.

Isso fecha exatamente a lacuna que permitiu o bug original passar despercebido: os testes anteriores (Fase 6C.3/6C.4) mockavam uma API chainable do Supabase-JS que não existe de verdade neste projeto — nunca exercitavam a linha real de instanciação do client, por isso nunca detectaram a confusão de nomes com o `createClient` do Base44.

## 5. Bug de Production e correção (Hotfix, Fase 6C.6)

**O bug:** o primeiro deploy do código (commit `faffb99`, 2026-07-31) chegou a Production com um erro de implementação nos 3 handlers NEX de `api/system-tools.js`. O código instanciava `createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)` esperando o cliente do Supabase-JS (`.from(tabela).select()...`), mas `createClient` **já estava importado no topo do arquivo a partir do `@base44/sdk`** (usado pelas integrações Lyra/PRIME Cobranças, assinatura `{appId, headers}`). O nome compartilhado fez o código NEX chamar por engano o `createClient` do Base44, cujo retorno não tem método `.from()`.

**Sintoma em Production:** `GET /api/system-tools?tool=nex-health` retornava `HTTP 500` com `{"erro":"Falha ao consultar Supabase"}`. O log real (`vercel logs --json`) expôs a causa exata: `erro: 'supabase.from is not a function'`.

**Como foi identificado:** através da validação pós-deploy da Fase 6C.6 — os 3 testes seguros de leitura (GET `nex-health` público, POST `nex-sync-clientes` sem auth, GET `nex-cliente` sem auth) contra o deployment real revelaram o `500`. Os 55 testes automatizados anteriores (Fase 6C.3/6C.4) **não pegaram o bug** porque mockavam diretamente uma API chainable do Supabase-JS que não existe de verdade neste projeto — nunca exercitavam a linha real de instanciação do client.

**A correção (commit `a595ab5`):**
- Removido 100% o uso de `createClient` (de qualquer origem, Base44 ou Supabase-JS) no fluxo NEX
- Implementado acesso ao Supabase via **REST direto com `fetch`**, mesmo padrão já usado em `api/_profileLearning.js` e `qwenHealthSupabaseHeaders()` (`docs/SUPABASE.md §1`)
- Toda a lógica de acesso concentrada em `api/_nexClientes.js`: novo wrapper REST privado (`montarUrl`/`restRequest`/`parseContagem`) + 2 funções novas (`obterClienteComEventos`, `obterAgregados`) que assumiram a lógica que antes estava inline em `system-tools.js`
- `api/system-tools.js` ficou reduzido, nos 3 handlers, a: validar HTTP/auth → montar `supabaseConfig` (`{baseUrl, headers}`) → delegar ao helper → devolver a resposta
- Nenhum contrato HTTP mudou (status codes, formato de resposta, `NEX_SYNC_SECRET`, limite de 500, `content_hash`, `ausente_desde`, RLS, isolamento do Base44 — todos preservados)
- Cobertura de regressão adicionada (ver §4) para impedir que o mesmo erro volte a passar despercebido

## 6. Resultado da POC (Fase 6C.7, executada em Production)

Sequência fechada A–G, com dados exclusivamente fictícios (`origem_loja='primestore-udi-poc-teste'`, `nex_codigo` prefixado `POC-`, `cpf_cnpj`/`telefone`/`celular` sempre `null`, e-mail `.invalid`, endereço claramente fictício, `metadados.poc=true`, `metadados.fase="6C.6-7"`):

| Etapa | Validação | Resultado |
|---|---|---|
| Pré-POC | 0 clientes/eventos antes de qualquer escrita | ✅ Confirmado (404 nos 3 códigos) |
| A — Criação | 3 clientes novos, tipo `criado` | ✅ HTTP 200, 3× `criado` |
| B — Atualização | Mudança de dados classificada como `atualizado`, mesmo ID | ✅ HTTP 200, `atualizado` |
| C — Reenvio idêntico | `content_hash` igual → `sem_alteracao`, nenhum evento novo | ✅ HTTP 200, sem evento novo |
| D — Registro inválido | Erro estruturado, nada persistido | ✅ HTTP 200, erro `"nex_codigo obrigatório"` |
| E — Consulta individual | `nex-cliente` autenticado retorna cliente + histórico correto, sem PII indevida | ✅ HTTP 200, dados e histórico corretos |
| F — Agregados | `nex-health?force=true` autenticado reflete o estado real, sem cache | ✅ HTTP 200, agregados corretos |
| G — Idempotência em lote | Reenvio do lote inteiro → 3× `sem_alteracao`, nada duplicado | ✅ HTTP 200, sem duplicação |

**Contagem final antes do cleanup:** 3 clientes, 4 eventos (3 `criado` + 1 `atualizado`) — exatamente como projetado.

**Cleanup:** executado manualmente no SQL Editor do Supabase, na seguinte sequência factual:
1. A primeira tentativa executou um texto inválido no SQL Editor e falhou com erro de sintaxe (nenhum efeito no banco)
2. Em seguida, consultas `SELECT` de contagem confirmaram o estado ainda existente: 3 clientes, 4 eventos
3. O bloco `DELETE` (em `nex_sync_eventos`, depois `nex_clientes`, filtrado estritamente por `origem_loja='primestore-udi-poc-teste'` + `metadados`) + `COMMIT` foi executado com sucesso
4. Consultas diretas ao banco após esse `COMMIT` retornaram `0`/`0`
5. `nex-health?force=true` confirmou o mesmo resultado: `total_clientes=0`, `total_eventos=0`

Ambiente devolvido ao estado limpo. Nenhum dado fora dessa origem, nenhuma migration (016/017/018), PRIME Bridge ou Base44 foi tocado em nenhuma etapa.

**Rollback:** não foi necessário em nenhum momento — o hotfix funcionou na primeira tentativa pós-deploy, sem exigir reversão.

## 7. Lições aprendidas

- **Mocks que simulam uma API que não existe de verdade no projeto escondem bugs de integração.** Os testes originais mockavam a API chainable do Supabase-JS (`.from().select().eq()...`), que este projeto nunca usou de fato (todo o resto do código acessa Supabase via REST/`fetch`). O mock parecia razoável, mas nunca teria detectado o bug real.
- **Imports com nomes iguais para propósitos diferentes são uma armadilha silenciosa.** `createClient` já estava vinculado ao SDK do Base44 no topo do arquivo; reaproveitar o mesmo nome para outra biblioteca/intenção (Supabase) compilou e passou nos testes locais sem nenhum aviso — só quebrou em tempo de execução, contra dados reais.
- **Só a validação contra Production real revelou o bug.** Nem os 66 testes locais da Fase 6C.4/6C.5, nem a auditoria de código, pegaram isso — só uma chamada HTTP real contra o deployment expôs o erro. Reforça por que a Fase 6C.6 (validação pós-deploy antes de qualquer POC com dados) é uma etapa obrigatória, não opcional.
- **Secret Keys marcadas "Sensitive" na Vercel são genuinamente write-only.** Nem a CLI (`vercel env pull`) nem o MCP do Supabase conseguem devolver o valor depois de criado — confirmado empiricamente duas vezes nesta fase (com `NEX_SYNC_SECRET` e ao tentar classificar `SUPABASE_SECRET_KEY`). Perda do valor original exige regeneração completa, nunca recuperação.
- **O cache do `nex-health` pode mascarar validações imediatas após uma escrita.** Uma leitura logo após um `INSERT`/`UPDATE`/`DELETE` pode devolver dados momentaneamente desatualizados (cache de até 3 min); `?force=true` (autenticado) bypassa o cache e deve ser preferido em qualquer validação imediata pós-escrita.

## 8. Pendências Técnicas Futuras

1. **`updated_at` não é atualizado durante o upsert.** A coluna existe em `nex_clientes` (migration 016), mas nenhum código escreve nela explicitamente no upsert — permanece com o timestamp da criação mesmo após uma atualização real. **Prioridade: baixa.** Não bloqueia produção (idempotência e classificação dependem de `content_hash`, não de `updated_at`).
2. **Confirmar oficialmente o tipo da `SUPABASE_SECRET_KEY`** (novo formato `sb_secret_...` ou legado JWT `service_role`). **Prioridade: baixa.** Já validado empiricamente em Production durante a POC da Fase 6C.7 — os headers `apikey`-only funcionam corretamente na prática, independente do formato exato.

## Próxima Fase — PrimeIntegracaoNex

A API do IGNITE PRIME para a integração NEX está validada ponta a ponta em Production: código corrigido, testes automatizados (incluindo cobertura comportamental dos handlers reais) e uma POC completa com dados fictícios, cobrindo criação, atualização, idempotência, validação de erro, consulta individual e agregados — encerrada com o ambiente limpo.

A próxima etapa é integrar o **`PrimeIntegracaoNex`**, o aplicativo Windows (fora deste repositório) responsável por extrair os clientes reais do sistema NEX da loja física e enviá-los para os endpoints já validados aqui (`nex-sync-clientes`, autenticado por `NEX_SYNC_SECRET`). Nenhuma implementação dessa integração foi iniciada — esta seção é só um registro de intenção para a próxima fase.
