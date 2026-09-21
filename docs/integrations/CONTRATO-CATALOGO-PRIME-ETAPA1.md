# CONTRATO CATÁLOGO PRIME — Etapa 1 (LAB/preview) — registro técnico

Data: 2026-09-21. Branch: `contrato-catalogo-prime/etapa1-lab`.
Escopo respeitado: NADA em produção — nem Supabase de produção, nem Bagy, nem
GABY OFICIAL, nem GPTMaker, nem deploy de produção. Toda evidência veio de
leitura pública da loja e leitura REST (anon) do Supabase de produção.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `api/_catalogoContratoPrime.js` (novo) | Regras puras: disponibilidade, elegibilidade, dedup canônica |
| `api/_bagySyncMapper.js` | `stock_real` sempre preservado; `active` derivado do valor de atributo; atributo secundário; `status` opcional em `mapProductRow` |
| `api/_bagySyncCompare.js` | diff passa a comparar `status` (produto), `stock_real` e `active` (variação) |
| `api/_bagySyncService.js` | `resolveStatusProduto` (404→inactive, 200 em inativo→active); 404 grava status controlado; `syncNewProduct` envia `status:'active'` |
| `api/_gabrielaContextService.js` | select V2 + filtro de ativos (só com `contratoV2:true`); `fetchVariationsPorProdutos` |
| `api/webhook.js` | flag `CONTRATO_CATALOGO_V2`: dedup canônica, elegibilidade (sem preço fora), disponibilidade real no top-5, `marca` e `sem_imagem` na resposta |
| `api/system-tools.js` | ausência da listagem → detecção + caso de revisão (`ausente_listagem`), nunca inativação |
| `supabase/migrations/033_contrato_catalogo_prime.sql` (nova) | colunas `stock_real`/`active`; tipo de exceção `ausente_listagem`; RPC aceita `status`, `stock_real`, `active` — **e preserva os campos de preço tabela/parcelamento que a RPC de produção já suporta** (correção cirúrgica 2026-09-21, ver seção 9) |
| `api/__tests__/catalogoContratoPrime.test.js` (novo) | 34 testes (21 originais + 6 sem-grade + 7 duplicate_group) |
| `api/__tests__/bagySyncMapperContratoPrime.test.js` (novo) | 15 testes |
| `api/__tests__/bagySyncStatusProduto.test.js` (novo) | 10 testes |
| `api/_reconciliacaoLegados.js` (novo, ajuste final) | Preview SOMENTE LEITURA da reconciliação assistida dos 43 legados sem bagy_product_id |
| `api/__tests__/reconciliacaoLegados.test.js` (novo, ajuste final) | 10 testes |
| `api/__tests__/migration033ContratoPrime.test.js` (novo, correção cirúrgica) | 6 testes — guarda estática da 033: campos de produção preservados em v_allowed_keys/INSERT/UPDATE, mudanças do Contrato intactas, rollback correto |
| `scripts/reconciliacao-legados-preview.mjs` (novo, ajuste final) | Runner read-only do relatório (REST anon, sem escrita) |

## Checkpoint de testes (atualizado no ajuste final, 2026-09-21)

Suíte completa: **725/725 testes passando em 39 arquivos**, zero regressão
(650 pré-existentes + 75 novos da Etapa 1). Marcos: 696/696 na entrega
original; **702/702 após a regra aprovada de produto sem grade (+6 testes
dedicados)**; 719/719 após o ajuste final (+7 duplicate_group, +10
reconciliação); 725/725 após a correção cirúrgica da migration 033 (+6
guardas estáticas).

## Descobertas ao vivo (2026-09-21)

### 1. Grade dupla cor+tamanho — NÃO EXISTE no catálogo atual
13 produtos amostrados de perfis variados (tênis, regata, calça, conjunto,
cueca, chinelo, moletom, óculos, boné, plataforma, bermuda, LV Trainer):
TODOS com `attribute_secondary: null`. Na Dooca desta loja, COR é conceito
de nível de produto (`color_id`, `colors[]` ligando produtos irmãos) — cada
cor vira um produto separado. A regra de derivação de `active` já está
preparada para grade dupla (AND das evidências dos dois atributos, testada
por contrato), mas não há caso real para validar hoje.

### 2. Grades antigas — estrutura idêntica às novas
Produtos do lote original de importação (boné Philipp Plein 10084772,
bermuda LV 10084752, Gucci 10254775, Nike Dunk 10259756, NB530 10253293):
mesmo shape (`variation.attribute.active` direto + `attribute.values[].active`
no produto). Produtos SEM grade (óculos, boné — 1 variação): `variation.attribute`
vazio → `active=null` (sem evidência). 

### 2a. REGRA ADICIONAL APROVADA por Rafael em 2026-09-21 (Etapa 1)
Produto COMPROVADAMENTE sem grade/sem atributo (todas as variações sem
nenhum atributo — shape real dos óculos/bonés/perfumes): `active=null`
significa "não se aplica", e a disponibilidade se decide pelo estoque
efetivo: ativo + stock_real>0 → DISPONIVEL; ativo + stock_real=0 +
sell_without_stock=false → ESGOTADO; estoque zerado/não confirmado +
sell_without_stock=true → A_CONFIRMAR. Produtos COM grade seguem na regra
estrita (active=null nunca confirma). Implementado em
`resolveDisponibilidade` (api/_catalogoContratoPrime.js) com testes
dedicados. As 8 linhas com status 'Ativo' NÃO foram normalizadas (decisão
do Rafael: manter whitelist, normalização fica pra Etapa 3).

### 3. Validação de 404 nos inativos conhecidos
| Produto | Link | Resultado |
|---|---|---|
| Camisa Adidas Flamengo III 2024 | /camisa-adidas-flamengo-iii-2024 | 404 ✓ |
| Alien Mugler Loção Corporal 200ml | /alien-mugler-locao-corporal-200ml | 404 ✓ |
| Regatas Dry-fit | /regatas-dry-fit | 404 ✓ |
| Body Cream Mugler Alien | /body-cream-mugler-alien-feminino-creme-hidratante-200ml | 404 ✓ |
| Chinelo Slide Gucci Feminina | /chinelo-slide-gucci-unissex | **200 sem window.dooca.product** |

4 de 5 inativos são 404 de verdade. O 5º é "página inválida" (200 sem o
objeto de produto) — hoje classificado `pagina_invalida`, NÃO coberto pela
regra 404→inativo. Fica como caso de revisão; se esse padrão se repetir,
vale uma regra adicional ("200 persistente sem marcador → revisão reforçada")
na Etapa 3.

### 4. Quem alimenta preco_tabela/parcelamento hoje — NINGUÉM no código atual
- Nenhum arquivo do repositório ESCREVE `preco_tabela` nem `parcelamento_*`
  (busca exaustiva: só leitores — `_gabrielaContextService`, `webhook`,
  `_toolConsultarProduto`, testes e docs).
- Os valores batem 1:1 com o objeto `payments` da Bagy: óculos Miu Miu
  Tartaruga (7973325) tem `price_compare=249` == `preco_tabela=249`;
  `payments.creditcard` 4x49.75 == `parcelamento_padrao_*`; `max_installment`
  12x19.75 == `parcelamento_max_*`; `payments.pix.total=187.06` ==
  `preco_pix` (este último o mapper JÁ sincroniza).
- `preco_tabela` também espelha a coluna `price_original` (249), escrita
  pelos scripts históricos `page-XX-sync.mjs` da importação de junho.
- Conclusão: campos alimentados por importação histórica (fora do repo
  atual), hoje CONGELADOS — nenhum sync os atualiza. A Bagy tem o dado
  vivo (`payments.creditcard` + `price_compare`). Origem definitiva fica
  pra decisão da Etapa 2+ (sugestão do plano: migrar pro mapper Bagy).

### 5. Vocabulário real de products.status
Medido: `active` 566, `Ativo` 8, `inactive` 5. O plano dizia filtro
`status=eq.ativo` — esse valor NÃO EXISTE na coluna e esvaziaria o catálogo
da Gaby. Implementado: whitelist `in.(active,Ativo,ativo)`; sync escreve
sempre `active`/`inactive`. Normalização das 8 linhas `Ativo` fica pra
Etapa 3 (decisão de dados, não de código).

### 6. Fallback de atributo confirmado ao vivo
Grade "TAMAMHO CALÇA/BERMUDAS JEANS" (erro de digitação na Bagy, calça
Diesel 10586482) não casa com a heurística "TAMANHO" → cai no fallback
genérico. Evidência real pro trabalho de cobertura da heurística (plano §13).

## O que NÃO foi feito (bloqueios de ambiente — ver relatório)
- Migration 033 NÃO aplicada: não existe projeto Supabase de LAB acessível.
- Branch NÃO publicada / Preview NÃO deployado: integração GitHub disponível
  é somente leitura+PR; sem credencial de push nem acesso à Vercel.
- Teste de integração RPC (atômica com campos novos): depende do LAB.

## Ajuste final (2026-09-21, segunda revisão de Rafael)

### 7. duplicate_group — duplicidades de nomes diferentes
A dedup original agrupava só por nome normalizado idêntico, o que não cobre
os pares da auditoria com nomes diferentes ("Cinza Claro / Cinza", "Preto /
Preto II"). Implementado mecanismo declarado e auditável:
- `GRUPOS_DUPLICIDADE_CONHECIDOS` (em `_catalogoContratoPrime.js`): tabela
  declarada, cada entrada com id de grupo, motivo (evidência da auditoria) e
  as grafias humanas dos nomes. Editar a tabela = decisão auditável.
- `deduplicarPorLinhaCanonica` resolve a chave de grupo: nome declarado →
  `declarado:<grupo>`; senão `nome:<chave normalizada>`. Saída por grupo:
  `duplicate_group`, `origem` (grupo_declarado|nome_exato), chaves, total,
  canonicaId, ids (ordenados — independente da ordem de entrada).
- NENHUM registro é excluído ou mesclado: a tabela só muda qual linha a
  Gaby enxerga como canônica (critérios de canônica inalterados).
- Conflito de declaração (mesma chave em 2 grupos): primeiro grupo vence e o
  conflito é reportado em `conflitosDeclaracao` — nunca silenciado.
- Tabela semeada com 5 dos 7 pares da auditoria, validada no catálogo real
  (579 → 558 canônicas, 20 grupos: 5 declarados + 15 nome_exato, 0
  conflitos): On Running Cinza/Cinza Claro, Nike Dunk TNF Preto/Preto II,
  Óculos Retangular Fumê/Fumê II, Óculos Flat Top Âmbar/Âmbar II, Bermuda
  Diesel Verde/Verde Musgo. Os 2 pares restantes: "Boné New Era" tem a
  duplicidade LEG/B de mesmo nome (já coberta por nome exato) e "CH Carolina
  Herrera" não tem par identificável no catálogo atual — ambos aguardam
  confirmação do Rafael para entrar na tabela.

### 8. Reconciliação assistida dos 43 legados — preview SOMENTE LEITURA
`api/_reconciliacaoLegados.js` (puras, sem I/O) +
`scripts/reconciliacao-legados-preview.mjs` (runner read-only via REST
anon). Para cada legado: produto, link normalizado (mesma semântica de
normalizeLink do sync), candidatos Bagy com evidências, confiança
(alta|media|baixa|nenhuma), conflito/ambiguidade e recomendação
(validar_vinculo_humano | revisao_manual | revisar_sem_candidato).
Regras: link exato + nome igual → alta; link exato com nome divergente →
media (links são RECICLADOS nesta loja — evidência real: link de um produto
aparece em outro); >1 candidato no link → media + conflito; sem link, nome
exato → baixa; nada → nenhuma. NENHUMA escrita ou vinculação automática.

Resultado real do preview (2026-09-21, 43 legados × 536 candidatos):
- alta (validar vínculo): 3 — Blusa Diesel→7447931, Lattafa Musamam→9682509,
  Armaf Club de Nuit Woman→10373121;
- baixa (só nome): 4 — Boné New Era Destroyed Bordo→7638041, Camiseta Tricot
  Itals Palha→7978749, Chinelo Diesel Vermelho→7622324, Plataforma Gucci
  Marrom Escuro→10254775;
- nenhuma (sem candidato): 36 — decisão por grupo (inativar, corrigir na
  Bagy, manter ou retirar da consulta da Gaby), conforme plano §8.

### 9. Correção cirúrgica da migration 033 (2026-09-21, terceira revisão de Rafael)
A versão ATUAL de produção da RPC `bagy_sync_product_transaction` já
suporta `preco_tabela` e os 6 campos de parcelamento — suporte aplicado
direto em produção (migrations 024-029 não constam do repositório). A
versão anterior da 033 partia da migration 023 e REMOVIA esses campos de
`v_allowed_keys`, INSERT e UPDATE. Corrigido: a 033 agora parte
funcionalmente da versão atual de produção (023 + campos de
preço/parcelamento — tipos conferidos por leitura dos dados reais:
numeric/integer/boolean) e acrescenta SOMENTE as mudanças do Contrato
(`status` em products; `stock_real`/`active` em product_variations; tipo
`ausente_listagem`). Nos UPDATEs, os campos preservados usam "chave ausente
preserva o valor gravado" — nenhum writer atual os envia e a decisão de
ORIGEM de preco_tabela/parcelamento NÃO muda nesta etapa (decisão de
Rafael). Comentário de rollback corrigido: não basta voltar à 023; o
rollback correto recria a função a partir da definição vigente capturada
com `pg_get_functiondef` antes de aplicar. Limitação registrada: o corpo
exato da RPC de produção não é legível com a chave pública (EXECUTE é
service_role e pg_proc não é exposto); a base foi reconstruída a partir da
enumeração do Rafael + tipos medidos nos dados, e coberta por guarda
estática (migration033ContratoPrime.test.js).
