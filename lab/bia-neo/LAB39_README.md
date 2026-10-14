# LAB-39 — BIA NEO: filtros comerciais seguros (proposta isolada)

**Status:** patch criado contra o código efetivamente publicado da Edge Function `gaby-lab-shadow-catalog-v14-stable`, versão 7. **NÃO aplicado ao Supabase; NÃO implantado.** Branch independente de `render-lab`; não abrir merge sem homologação.

## Por que precisamos desta mudança?

O retorno específico da BIA já é protegido: mostra apenas nome, marca, categoria, foto, link e `CANDIDATO_NAO_CONFIRMADO`, sinalizando que preço e estoque não são atuais.

Mas **a seleção dos candidatos é executada ANTES dessa proteção**. A versão 7 aplica preço de snapshot e estoque de snapshot na seleção e ordenação. Isso pode gerar falsos negativos, mesmo que o retorno não divulgue preço e estoque.

Casos de prova, consultados no Supabase em 14/10/2026:

- Nike Air Force 1: snapshot de preço R$ 399, capturado em 19/08. Solicitação `até R$ 300` pode descartar a sugestão sem verificar preço de hoje.
- LV Skate Sneaker Branco: tamanhos 34–37 apresentam estoque histórico zero em 19/08. A função original os filtra quando o cliente pede um desses tamanhos.

## O patch `LAB39_EDGE_V7_BIA_ONLY.patch`

1. Quando `isBia`, preço antigo NÃO exclui candidatos.
2. Quando `isBia`, tamanho listado é usado apenas como sinal de correspondência, independentemente do estoque antigo.
3. Para BIA, candidatos com tamanho desconhecido não são descartados; isso NÃO é promessa de disponibilidade.
4. Para BIA, preço antigo não participa da ordenação.
5. Reconhecimento BIA-only de `Vans bege 40` e `camiseta preta M` como possíveis tamanhos.
6. Quando a pergunta BIA não contém termos de produto, resposta vazia no contrato específico da BIA.
7. O ramo GABY LAB **mantém o filtro e a ordenação originais**.

## Testes

Pacote local `PRIME_CONTROL_LAB39_BIA_FILTROS_SEGUROS.zip`: `bia-filter-policy.mjs` e `bia-filter-policy.test.mjs` — **47/47 testes aprovados**.

Esses testes verificam a política comercial e regressões dos exemplos; **não são integração nativa GPT Maker e não constituem verificação compilada/implantada da Edge Function**.

## Próximo passo

- Revisar diff, validar sintaxe TS contra o `index.ts` exportado da versão 7, preferencialmente no ambiente de build Deno.
- Homologar em função LAB **isolada** antes de aplicar na função compartilhada.
- Confirmar qual agente GPT Maker corresponde à BIA e testar no `Teste sua IA`. O conector atual retorna `AGENT_NOT_ALLOWED` para BIA.
- **Não** mudar a Bagy V2: sua sincronização continua reservada para a etapa final.
- Não divulgar valores/estoques como atuais sem origem comercial validada.

**Progresso PRIME CONTROL/BIA NEO:** manter **60%** até a integração real.
