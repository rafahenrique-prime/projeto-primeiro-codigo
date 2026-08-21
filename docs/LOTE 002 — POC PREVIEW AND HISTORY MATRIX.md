# LOTE 002 — POC PREVIEW AND HISTORY MATRIX

**Pacote:** LOTE 002 — Pacote A — Classificação e Governança Documental
**Base:** `main` em `6f64a6796ae34a9226c1187aab96d6ed142e6462`
**Método:** leitura estática de árvore, commits, documentação, handlers, testes e branches/tags.
**Estado:** nenhum POC, preview, backup, componente histórico ou branch foi movido, renomeado ou excluído.

> `POC`, `PREVIEW`, `EXPERIMENTAL`, `HISTÓRICO` e `BACKUP` descrevem evidência e finalidade aparente. Não significam lixo, descarte, produção confirmada ou autorização de remoção.

## 1. Matriz de classificação

| Nome | Local | Tipo/classificação | Finalidade | Evidência disponível | Runtime confirmado? | Valor histórico | Valor para V2 | Pode ser reorganizado? | Recomendação | Confiança |
|---|---|---|---|---|---|---|---|---|---|---:|
| PRIME Bridge | `poc/zap-gptmaker-bridge/`, `api/_primeBridgeWebhook.js`, `tests/prime-bridge-webhook.test.js` | `POC` + `EXPERIMENTAL` + `REFERÊNCIA V2` + `PREVIEW` | Bridge ZAP-API ↔ GPT Maker com núcleo reutilizado pelo handler serverless. | README, bridgeCore/router/gatekeeper, handler, contrato e testes. | **RUNTIME ATUAL: NÃO CONFIRMADO**. O handler e os contratos estão confirmados; tráfego externo, domínio e deploy efetivo não. | Alto: preserva decisões e contratos de integração. | Alto: arquitetura de adapter, idempotência, modos e autenticação. | Não neste pacote. Uma reorganização futura deve preservar imports, testes, documentação e rollback. | **PRESERVAR**; separar documentalmente POC, adapter serverless e runtime externo antes de qualquer organização física. | 100% |
| `poc/zap-gptmaker-bridge/README.md` | `poc/zap-gptmaker-bridge/` | `POC` + `HISTÓRICO` | Explica arquitetura, modos `simple`/`complicated`, validações e limites. | Texto lido diretamente e alinhado ao código/testes. | Não prova runtime atual. | Alto. | Alto como contrato de evolução. | Não neste pacote. | Manter junto da POC até existir documentação canônica de integração. | 99% |
| `docs/integrations/PRIME-BRIDGE-POC.md` | `docs/integrations/` | `HISTÓRICO` + `REFERÊNCIA V2` | Registra evolução local → serverless e decisões Railway/Vercel. | Documento histórico lido na investigação. | Não confirmado. | Alto. | Alto. | Apenas após mapear links e fontes de verdade. | Manter como registro arquitetural; não tratá-lo como prova de produção. | 96% |
| `docs/integrations/GPTMAKER-ZAPAPI-POC.md` | `docs/integrations/` | `POC` + `EXPERIMENTAL` + `REFERÊNCIA V2` | Documenta integração experimental GPT Maker/ZAP API. | Documento e estrutura POC. | Não confirmado. | Alto. | Médio/alto. | Não neste pacote. | Manter até confirmar substituição, owner e runtime. | 94% |
| Branch `cutover-builder-preview-b` | Referência Git | `PREVIEW` + `REFERÊNCIA V2` | Preview de cutover de PRIME Cobranças. | Nome, commits e divergência; destino externo não confirmado. | Não confirmado. | Alto para rastrear alternativa de cutover. | Alto, condicionado a decisão arquitetural. | Não; branches são avaliadas em pacote próprio. | Preservar e não decidir cutover automaticamente. | 95% |
| Branches `preview/*` | Referências Git | `PREVIEW` + `EXPERIMENTAL` | Linhas de visualização/experimentação com commits próprios ou divergentes. | Topologia Git, mensagens e divergências consultadas. | Não confirmado. | Médio/alto. | Variável. | Não neste pacote. | Revisar individualmente somente no Pacote C, com owner e retenção. | 90% |
| Branch `shadow/*` | Referências Git | `EXPERIMENTAL` + `HISTÓRICO` | Linha shadow/experimental explicitamente descrita nos commits. | Nome e mensagens dos commits. | Não confirmado. | Médio/alto. | Variável. | Não neste pacote. | Não interpretar como descartável sem decisão do owner. | 90% |
| Branch `docs/lote-001-organizacao-documental` | Referência Git | `HISTÓRICO` + `REFERÊNCIA V2` | Trilha documental do Lote 001, já mergeada. | PR/merge, commits e documentos presentes na `main`. | Não é runtime de produto. | Alto para auditoria. | Alto como precedente de governança. | Não neste pacote. | Manter enquanto a rastreabilidade do Lote 001 for necessária. | 100% |
| Tag `v-backup-23jun` | Referência Git | `BACKUP` | Recuperação de layout em ponto histórico. | Tag e branch `backup/layout-23jun` apontam para contexto equivalente. | Não se aplica. | Alto. | Condicionado a rollback/layout. | Não neste pacote. | Manter até política formal de retenção. | 100% |
| Tags `BACKUP-IGNITE-22-06-FOTOSRESOLVIDOS` e `BACKUP-IGNITE-21-06-TOP+BAGY` | Referências Git | `BACKUP` + `HISTÓRICO` | Preservam estados de fotos, aplicação e catálogo Bagy. | Tags, SHAs, mensagens e datas. | Não se aplica. | Alto para regressão e recuperação. | Condicionado a decisões de dados. | Não neste pacote. | Manter; revisão de retenção pertence ao Pacote C. | 100% |
| `docs/backups/gabriela-behavior-backup-2026-07-30_152958.json` | `docs/backups/` | `BACKUP` + `HISTÓRICO` | Backup estruturado de comportamento/configuração da Gabriela. | Caminho e nome temporal/semântico confirmados. | Não prova runtime atual. | Alto. | Médio, se validado e restaurável. | Não neste pacote. | Manter e relacionar futuramente a procedimento de restauração. | 99% |
| `docs/GABRIELA_BACKUP_COMPLETO.md` | `docs/` | `HISTÓRICO` | Registro textual do backup/configuração. | Arquivo documental e área de backup. | Não prova runtime. | Alto. | Médio. | Somente após links e política de restauração. | Manter como documentação histórica. | 95% |
| `CHECKPOINT-BACKUP-28-06.md` | Raiz | `BACKUP` + `HISTÓRICO` | Checkpoint de estado e decisões. | Nome, conteúdo e último commit. | Não se aplica. | Alto para rastreabilidade. | Médio. | Não neste pacote. | Manter até indexação documental futura. | 95% |
| `docs/dashboard-preview.png` | `docs/` | `PREVIEW` + `HISTÓRICO` | Evidência visual de geração de Dashboard. | Asset em documentação e contexto de preview. | Não prova runtime. | Alto para comparação visual. | Médio/alto. | Não neste pacote. | Manter até política de assets e decisão de Dashboard. | 92% |
| `src/services/_archive/` | `src/services/_archive/` | `HISTÓRICO` | Serviços arquivados por evolução anterior. | README, `importBackupService.js`, `photoMatchingService.js`, `photoRecognitionService.js`. | Não são runtime principal confirmado. | Alto para entender substituições. | Variável; `importBackupService` pode não ter substituto confirmado. | Somente após consumidores, links e rollback. | Manter; não remover nem mover neste pacote. | 99% |
| `photoMatchingService.js` e `photoRecognitionService.js` | `src/services/_archive/` | `HISTÓRICO` | Serviços fotográficos superados pelo fluxo `foto/photoFlowService.js`, conforme README. | README e ausência de importadores estáticos ativos. | Runtime arquivado; substituto estrutural aparente. | Médio/alto. | Médio, como referência de migração. | Futuramente, com revisão de links. | Manter arquivado; não concluir remoção. | 95% |
| `importBackupService.js` | `src/services/_archive/` | `HISTÓRICO` + `NÃO CONFIRMADO` | Serviço de importação arquivado sem substituto vivo confirmado. | README e auditoria de órfãos. | Não confirmado. | Alto por risco de dependência desconhecida. | Potencialmente alto. | Não sem busca externa e owner. | Preservar até confirmar substituto e consumidores. | 98% |
| `aws-backend-example.js` | Raiz | `EXPERIMENTAL` + `REFERÊNCIA V2` + `HISTÓRICO` | Exemplo independente de AWS Rekognition. | Endpoints `/api/analyze-photo`, `/api/test`, `/api/status` e documentação de referência. | **NÃO CONFIRMADO**; não integrado ao app atual. | Alto como POC de visão. | Alto, condicionado a arquitetura e secrets. | Não neste pacote. | Manter como exemplo; não tratar como produção. | 98% |
| `catalog-imported.json` e `import-report.json` | Raiz | `BACKUP` + `HISTÓRICO` + `NÃO CONFIRMADO` | Snapshot/relatório de importação de catálogo/fotos. | Arquivos e commits no contexto AWS/Rekognition. | Não. | Alto para auditoria de dados. | Médio. | Somente após fonte canônica e validade dos dados. | Manter; não usar como fonte de runtime sem reconciliação. | 92% |

## 2. Regra especial do PRIME Bridge

O PRIME Bridge **não é classificado como lixo, descartável ou legado** apenas por estar relacionado a `poc/`. Há evidência de handler, integração, testes, contrato, Preview e arquitetura reutilizável. A classificação correta separa:

| Camada | Estado |
|---|---|
| Origem/localização | POC em `poc/zap-gptmaker-bridge/` e documentação de integração. |
| Valor arquitetural | Alto; núcleo reutilizado pelo `api/_primeBridgeWebhook.js`, com contratos e testes. |
| Estado operacional atual | `RUNTIME ATUAL: NÃO CONFIRMADO`; deploy, domínio, tráfego e health externo não foram comprovados. |

Nenhuma parte do Bridge foi alterada, executada, movida ou marcada para exclusão.

## 3. PRIME Cobranças, Base44 e Lyra

O repositório contém código, configuração, documentação e/ou referências para PRIME Cobranças, Base44 e Lyra, mas este pacote não decide cutover, substituição ou aposentadoria. Quando não há evidência externa de runtime, o estado permanece `NÃO CONFIRMADO` e a decisão é **ARQUITETURAL EXTERNA NECESSÁRIA**.

## 4. Política para organização futura

Antes de qualquer organização física, deve existir: inventário de links, consumidores internos e externos, owner, estratégia de rollback, confirmação de runtime, retenção histórica e autorização específica. POCs e previews podem conter valor para V2 e não devem ser removidos por nomenclatura.

## Referências

[1]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/tree/main/poc "POCs"
[2]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/api/_primeBridgeWebhook.js "Handler PRIME Bridge"
[3]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/tree/main/src/services/_archive "Serviços arquivados"
[4]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/tags "Tags"

## Encerramento

**Classificação documental concluída; nenhuma organização física foi executada.**
