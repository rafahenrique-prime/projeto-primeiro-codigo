# Sincronizador Bagy → Supabase

**Status:** 🟢 Auditoria Bagy V2 completa — descoberta de produtos novos, INSERT transacional e proteção por senha de ação implementados, testados e **deployados em produção**. Cron/automação ativa ainda NÃO implementada.
**Última atualização:** 2026-08-10
**Deployment validado:** `dpl_6P8TqTqezz9CH8aiadP66Fwu1aQi`, alias `ignite-webhook.vercel.app`
**Commit principal:** `88b63ee` — `feat(bagy): complete v2 sync and new product discovery`

## 1. Visão geral

Objetivo: manter o catálogo interno (`products`/`product_variations`, Supabase) sincronizado com o catálogo real da loja Bagy/Dooca (`https://www.primestoremen.com.br`), sem depender da API paga da Bagy nem de automação de navegador. Cobre tanto **produtos já conhecidos** (UPDATE) quanto **produtos totalmente novos publicados na Bagy** (INSERT).

Fluxo de produtos já conhecidos (UPDATE):
```
Bagy/Dooca (fonte de origem, window.dooca.product embutido em cada página de produto)
   ↓ HTTP GET + extração (api/_bagySyncClient.js)
Mapper (api/_bagySyncMapper.js) — aplica regras de negócio validadas (estoque, categoria, imagem, marca)
   ↓
Compare (api/_bagySyncCompare.js) — diff campo a campo contra o que já está no Supabase
   ↓
Service/Orquestrador (api/_bagySyncService.js) — resolve duplicatas, decide o que escrever, faz retry
   ↓ (só em mode=write, só se houver diff real)
RPC transacional (public.bagy_sync_product_transaction, branch UPDATE)
   ↓
Supabase (products + product_variations) — catálogo interno sincronizado
```

Fluxo de descoberta de produtos novos (Auditoria Bagy V2 — Etapas A/B/C):
```
/produtos?page=N (listagem paginada da Bagy — fonte oficial de descoberta,
                   NÃO o sitemap.xml — ver §4.1)
   ↓ descobrirCatalogoBagy() (api/_bagySyncClient.js) — pagina até página vazia,
      normaliza cada link (normalizeLink)
   ↓
Comparação em memória: linksBagy − linksSupabase (products.link, também
   normalizado) = candidatos brutos
   ↓ Para cada candidato: revalidação (descobrirProdutosNovos, api/system-tools.js)
      1. releitura real via fetchBagyProductByLink
      2. extrai bagy_product_id
      3. confirma que esse bagy_product_id ainda não existe em products
         (getProductByBagyId)
   ↓ (só passa quem sobrevive às 3 checagens)
produtosNovos — exibido no resumo do dry_run, nada escrito ainda
   ↓ (só em mode=write, só para os produtos validados nesta mesma requisição)
syncNewProduct (api/_bagySyncService.js) → RPC transacional
   (public.bagy_sync_product_transaction, branch p_product_id=NULL → INSERT)
   ↓
Supabase (novo produto + suas variações, inseridos na mesma transação)
```

Bagy é sempre a fonte de verdade; o Supabase é o catálogo interno já usado pelo painel (Catálogo V1, ver [`CATALOGO-V1.md`](CATALOGO-V1.md)) e, futuramente, pela Gabriela.

## 2. Arquitetura — responsabilidades por arquivo

| Arquivo | Responsabilidade |
|---|---|
| `api/_bagySyncClient.js` | Único ponto que fala HTTP com a Bagy. Busca a página do produto, extrai `window.dooca.product` (regex/brace-matching, sem headless browser). Não conhece Supabase, não mapeia campos, não decide nada. |
| `api/_bagySyncMapper.js` | Funções puras (sem I/O) que aplicam as regras de negócio já validadas: estoque, categoria, imagem, marca, atributos de variação, formatação de preço. Transforma `window.dooca.product` no formato de linha do Supabase. |
| `api/_bagySyncCompare.js` | Diff campo a campo entre o que já está gravado e o que o mapper propôs — para produto e para variações (casadas por `bagy_variation_id`). Não decide se escreve, só descreve a diferença. |
| `api/_bagySyncSupabase.js` | Único ponto de acesso ao Supabase do sincronizador. Leitura via chave `anon` (`VITE_SUPABASE_KEY`). Escrita em `product_variations`/`bagy_sync_runs`/`bagy_sync_exceptions` via `service_role` (`SUPABASE_SECRET_KEY`), porque RLS revoga escrita de `anon` nessas tabelas de propósito. |
| `api/_bagySyncLogger.js` | Logger estruturado em memória (`createRunLogger`) — steps com timing, usado durante a execução; não persiste nada sozinho (a persistência é feita por `_bagySyncService.js` chamando `_bagySyncSupabase.js`). |
| `api/_bagySyncService.js` | Orquestrador. `syncProduct` sincroniza 1 produto conhecido (resolve duplicata, mapeia, compara, decide escrever). `syncNewProduct` insere 1 produto novo + variações (reaproveita o mapper, nunca duplica regra). `syncBatch` processa uma lista inteira de produtos conhecidos, isolando falha por item, aplicando retry automático (só erro de rede), registrando exceções conhecidas e persistindo o run ao final. |
| `api/system-tools.js` (`?tool=bagy-sync-run`) | Rota HTTP externa (GitHub Actions/futuro cron), protegida por `Authorization: Bearer <BAGY_SYNC_SECRET>`. Dispara `syncBatch` sob demanda. Não é um arquivo próprio — está dentro do endpoint combinado `system-tools.js` porque o projeto está no limite de 12 Serverless Functions do plano Hobby da Vercel. |
| `api/system-tools.js` (`?tool=bagy-sync-run-ui`) | Rota HTTP usada pelos botões "Verificar agora"/"Sincronizar agora" da Auditoria Bagy V2 (painel interno). Protegida por `BAGY_UI_ACTION_SECRET` (não pelo `BAGY_SYNC_SECRET`, que nunca é exposto ao frontend — ver §5). Reaproveita `montarLinksParaSyncBagy`/`executarBagySyncBatch` (mesma lógica da rota externa, zero duplicação) e adiciona a descoberta de produtos novos (`descobrirProdutosNovos`) e, em `mode=write`, a inserção deles (`processarProdutosNovosWrite`). |
| `public.bagy_sync_product_transaction` (RPC, Postgres) | Única forma de escrita real, para produto conhecido **e** produto novo. `SECURITY DEFINER`. `p_product_id` não-nulo → branch UPDATE (produto conhecido) + upsert de variações. `p_product_id = NULL` → branch INSERT (produto novo, migrations 022/023) + upsert de variações — tudo numa única transação atômica do Postgres. Chamada só com `service_role` (EXECUTE revogado de `anon`/`authenticated`). |

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

### `bagy_sync_product_transaction` — RPC estendida (migrations 022 e 023)

A mesma function da migration 020 foi estendida de forma aditiva (nenhuma linha do branch UPDATE original foi alterada):
- **022** — adiciona o branch `p_product_id IS NULL` → `INSERT INTO products` (só com os campos que o mapper produz; `status`/`source`/`codigo` não são forçados no payload, ficam a cargo dos defaults do próprio schema) + `RETURNING id` reaproveitado pro upsert de variações na mesma transação. Guarda de idempotência explícita: se `bagy_product_id` já existir, `RAISE EXCEPTION` antes de qualquer INSERT (mesma proteção de `bagy_variation_id` já existente desde a 020).
- **023** — microajuste: o branch de INSERT passou a gravar `source='bagy_sync'` explicitamente quando informado pelo caller (o INSERT original da 022 não incluía essa coluna, então o produto nascia com o default global `'bagy'`, diferente do valor que o fluxo de UPDATE sempre grava — gerava uma "alteração necessária" fantasma no dry_run seguinte). Default global da coluna **não foi alterado** — só o payload deste caminho específico passou a informar o valor.

Nenhuma migration nova em `bagy_sync_runs` — os campos de descoberta (`produtosNovos`, `candidatosBrutos`, `descartados`, `descobertaErro`) **não são persistidos** nessa tabela (decisão deliberada, ver §8).

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

## 4.1 Descoberta de produtos novos

**Fonte oficial: `/produtos?page=N` (listagem paginada da Bagy) — não o `sitemap.xml`.** Validado com dados reais: o sitemap inclui páginas não-produto (home, categorias, institucional) e demora mais a refletir produtos recém-publicados; a listagem paginada já vem limpa (só cards de produto) e é a fonte usada pelo código (`descobrirCatalogoBagy`, `api/_bagySyncClient.js`). Paginação para na primeira página sem cards (~24 páginas hoje), com teto de segurança (`maxPages`) contra loop infinito.

**Comparação:** `linksBagy` (da listagem, normalizados) menos `linksSupabase` (`products.link`, mesma normalização) = candidatos brutos. O lote de verificação dos produtos **já conhecidos** (`syncBatch`) continua recebendo **todos** os `products.link`, sem filtro — a descoberta nunca reduz nem substitui esse lote.

**Validação por `bagy_product_id`, não só por link** — cada candidato passa por 3 checagens antes de virar `produtosNovos`:
1. releitura real da página (`fetchBagyProductByLink`) — confirma que o produto existe de verdade
2. `bagy_product_id` extraído do produto lido
3. confirma que esse `bagy_product_id` (não só o link) ainda não existe em `products` — cobre o caso raro de um produto já conhecido ter mudado de slug/URL na Bagy

**Criação do produto e variações:** só em `mode=write`, só para os candidatos validados na mesma requisição (nunca confia numa lista antiga de um dry_run anterior) — `syncNewProduct` relê o produto de novo, reconfirma que o `bagy_product_id` ainda não existe (defesa em profundidade, mesma checagem que a RPC também faz), e só então chama a RPC (branch INSERT). `source` gravado explicitamente como `'bagy_sync'` (migration 023).

**Comportamento observado da Bagy (não é bug do sincronizador):** produtos recém-publicados/duplicados na Bagy podem demorar alguns minutos para refletir em `/produtos?page=N` — a própria interface da Bagy avisa isso ao usuário no momento da criação ("Esta alteração poderá levar alguns minutos para refletir em sua loja virtual devido às camadas de cache"). Um "Verificar agora" rodado muito perto do momento da publicação pode não encontrar o produto ainda; uma nova verificação minutos depois encontra normalmente (comprovado nos testes reais — ver §9).

## 5. Segurança

- `SUPABASE_SECRET_KEY` — chave secret/service_role do projeto. Nunca prefixada `VITE_`, nunca no bundle do navegador, nunca logada/impressa. Única forma de chamar a RPC e de escrever em `product_variations`/`bagy_sync_runs`/`bagy_sync_exceptions`.
- `BAGY_SYNC_SECRET` — segredo próprio da rota externa (`?tool=bagy-sync-run`, `Authorization: Bearer <BAGY_SYNC_SECRET>`), mesmo padrão já usado por `sync-lyra`/`stuck-check`/`lyra-webhook` em `system-tools.js`. Uso: GitHub Actions/futuro cron — nunca chamado direto do frontend. Presente em `.env.local` e nos 3 ambientes do Vercel.
- `BAGY_UI_ACTION_SECRET` — segredo **separado e isolado** de `BAGY_SYNC_SECRET`, usado pela rota `?tool=bagy-sync-run-ui` (painel interno — "Verificar agora"/"Sincronizar agora"/Ignorar/Reativar exceção) e também reaproveitado nas rotas legadas `bagy-audit`/`bagy-audit-ignore` (mesmo secret, evita criar um terceiro). Comparação segura (`crypto.timingSafeEqual`, função `compararSegredoSeguro`), falha fechada (`503` se a env var não estiver configurada, nunca "sem configuração = libera"). O usuário digita uma senha de ação no modal a cada clique — nunca persistida em `localStorage`, nunca em `VITE_*`, nunca vista pelo frontend fora do campo de senha efêmero.
- RPC `bagy_sync_product_transaction`: `EXECUTE` revogado de `PUBLIC`/`anon`/`authenticated`, concedido só a `service_role`. Vale para os dois branches (UPDATE e INSERT).
- `mode=dry_run` é o default seguro das duas rotas (externa e UI) — `mode=write` só executa com **também** `confirm=SIM` (duas partes de intenção explícita). Na rota UI, isso vale igual para o INSERT de produtos novos (não existe um terceiro modo/confirmação separada — mesma confirmação cobre update e insert).

## 6. Transação e idempotência

A RPC roda `UPDATE products` + upsert de todas as variações do produto **numa única transação Postgres**. Qualquer erro no meio (ex. `bagy_variation_id` pertencente a outro produto — checagem explícita antes do upsert) faz `RAISE EXCEPTION`, e o Postgres desfaz tudo, incluindo o `UPDATE` já aplicado — nunca fica escrita parcial. Isso foi comprovado com um teste real de rollback nesta sessão (falha proposital numa variação, confirmado que nada foi gravado, nem o produto nem as demais variações do mesmo lote).

Idempotência: `products` via `UPDATE ... WHERE id=uuid` (natural); `product_variations` via `INSERT ... ON CONFLICT (bagy_variation_id) DO UPDATE`. Reexecutar o mesmo produto não duplica nem quebra — confirmado nos lotes de 10/50/532 e nos testes desta fase.

## 7. Retry automático

Implementado dentro de `syncBatch` (`_bagySyncService.js`), só para `erro_rede` (falha de `fetch()` pura — sem resposta HTTP nenhuma, `httpStatus === null`): tentativa original → retry em ~2s → retry em ~5s → máximo 3 tentativas totais. `404`, `pagina_invalida` e `DUPLICATE_CONFLICT` **nunca** são retentados (não são transitórios — retentar não muda o resultado). Erro estrutural (schema inesperado, anomalia de estoque) também não é retentado — indica caso não coberto pelas regras aprovadas, não falha de rede. Testado nesta sessão com um erro de rede real forçado (servidor local mata a conexão na 1ª tentativa) — o produto foi processado normalmente após 1 retry, contabilizado em `retries_executados`.

## 8. Logs e exceções

`bagy_sync_runs` grava 1 linha por execução (`syncBatch`), incluindo o array completo de resultados por produto em `detalhes` (jsonb). `bagy_sync_exceptions` recebe upsert por `link+tipo` a cada run — atualiza `ultima_deteccao` se o caso persistir, nunca toca em `status` já definido manualmente (`aberto`→`ignorado`/`resolvido` é sempre uma decisão humana, testado explicitamente nesta sessão).

**Regra arquitetural da V1 (explícita):** a persistência do log/exceções é *best-effort* — se `insertSyncRun` falhar, o resultado real do `syncBatch` (produtos sincronizados, diffs, etc.) continua sendo devolvido normalmente, com o erro de persistência reportado à parte (`persistencia.erro`). **Uma falha de log nunca desfaz nem esconde uma sincronização bem-sucedida.**

**Descoberta de produtos novos NÃO é persistida em `bagy_sync_runs`** — `produtosNovos`, `candidatosBrutos`, `descartados`, `descobertaErro`, `totalPaginasBagy`/`totalLinksBagy` (e, em write, `produtosNovosInseridos`/`produtosNovosFalhas`) existem só na resposta HTTP ao vivo daquela requisição, nunca gravados em nenhuma tabela. Decisão deliberada da Auditoria V2 (evitar migration em `bagy_sync_runs` e evitar mudar o formato de `detalhes`, que hoje é um array puro de resultados por produto conhecido — mudar pra objeto quebraria esse contrato). **Limitação real conhecida:** não é possível, depois do fato, reconstruir o que uma execução específica de descoberta encontrou ou deixou de encontrar — só o resultado dos produtos já conhecidos (`resumo`/`detalhes`) fica no histórico.

## 9. Resultados reais validados (WRITE completo do catálogo, execução única)

- 555 produtos preservados (nenhum apagado)
- 453 produtos sincronizados no lote completo (452 no write principal + 1 retry manual de uma falha de rede transitória)
- 1943 variações inseridas/atualizadas nessa etapa (confirmado pelo delta real do banco: 2130 − 187 = 1943)
- 2130 variações totais após o WRITE
- 20 exceções isoladas: 6× HTTP 404, 2× página sem `window.dooca.product` válido, 12× `DUPLICATE_CONFLICT`
- 1 falha de rede transitória, resolvida com retry manual pontual (a operacionalização desta fase automatizou esse retry — ver seção 7)
- zero duplicidade `bagy_product_id`, zero duplicidade `bagy_variation_id`, zero `stock_quantity=9999`, zero transação parcial, zero erro silencioso

## 9.1 Testes reais em produção — Auditoria Bagy V2 (Etapas A/B/C)

Executados contra o Supabase de produção real e, depois do deploy `dpl_AaNh4Lk18RhE3t3CPk5A6ELjUWcw`/`dpl_6P8TqTqezz9CH8aiadP66Fwu1aQi`, contra a URL pública real (`ignite-webhook.vercel.app`) — não simulação:

- **Regata Alo Feminina Importada Branca - TESTE OFICIAL** (`bagy_product_id 10493527`): criada manualmente na Bagy, descoberta corretamente por "Verificar agora" em produção real, inserida via "Sincronizar agora" real (fluxo oficial, `BAGY_UI_ACTION_SECRET` + `confirm=SIM`) — 4 variações importadas corretamente, `source='bagy_sync'`, zero duplicidade, dry_run seguinte mostrou "sem mudança".
- **Regata Alo Feminina Importada Preta - Anuncio Teste 002** (`bagy_product_id 10494395`): primeiro clique em "Verificar agora" (logo após a criação na Bagy) **não** encontrou o produto — investigado a fundo (rastreio de código ponta a ponta + reexecução isolada da descoberta + chamada direta ao mesmo endpoint de produção); nenhuma falha de código foi encontrada em nenhuma camada (frontend, backend, descoberta) — todas testadas, todas corretas. A explicação mais sustentada pela evidência disponível é atraso de cache/indexação do lado da Bagy (comportamento que a própria Bagy avisa ao usuário — ver §4.1), não um bug do sincronizador. Uma verificação seguinte, minutos depois, encontrou o produto normalmente e a sincronização foi concluída com sucesso (4 variações, `source='bagy_sync'` correto).
- **16 outros produtos novos** detectados e inseridos num teste de Etapa C (2 controlados primeiro — 1 simples/1 variação, 1 complexo/10 variações — depois os 13 restantes pelo mesmo caminho, sem tratamento especial): zero falhas, zero duplicidade.
- **Idempotência confirmada em produção real:** reexecutar "Verificar agora" depois de qualquer inserção nunca reoferece o mesmo produto como novo (ele passa a aparecer no lote de produtos conhecidos, "sem mudança").
- **Rollback forçado testado** (branch de INSERT): payload com uma variação propositalmente conflitante — a RPC abortou, o produto **não** ficou inserido (confirmado via query direta antes/depois).

**Falha de rede transitória observada, não corrigida ainda:** numa das execuções reais de produção, 1 produto conhecido (não relacionado à descoberta) falhou com "fetch failed" (provavelmente numa chamada Supabase dentro de `syncProduct`, fora da leitura inicial da Bagy — a única categoria hoje classificada como `erro_rede` é a falha na leitura da Bagy). Essa falha não classificada faz `status_final` da run virar `'falha'` mesmo quando só 1 de ~548 produtos foi afetado. **Isso é uma limitação real, pré-existente (não introduzida pela Auditoria V2), ainda não corrigida** — ver §12.

## 10. Operacionalização

### Rota externa (GitHub Actions/futuro cron)
```
GET/POST /api/system-tools?tool=bagy-sync-run
  Header: Authorization: Bearer <BAGY_SYNC_SECRET>

  mode=dry_run (default) | mode=write (exige também confirm=SIM)
  links=url1,url2 (opcional — senão usa todos os links de products)
  limit=N (opcional, só quando sem &links=)
```
Reaproveita `syncBatch` já validado — nenhuma lógica duplicada. `BAGY_SYNC_SECRET` configurado local e nos 3 ambientes Vercel.

### Rota do painel interno — "Verificar agora" / "Sincronizar agora"
```
POST /api/system-tools?tool=bagy-sync-run-ui
  Body: { mode: "dry_run" | "write", confirm: "SIM" (só se write), actionSecret }
```
Sem `Authorization` header — a senha de ação vem no corpo, digitada pelo usuário a cada clique. Reaproveita `montarLinksParaSyncBagy`/`executarBagySyncBatch` (produtos conhecidos, zero duplicação com a rota externa) e adiciona `descobrirProdutosNovos` (sempre executada, dry_run e write) + `processarProdutosNovosWrite` (só em write, só para os candidatos validados nessa mesma requisição).

**Estado real:** código commitado (`88b63ee`) e **deployado em produção** (`ignite-webhook.vercel.app`, deployment `dpl_6P8TqTqezz9CH8aiadP66Fwu1aQi`) — confirmado por fingerprint real do bundle e por chamadas HTTP reais ao endpoint (não só pelo CLI reportar sucesso). `BAGY_UI_ACTION_SECRET` configurado em `.env.local` e nos ambientes Preview/Production do Vercel.

## 11. Estado atual × Futuro

### ESTADO ATUAL — VALIDADO E EM PRODUÇÃO
- Leitura Bagy via `window.dooca.product` (sem API paga, sem browser automation)
- Mapeamento com regras de estoque/categoria/imagem/marca validadas em produção
- RPC transacional (atomicidade comprovada, incluindo teste real de rollback), agora com branch UPDATE **e** branch INSERT
- Resolução segura de duplicatas de link (nunca arbitrária)
- WRITE completo do catálogo já executado múltiplas vezes, incluindo em produção real, sem corrupção
- Logs persistentes (`bagy_sync_runs`) e fila de exceções (`bagy_sync_exceptions`) implementados e testados
- Retry automático limitado (só erro de rede na leitura da Bagy, máx. 3 tentativas) implementado e testado
- Rota externa protegida por Bearer secret (`BAGY_SYNC_SECRET`); rota do painel protegida por senha de ação (`BAGY_UI_ACTION_SECRET`) — `dry_run` como default seguro nas duas, `write` exige `confirm=SIM`
- **Descoberta de produtos novos** via `/produtos?page=N`, validação por `bagy_product_id`, INSERT transacional — implementado, testado e validado em produção real (Regata Branca, TESTE 002, +15 produtos)
- **Deploy em produção confirmado** — `ignite-webhook.vercel.app`, commit `88b63ee`, deployment inicial `dpl_AaNh4Lk18RhE3t3CPk5A6ELjUWcw` (depois substituído por `dpl_6P8TqTqezz9CH8aiadP66Fwu1aQi`, do deploy do Catálogo V1, que carrega o mesmo código Bagy V2 sem nenhuma alteração)

### PLANEJADO FUTURO — NÃO IMPLEMENTADO
- Cron em `dry_run` (observação, sem escrita)
- Cron em `write` (só após aprovação do dry_run)
- Integração visual mais profunda entre Catálogo e Auditoria Bagy (além da navegação "Ver no Catálogo" já existente)
- Gabriela / `_toolConsultarProduto.js` lendo `product_variations`, estoque, `preco_pix`
- Melhoria de normalização de `attributes` (fallback genérico ainda presente numa fração das variações)
- Revisão manual das exceções isoladas (404/página inválida/duplicate_conflict)
- Persistência histórica do resultado da descoberta de produtos novos (hoje só existe ao vivo na resposta HTTP — ver §8)
- Autenticação real do IGNITE PRIME (login + sessão verificável no backend + roles) — `BAGY_UI_ACTION_SECRET` é uma proteção de aplicação, não um sistema de usuários

## 12. Limitações atuais conhecidas

- 16 grupos de `link` duplicado pré-existentes no catálogo manual — 7 prováveis duplicatas reais, 6 produtos distintos compartilhando link por engano, mais casos de lixo (`teste.com`). Nenhum corrigido automaticamente — ficam como `DUPLICATE_CONFLICT`, aguardando decisão humana.
- Exceções `404`/`pagina_invalida` isoladas (ver contagem real em `bagy_sync_exceptions`) — nenhum produto apagado/desativado automaticamente, só registrado.
- Fração das variações do catálogo cai no fallback genérico de nome de atributo (não são "tamanho" nem "cor" reconhecíveis pela heurística) — dado preservado (`attributes` genérico), mas sem normalização fina ainda.
- `erro_rede` **só é classificado quando a falha acontece na leitura inicial da Bagy** — uma falha de rede transitória em qualquer outra chamada (ex. Supabase, dentro de `syncProduct`) cai num `catch` genérico não classificado em `syncBatch`, e pode fazer `status_final` da run inteira virar `'falha'` mesmo com só 1 produto afetado de centenas. **Observado em produção real, ainda não corrigido** — correção proposta (não implementada): classificar como `erro_rede` qualquer falha de rede em qualquer etapa de `syncProduct`, não só na leitura da Bagy.
- Descoberta de produtos novos pode não encontrar um produto publicado há poucos minutos, por atraso de cache/indexação do lado da Bagy (ver §4.1) — não é um bug do sincronizador, é um comportamento observado da própria plataforma Bagy.
- Resultado da descoberta (produtosNovos/candidatosBrutos/descartados) não fica no histórico — só existe na resposta ao vivo daquela execução (ver §8).

## Referências

- Decisão arquitetural: [`docs/decisions/0001-bagy-sync-scraping-http-rpc-manual.md`](../decisions/0001-bagy-sync-scraping-http-rpc-manual.md)
- Schema Supabase: [`docs/SUPABASE.md`](../SUPABASE.md)
- Estrutura geral do projeto: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)
