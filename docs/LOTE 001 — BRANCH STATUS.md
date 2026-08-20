# IGNITE PRIME — BRANCH STATUS

**Status do mapa:** homologado e corrigido no LOTE 001
**Data:** 2026-08-20
**Fonte primária:** [`LOTE 001 — SOURCE OF TRUTH.md`](./LOTE%20001%20%E2%80%94%20SOURCE%20OF%20TRUTH.md)
**Regra:** nenhuma branch foi excluída, renomeada, mergeada ou alterada por este lote.

> A relação com `main` foi obtida por comparação GitHub somente leitura. “Atrás” ou “divergente” descreve topologia de commits; não prova abandono. Nenhuma branch deve ser removida sem confirmação do responsável, revisão dos commits exclusivos e política de retenção.

## Branches

| Branch | Relação com `main` | Finalidade aparente | Status | Evidência | Recomendação futura |
|---|---|---|---|---|---|
| `main` | Branch padrão; estado principal | Linha de referência configurada | `PRINCIPAL` / `CONFIGURADO`; runtime não confirmado | Branch padrão do repositório; HEAD auditado em 2026-08-20 | Manter; avaliar proteção de branch separadamente. |
| `fase2a-preview-isolado` | `REDUNDANTE NO SNAPSHOT CONSULTADO` em relação a `main` | Preview isolado da Fase 2A | `PREVIEW` / `INVESTIGAR` | Comparação `main...branch`: `identical` | Confirmar se a finalidade foi absorvida; não excluir por duplicidade aparente. |
| `shadow-experimental-preview` | 1 commit à frente; 0 atrás; 3 arquivos no diff | Shadow/preview experimental | `EXPERIMENTAL` / `PREVIEW` | Nome da branch, comparação e commit exclusivo | Preservar até o owner confirmar resultado e destino. |
| `preview-mensagem-manual-builder` | 23 commits à frente; 10 atrás; 22 arquivos no diff | Preview do fluxo de mensagem manual e Builder | `PREVIEW` / `DIVERGENTE` | Comparação GitHub somente leitura | Comparar contratos com `main` e decidir retenção com owner. |
| `preview-teste-mensagem-manual-minimo` | 14 commits à frente; 10 atrás; 22 arquivos no diff | Preview mínimo/teste de mensagem manual | `PREVIEW` / `DIVERGENTE` | Comparação GitHub somente leitura | Preservar até consolidar ou declarar histórico. |
| `cutover-builder-preview-b` | 0 à frente; 10 atrás | Preview B do cutover para Builder | `PREVIEW` / `HISTÓRICO A VALIDAR` | Nome e commits de cutover; relação Git | Confirmar se foi absorvida ou permanece como evidência de migração. |
| `fix/auto-photo-categoria-falsa` | 0 à frente; 9 atrás | Correção de classificação de categoria no auto-photo | `NÃO CONFIRMADO` / `INVESTIGAR` | Nome e divergência em relação à `main` | Verificar se a correção já está em `main`; não remover sem diff e owner. |
| `backup/layout-23jun` | 0 à frente; 276 atrás | Backup de layout em 23 de junho | `HISTÓRICO` / `BACKUP` | Prefixo `backup/`, idade topológica e comparação | Manter até política de retenção confirmar descarte. |
| `claude/affectionate-leavitt-f2015c` | 0 à frente; 189 atrás | Worktree/branch de agente Claude | `NÃO CONFIRMADO` / `INVESTIGAR` | Prefixo `claude/` e relação Git | Identificar owner e commits exclusivos; não excluir. |
| `claude/determined-aryabhata-bc069a` | 0 à frente; 213 atrás | Worktree/branch de agente Claude | `NÃO CONFIRMADO` / `INVESTIGAR` | Prefixo `claude/` e relação Git | Identificar owner e commits exclusivos; não excluir. |
| `claude/keen-cerf-a6eafb` | 0 à frente; 175 atrás | Worktree/branch de agente Claude | `NÃO CONFIRMADO` / `INVESTIGAR` | Prefixo `claude/` e relação Git | Identificar owner e commits exclusivos; não excluir. |

## Tags de backup relacionadas

As seguintes tags foram encontradas no inventário Git e não são branches:

| Tag | Classificação | Observação |
|---|---|---|
| `v-backup-23jun` | `HISTÓRICO` / `BACKUP` | Snapshot temporal associado ao backup de layout. |
| `BACKUP-IGNITE-22-06-FOTOSRESOLVIDOS` | `HISTÓRICO` / `BACKUP` | Nome indica snapshot de correções de fotos. |
| `BACKUP-IGNITE-21-06-TOP+BAGY` | `HISTÓRICO` / `BACKUP` | Nome indica snapshot de catálogo/Bagy. |

## Regras de decisão para lote futuro

Antes de arquivar ou remover qualquer branch, deve-se registrar o owner, listar commits exclusivos, verificar referências em PRs/worktrees/documentação, confirmar que o estado foi absorvido ou preservado em tag e definir restauração. A palavra “backup” não é uma autorização de exclusão, e uma branch atrás de `main` pode conter contexto histórico relevante. Topologia, nomenclatura ou ausência de atividade não bastam para classificar uma branch como `HISTÓRICO` ou `LEGADO`; nesses casos, use `NÃO CONFIRMADO`.

**Fonte de comparação:** endpoint GitHub de comparação entre `main` e cada branch, consultado em modo somente leitura em 2026-08-20.
