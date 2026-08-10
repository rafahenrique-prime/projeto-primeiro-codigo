# Catálogo V1 — tela de gestão e conferência visual

**Status:** 🟢 Fases 1-5 concluídas e **deployadas em produção** (V2 — histórico, correção de exceção, integração mais profunda com Auditoria Bagy — NÃO implementada)
**Última atualização:** 2026-08-10
**Deployment validado:** `dpl_6P8TqTqezz9CH8aiadP66Fwu1aQi`, alias `ignite-webhook.vercel.app`
**Commit:** `b8faafc` — `feat(catalog): publish catalog v1`

## 1. Objetivo

Evoluir `src/pages/CatalogPage.jsx` (antes só um CRUD manual de catálogo) para também exibir, filtrar e detalhar os dados que o [sincronizador Bagy](BAGY-SYNC.md) já produz no Supabase: origem (Bagy/Manual), status de sincronização, variações, estoque e pendências (`bagy_sync_exceptions`) — sem criar nenhuma tabela nova e sem nenhuma escrita nova.

## 2. Arquitetura de dados

```
catalogV1Data.js  → 3 queries paralelas (Promise.all), paginadas
                     (products, product_variations agregado, bagy_sync_exceptions abertas)
      ↓
catalogV1Status.js  → deriva o status de sincronização por produto (badge)
catalogV1Format.js  → formata data/PIX/estoque pra exibição
      ↓
CatalogPage.jsx  → só orquestra: carrega, guarda em Maps por id, renderiza tabela+filtros
      ↓ (ao abrir 1 produto)
ProdutoDrawer.jsx  → 1 query adicional (getVariationsForProduct), só daquele produto
```

## 3. Arquivos novos desta funcionalidade

| Arquivo | Papel |
|---|---|
| `src/services/catalogo/catalogV1Data.js` | 3 queries paginadas + agregação (`variationAggregates`, `exceptionsByLink`) + `getVariationsForProduct` (sob demanda) |
| `src/services/catalogo/catalogV1Status.js` | `derivarStatusCatalogo(product, exceptionsForLink)` — função pura, badge de status |
| `src/services/catalogo/catalogV1Format.js` | `formatCatalogSyncDate`, `formatPixLabel`, `formatStockSummary` — helpers de apresentação |
| `src/components/catalogo/SyncStatusBadge.jsx` | badge visual do status (🟢/🔵/🔴/⚠️/🟡) |
| `src/components/catalogo/OrigemBadge.jsx` | badge Bagy/Manual |
| `src/components/catalogo/ProdutoDrawer.jsx` | painel lateral de leitura de 1 produto + suas variações |

`src/pages/CatalogPage.jsx` foi editado (não recriado) — ganhou 1 coluna `Status`/`Origem`/`Última Sync`/`Estoque` na tabela existente, 1 linha de filtros rápidos, 1 popover "Mais filtros" e a integração do drawer. Nenhum componente/fluxo pré-existente (modal de edição, extração por URL, histórico) foi removido ou redesenhado.

## 4. Regras de status (badge)

Prioridade, sobre o array completo de exceções abertas do `link` (nunca só a primeira):

1. `404` aberto → 🔴 Não encontrado
2. `duplicate_conflict` aberto → ⚠️ Conflito
3. `pagina_invalida` aberto (ou qualquer outro tipo não coberto) → 🟡 Exceção
4. `bagy_product_id IS NOT NULL` e nenhuma exceção aberta → 🟢 Sincronizado
5. fallback → 🔵 Manual

`bagy_product_id` é o sinal principal de origem — `source` é só informação complementar (pode ficar desatualizado numa edição manual de um produto já sincronizado), nunca critério isolado.

**Achado registrado na V1:** o badge "Conflito" conta **por produto**, não por link — como cada link duplicado tem 2 linhas em `products`, 12 links com `duplicate_conflict` geram 24 produtos marcados (confirmado: `count(products.link in duplicate_conflict links) = 24`, exatamente 12×2). Não é bug, é a contagem correta refletindo ambos os lados da duplicata.

## 5. Regras de estoque (mesma precedência do sincronizador)

```
se products.sell_without_stock === true → "Venda sem estoque" (nunca soma stock_quantity)
senão, se não há variações → "Sem variações" / "—"
senão → soma de product_variations.stock_quantity (0 é valor real, não ausência)
```
Nunca interpreta `9999` — esse valor nunca é gravado no Supabase (ver [BAGY-SYNC.md §4](BAGY-SYNC.md)).

## 6. Filtros (100% client-side, sobre os dados já carregados)

**Linha 1** (situação, com contador real): Todos · Sincronizados · Manuais · Com exceção (`not_found`+`conflict`+`exception`) · Atualizados (`synced_at` ≤ 7 dias).
**Linha 2**: categorias (já existente) + ordenação (já existente) + popover **"Mais filtros"**: Marca, Com variações, Sem estoque (`sell_without_stock≠true` E soma real conhecida E `=0` — nunca classifica produto sem variação como "sem estoque"), Venda sem estoque.
Todos combináveis entre si e com busca/categoria/ordenação. `useMemo` em contadores/filtragem/lista de marcas evita recomputar a cada clique.

## 7. Drawer (painel lateral)

Abre ao clicar na linha (ações — Zap/Foto/Link/Editar/Excluir — protegidas com `stopPropagation`, não abrem o drawer). Mostra dados do produto (já carregados, sem query nova) + variações completas (`getVariationsForProduct`, 1 query, só quando aberto, refeita se trocar de produto). Renderiza `attributes` (jsonb) literalmente — inclusive chaves malformadas vindas da própria Bagy (achado real: `{"tamamho_calça/bermudas_jeans": "46"}`, exibido sem correção). Seção "⚠️ Pendência de sincronização" só aparece se houver exceção aberta — sem botão de correção (fica pra V2).

## 8. Performance (medida nesta revisão)

- Carregamento inicial: **3 queries em paralelo**, todas paginadas via header `Range` (necessário — PostgREST corta em 1000 linhas por padrão; sem isso, `product_variations` com 2130 linhas perderia ~53% dos dados silenciosamente — bug real encontrado e corrigido na Fase 1).
- Tempo médio de carga da camada V1 (3 execuções reais): **~1,07s** (555 produtos + 2130 variações agregadas + 20 exceções).
- Drawer: **1 query adicional** só ao abrir 1 produto — medido em **176ms**.
- Nenhuma query por linha da tabela, nenhuma pré-carga de variações completas de todos os produtos.

## 9. Dependência de `bagy_sync_exceptions`

Os badges 🔴/⚠️/🟡 refletem só o que está gravado em `bagy_sync_exceptions` com `status='aberto'` — ou seja, dependem de o sincronizador ter rodado recentemente (manual, ver [BAGY-SYNC.md](BAGY-SYNC.md)). Se o sincronizador não rodar por um tempo, essa fila fica desatualizada e os badges também. Não é um problema desta funcionalidade — é a mesma limitação já documentada do sincronizador (sem cron ainda).

## 9.1 Teste real em produção

Verificado ao vivo em `ignite-webhook.vercel.app` (não simulação/preview local), depois do deploy `dpl_6P8TqTqezz9CH8aiadP66Fwu1aQi`:
- Tela carregou **573 de 573 produtos**, filtros de situação (Todos/Sincronizados/Manuais/Com exceção/Atualizados) e pills de marca funcionando.
- **Regata Alo Feminina Importada Preta - Anuncio Teste 002** (inserida pela Auditoria Bagy V2 — ver [`BAGY-SYNC.md §9.1`](BAGY-SYNC.md)) apareceu **automaticamente** na tabela após a sincronização, sem nenhum código novo no Catálogo — confirma que a leitura de `products` já cobre produtos recém-inseridos pelo sincronizador, sem necessidade de refresh manual de cache/rota: `R$ 95,00`, `PIX R$ 90,25`, origem `Bagy`, status `Sincronizado`, `4 variações`/`4 un.` de estoque.
- **`ProdutoDrawer`** aberto em produção real, mostrando Preço, Preço PIX, Categoria, Breadcrumb, Marca, Estoque, Descrição e as 4 variações com `bagy_variation_id` cada uma.
- Navegação "Ver no Catálogo" (Auditoria Bagy V2 → Catálogo → abre o drawer do produto direto) confirmada funcional em produção — depende de `App.jsx`/`CatalogPage.jsx` (deployados no mesmo commit que trouxe o restante da V2 e do Catálogo V1).

## 10. Nenhuma escrita nova

Toda a V1 (`catalogV1Data.js`, `catalogV1Status.js`, `catalogV1Format.js`, `SyncStatusBadge`, `OrigemBadge`, `ProdutoDrawer`) é **100% leitura**. As únicas escritas que continuam existindo em `CatalogPage.jsx` são as que já existiam antes (editar/excluir produto manual, extração por URL) — nenhuma ação nova de escrita foi introduzida.

## 11. Limitações conhecidas

- `attributes` genérico/fallback em variações cujo nome de atributo não contém "TAMANHO"/"COR" — dado preservado, exibido honestamente, sem normalização (herda a limitação já documentada do sincronizador: 43% das variações do catálogo).
- Badges dependem de `bagy_sync_exceptions` estar atualizada — sem cron, a atualização é sempre manual.
- Confirmação visual feita tanto em `localhost` (Fase 3/4, pelo Rafael) quanto em produção real (`ignite-webhook.vercel.app`, ver §9.1) — nenhuma lacuna de validação visual restante nesta V1.

---

## ESTADO ATUAL — VALIDADO E EM PRODUÇÃO

- Tabela com Foto, Produto, Categoria, Preço (+PIX), Origem, Status, Última Sync, Estoque, Ações — confirmada em produção real com 573 produtos
- 5 badges de status derivados sem inventar dado (404/conflito/exceção/sincronizado/manual)
- Filtros rápidos de situação + "Mais filtros" (marca, variações, estoque), 100% combináveis, 100% client-side
- `ProdutoDrawer` com dados do produto + variações completas sob demanda, exceções abertas visíveis — testado em produção real
- 3 queries paralelas e paginadas no carregamento (~1,07s), 1 query adicional só ao abrir drawer (~176ms), zero N+1
- Zero escrita nova introduzida por esta tela
- Navegação "Ver no Catálogo" a partir da Auditoria Bagy V2 (abre direto no drawer do produto) — funcional em produção
- Produtos inseridos pela Auditoria Bagy V2 (descoberta de produtos novos) aparecem automaticamente aqui, sem nenhum código extra — confirmado com teste real (ver §9.1)

## FUTURO V2 — NÃO IMPLEMENTADO

- Histórico de mudanças por produto
- Comparação antes/depois (diff visual)
- Botão de "corrigir exceção" (mudar `status` em `bagy_sync_exceptions` pela UI)
- Integração visual **mais profunda** com a Auditoria Bagy além da navegação já existente (ex.: abrir a fila de exceções direto do Catálogo)
- Disparo de sincronização individual de 1 produto pela UI do Catálogo (hoje só existe pela Auditoria Bagy V2, em lote)
- Cron (segue não implementado, é decisão do [BAGY-SYNC.md](BAGY-SYNC.md), não desta tela)

## Referências
- [`docs/integrations/BAGY-SYNC.md`](BAGY-SYNC.md) — sincronizador que alimenta os dados desta tela
- [`docs/SUPABASE.md §3.9`](../SUPABASE.md) — schema de `product_variations`/`bagy_sync_exceptions`
