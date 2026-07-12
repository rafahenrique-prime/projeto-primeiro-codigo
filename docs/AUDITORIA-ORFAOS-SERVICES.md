# docs/AUDITORIA-ORFAOS-SERVICES.md — Auditoria e descomissionamento dos services órfãos

> **Gerado em:** 2026-07-10 · pós-Fase-3C (reorganização de `src/services/` já concluída e publicada em `main`).
> **Escopo:** os 5 services com fan-in = 0 identificados na auditoria final da reorganização (`docs/POS-FASE3B-AUDITORIA.md §4.4`, confirmados novamente na auditoria independente pós-push).

---

## 1. Os 5 órfãos identificados

| Service | Pasta | Criado em | Último uso real |
|---|---|---|---|
| `awsRekognitionService` | `foto/` | `e0f8eaf` (2026-06-19) | nunca — só move de pasta |
| `photoMatchingService` | `foto/` | `e0f8eaf` (2026-06-19) | `a6279b5` (2026-06-22) — fix real |
| `photoRecognitionService` | `foto/` | `e0f8eaf` (2026-06-19) | nunca — só move de pasta |
| `searchKnowledge` | `conhecimento/` | `804a49f` (2026-06-24) | nunca — só move de pasta |
| `importBackupService` | `catalogo/` | `e0f8eaf` (2026-06-19) | `f824a68` (2026-06-22) — fix real |

Todos os 5 nasceram na mesma leva de commits de exploração de arquitetura (foto/catálogo, 2026-06-19 a 24) e foram superados dentro de poucos dias por implementações mais simples que de fato ganharam consumidores: `photoFlowService.js` (fotos, via GPT Maker Vision) e `api/webhook.js::searchKnowledge()` (conhecimento, serverless).

## 2. Auditoria de segurança (verificação de consumo invisível ao grep simples)

Verificado em todo o repositório (`src/`, `api/`, `scripts/`, `docs/`, configs, CI):

| Mecanismo | Resultado |
|---|---|
| `import.meta.glob` (Vite) | Zero ocorrências no projeto inteiro |
| `eval()` / `new Function()` | Zero ocorrências |
| `import()` dinâmico (lazy load) | Zero ocorrências — projeto não usa code-splitting |
| Configs (`vite.config.js`, `vitest.config.js`, `package.json`) | Zero menções aos 5 nomes |
| CI (`.github/`) | Zero menções |
| Testes (`src/services/__tests__/syncCatalog.test.js`, único teste do repo) | Importa só `catalogo/catalogSyncService` |
| Strings de caminho literal (`require`, `fetch`, URLs) | Zero, exceto 1 `console.error` em `api/webhook.js` referenciando o nome da própria função local (não um import) |
| Variáveis de ambiente exclusivas (`VITE_AWS_*`, `VITE_GOOGLE_VISION_KEY`, `VITE_OPENAI_API_KEY`) | Placeholders vazios em `.env.example`, não setadas em `.env.local`, referenciadas só por `awsRekognitionService.js`/`photoRecognitionService.js` |

**Conclusão:** nenhum dos 5 arquivos tem qualquer forma de consumo — estático, dinâmico, por string, por teste, por config ou por CI.

## 3. Classificação de risco de remoção

| Service | Risco (0-10) | Motivo |
|---|---|---|
| `awsRekognitionService` | **0** | Nunca teve substituto porque nunca foi implementação — 3 dos 6 exports são template strings de exemplo/documentação, não código de produção |
| `searchKnowledge` | **1** | Zero consumo no frontend; duplicado (não importado) por `api/webhook.js::searchKnowledge()`, que é a versão viva |
| `photoMatchingService` | **1** | Teve refino de engenharia real (3 commits de fix), superado por `photoFlowService.js` |
| `photoRecognitionService` | **1** | Arquitetura multi-provider desenhada e nunca conectada, superada por `photoFlowService.js` |
| `importBackupService` | **2** | Feature completa nunca conectada a uma tela; `dealism-backup/` foi removida da árvore atual em 2026-07-12 (commit `d940b05`) — permanece arquivado como referência, sem dependência externa pendente |

## 4. Plano de descomissionamento

- **Etapa A (arquivar)** — `photoMatchingService`, `photoRecognitionService`, `importBackupService`: preservar como registro de decisão de arquitetura ou por dependerem de uma decisão externa ainda não tomada. **Ainda não executada.**
- **Etapa B (remover)** — `awsRekognitionService`, `searchKnowledge`: sem valor de referência arquitetural, sem dependência externa pendente.

## 5. Execução — Etapa B (2026-07-10)

**Aprovado por Rafael Henrique**, escopo explícito: remover apenas `awsRekognitionService.js` e `searchKnowledge.js`.

- `git rm src/services/foto/awsRekognitionService.js`
- `git rm src/services/conhecimento/searchKnowledge.js`
- `docs/ARCHITECTURE.md` atualizado: linha de órfãos (§4.4), tabela de domínios (§7) e tabela de duplicação de regras (§5) — a duplicação de "busca de conhecimento" está **resolvida** (não mais mitigada): a implementação canônica é `api/webhook.js::searchKnowledge()`.
- Verificação pós-remoção: zero imports quebrados, zero referências residuais, `npm run build` limpo (detalhes na seção 6 abaixo).
- `photoMatchingService`, `photoRecognitionService`, `importBackupService` **permanecem intactos** — Etapa A (arquivar) não foi autorizada nesta rodada.

## 6. Verificação pós-remoção (Etapa B)

- **Imports quebrados:** verificação programática de todos os 186 imports relativos em `src/` — **0 quebrados** (mesma contagem de antes da remoção, confirma que nenhum import apontava para os 2 arquivos removidos).
- **Referências residuais:** `grep` por `awsRekognitionService` em `src/`, `api/`, `scripts/` — **0 ocorrências**. `grep` por `from ... searchKnowledge` — **0 ocorrências** (a função homônima em `api/webhook.js` é local, não um import do arquivo removido).
- **`npm run build`:** passou limpo — 789 módulos transformados (mesma contagem de antes da remoção, confirma que os 2 arquivos já não entravam no grafo do bundle).
- **Total de `src/services/`:** 49 → 47 arquivos.

## 7. Execução — Etapa A (2026-07-10)

**Aprovado por Rafael Henrique**, escopo explícito: mover `photoMatchingService.js`, `photoRecognitionService.js` e `importBackupService.js` para `src/services/_archive/`, com auditoria de pré-checagem antes de executar.

**Pré-checagem imediatamente antes da execução:**
- Fan-in recalculado (interno + externo, estático) para os 3 — **0 em todos**, confirma que nada mudou desde a auditoria original.
- Verificação de documentação operacional ativa (fora dos relatórios de auditoria) revelou que os 3 **são mencionados** em `docs/VARIABLES-REPORT.md` (`photoRecognitionService.js`, linhas 116-117), `docs/relacionamentos/supabase-vs-catalogo.md` (`photoRecognitionService.js`, 5 menções) e `docs/SUPABASE.md` (`importBackupService.js`, linha 159) — descrevendo-os como se fossem consumidores ativos do fluxo de dados. Essas 3 menções já estavam desatualizadas antes desta auditoria (fan-in é 0 desde a criação dos arquivos) e **não foram corrigidas nesta rodada** — fora do escopo aprovado (`ARCHITECTURE.md` + este documento). **Pendência registrada para correção futura.**

**Execução:**
- `git mv src/services/foto/photoMatchingService.js src/services/_archive/photoMatchingService.js`
- `git mv src/services/foto/photoRecognitionService.js src/services/_archive/photoRecognitionService.js`
- `git mv src/services/catalogo/importBackupService.js src/services/_archive/importBackupService.js`
- Cada arquivo recebeu um comentário de cabeçalho registrando data, motivo do arquivamento e substituto atual.
- `importBackupService.js` teve seu import interno corrigido: `from './catalog'` → `from '../catalogo/catalog'` (mudou de pasta, `catalog.js` não é mais vizinho de pasta).
- Novo `src/services/_archive/README.md` — índice dos 3 arquivos arquivados, motivo e substituto de cada um.
- `docs/ARCHITECTURE.md` atualizado: §2 (adiciona `_archive/` à árvore), §4.4 (órfãos: fica vazio, os 3 estão arquivados), §7 (tabela de domínios, `_archive/` como nova linha).

**Verificação pós-arquivamento:**
- Imports quebrados: **0** de 186 verificados (mesma contagem — confirma que o import corrigido de `importBackupService.js` resolve corretamente).
- `npm run build`: limpo, 789 módulos (mesma contagem de antes — os 3 arquivos já não entravam no grafo do bundle).
- **`photoMatchingService`, `photoRecognitionService`, `importBackupService` permanecem sem consumidores** — arquivar não muda esse fato, só a localização e a rastreabilidade da decisão.

---

**Total de `src/services/`:** 47 arquivos (8 domínios + `_archive/`, zero arquivos soltos na raiz). Nenhum arquivo foi perdido — todos os 5 órfãos originais foram tratados: 2 removidos, 3 arquivados.
