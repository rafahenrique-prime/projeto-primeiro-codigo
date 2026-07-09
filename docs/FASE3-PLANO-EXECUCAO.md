# docs/FASE3-PLANO-EXECUCAO.md — Plano de Execução da Fase 3 (reorganização de `src/services/`)

> **Snapshot:** 2026-07-09 · branch `main` · checkpoint pré-Fase-3: `ec60b8f` (histórico: documento criado sobre `6258744`, publicado em `ec60b8f`, que passa a ser o checkpoint de referência antes de iniciar a 3A)
> **Pré-requisito:** `docs/PRE-FASE3-CHECKLIST.md` — todos os blocos concluídos (AMBIENTE, CLASSIFICAÇÃO DE SERVICES, ESCOPO, CHECKPOINT)
> **Fonte:** `docs/ARCHITECTURE.md §4` (matriz de dependências) + contagem de fan-in real feita em 2026-07-09 (grep de imports em `src/`, ver §1)
> **Objetivo:** definir oficialmente a ordem 3A → 3B → 3C, quais services entram em cada fase, e o plano de validação manual de cada uma. Documento de planejamento — **nenhum arquivo foi movido, nenhum import foi alterado** para gerá-lo.

---

## 1. Metodologia

O `ARCHITECTURE.md §4` documenta fan-in (número de consumidores) só para os 7 services mais importados, mais o hub `opsHealthService`, mais o grafo de 16 arestas service→service, mais a lista de 5 órfãos confirmados (`docs/PRE-FASE3-CHECKLIST.md §1.1`). Isso cobre ~25 dos 49 arquivos de `src/services/`.

Para os outros ~24 sem contagem documentada, rodei uma contagem de fan-in real em 2026-07-09: `grep -rl "services/<nome>" src/` excluindo o próprio arquivo, contando arquivos distintos que importam cada service (páginas, componentes e outros services). Os números batem com os já documentados para os 7 services de maior fan-out (pequena variação por metodologia — ex. `gptmaker` documentado com 12, contagem fresca encontrou 13; a diferença não muda a classificação de risco).

**Resultado completo (49 services, fan-in real):**

| Fan-in | Services |
|---|---|
| 13 | `gptmaker` |
| 9 | `catalog` |
| 6 | `groq` |
| 5 | `customerProfileService` |
| 4 | `photoHistory`, `knowledgeDB` |
| 3 | `followUpService` |
| 2 | `scrapingService`, `ocrService`, `knowledgeParser`, `interactionsService`, `avatarCacheService`, `agentAuditService` |
| 1 | `whatsappAuditService`, `weeklyInsightService`, `tokenLoggingService`, `systemHealthService`, `supabaseStorage`, `stageHistory`, `scraperService`, `photoFlowService`, `photoCacheService`, `opsHealthService`, `messageHistoryService`, `learningsAuditService`, `knowledgeTimestamps`, `knowledgeGenerator`, `knowledgeExtractor`, `knowledgeAuditService`, `instagramAuditService`, `imageReviewService`, `imageExtractor`, `gptmakerCreditsService`, `googleDriveCatalog`, `diagnosticService`, `deepseekBalanceService`, `deepseek`, `contactAnalysisService`, `codexAuditService`, `codexAlertsService`, `cobrancasService`, `catalogSyncService`, `bagyAuditService`, `agentLearningsService` |
| 0 | `searchKnowledge`, `photoRecognitionService`, `photoMatchingService`, `importBackupService`, `awsRekognitionService` |

**Nota sobre `opsHealthService` (fan-in=1):** apesar de ter só 1 consumidor direto (`IntelligenceOpsPage`), ele é hub — importa 10 outros services (`ARCHITECTURE.md §4.2`). Mover `opsHealthService` sozinho é barato (1 arquivo consumidor a atualizar), mas ele só deve ser movido **depois** que os 10 services que ele importa já estiverem estáveis em suas novas pastas — por isso entra na fase de maior cautela (3C), não pelo fan-in dele, mas pela posição dele no grafo.

---

## 2. Ordem oficial: 3A → 3B → 3C

### Fase 3A — Risco baixo (5 arquivos, fan-in = 0 confirmado)

Os 5 órfãos confirmados na auditoria de 2026-07-09 (`PRE-FASE3-CHECKLIST.md §1.1`). Zero consumidores em `src/` ou `api/`, verificado por duas rodadas independentes de grep (incluindo nomes de função exportada, não só nome de arquivo).

| Service | Domínio (ARCHITECTURE.md §7) | Caminho atual | Caminho destino |
|---|---|---|---|
| `awsRekognitionService` | Foto | `src/services/awsRekognitionService.js` | `src/services/foto/awsRekognitionService.js` |
| `importBackupService` | Catálogo | `src/services/importBackupService.js` | `src/services/catalogo/importBackupService.js` |
| `photoMatchingService` | Foto | `src/services/photoMatchingService.js` | `src/services/foto/photoMatchingService.js` |
| `photoRecognitionService` | Foto | `src/services/photoRecognitionService.js` | `src/services/foto/photoRecognitionService.js` |
| `searchKnowledge` | Conhecimento | `src/services/searchKnowledge.js` | `src/services/conhecimento/searchKnowledge.js` |

**Convenção de pastas (aprovada por Rafael em 2026-07-09):** subpastas dentro de `src/services/`, minúsculas, sem acento, nomeadas pelo domínio lógico já documentado em `ARCHITECTURE.md §7` — `foto/`, `catalogo/`, `conhecimento/`. Essa convenção vale para toda a Fase 3 (3A/3B/3C), não só para 3A; os domínios de 3B (Chat, Cliente/CRM, Auditoria, IA, Plataforma/Util) seguem o mesmo padrão quando essa fase for planejada em detalhe.

**Imports internos que exigem atualização (fan-out dos próprios arquivos movidos, auditado em 2026-07-09):**

| Arquivo | Import interno | De | Para |
|---|---|---|---|
| `importBackupService.js` | linha 6 | `from './catalog'` | `from '../catalog'` |
| `photoMatchingService.js` | linha 8 | `from './catalog'` | `from '../catalog'` |
| `awsRekognitionService.js` | — | Nenhum import real (as linhas com `import AWS`/`import express` estão dentro da template string `awsBackendExample`, um exemplo de código documentado como texto — não são imports executados) | — |
| `photoRecognitionService.js` | — | Nenhum import | — |
| `searchKnowledge.js` | — | Nenhum import | — |

**Imports externos a atualizar:** nenhum — 0 consumidores confirmados em `src/`, `api/`, `scripts/` (reconfirmado por grep em 2026-07-09, inclusive contra `vite.config.js`, `package.json`, `vercel.json`).

**Por que primeiro:** nenhuma página ou componente quebra se esses arquivos mudarem de lugar — o único risco é erro de sintaxe na movimentação em si (incluindo os 2 imports internos acima), detectável pelo build.

---

### Fase 3B — Risco médio (36 arquivos, fan-in 1–2, isolados por domínio)

Todo o restante que não está em 3A nem 3C. Organizados por domínio para facilitar validação — cada subgrupo pode ser um commit interno dentro do checkpoint de 3B, testado pela página correspondente.

| Domínio | Services | Página(s) para validar |
|---|---|---|
| Chat | `messageHistoryService`, `interactionsService` | Inbox, ChatArea |
| Catálogo | `catalogSyncService`, `googleDriveCatalog`, `scraperService`, `scrapingService` | CatalogPage, DraftCatalogPage, ImportCatalogPage, ExtractorPage |
| Cliente/CRM | `contactAnalysisService`, `cobrancasService`, `stageHistory` | ContactsPage, ContactsNewPage, CobrancasPage |
| Conhecimento | `knowledgeGenerator`, `knowledgeParser`, `knowledgeExtractor`, `knowledgeTimestamps` | KnowledgePage |
| Foto | `photoFlowService`, `photoCacheService`, `ocrService`, `imageExtractor`, `imageReviewService` | PhotoRecognitionPage, ExtractorPage, ImageExtractorPage, DealOncaPage (revisão de imagens) |
| Auditoria | `agentAuditService`, `codexAuditService`, `codexAlertsService`, `agentLearningsService`, `learningsAuditService`, `knowledgeAuditService`, `whatsappAuditService`, `instagramAuditService`, `bagyAuditService` | IntelligenceOpsPage |
| IA (isolado) | `deepseek` ⚠️, `deepseekBalanceService` | DealOncaPage (seletor de modelo), Dashboard (TokenUsageCard/DeepSeekBalanceCard) |

> ⚠️ **Ordem interna obrigatória dentro de 3B — `deepseek` por último:** `deepseek` deve ser o **último service movido dentro da Fase 3B**, depois de todos os outros 35. Ele é dependência indireta de `groq` (Fase 3C) — `knowledgeAuditService`, `learningsAuditService`, `contactAnalysisService` e o próprio `groq` importam `askDeepSeek` dele. Movê-lo cedo demais dentro de 3B não quebra nada sozinho (o import é atualizado no mesmo commit), mas movê-lo **depois** de `groq` já estar em 3C deixaria o import de `groq` apontando para o caminho antigo. Aprovado por Rafael em 2026-07-09: mantido em 3B, com esta restrição de ordem registrada.
| Plataforma/Util | `supabaseStorage`, `systemHealthService`, `diagnosticService`, `avatarCacheService`, `tokenLoggingService`, `gptmakerCreditsService`, `weeklyInsightService` | Dashboard, IntelligenceOpsPage, InboxList |

**Nota sobre `deepseek`:** reclassificado em `PRE-FASE3-CHECKLIST.md §1.1` como "uso indireto" (4 consumidores diretos: `knowledgeAuditService`, `learningsAuditService`, `contactAnalysisService`, `groq`). Fan-in real = 1 (só `groq` importa via caminho direto contado pelo grep; os outros 3 aparecem no grafo de `ARCHITECTURE.md §4.3` como consumidores de `askDeepSeek`). Entra em 3B, não em 3A, e deve ser movido **antes** de `groq` (que é 3C) para não deixar import pendurado.

---

### Fase 3C — Risco alto (8 arquivos: hubs e maior fan-in)

| Service | Fan-in | Motivo do risco |
|---|---|---|
| `gptmaker` | 13 | Maior fan-out do projeto — Inbox, ChatArea, RightPanel, quase todas as páginas de CRM dependem dele |
| `catalog` | 9 | CatalogPage, DealOncaPage, Extractor*, ChatArea, RightPanel, App.jsx/main.jsx |
| `groq` | 6 | AgentLab, DealOncaPage, KnowledgePage, SimuladorCliente, ChatArea, RightPanel |
| `customerProfileService` | 5 | Contacts*, DealOncaPage, ChatArea, App.jsx — alimenta a priorização do Inbox (`buy_score`) |
| `photoHistory` | 4 | SimuladorCliente, ChatArea, PhotoHistoryPanel, RightPanel |
| `knowledgeDB` | 4 | ContactsNew, DealOncaPage, KnowledgePage, ChatArea |
| `followUpService` | 3 | DealOncaPage, FollowUpPage, App.jsx |
| `opsHealthService` | 1 (mas hub de 10) | Agrega 10 services de auditoria (3B) — só deve mover depois que todos eles estiverem estáveis |

**Por que por último:** qualquer engano aqui é visível simultaneamente em várias páginas centrais (Inbox, DealOnça, Catálogo) — é onde vale a pena ter o máximo de confiança acumulada das fases anteriores antes de mexer.

---

## 3. Plano de validação manual por fase

> ⚠️ **Limitação de teste conhecida (registrada em 2026-07-09, incidente Fase 3A):** páginas/fluxos que dependem de `api/*.js` (Importação por URL/scraper, Auto-Foto, Webhook) **não podem ser validados via `npm run dev` puro**. O `vite.config.js` não tem proxy para `/api/*`, então o Vite serve o arquivo `.js` como texto-fonte estático em vez de executá-lo como Serverless Function — qualquer chamada a `/api/*` retorna 200 com o código-fonte no corpo, que quebra no `.json()` do lado do cliente com `"Unexpected token '/'... is not valid JSON"`. Isso é uma limitação pré-existente do ambiente de teste, não um bug de código, e reproduz identicamente independente de qualquer service ter sido movido. Confirmado na investigação do falso-positivo do scraper durante a validação da Fase 3A: nenhum dos 5 arquivos movidos participava da cadeia de chamada (`CatalogPage.jsx` → `scraperService.js` → `api/scraper.js`), e o mesmo erro reproduziria antes da Fase 3A no mesmo ambiente. **Para validar essas páginas de verdade, use `vercel dev` local ou um deploy de preview da Vercel — não o `npm run dev` puro.**

### 3A — Smoke test geral
- [ ] `npm run build` sem erros
- [ ] `npm run dev` sobe sem erro no console
- [ ] Confirmar que `importBackupService.js` e `photoMatchingService.js` resolvem `../catalog` corretamente (import interno atualizado)
- [ ] Abrir `PhotoRecognitionPage`, `ExtractorPage`, `ImageExtractorPage`, `ImportCatalogPage` uma vez cada (domínios adjacentes aos órfãos) — confirmar que carregam normalmente
- [ ] `grep` por caminho antigo (`services/awsRekognitionService`, `services/importBackupService`, `services/photoMatchingService`, `services/photoRecognitionService`, `services/searchKnowledge`) em `src/` e `api/` — confirmar zero resultados

### 3B — Validação por domínio (a cada subgrupo movido)
- [ ] `npm run build` sem erros
- [ ] Abrir a(s) página(s) listada(s) na tabela da seção 2 para aquele domínio
- [ ] Conferir console do navegador sem erro novo
- [ ] Para domínio **Auditoria**: rodar uma auditoria em `IntelligenceOpsPage` e conferir que os achados aparecem
- [ ] Para domínio **Catálogo**: abrir `DraftCatalogPage`, clicar "Atualizar", confirmar que lista fotos do Drive
- [ ] Para domínio **IA**: no `DealOncaPage`, trocar para um modelo DeepSeek e rodar uma análise simples

### 3C — Regressão completa (checklist único, ao final de cada service movido)
- [ ] `npm run build` sem erros
- [ ] Abrir Inbox — confirmar que carrega conversas reais (não "0 conversas", sintoma conhecido de config quebrada — `CLAUDE.md` regra 7)
- [ ] Abrir uma conversa, enviar mensagem de teste, confirmar resposta
- [ ] Abrir `DealOncaPage` — confirmar que funil, scores e auditorias carregam
- [ ] Abrir `CatalogPage` — CRUD básico (buscar produto, ver detalhe)
- [ ] Abrir `FollowUpPage` e `ContactsPage` — confirmar listagem
- [ ] Conferir que `api/webhook` e `api/auto-photo` continuam funcionando (não foram tocados, mas validam que a Gabriela real não quebrou — teste enviando "manda foto" num chat de teste, se houver ambiente de teste disponível)
- [ ] Console do navegador sem erro novo em nenhuma das páginas acima

---

## 4. Checkpoints de commit

Conforme `PRE-FASE3-CHECKLIST.md §1.3`: cada subfase (3A/3B/3C) tem seu próprio commit de checkpoint ao ser concluída e validada.

| Fase | Commit sugerido (mensagem) | Rollback aponta para |
|---|---|---|
| Pré-Fase-3 | (já existe) `6258744` | — |
| 3A | `refactor: move services órfãos (fase 3A) — awsRekognitionService, importBackupService, photoMatchingService, photoRecognitionService, searchKnowledge` | `6258744` |
| 3B | `refactor: reorganiza services por domínio (fase 3B) — N arquivos` (um commit por subgrupo de domínio, ou um único commit se toda 3B for validada de uma vez) | checkpoint de 3A |
| 3C | `refactor: move services de alto fan-in (fase 3C) — gptmaker, catalog, groq, customerProfileService, photoHistory, knowledgeDB, followUpService, opsHealthService` | checkpoint de 3B |

---

## 5. Fora de escopo (reafirmado)

Conforme `PRE-FASE3-CHECKLIST.md §1.3`: esta execução não toca em `api/*.js`, não unifica regras duplicadas entre `api/` e `src/services/`, e não mexe em credenciais AWS/segurança — mesmo movendo `awsRekognitionService.js` em 3A, a lógica interna e as credenciais que ele referencia não são alteradas.

---

**Gerado em:** 2026-07-09 · Planejamento da Fase 3, com base em `ARCHITECTURE.md §4` + contagem de fan-in real. Nenhum arquivo de `src/`, `api/` foi movido ou alterado para gerar este documento.
