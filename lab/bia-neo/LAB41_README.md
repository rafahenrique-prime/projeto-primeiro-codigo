# LAB-41 — Homologação de acesso e compilação parcial da BIA NEO

**Data:** 14/10/2026
**Estado:** TESTES LOCAIS CONCLUÍDOS, função completa NÃO publicada, NÃO compilada em Deno.

## Evidência

- Branch isolada: `lab/bia-neo-safe-filters-20261014` (fora de `render-lab`, sem merge).
- Código candidato: `lab/bia-neo/edge-candidate/index.ts`.
- Revisão: **16/16 invariantes estruturais passaram** na leitura da função staged do GitHub.
- Testes locais: **108/108** (82 existentes e 26 cenários novos de autenticação).
- Compilador: `tsc --target ES2022 --module CommonJS --moduleResolution Node --lib ES2022,DOM --strict --noEmit LAB41_AUTH_CONTRACT.ts` passou. Este arquivo é uma **reprodução isolada do helper de autenticação**, NÃO o arquivo completo Edge.
- Teste completo `deno check index.ts`: PENDENTE (Deno indisponível na sessão).

## Corrigido no código staged

A função `authorizeBia` agora retorna false se `BIA_AGENT_ID` estiver ausente ou apresentar comprimento menor que 6 ou maior que 200. Isso impede que uma chave LAB válida autorize acidentalmente um cabeçalho de agente vazio num ambiente mal configurado.

Os segredos são env vars e **não estão no GitHub**: `PRIME_CONTROL_BIA_AGENT_ID` e `PRIME_CONTROL_BIA_LAB_READ_KEY` (distinta da credencial original). Não copiar esses valores para frontend ou histórico de chat.

## Limite de infraestrutura

O projeto separado **PRIME CATALOGO LAB** (Supabase `fjikmasryzmhvpdofgmu`) foi encontrado INACTIVE, sem Edge Functions. Não foi reativado nem usado, para evitar efeitos operacionais/custos. Não usar o projeto de retenção LAB-2 nem gravar no Supabase produção (`mbbgqasvssueirynnoyk`).

A função staged requer Supabase SDK/Edge runtime, banco populado em projeto isolado e, caso `verify_jwt=true`, um JWT válido além de suas credenciais customizadas. O conector GPTMaker não autorizou a BIA; nenhuma conversa de teste nativo foi executada.

## Próximas etapas (ordem)

1. Disponibilizar runtime Deno/ambiente efêmero gratuito para validar `deno check` contra a versão staged.
2. Em ambiente LAB Supabase **isolado**, homologar GET de catálogo com dados fictícios e autenticação separada, sem usar dados comerciais reais.
3. Testar pedidos com tamanho sem estoque histórico; orçamento que excede snapshot; sem resultado; falta de autorização; imagem/link ausentes.
4. Somente com permissão para o agente BIA, usar `Teste sua IA` nativo.
5. Deixar a recuperação da sincronização Bagy V2 para a etapa final, como decidido.

**Não houve:** deploy Supabase, ativação de projeto, acesso indevido ao GPTMaker, alterações na GABY, Bagy V2, preços ou estoques.

**Progresso geral BIA NEO:** **60%**, sem avanço artificial até o teste integrado.
