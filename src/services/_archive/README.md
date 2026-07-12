# src/services/_archive/

Código sem consumidores ativos, mantido por valor de referência arquitetural
ou por depender de uma decisão externa ainda em aberto — não por indecisão
sobre removê-lo.

| Arquivo | Por quê está aqui | Substituto vivo |
|---|---|---|
| `photoMatchingService.js` | Matching de foto por Levenshtein, teve refino real, abandonado quando o projeto pivotou pra GPT Maker Vision | `foto/photoFlowService.js` |
| `photoRecognitionService.js` | Arquitetura multi-provider (Vision/OpenAI/AWS/local) desenhada e nunca implementada | `foto/photoFlowService.js` |
| `importBackupService.js` | Importação de backup do Prime Store, nunca conectada a tela; `dealism-backup/` foi removida da árvore atual em 2026-07-12 | nenhum — funcionalidade não tem equivalente ativo |

Ver `docs/AUDITORIA-ORFAOS-SERVICES.md` para a auditoria completa.
