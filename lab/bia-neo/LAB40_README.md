# LAB-40 — BIA-only Edge candidate, sem deploy

Data: 14/10/2026. **Somente branch isolada**, base `render-lab`; nenhum merge ou publicação foi feito.

## Artefatos
- `lab/bia-neo/edge-candidate/index.ts`: fonte integral da Edge Function v7, acrescida do patch BIA-only LAB-39. Para homologação futura.
- `lab/bia-neo/LAB39_EDGE_V7_BIA_ONLY.patch`: diff aplicado ao código v7 de origem.

## Mudanças exclusivas para BIA
- Desconsidera preços históricos como filtro de orçamento ou ordenação.
- Não elimina produto por estoque histórico nulo/zero; tamanho listado é apenas sinal de correspondência, **nunca confirmação de venda**.
- Mantém sanitização BIA de nome, marca, categoria, foto, link e `CANDIDATO_NAO_CONFIRMADO`.
- Preserva a lógica da GABY no patch original, mas o **endpoint de laboratório está bloqueado para todas as chamadas que não comprovarem identidade BIA autorizada**.
- No fork LAB: `PRIME_CONTROL_BIA_AGENT_ID` e `PRIME_CONTROL_BIA_LAB_READ_KEY` são obrigatórias, somente server-side. Não reutilizar `PRIME_CONTROL_BIA_CATALOG_READ_KEY`.
- Sem o ID e a chave do LAB, acesso **negado por padrão**. Não aceita `x-prime-lab` ou caminho alternativo para GABY.

## Isolamento
O projeto Supabase `PRIME CATALOGO LAB` (`fjikmasryzmhvpdofgmu`) existe, mas estava `INACTIVE` em 14/10. O LAB temporário de retenção, apesar de ativo, não é apropriado. Assim, **não houve deploy** em nenhum dos três projetos Supabase.
Antes de publicar qualquer serviço de teste: confirmar projeto separado ativo sem custo adicional não aprovado, `verify_jwt=true`, chave separada e ambiente de dados **somente leitura**. Sem configuração das duas credenciais, o endpoint deve permanecer indisponível.

## Verificações
- Fetched Edge v7 active; aplicação automática dos 4 hunks do LAB-39 sobre o source, com conferência de contexto.
- Fork de autenticação exclusivamente BIA + chave de LAB (sem header GABY).
- Read-back real do arquivo no GitHub, SHA de conteúdo confirmado.
- 47 testes anteriores e 35 testes novos de seleção/higienização executados localmente: **82/82 PASS**.
- **PENDENTE:** compilação integral via Deno, implantação isolada, integração com GPT Maker e teste nativo da BIA (conector GPTMaker retornou `AGENT_NOT_ALLOWED`).

## Gate para uma futura homologação real
1. Ambiente realmente separado e ativo, sem efeitos colaterais no projeto de produção.
2. Compiler Deno aprova o `index.ts`.
3. `verify_jwt=true`, segredos de LAB instalados no backend e testes de 401/403.
4. Teste de busca com fixtures ou tabelas LAB isoladas, não com produto real de produção.
5. Evidências de respostas BIA seguras em todas as consultas e regressão de GABY original.
6. GPTMaker `Teste sua IA` disponível para o agente BIA e testes de conversas autorizados.
7. Só depois decidir separadamente qualquer deploy da integração real.

Progresso do projeto: **60% estimado**, sem subida até homologação real. Bagy V2 pausada e adiada para o final.
