# LOTE 002 — SCRIPT AND ROOT FILE GOVERNANCE

**Pacote:** LOTE 002 — Pacote A — Classificação e Governança Documental
**Base auditada:** `main` em `6f64a6796ae34a9226c1187aab96d6ed142e6462`
**Método:** leitura estática de nomes, conteúdo, histórico por caminho e referências no snapshot.
**Estado:** classificação documental; nenhum item foi executado, movido, renomeado, excluído ou alterado.

> A presença de um script não constitui autorização para executá-lo. A ausência de um importador estático não prova que o item esteja morto: podem existir consumidores externos, manuais, dinâmicos ou fora do snapshot.

## 1. Legenda de classificação

| Rótulo | Significado |
|---|---|
| `READ-ONLY` | Somente consulta/leitura comprovada no código observado. |
| `ESCREVE LOCAL` | Pode criar ou modificar arquivos locais, inclusive `.env.local`, relatórios ou caches. |
| `ESCREVE REMOTO` | Pode realizar POST, PUT, PATCH ou outra escrita em serviço externo. |
| `DESTRUTIVO` | Pode apagar ou realizar alteração remota relevante ou irreversível. |
| `TESTE/DIAGNÓSTICO` | Ferramenta de investigação, teste ou validação manual. |
| `HISTÓRICO` | Mantido como referência de decisões ou operações anteriores. |
| `NÃO CONFIRMADO` | A evidência disponível não permite concluir uso, consumidor ou estado operacional. |

## 2. Matriz de scripts e arquivos operacionais

| Arquivo/família | Finalidade e tipo | Leitura local/remota | Escrita local/remota | Destrutivo | Serviço externo | Uso/consumidor | Status, risco e recomendação futura |
|---|---|---|---|---|---|---|---|
| `token-receiver.js` | Servidor Express local para distribuir token GPT Maker entre worktrees; JavaScript/Node. | Lê argumentos/estado local; não é leitor remoto de produto. | `ESCREVE LOCAL`: grava `VITE_GPTMAKER_USER_TOKEN` em `.env.local` de worktrees. | Não é DELETE remoto, mas possui alto impacto de credencial. | GPT Maker; filesystem de múltiplas worktrees. | Uso manual via bookmarklet; consumidor do app não identificado. | `ESCREVE LOCAL` + `NÃO CONFIRMADO` quanto ao uso atual. **Alto risco** por alcance entre worktrees. Não mexer até existir desenho seguro de sessão e autorização específica. |
| `renovar-token.sh` | Renovação manual de token GPT Maker; shell. | Lê argumento/clipboard e arquivos locais. | `ESCREVE LOCAL`: atualiza `.env.local`. | Não há remoção remota comprovada. | GPT Maker; clipboard/filesystem. | Uso manual documentado; concorre com `token-receiver.js`. | `ESCREVE LOCAL` + `HISTÓRICO` aparente. **Alto risco** de duplicidade operacional de credencial. Não consolidar neste pacote; convergir somente após política Bitwarden-first e revisão de segurança. |
| `page-13-sync.mjs` … `page-21-sync.mjs` | Lotes manuais de sincronização/importação de produtos; JavaScript/Node. | Leitura local de dados hardcoded/configurados e consulta REST. | Podem escrever remotamente por POST no recurso `products`; escrita local não é o objetivo principal. | Não comprovado como DELETE, mas pode duplicar/alterar catálogo. | API REST de produtos/Bagy/Supabase conforme configuração do script. | Família manual; consumidor do app não identificado. | `ESCREVE REMOTO` + `NÃO CONFIRMADO`. **Alto risco** de duplicidade e inconsistência. Não executar, consolidar ou arquivar sem mapear dados, idempotência e autorização. |
| `update-catalog-full.py` | Atualização ampla de catálogo; Python. | Lê dados locais e configuração de ambiente. | Possível escrita remota no catálogo; escrita local não confirmada. | Não confirmada. | Catálogo/API de produtos. | Uso manual provável; consumidor estático não identificado. | `ESCREVE REMOTO` + `NÃO CONFIRMADO`. **Médio/alto risco**. Manter até confirmar substituto, owner e contrato. |
| `update-links-test.mjs` | Teste/atualização de links de catálogo; JavaScript/Node. | Consulta dados locais e endpoint conforme configuração. | Possível escrita remota; escrita local não confirmada. | Não confirmada. | Catálogo/API de links. | Nome e histórico indicam manutenção/teste manual; consumidor não identificado. | `TESTE/DIAGNÓSTICO` + `NÃO CONFIRMADO`. **Médio risco**. Definir dry-run e entrada canônica antes de qualquer reorganização. |
| `update-links-admin.mjs` | Variante administrativa de atualização de links; JavaScript/Node. | Leitura de dados/configuração. | Possível escrita remota administrativa. | Não confirmada. | Catálogo/API administrativa. | Uso manual/admin aparente; consumidor não identificado. | `ESCREVE REMOTO` + `NÃO CONFIRMADO`. **Médio/alto risco**. Exigir owner, escopo e confirmação de ambiente. |
| `test-sync.js` e `test-sync.mjs` | Testes/diagnósticos de sincronização; JavaScript/Node. | Podem consultar dados e endpoints. | Depende do endpoint chamado; não presumir read-only apenas pelo nome. | Não confirmado. | Catálogo/API de sincronização. | Uso manual/teste aparente; consumidor não identificado. | `TESTE/DIAGNÓSTICO` + `NÃO CONFIRMADO`. **Médio risco**. Revisar contrato e criar modo somente leitura antes de uso. |
| `find-duplicates.mjs` | Agrupa produtos por nome e imprime duplicidades; JavaScript/Node. | `READ-ONLY` local e remoto, conforme leitura de produtos observada. | Não identificada. | Não. | API de produtos. | Ferramenta manual de diagnóstico; consumidor do app não identificado. | `READ-ONLY` + `TESTE/DIAGNÓSTICO`. **Baixo risco de mutação**; preservar até existir auditoria canônica. |
| `delete-duplicates-smart.mjs` | Calcula duplicidades por link/imagem e executa exclusões por ID; JavaScript/Node. | Lê produtos e critérios locais/remotos. | Pode escrever remotamente com DELETE. | `DESTRUTIVO` confirmado. | API de produtos. | Execução manual; consumidor do app não identificado. | `ESCREVE REMOTO` + `DESTRUTIVO`. **Alto risco**. Nunca executar automaticamente; qualquer uso futuro exige dry-run, revisão humana, backup, lista aprovada e autorização explícita. |
| `count-products.mjs` | Contagem/diagnóstico do catálogo; JavaScript/Node. | `READ-ONLY` local/remoto conforme consulta de produtos. | Não identificada. | Não. | API de produtos. | Ferramenta manual; consumidor não identificado. | `READ-ONLY` + `TESTE/DIAGNÓSTICO`, com valor histórico. Confirmar substituto antes de arquivar. |
| `fix-prices.py` | Correção manual de preços; Python. | Lê dados/configuração. | Pode alterar dados remotamente. | Não é DELETE, mas é alteração comercial relevante. | API de produtos/catálogo. | Uso manual aparente; consumidor do app não identificado. | `ESCREVE REMOTO` + `NÃO CONFIRMADO`. **Alto risco de negócio**. Não executar nem reorganizar antes de revisão de dados e autorização. |
| `test-medios.mjs` | Teste de mídia/fotos; JavaScript/Node. | Leitura local e possivelmente Storage conforme fluxo. | Não confirmada. | Não confirmada. | Supabase Storage/AWS conforme referência. | Teste manual provável; consumidor textual não confirmado. | `TESTE/DIAGNÓSTICO` + `NÃO CONFIRMADO`. **Baixo/médio risco**. Manter como histórico até confirmar finalidade. |
| `aws-backend-example.js` | Exemplo Express de Rekognition com `/api/analyze-photo`, `/api/test` e `/api/status`; JavaScript. | Lê upload/configuração e pode consultar AWS. | Pode criar cache/resultado local e responder por HTTP; escrita remota de produto não confirmada. | Não confirmada. | AWS Rekognition/Storage. | Exemplo independente; não integrado ao app atual conforme snapshot. | `HISTÓRICO` + `REFERÊNCIA V2` + `NÃO CONFIRMADO`. **Médio/alto risco** se executado sem ambiente. Manter como referência, não tratar como backend de produção. |
| `scripts/fix-drive-permissions.mjs` | Correção recursiva de permissões de pasta Drive; JavaScript/Node. | Lê estado local e permissões remotas. | Pode escrever remotamente em permissões do Google Drive; pode solicitar OAuth. | Não é destrutivo por si, mas altera ACLs. | Google Drive/OAuth. | Uso manual documentado em `CLAUDE.md`/`AGENTS.md`; consumidor do app não identificado. | `ESCREVE REMOTO` + `NÃO CONFIRMADO`. **Alto risco operacional**. Exigir confirmação de conta, pasta e escopo antes de uso. |
| Relatórios/guias `CHECKPOINT-*`, `AUDITORIA-*`, `PASSO-*`, `RELEASE-*`, `AWS_*`, `PHOTO_*`, `PROJECT_CONTEXT.md` | Documentação, checkpoints, guias e contexto; Markdown/JSON/imagens. | Leitura local. | Não identificada. | Não. | Alguns descrevem serviços externos, sem prova de execução. | Consumidores humanos/agentes; não são runtime. | `HISTÓRICO` ou `NÃO CONFIRMADO` conforme documento. **Baixo risco direto**, mas risco de fonte concorrente. Indexar antes de qualquer organização física. |

## 3. Regras para scripts de alto risco

Os seguintes itens devem ser tratados como **bloqueados para execução automática**: `delete-duplicates-smart.mjs`, `token-receiver.js`, `renovar-token.sh`, `page-13-sync.mjs` a `page-21-sync.mjs`, `update-links-*`, `test-sync.*`, `update-catalog-full.py`, `fix-prices.py` e qualquer outro arquivo que realize POST/PUT/PATCH/DELETE, altere ACLs ou escreva tokens.

A classificação acima não prova que os scripts estejam ativos em produção. Ela prova apenas a capacidade estrutural observada ou a necessidade de investigação adicional. Nenhum script desta lista foi executado no Pacote A.

## 4. Política futura de segurança para scripts

1. Scripts destrutivos nunca devem ser executados automaticamente por agentes.
2. Qualquer escrita remota exige autorização explícita, ambiente confirmado, owner identificado e registro do resultado.
3. Ferramentas de diagnóstico devem preferir modo `READ-ONLY` e declarar claramente quando não o forem.
4. Scripts históricos devem conter classificação documental e não podem ser interpretados como comandos recomendados.
5. Execução em produção exige confirmação explícita do ambiente e do escopo dos dados.
6. O agente deve ler o contrato e o diff/efeito esperado antes de executar; nomes como `test`, `sync` ou `update` não são prova de segurança.
7. Fluxos de token devem seguir a política Bitwarden-first e nunca registrar valores em relatórios.
8. Toda ferramenta destrutiva deve ter dry-run, lista de alvos, confirmação humana e possibilidade de rollback quando tecnicamente possível.
9. A presença de um script nunca constitui autorização para execução, migração, rotação de secret ou alteração de integração.

## 5. Limites e próximos pacotes

Este catálogo é documental. Não move scripts para `archive/`, não cria wrappers, não altera permissões, não converte ferramentas em dry-run e não escolhe um fluxo canônico de tokens. Essas decisões permanecem pendentes e dependem de owners, evidência operacional e autorização específica para Pacotes posteriores.

## Referências

[1]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/tree/main "Árvore main"
[2]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/delete-duplicates-smart.mjs "Script destrutivo"
[3]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/token-receiver.js "Distribuidor local de token"
[4]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/page-13-sync.mjs "Família de sincronização"
[5]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/aws-backend-example.js "Exemplo AWS"
[6]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/CLAUDE.md "Governança documentada"

## Encerramento

**Classificação concluída; execução proibida sem autorização posterior.**
