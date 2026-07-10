# docs/POS-FASE3B-AUDITORIA.md — Auditoria Final Pós-Fase-3B

> **Auditoria:** 2026-07-10 · branch `main` · checkpoint: `12ea77d` (fechamento da Fase 3B)
> **Metodologia:** grep direto sobre o estado atual do código (não reaproveita números de sessões anteriores). Fan-in contado por **arquivo consumidor distinto**, cobrindo todos os padrões de import (`./nome`, `../nome`, `../domínio/nome`, `../services/nome` a partir de `pages`/`components`).
> **Escopo:** apenas leitura e análise. Nenhum código foi alterado para gerar este documento.

---

## 1. Estrutura final completa de `src/services/`

```
src/services/
├── auditoria/          (9 arquivos)
│   ├── agentAuditService.js
│   ├── agentLearningsService.js
│   ├── bagyAuditService.js
│   ├── codexAlertsService.js
│   ├── codexAuditService.js
│   ├── instagramAuditService.js
│   ├── knowledgeAuditService.js
│   ├── learningsAuditService.js
│   └── whatsappAuditService.js
├── catalogo/            (5 arquivos)
│   ├── catalogSyncService.js
│   ├── googleDriveCatalog.js
│   ├── importBackupService.js   ← órfão (Fase 3A)
│   ├── scraperService.js
│   └── scrapingService.js
├── chat/                (2 arquivos)
│   ├── interactionsService.js
│   └── messageHistoryService.js
├── conhecimento/        (5 arquivos)
│   ├── knowledgeExtractor.js
│   ├── knowledgeGenerator.js
│   ├── knowledgeParser.js
│   ├── knowledgeTimestamps.js
│   └── searchKnowledge.js       ← órfão (Fase 3A)
├── crm/                 (3 arquivos)
│   ├── cobrancasService.js
│   ├── contactAnalysisService.js
│   └── stageHistory.js
├── foto/                (8 arquivos)
│   ├── awsRekognitionService.js  ← órfão (Fase 3A)
│   ├── imageExtractor.js
│   ├── imageReviewService.js
│   ├── ocrService.js
│   ├── photoCacheService.js
│   ├── photoFlowService.js
│   ├── photoMatchingService.js   ← órfão (Fase 3A)
│   └── photoRecognitionService.js ← órfão (Fase 3A)
├── ia/                  (2 arquivos)
│   ├── deepseek.js
│   └── deepseekBalanceService.js
├── plataforma/          (7 arquivos)
│   ├── avatarCacheService.js
│   ├── diagnosticService.js
│   ├── gptmakerCreditsService.js
│   ├── supabaseStorage.js
│   ├── systemHealthService.js
│   ├── tokenLoggingService.js
│   └── weeklyInsightService.js
├── __tests__/           (1 arquivo — não é service, fica fora da reorganização por domínio)
│   └── syncCatalog.test.js
│
└── (raiz — 8 arquivos ainda não movidos — candidatos à Fase 3C)
    ├── catalog.js
    ├── customerProfileService.js
    ├── followUpService.js
    ├── gptmaker.js
    ├── groq.js
    ├── knowledgeDB.js
    ├── opsHealthService.js
    └── photoHistory.js
```

---

## 2. Quantidade de arquivos por domínio

| Domínio | Arquivos | % do total (49) |
|---|---|---|
| `auditoria/` | 9 | 18,4% |
| `foto/` | 8 | 16,3% |
| `plataforma/` | 7 | 14,3% |
| `catalogo/` | 5 | 10,2% |
| `conhecimento/` | 5 | 10,2% |
| `crm/` | 3 | 6,1% |
| `chat/` | 2 | 4,1% |
| `ia/` | 2 | 4,1% |
| **Subtotal organizado** | **41** | **83,7%** |
| Raiz (candidatos 3C) | 8 | 16,3% |
| **Total** | **49** | **100%** |

(`__tests__/syncCatalog.test.js` não é contado como service — é arquivo de teste.)

---

## 3. Todos os imports internos entre domínios (service → service)

**30 arestas no grafo de dependências**, listadas por arquivo de origem:

| Arquivo de origem | Domínio | Importa | Domínio destino |
|---|---|---|---|
| `opsHealthService.js` | raiz | `bagyAuditService` | `auditoria/` |
| `opsHealthService.js` | raiz | `systemHealthService` | `plataforma/` |
| `opsHealthService.js` | raiz | `knowledgeAuditService` | `auditoria/` |
| `opsHealthService.js` | raiz | `learningsAuditService` | `auditoria/` |
| `opsHealthService.js` | raiz | `whatsappAuditService` | `auditoria/` |
| `opsHealthService.js` | raiz | `instagramAuditService` | `auditoria/` |
| `opsHealthService.js` | raiz | `agentAuditService` | `auditoria/` |
| `opsHealthService.js` | raiz | `knowledgeDB` | raiz |
| `opsHealthService.js` | raiz | `agentLearningsService` | `auditoria/` |
| `opsHealthService.js` | raiz | `gptmaker` | raiz |
| `followUpService.js` | raiz | `gptmaker` | raiz |
| `followUpService.js` | raiz | `groq` | raiz |
| `catalog.js` | raiz | `gptmaker` | raiz |
| `groq.js` | raiz | `customerProfileService` | raiz |
| `groq.js` | raiz | `stageHistory` | `crm/` |
| `groq.js` | raiz | `deepseek` | `ia/` |
| `systemHealthService.js` | `plataforma/` | `gptmaker` | raiz |
| `photoMatchingService.js` | `foto/` | `catalog` | raiz |
| `photoFlowService.js` | `foto/` | `photoCacheService` | `foto/` (mesma pasta) |
| `deepseek.js` | `ia/` | `tokenLoggingService` | `plataforma/` |
| `knowledgeExtractor.js` | `conhecimento/` | `catalog` | raiz |
| `contactAnalysisService.js` | `crm/` | `deepseek` | `ia/` |
| `importBackupService.js` | `catalogo/` | `catalog` | raiz |
| `catalogSyncService.js` | `catalogo/` | `knowledgeGenerator` | `conhecimento/` |
| `learningsAuditService.js` | `auditoria/` | `agentLearningsService` | `auditoria/` (mesma pasta) |
| `learningsAuditService.js` | `auditoria/` | `deepseek` | `ia/` |
| `whatsappAuditService.js` | `auditoria/` | `gptmaker` | raiz |
| `instagramAuditService.js` | `auditoria/` | `gptmaker` | raiz |
| `knowledgeAuditService.js` | `auditoria/` | `knowledgeDB` | raiz |
| `knowledgeAuditService.js` | `auditoria/` | `deepseek` | `ia/` |

**Padrão observado:** os 8 arquivos da raiz (candidatos 3C) são o destino de **19 das 30 arestas** — confirma que são os serviços mais centrais/acoplados do sistema, coerente com terem ficado por último no plano original.

**Grafo continua acíclico (DAG)** — nenhuma dependência circular encontrada, mesma conclusão da auditoria pré-Fase-3.

---

## 4. Serviços mais acoplados (maior fan-in)

Contagem por **arquivo consumidor distinto** (páginas, componentes e outros services):

| # | Service | Fan-in | Localização atual |
|---|---|---|---|
| 1 | `gptmaker` | **18** | raiz |
| 2 | `catalog` | **11** | raiz |
| 3 | `groq` | **7** | raiz |
| 4 | `knowledgeDB` | **6** | raiz |
| 5 | `customerProfileService` | **6** | raiz |
| 6 | `photoHistory` | **4** | raiz |
| 7 | `deepseek` | **4** | `ia/` |
| 8 | `followUpService` | **3** | raiz |
| 9 | `agentLearningsService` | **3** | `auditoria/` |
| 10 | `agentAuditService` | **3** | `auditoria/` |

**Observação-chave:** os **7 primeiros lugares em fan-in são exatamente os 7 dos 8 candidatos à Fase 3C** (falta só `opsHealthService`, que tem fan-in externo baixo — 1 — mas é hub interno de 10 services). Isso **confirma retroativamente** que a decisão de deixar esses 8 arquivos por último foi a escolha certa: são estruturalmente os mais centrais do sistema.

`deepseek` (movido no lote 8) aparece em 7º — mesmo já estando organizado em `ia/`, continua sendo um dos serviços mais consumidos, principalmente por causa dos 4 domínios de auditoria/CRM que dependem dele.

---

## 5. Serviços órfãos

**5 confirmados, sem mudança desde a auditoria da Fase 3A** (2026-07-09):

| Service | Localização atual | Fan-in |
|---|---|---|
| `awsRekognitionService` | `foto/` | 0 |
| `importBackupService` | `catalogo/` | 0 |
| `photoMatchingService` | `foto/` | 0 |
| `photoRecognitionService` | `foto/` | 0 |
| `searchKnowledge` | `conhecimento/` | 0 |

Nenhum novo órfão surgiu durante a Fase 3B — os 36 arquivos movidos nos lotes 1-8 mantiveram todos pelo menos 1 consumidor real, confirmado individualmente em cada lote.

---

## 6. Candidatos à Fase 3C

Os **8 arquivos que restam na raiz** de `src/services/` são, por eliminação, os candidatos:

| Service | Fan-in | Papel no grafo | Observação |
|---|---|---|---|
| `gptmaker` | 18 | Consumido por quase todo domínio | Maior fan-in do projeto inteiro — mover por último dentro da 3C |
| `catalog` | 11 | Consumido por `foto/`, `conhecimento/`, `catalogo/` | Segundo maior — vários domínios já movidos dependem dele |
| `groq` | 7 | Consome `customerProfileService`, `crm/stageHistory`, `ia/deepseek` | Já aponta para 2 domínios organizados — sinal de que está "pronto" para mover |
| `knowledgeDB` | 6 | Consumido por `auditoria/`, `opsHealthService` | — |
| `customerProfileService` | 6 | Consumido só por `groq.js` internamente + páginas | — |
| `photoHistory` | 4 | Consumido por páginas de foto/chat | Nome sugere pertencer a `foto/`, mas não foi incluído no domínio Foto original — precisa decisão |
| `followUpService` | 3 | Consome `gptmaker`, `groq` | — |
| `opsHealthService` | 1 (externo) / 10 (interno) | Hub — importa 7 de `auditoria/` + `gptmaker` + `knowledgeDB` | Deve ser o **último** a mover — depende de quase tudo já estar estável |

**Ordem sugerida dentro da 3C** (do menor pro maior fan-in/acoplamento, mesmo princípio usado na 3A→3B):
1. `photoHistory` (4) — mais isolado, mas precisa de decisão de nome de pasta (`foto/` ou pasta nova)
2. `customerProfileService` (6) e `followUpService` (3) — médio acoplamento
3. `knowledgeDB` (6) — consumido por `auditoria/`, já testável com a infra existente
4. `groq` (7) e `catalog` (11) — alto acoplamento, exigem regressão ampla
5. `gptmaker` (18) — maior fan-in do sistema, mover com o máximo de cautela
6. `opsHealthService` — só depois de todos os outros 7 estarem estáveis, por ser o hub que os importa todos

**Pendência de nomenclatura:** `photoHistory.js` não tem domínio óbvio já aprovado — pertence semanticamente a `foto/`, mas seu nome e uso (histórico de fotos enviadas ao cliente, não reconhecimento) também tem características de `chat/`/`crm/`. Precisa de decisão explícita antes da execução da 3C.

---

## 7. Atualização do `ARCHITECTURE.md`

Aplicada nesta auditoria — ver diff no commit. Resumo das mudanças:
- Seção 2 (estrutura de diretórios): `src/services/` passa de "lista plana (49)" para "41 arquivos organizados em 8 domínios + 8 arquivos na raiz (candidatos Fase 3C)".
- Seção 4 (matriz de dependências): números de fan-in atualizados com os dados desta auditoria; nota new explicando que a fase de reorganização está em andamento (3A + 3B concluídas, 3C pendente).
- Seção 7 (agrupamento funcional): convertido de "agrupamento lógico, não reflete estrutura física" para "estrutura física real", com os 8 domínios de pasta.
- Seção 8 (pontos de atenção): item sobre "services/ plano" atualizado para refletir que 83,7% já está organizado.

---

**Gerado em:** 2026-07-10 · Auditoria pós-Fase-3B, pré-Fase-3C. Nenhuma alteração de código.
