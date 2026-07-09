# docs/PRE-FASE3-CHECKLIST.md — Auditoria de Prontidão Pré-Fase-3

> **Snapshot:** 2026-07-09 · branch `main` · checkpoint de referência: `e21bae2`
> **Fonte:** `PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, `docs/WEBHOOKS.md`, `docs/SUPABASE.md`, `docs/VARIABLES-REPORT.md`, `docs/relacionamentos/*`
> **Objetivo:** listar o que precisa ser resolvido/confirmado antes de mover qualquer arquivo de `src/services/`. Documento de análise — nenhuma mudança de código foi feita para gerá-lo.

---

## 1. Inconsistências documentadas que pesam sobre a Fase 3

| # | Inconsistência | Fonte | Por que importa pra mover `src/services/` |
|---|---|---|---|
| 1 | `VITE_GPTMAKER_WORKSPACE` diverge entre `.env` e `.env.local` — **RESOLVIDO em 2026-07-09, ver §1.2**: reauditado, valores já idênticos; doc corrigida | `VARIABLES-REPORT.md §2.1` | Se algum teste de regressão da Fase 3 rodar num contexto que lê só `.env`, valida a migração contra o workspace errado — falso positivo/negativo |
| 2 | `.env` desatualizado — faltam 10 variáveis que só existem em `.env.local` (Groq, DeepSeek, Drive, Cohere, Base44, GPTMaker URL) — **documentação confirmada correta em 2026-07-09, ver §1.2; propagação real ao arquivo `.env` ainda pendente** | `VARIABLES-REPORT.md §2.4` | Mesma raiz do #1: qualquer verificação que dependa só do `.env` pode "quebrar" funcionalidades que na verdade estão OK |
| 3 | Nome do bucket Storage ambíguo — `produtos` (docs) vs `productos` (CLAUDE.md) — **RESOLVIDO em 2026-07-09, ver §1.2**: código usa só `produtos`, CLAUDE.md corrigido | `SUPABASE.md §5` | Não bloqueia a Fase 3 diretamente, mas pode gerar falso alarme durante testes manuais pós-movimentação |
| 4 | `VITE_SUPABASE_ANON_KEY` (citada no CLAUDE.md) vs `VITE_SUPABASE_KEY` (usada de fato no código) — **RESOLVIDO em 2026-07-09, ver §1.2**: CLAUDE.md corrigido para `VITE_SUPABASE_KEY` | `VARIABLES-REPORT.md §4` | Mesmo risco de falso alarme durante validação |
| 5 | 6 services "órfãos" (`awsRekognitionService`, `deepseek`, `importBackupService`, `photoMatchingService`, `photoRecognitionService`, `searchKnowledge`) sem confirmação de que são realmente mortos — **RESOLVIDO em 2026-07-09, ver §1.1** | `ARCHITECTURE.md §4.4` | Classificá-los como "baixo risco" sem confirmar pode fazer mover algo consumido indiretamente (import dinâmico, string, etc.) |
| 6 | Regras de negócio duplicadas entre `api/` e `src/services/` (scoring, funil, objeções, fallback de catálogo, busca de conhecimento) | `ARCHITECTURE.md §5` | Risco de escopo: a Fase 3 é sobre organizar `src/services/`, não sobre unificar com `api/`. Precisa estar explícito que não mexe em `api/*.js` |
| 7 | `DealOncaPage.jsx` importa 14 services; `opsHealthService` é hub de 10 | `ARCHITECTURE.md §4.2, §8` | Maior superfície de teste manual — precisa de checklist próprio antes de tocar nesses dois pontos |
| 8 | 12 tabelas Supabase sem migration versionada (schema só existe no painel) | `SUPABASE.md §3.2` | Não bloqueia Fase 3, mas não há como validar via `git diff` se uma mudança em service quebrou leitura de tabela — só testando manualmente |
| 9 | `VITE_AWS_*` com prefixo `VITE_` (client-side) carregando credenciais que deveriam ser server-side | `VARIABLES-REPORT.md §7` | Risco de segurança preexistente, não gerado pela Fase 3; registrar para não ser "aproveitado" fora de escopo durante o move |

---

### 1.1 Auditoria dos 6 services "órfãos" — resultado (2026-07-09)

> **Metodologia:** grep case-insensitive em todo o repositório (`src/`, `api/`, `scripts/`, `.github/`, raiz, docs) por import direto, import dinâmico (`import(...)` — nenhum encontrado no projeto inteiro), referência por string, uso em `pages`/`components`, cron jobs e scripts. Checagem adicional: exports de cada arquivo buscados individualmente pelo nome da função em todo o código. Nenhum arquivo foi movido ou alterado para esta auditoria.

**Órfãos confirmados (zero uso real no runtime):**

| Service | Evidência |
|---|---|
| `awsRekognitionService` | Zero referências em `src/`, `api/`, `scripts/`. `photoRecognitionService.js:149` tem função própria `analyzeWithAWSRekognition` duplicada, não importa o arquivo real. Só aparece em docs históricos da raiz e comentário do `.env.example`. |
| `importBackupService` | Zero referências fora do próprio arquivo. Checado especificamente em `ImportCatalogPage.jsx` e `ImportReviewPage.jsx` (páginas que o nome sugeriria uso) — nenhuma importa. |
| `photoMatchingService` | Zero referências externas às funções exportadas (`matchPhotoToProducts`, `searchProductByName`, `debugPhotoAnalysis`). Só aparece em docs históricos. |
| `photoRecognitionService` | Zero imports externos das funções exportadas (`recognizePhoto`, `analyzeImageWithFallback`, etc.) em `src/pages`/`src/components`. |
| `searchKnowledge` | `src/services/searchKnowledge.js` não é importado por nada em `src/`. `api/webhook.js:179` tem função local homônima, implementação independente sem import — confirma a duplicação já registrada em `ARCHITECTURE.md §5`. Única "referência" é `TESTE-WEBHOOK.md`, snippet de teste manual histórico, não script executável do projeto. |

**Não órfão — reclassificar:**

| Service | Evidência |
|---|---|
| `deepseek` | Importado diretamente (`import { askDeepSeek } from './deepseek'`) por: `knowledgeAuditService.js`, `learningsAuditService.js`, `contactAnalysisService.js`, `groq.js`. Todos consumidos por páginas reais (`groq` tem 7 consumers documentados em `ARCHITECTURE.md §4.1`). **Classificação corrigida: uso indireto confirmado, não é candidato de baixo risco para mover cedo.** |

**Conclusão:** 5 dos 6 "órfãos" listados em `ARCHITECTURE.md §4.4` são órfãos reais e bons candidatos para abrir a Fase 3A. O 6º (`deepseek`) sai dessa lista e passa para a categoria de risco médio (múltiplos consumidores diretos, isolados por domínio de IA).

---

### 1.2 Auditoria dos itens de ambiente — resultado (2026-07-09)

> **Metodologia:** leitura direta de `.env` e `.env.local` (comparação de valores completos, não só nomes), grep de `VITE_SUPABASE_ANON_KEY`/`VITE_SUPABASE_KEY` e do literal `produtos`/`productos` em todo `src/` e `api/`. Correções aplicadas somente em `CLAUDE.md` e `docs/VARIABLES-REPORT.md` — nenhum arquivo em `src/`, `api/`, Supabase ou Vercel foi tocado; `.env`/`.env.local` não foram editados.

| Item | Situação encontrada | Ação tomada |
|---|---|---|
| Divergência `VITE_GPTMAKER_WORKSPACE` | `.env` e `.env.local` têm o **mesmo valor** hoje (`3F300E7C6105E0123A946E0E9A5EC274`), batendo com o CLAUDE.md. A divergência registrada no snapshot de 2026-07-08 não existe mais na árvore atual — foi corrigida em algum momento entre os dois snapshots, sem atualização do doc. | `VARIABLES-REPORT.md §2.1` reescrita para refletir o estado atual; alerta crítico removido. |
| Variáveis só no `.env.local` | Confirmado por diff direto dos dois arquivos: 10 variáveis só em `.env.local` (`COHERE_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `VITE_BASE44_API_KEY`, `VITE_BASE44_APP_ID`, `VITE_DEEPSEEK_API_KEY`, `VITE_GOOGLE_DRIVE_API_KEY`, `VITE_GOOGLE_DRIVE_FOLDER_ID`, `VITE_GPTMAKER_URL`, `VITE_GROQ_API_KEY`) e 4 só em `.env` (`VITE_AWS_ACCESS_KEY`, `VITE_AWS_SECRET_KEY`, `VITE_AWS_REGION`, `VITE_OPENROUTER_KEY`). As tabelas §2.3/§2.4 do `VARIABLES-REPORT.md` já estavam corretas — só faltava a confirmação formal. | Adicionada nota de reauditoria em `VARIABLES-REPORT.md §2` confirmando os números. **A propagação real das variáveis entre os arquivos não foi feita** — está fora do escopo documental, seguirá como ação pendente. |
| `VITE_SUPABASE_KEY` vs `VITE_SUPABASE_ANON_KEY` | `VITE_SUPABASE_KEY` é usada em 43 arquivos reais (`src/`, `api/`, `scripts/`). `VITE_SUPABASE_ANON_KEY` não existe em nenhum código — só numa linha de exemplo no `CLAUDE.md`. | `CLAUDE.md` linha do exemplo de `.env.local` corrigida para `VITE_SUPABASE_KEY`. |
| Bucket `produtos` vs `productos` | Código usa exclusivamente `produtos` (12 ocorrências reais em `ChatArea.jsx`, `CatalogPage.jsx`, `imageReviewService.js`, `supabaseStorage.js`, `catalogSyncService.js`, incluindo URLs reais do Supabase Storage em produção). Zero ocorrências de `productos` em qualquer código. | `CLAUDE.md` (2 ocorrências) corrigido de `productos` para `produtos`. |

**Conclusão:** dos 4 itens, 1 já estava resolvido na prática (workspace) e só precisava de atualização documental; 2 eram inconsistências reais de nomenclatura em documentação (`ANON_KEY`, `productos`) agora corrigidas; 1 (propagação de variáveis entre `.env`/`.env.local`) segue como ação pendente porque exige editar arquivos de ambiente, fora do escopo desta rodada (só documentação).

---

## 2. Classificação das correções

**Seguras (só alinhamento de doc/config, zero risco de comportamento) — exigem confirmação explícita do Rafael antes de aplicar, por regra do `CLAUDE.md`:**
- #1 e #2 — corrigir `.env` para bater com `.env.local` (Vite já prioriza `.env.local`, então é reversível e não muda runtime).
- #3 e #4 — puramente nomenclatura/documentação.

**Verificadas (concluído):**
- #5 — auditoria completa em 2026-07-09 (ver §1.1): 5 órfãos confirmados, `deepseek` reclassificado.

**Não exigem correção, só planejamento:**
- #7 — não é uma inconsistência a "corrigir", é um ponto de atenção que define a ordem da Fase 3.

**Fora do escopo da Fase 3 — não corrigir agora, só registrar:**
- #6 — unificar `api/` e `src/services/` é outro projeto.
- #8 — versionar schema é trabalho à parte.
- #9 — segurança das keys AWS é outro projeto.

---

## 3. Checklist definitiva de Pré-Fase-3

```
AMBIENTE
[x] Corrigir VITE_GPTMAKER_WORKSPACE no .env — reauditado 2026-07-09: já estava consistente, doc corrigida (VARIABLES-REPORT.md §2.1)
[ ] Propagar para o .env as variáveis que só existem no .env.local (Groq, DeepSeek, Drive, Cohere, Base44, GPTMaker URL) — ainda pendente, ação real no arquivo (fora do escopo documental de 2026-07-09)
[x] Confirmar nome real do bucket (produtos vs productos) — confirmado por evidência de código (12 usos reais de "produtos", zero de "productos"), CLAUDE.md corrigido em 2026-07-09
[x] Decidir nome oficial: VITE_SUPABASE_KEY (usar esse) — corrigido em CLAUDE.md em 2026-07-09
[ ] Remover ou confirmar NEXT_PUBLIC_VERCEL_URL no CLAUDE.md (não encontrada em nenhum grep) — fora do escopo desta rodada, ainda pendente

CLASSIFICAÇÃO DE SERVICES
[x] Confirmar se os 6 services "órfãos" são realmente sem uso (grep incluindo imports dinâmicos) — concluído 2026-07-09, ver §1.1
[ ] Registrar por escrito a ordem de movimentação (ex: órfãos confirmados [awsRekognitionService, importBackupService, photoMatchingService, photoRecognitionService, searchKnowledge] → domínio isolado [inclui deepseek] → hubs gptmaker/catalog/groq/opsHealthService)
[ ] Definir plano de teste manual específico para DealOncaPage e opsHealthService (maior superfície de risco)

ESCOPO
[ ] Confirmar por escrito: Fase 3 NÃO toca em api/*.js (mantém a separação já existente entre api/ e src/services/)
[ ] Confirmar por escrito: Fase 3 NÃO tenta unificar regras duplicadas (scoring/funil/objeções/fallback) — projeto separado
[ ] Confirmar por escrito: Fase 3 NÃO mexe em credenciais AWS/segurança — risco preexistente, fora de escopo

CHECKPOINT
[ ] Confirmar que e21bae2 (ou commit mais recente) é o ponto de rollback antes de iniciar 3A
[ ] Definir que cada sub-fase (3A/3B/3C) terá seu próprio commit de checkpoint, para rollback granular
```

---

## 4. Recomendação de abordagem

1. ~~Resolver os 4 itens de ambiente/nomenclatura primeiro~~ — concluído em 2026-07-09 (ver §1.2): 3 resolvidos por completo (workspace, ANON_KEY, bucket), 1 com documentação confirmada mas propagação real do `.env` ainda pendente.
2. ~~Confirmar os 6 órfãos de verdade antes de classificá-los como "baixo risco"~~ — concluído em 2026-07-09 (ver §1.1): 5 confirmados, `deepseek` reclassificado como uso indireto.
3. Começar a Fase 3 pelos 5 órfãos confirmados (`awsRekognitionService`, `importBackupService`, `photoMatchingService`, `photoRecognitionService`, `searchKnowledge`) — validação rápida, baixo custo de erro.
4. Deixar `gptmaker`, `catalog`, `groq` e `opsHealthService` por último — são os hubs; qualquer engano ali afeta várias páginas ao mesmo tempo (Inbox, DealOnça, Catálogo).
5. Não misturar com a unificação `api/` × `src/services/` — são dois projetos de risco muito diferente.

---

**Gerado em:** 2026-07-09 · Auditoria pré-Fase-3, com base apenas em documentação das Fases 1 e 2.
