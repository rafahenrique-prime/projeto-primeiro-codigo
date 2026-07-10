# docs/FASE3B-RELATORIO-IMPACTO.md — Relatório de Impacto da Fase 3B

> **Auditoria:** 2026-07-10 · branch `main` · checkpoint pré-3B: `ae468b3`
> **Fonte:** reauditoria completa de `src/services/` (não reaproveita números do `FASE3-PLANO-EXECUCAO.md` de 2026-07-09 — metodologia corrigida, ver nota abaixo)
> **Objetivo:** mapear todo o impacto da Fase 3B antes de mover qualquer arquivo. Documento de análise — nenhuma mudança de código foi feita para gerá-lo.

---

## Nota metodológica — correção em relação ao plano original

A contagem de fan-in do `FASE3-PLANO-EXECUCAO.md` só contava imports vindos de `pages/`/`components/` (`../services/X`) — não contava um service importando outro dentro de `src/services/` (`./X`). Isso subestimava o fan-in real de vários arquivos, principalmente os consumidos só pelo hub `opsHealthService`. Os números deste documento são os corrigidos, com metodologia de dupla verificação (grep por padrão + contagem por arquivo único).

**Fan-in real (36 arquivos, corrigido):**
- **4**: `deepseek`
- **3**: `agentAuditService`, `agentLearningsService`
- **2**: `bagyAuditService`, `instagramAuditService`, `interactionsService`, `knowledgeAuditService`, `knowledgeGenerator`, `knowledgeParser`, `learningsAuditService`, `ocrService`, `photoCacheService`, `scrapingService`, `stageHistory`, `systemHealthService`, `tokenLoggingService`, `whatsappAuditService`
- **1**: `avatarCacheService`, `catalogSyncService`, `cobrancasService`, `codexAlertsService`, `codexAuditService`, `contactAnalysisService`, `deepseekBalanceService`, `diagnosticService`, `googleDriveCatalog`, `gptmakerCreditsService`, `imageExtractor`, `imageReviewService`, `knowledgeExtractor`, `knowledgeTimestamps`, `messageHistoryService`, `photoFlowService`, `scraperService`, `supabaseStorage`, `weeklyInsightService`

Confirmado: **zero órfãos ocultos** nos 36 — todos têm pelo menos 1 consumidor real.

---

## 1. Arquivos que serão alterados pela Fase 3B

| Domínio (pasta destino, aprovada) | Arquivos movidos | Consumidores a atualizar |
|---|---|---|
| `chat/` | `messageHistoryService`, `interactionsService` | `ChatArea.jsx`, `DealOncaPage.jsx`, `RelatoriosPage.jsx` |
| `catalogo/` | `catalogSyncService`, `googleDriveCatalog`, `scraperService`, `scrapingService` | `CatalogPage.jsx`, `DraftCatalogPage.jsx`, `ImportCatalogPage.jsx`, `ExtractorPage.jsx`, **`src/services/__tests__/syncCatalog.test.js`** ⚠️ |
| `crm/` | `contactAnalysisService`, `cobrancasService`, `stageHistory` | `ContactsNewPage.jsx`, `CobrancasPage.jsx`, `DealOncaPage.jsx`, `groq.js` |
| `conhecimento/` | `knowledgeGenerator`, `knowledgeParser`, `knowledgeExtractor`, `knowledgeTimestamps` | `KnowledgePage.jsx`, `ChatArea.jsx`, `catalogSyncService.js` |
| `foto/` | `photoFlowService`, `photoCacheService`, `ocrService`, `imageExtractor`, `imageReviewService` | `PhotoRecognitionPage.jsx`, `DealOncaPage.jsx`, `KnowledgePage.jsx`, `ImageExtractorPage.jsx` |
| `auditoria/` | `agentAuditService`, `codexAuditService`, `codexAlertsService`, `agentLearningsService`, `learningsAuditService`, `knowledgeAuditService`, `whatsappAuditService`, `instagramAuditService`, `bagyAuditService` | `DealOncaPage.jsx`, `GabrielaAuditTab.jsx`, `CodexAuditTab.jsx`, `KnowledgePage.jsx`, `LearningsAuditTab.jsx`, `KnowledgeAuditTab.jsx`, `WhatsappAuditTab.jsx`, `InstagramAuditTab.jsx`, `BagyAuditPage.jsx`, **`opsHealthService.js`** (importa 8 destes 9) |
| `ia/` | `deepseek`, `deepseekBalanceService` | `DeepSeekBalanceCard.jsx`, e **4 services internos**: `learningsAuditService.js`, `contactAnalysisService.js`, `knowledgeAuditService.js`, `groq.js` |
| `plataforma/` | `supabaseStorage`, `systemHealthService`, `diagnosticService`, `avatarCacheService`, `tokenLoggingService`, `gptmakerCreditsService`, `weeklyInsightService` | `SupabaseStorageCard.jsx`, `SystemHealthTab.jsx`, `DealOncaPage.jsx`, `AgentsPage.jsx`, `TokenUsageCard.jsx`, `GPTMakerCreditsCard.jsx`, `deepseek.js` |

⚠️ **Achado novo:** `src/services/__tests__/syncCatalog.test.js` importa `catalogSyncService` via `../catalogSyncService`. Não constava no plano original — precisa ser atualizado junto com o domínio Catálogo.

---

## 2. Dependências externas impactadas

| Tipo | Serviço/integração | Arquivos que tocam |
|---|---|---|
| **Pacote npm** | `@base44/sdk` | `cobrancasService.js` (único caso entre os 36) |
| **Supabase** | REST API | 24 dos 36 arquivos |
| **GPT Maker** | `api.gptmaker.ai` | `systemHealthService.js`, `gptmakerCreditsService.js` |
| **Google Drive** | `googleapis.com` | `googleDriveCatalog.js` |
| **DeepSeek** | `api.deepseek.com` | `deepseek.js`, `deepseekBalanceService.js` |

Nenhuma integração é afetada funcionalmente — é só mudança de caminho de arquivo, lógica de chamada não muda.

---

## 3. Rotas, páginas e serviços afetados

**14 páginas**: `CatalogPage`, `DraftCatalogPage`, `ImportCatalogPage`, `ExtractorPage`, `ImageExtractorPage`, `PhotoRecognitionPage`, `KnowledgePage`, `ContactsNewPage`, `CobrancasPage`, `RelatoriosPage`, `AgentsPage`, `DealOncaPage`, `BagyAuditPage`, `SystemHealthTab`

**6 abas de auditoria**: `GabrielaAuditTab`, `CodexAuditTab`, `LearningsAuditTab`, `KnowledgeAuditTab`, `WhatsappAuditTab`, `InstagramAuditTab`

**6 componentes**: `ChatArea`, `GPTMakerCreditsCard`, `DeepSeekBalanceCard`, `SupabaseStorageCard`, `TokenUsageCard`

**Maior concentração de risco: `DealOncaPage.jsx`** — consome 8 dos 36 serviços da 3B diretamente.
**Segundo maior risco: `opsHealthService.js`** — importa 8 dos 9 serviços do domínio Auditoria de uma vez.

**1 arquivo de teste**: `src/services/__tests__/syncCatalog.test.js`

**`api/`**: zero impacto confirmado.

---

## 4. Riscos de regressão

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| 1 | `DealOncaPage.jsx` acumula imports de 5 dos 8 domínios — erro num path quebra a página inteira | 🔴 Alto | Mover em lotes por domínio, testar `DealOncaPage` após cada lote que a toque |
| 2 | `opsHealthService.js` importa 8 serviços de Auditoria — quebra `IntelligenceOpsPage` se dessincronizado | 🔴 Alto | Mover os 8 serviços de Auditoria e `opsHealthService.js` no mesmo commit |
| 3 | `deepseek.js` tem 4 consumidores internos — maior fan-in do lote | 🟡 Médio | Mover por último dentro do domínio `ia/` |
| 4 | Teste `__tests__/syncCatalog.test.js` quebra se `catalogSyncService` mover sem atualizar o teste | 🟡 Médio | Incluir no domínio Catálogo |
| 5 | `npm run dev` não valida páginas dependentes de `api/*.js` | 🟢 Baixo | Não se aplica à 3B — nenhum dos 36 depende de `api/` |
| 6 | 36 arquivos é o maior lote das 3 fases | 🟡 Médio | Executar em 8 sub-lotes por domínio, cada um com commit próprio |

---

## 5. Plano de execução (ordem aprovada)

1. Domínio **Conhecimento** (4 arquivos)
2. Domínio **Foto** (5 arquivos)
3. Domínio **Plataforma** (7 arquivos)
4. Domínio **Chat** (2 arquivos)
5. Domínio **CRM** (3 arquivos)
6. Domínio **Catálogo** (4 arquivos + teste)
7. Domínio **Auditoria** (9 arquivos + `opsHealthService.js`)
8. Domínio **IA** (2 arquivos, `deepseek` por último)

Cada domínio: mover → atualizar imports → `npm run build` → validar páginas impactadas → registrar resultado → commit próprio (rollback granular).

---

## 6. Critérios objetivos de conclusão

```
[ ] Todos os 36 arquivos existem nos novos caminhos (subpastas por domínio)
[ ] Todos os 36 caminhos antigos não existem mais
[ ] grep por caminho antigo em src/, api/, scripts/ retorna zero resultados
[ ] opsHealthService.js atualizado com os 8 imports de Auditoria corrigidos
[ ] src/services/__tests__/syncCatalog.test.js atualizado e npm test passa
[ ] npm run build sem erros
[ ] npm run dev sobe sem erro novo no console
[ ] Todas as 14 páginas + 6 tabs afetadas abrem sem erro
[ ] DealOncaPage testada de ponta a ponta
[ ] IntelligenceOpsPage roda uma auditoria real com sucesso
[ ] Cada domínio tem seu próprio commit
[ ] Commit final de fechamento aponta para o checkpoint correto
```

---

**Gerado em:** 2026-07-10 · Relatório de impacto pré-Fase-3B, sem alteração de código.
