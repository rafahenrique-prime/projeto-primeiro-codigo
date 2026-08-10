# Sincronizador Bagy → Supabase

**Status:** 🟢 Fase manual documentada e encerrada (operacionalização automática — cron — ainda NÃO implementada)
**Última atualização:** 2026-08-08

## 1. Visão geral

Objetivo: manter o catálogo interno (`products`/`product_variations`, Supabase) sincronizado com o catálogo real da loja Bagy/Dooca (`https://www.primestoremen.com.br`), sem depender da API paga da Bagy nem de automação de navegador.

Fluxo:
```
Bagy/Dooca (fonte de origem, window.dooca.product embutido em cada página de produto)
   ↓ HTTP GET + extração (api/_bagySyncClient.js)
Mapper (api/_bagySyncMapper.js) — aplica regras de negócio validadas (estoque, categoria, imagem, marca)
   ↓
Compare (api/_bagySyncCompare.js) — diff campo a campo contra o que já está no Supabase
   ↓
Service/Orquestrador (api/_bagySyncService.js) — resolve duplicatas, decide o que escrever, faz retry
   ↓ (só em mode=write, só se houver diff real)
RPC transacional (public.bagy_sync_product_transaction, SECURITY DEFINER)
   ↓
Supabase (products + product_variations) — catálogo interno sincronizado
```

Bagy é sempre a fonte de verdade; o Supabase é o catálogo interno já usado pelo painel e (futuramente) pela Gabriela.

## 2. Arquitetura — responsabilidades por arquivo

| Arquivo | Responsabilidade |
|---|---|
| `api/_bagySyncClient.js` | Único ponto que fala HTTP com a Bagy. Busca a página do produto, extrai `window.dooca.product` (regex/brace-matching, sem headless browser). Não conhece Supabase, não mapeia campos, não decide nada. |
| `api/_bagySyncMapper.js` | Funções puras (sem I/O) que aplicam as regras de negócio já validadas: estoque, categoria, imagem, marca, atributos de variação, formatação de preço. Transforma `window.dooca.product` no formato de linha do Supabase. |
| `api/_bagySyncCompare.js` | Diff campo a campo entre o que já está gravado e o que o mapper propôs — para produto e para variações (casadas por `bagy_variation_id`). Não decide se escreve, só descreve a diferença. |
| `api/_bagySyncSupabase.js` | Único ponto de acesso ao Supabase do sincronizador. Leitura via chave `anon` (`VITE_SUPABASE_KEY`). Escrita em `product_variations`/`bagy_sync_runs`/`bagy_sync_exceptions` via `service_role` (`SUPABASE_SECRET_KEY`), porque RLS revoga escrita de `anon` nessas tabelas de propósito. |
| `api/_bagySyncLogger.js` | Logger estruturado em memória (`createRunLogger`) — steps com timing, usado durante a execução; não persiste nada sozinho (a persistência é feita por `_bagySyncService.js` chamando `_bagySyncSupabase.js`). |
| `api/_bagySyncService.js` | Orquestrador. `syncProduct` sincroniza 1 produto (resolve duplicata, mapeia, compara, decide escrever). `syncBatch` processa uma lista inteira, isolando falha por item, aplicando retry automático (só erro de rede), registrando exceções conhecidas e persistindo o run ao final. |
| `api/system-tools.js` (`?tool=bagy-sync-run`) | Rota HTTP manual que dispara `syncBatch` sob demanda. Não é um arquivo próprio — está dentro do endpoint combinado `system-tools.js` porque o projeto está no limite de 12 Serverless Functions do plano Hobby da Vercel. |
| `public.bagy_sync_product_transaction` (RPC, Postgres) | Única forma de escrita real. `SECURITY DEFINER`, roda `UPDATE products` + upsert de todas as variações do produto numa única transação atômica do Postgres. Chamada só com `service_role` (EXECUTE revogado de `anon`/`authenticated`). |

## 3. Schema atual

### `products` — campos relevantes à integração Bagy

| Campo | Status | Papel |
|---|---|---|
| `id`, `nome`, `preco`, `link`, `imagem`, `categoria`, `codigo`, `price_original`, `price_discount`, `discount_percent`, `status`, `synced_at`, `created_at` | já existentes (pré-integração) | Intocados — nenhum consumidor legado quebrou |
| `bagy_product_id` | **novo** (migration 020) | `bigint`, `UNIQUE` (múltiplos `NULL` permitidos) — chave estável de correspondência com a Bagy |
| `descricao` | **novo** | `text` |
| `marca` | **novo** | `text`, sempre com `.trim()` aplicado |
| `preco_pix` | **novo** | `numeric` |
| `sell_without_stock` | **novo** | `boolean` — espelha `product.selling_out_of_stock` da Bagy |
| `categoria_breadcrumb` | **novo** | `text` — caminho completo (ex. `"Acessórios > Boné"`) |
| `bagy_category_id` | **novo** | `bigint` — id estável da categoria-folha na Bagy |

Constraint: `products_bagy_product_id_key` (UNIQUE). Índice implícito pela UNIQUE.

### `product_variations` — tabela nova (migration 020)

| Campo | Tipo | Observação |
|---|---|---|
| `id` | `uuid`, PK | |
| `product_id` | `uuid`, FK → `products.id`, `ON DELETE CASCADE`, NOT NULL | índice próprio (`product_variations_product_id_idx`) |
| `bagy_variation_id` | `bigint`, UNIQUE, NOT NULL | chave de upsert (`ON CONFLICT`) |
| `attributes` | `jsonb`, NOT NULL default `{}` | genérico — sem colunas fixas `tamanho`/`cor` |
| `preco`, `preco_compare` | `numeric`, nullable | |
| `stock_quantity` | `integer`, nullable | fonte de verdade do estoque real — `NULL` = venda sem controle |
| `sell_without_stock` | `boolean`, nullable | independente do nível produto (comprovado nos testes: os dois valores mudam de forma desacoplada) |
| `imagem_principal` | `text`, nullable | |
| `synced_at` | `timestamptz`, NOT NULL default `now()` | |

RLS: ligado, `SELECT` liberado para `anon`/`authenticated`, `INSERT`/`UPDATE`/`DELETE` revogados dessas roles — só `service_role` (via RPC) escreve.

### `bagy_sync_runs` — tabela nova (migration 021)

Histórico persistente de cada execução manual (`dry_run`/`write`): `run_id` (UNIQUE), `mode`, `trigger`, `started_at`/`finished_at`/`duration_ms`, contadores (`total_analisado`, `sincronizados`, `sem_mudanca`, `total_404`, `pagina_invalida`, `duplicate_conflict`, `erro_rede`, `retries_executados`, `variacoes_inseridas`, `variacoes_atualizadas`), `status_final`, `erro_fatal`, `detalhes` (jsonb com o array completo de resultados por produto). RLS: mesmo padrão de `product_variations` (SELECT aberto, escrita só `service_role`). Índice: `started_at DESC`.

### `bagy_sync_exceptions` — tabela nova (migration 021)

Fila de casos nunca corrigidos automaticamente: `link`+`tipo` (UNIQUE composto), `tipo` ∈ `{404, pagina_invalida, duplicate_conflict}`, `detalhe` (jsonb), `primeira_deteccao`/`ultima_deteccao`, `run_id_ultima_deteccao`, `status` ∈ `{aberto, ignorado, resolvido}` (compatível com a taxonomia já usada pela Auditoria Bagy), `resolvido_em`. RLS: mesmo padrão. Índice: `status`.

## 4. Regras de negócio validadas

**Estoque** (comprovado na POC + WRITE completo, 0 anomalias em 532 produtos):
- `balance = 9999` **e** flag de venda-sem-estoque marcada → `stock_quantity = null` (nunca grava `9999` literal)
- `balance = 0` → estoque real zero
- `balance > 0` e `≠ 9999` → estoque real, gravado tal como veio
- `sell_without_stock` gravado separadamente em `products` **e** em `product_variations` — comprovadamente independentes (um mudou sem o outro mudar num teste real desta sessão)

**Categorias:**
- `product.category` presente → usa direto (`categoria`=nome, `categoria_breadcrumb`=breadcrumb, `bagy_category_id`=id)
- `product.category` ausente + `categories[]` presente → reconstrói pegando o item com breadcrumb de mais segmentos (a folha)
- os dois ausentes → mantém o que já está gravado, não apaga categoria válida existente

**Imagens:** preserva a imagem já re-hospedada no Storage do próprio Supabase (heurística: não contém `cdn.dooca.store`); caso contrário, usa `product.image.src` (fallback `images[0].src`).

**Marca:** `product.brand.name.trim()`.

**Duplicatas de `link`** (16 grupos pré-existentes no catálogo manual, antes da integração): resolução em ordem — (1) única linha com `bagy_product_id` batendo → usa ela; (2) senão, única linha com `source='bagy_sync'` → usa ela; (3) senão → `DUPLICATE_CONFLICT`, produto pulado com segurança, nunca escolhido arbitrariamente.

## 5. Segurança

- `SUPABASE_SECRET_KEY` — chave secret/service_role do projeto. Nunca prefixada `VITE_`, nunca no bundle do navegador, nunca logada/impressa. Única forma de chamar a RPC e de escrever em `product_variations`/`bagy_sync_runs`/`bagy_sync_exceptions`.
- `BAGY_SYNC_SECRET` — segredo próprio da rota manual (`Authorization: Bearer <BAGY_SYNC_SECRET>`), mesmo padrão já usado por `sync-lyra`/`stuck-check`/`lyra-webhook` em `system-tools.js`. Presente hoje em `.env.local` **e** nos 3 ambientes do Vercel (Development/Preview/Production) — mas o código da rota ainda não foi deployado (ver seção 10).
- RPC `bagy_sync_product_transaction`: `EXECUTE` revogado de `PUBLIC`/`anon`/`authenticated`, concedido só a `service_role`.
- `mode=dry_run` é o default seguro da rota manual — `mode=write` só executa com **também** `confirm=SIM` (duas partes de intenção explícita).

## 6. Transação e idempotência

A RPC roda `UPDATE products` + upsert de todas as variações do produto **numa única transação Postgres**. Qualquer erro no meio (ex. `bagy_variation_id` pertencente a outro produto — checagem explícita antes do upsert) faz `RAISE EXCEPTION`, e o Postgres desfaz tudo, incluindo o `UPDATE` já aplicado — nunca fica escrita parcial. Isso foi comprovado com um teste real de rollback nesta sessão (falha proposital numa variação, confirmado que nada foi gravado, nem o produto nem as demais variações do mesmo lote).

Idempotência: `products` via `UPDATE ... WHERE id=uuid` (natural); `product_variations` via `INSERT ... ON CONFLICT (bagy_variation_id) DO UPDATE`. Reexecutar o mesmo produto não duplica nem quebra — confirmado nos lotes de 10/50/532 e nos testes desta fase.

## 7. Retry automático

Implementado dentro de `syncBatch` (`_bagySyncService.js`), só para `erro_rede` (falha de `fetch()` pura — sem resposta HTTP nenhuma, `httpStatus === null`): tentativa original → retry em ~2s → retry em ~5s → máximo 3 tentativas totais. `404`, `pagina_invalida` e `DUPLICATE_CONFLICT` **nunca** são retentados (não são transitórios — retentar não muda o resultado). Erro estrutural (schema inesperado, anomalia de estoque) também não é retentado — indica caso não coberto pelas regras aprovadas, não falha de rede. Testado nesta sessão com um erro de rede real forçado (servidor local mata a conexão na 1ª tentativa) — o produto foi processado normalmente após 1 retry, contabilizado em `retries_executados`.

## 8. Logs e exceções

`bagy_sync_runs` grava 1 linha por execução (`syncBatch`), incluindo o array completo de resultados por produto em `detalhes` (jsonb). `bagy_sync_exceptions` recebe upsert por `link+tipo` a cada run — atualiza `ultima_deteccao` se o caso persistir, nunca toca em `status` já definido manualmente (`aberto`→`ignorado`/`resolvido` é sempre uma decisão humana, testado explicitamente nesta sessão).

**Regra arquitetural da V1 (explícita):** a persistência do log/exceções é *best-effort* — se `insertSyncRun` falhar, o resultado real do `syncBatch` (produtos sincronizados, diffs, etc.) continua sendo devolvido normalmente, com o erro de persistência reportado à parte (`persistencia.erro`). **Uma falha de log nunca desfaz nem esconde uma sincronização bem-sucedida.**

## 9. Resultados reais validados (WRITE completo do catálogo, execução única)

- 555 produtos preservados (nenhum apagado)
- 453 produtos sincronizados no lote completo (452 no write principal + 1 retry manual de uma falha de rede transitória)
- 1943 variações inseridas/atualizadas nessa etapa (confirmado pelo delta real do banco: 2130 − 187 = 1943)
- 2130 variações totais após o WRITE
- 20 exceções isoladas: 6× HTTP 404, 2× página sem `window.dooca.product` válido, 12× `DUPLICATE_CONFLICT`
- 1 falha de rede transitória, resolvida com retry manual pontual (a operacionalização desta fase automatizou esse retry — ver seção 7)
- zero duplicidade `bagy_product_id`, zero duplicidade `bagy_variation_id`, zero `stock_quantity=9999`, zero transação parcial, zero erro silencioso

## 10. Operacionalização manual (rota "Sincronizar agora")

```
GET/POST /api/system-tools?tool=bagy-sync-run
  Header: Authorization: Bearer <BAGY_SYNC_SECRET>

  mode=dry_run (default) | mode=write (exige também confirm=SIM)
  links=url1,url2 (opcional — senão usa todos os links de products)
  limit=N (opcional, só quando sem &links=)
```

Reaproveita `syncBatch` já validado — nenhuma lógica duplicada.

**Estado real:** `BAGY_SYNC_SECRET` já existe em `.env.local` (local) e nos 3 ambientes do Vercel (Development/Preview/Production) — confirmado por checagem booleana, sem imprimir o valor. **O código da rota (`case 'bagy-sync-run'` em `system-tools.js`) ainda está só local — não foi commitado nem deployado nesta fase.** A rota não está acessível em produção até isso acontecer.

## 11. Estado atual × Futuro

### ESTADO ATUAL — VALIDADO
- Leitura Bagy via `window.dooca.product` (sem API paga, sem browser automation)
- Mapeamento com regras de estoque/categoria/imagem/marca validadas em produção
- RPC transacional (atomicidade comprovada, incluindo teste real de rollback)
- Resolução segura de duplicatas de link (nunca arbitrária)
- WRITE completo do catálogo executado e validado (453 produtos, 1943 variações, zero corrupção)
- Logs persistentes (`bagy_sync_runs`) e fila de exceções (`bagy_sync_exceptions`) implementados e testados
- Retry automático limitado (só erro de rede, máx. 3 tentativas) implementado e testado
- Rota manual protegida por Bearer secret, `dry_run` como default seguro, `write` exige `confirm=SIM`
- `BAGY_SYNC_SECRET` configurada localmente e nos 3 ambientes do Vercel

### PLANEJADO FUTURO — NÃO IMPLEMENTADO
- Deploy (commit/push) do código da rota manual
- Cron em `dry_run` (observação, sem escrita)
- Cron em `write` (só após aprovação do dry_run)
- Catálogo V1 (próxima fase, fora deste checkpoint)
- Auditoria Bagy V2 (evoluir `api/bagy-audit.js` para usar `window.dooca.product` em vez de só JSON-LD)
- Integração visual entre Catálogo e Auditoria Bagy
- Gabriela / `_toolConsultarProduto.js` lendo `product_variations`, estoque, `preco_pix`
- Melhoria de normalização de `attributes` (43% ainda em fallback genérico)
- Revisão manual das 20 exceções isoladas (404/página inválida/duplicate_conflict)

## 12. Limitações atuais conhecidas

- 16 grupos de `link` duplicado pré-existentes no catálogo manual — 7 prováveis duplicatas reais, 6 produtos distintos compartilhando link por engano, mais casos de lixo (`teste.com`). Nenhum corrigido automaticamente — ficam como `DUPLICATE_CONFLICT`, aguardando decisão humana.
- 6 produtos com 404 real na Bagy e 2 com página sem marcador válido (um produto genuinamente quebrado, um link de busca salvo por engano como se fosse produto) — nenhum apagado/desativado, só registrado.
- 43% das variações do catálogo (839 de 1943) caem no fallback genérico de nome de atributo (não são "tamanho" nem "cor" reconhecíveis pela heurística `TAMANHO`/`COR`) — dado preservado (`attributes` genérico), mas sem normalização fina ainda.
- `erro_rede` não vira linha em `bagy_sync_exceptions` (só as 3 categorias 404/pagina_invalida/duplicate_conflict entram na fila) — fica só no `detalhes` do run.

## Referências

- Decisão arquitetural: [`docs/decisions/0001-bagy-sync-scraping-http-rpc-manual.md`](../decisions/0001-bagy-sync-scraping-http-rpc-manual.md)
- Schema Supabase: [`docs/SUPABASE.md`](../SUPABASE.md)
- Estrutura geral do projeto: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)
