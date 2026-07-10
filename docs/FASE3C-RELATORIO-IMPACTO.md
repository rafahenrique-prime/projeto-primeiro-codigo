# docs/FASE3C-RELATORIO-IMPACTO.md — Relatório de Impacto da Fase 3C

> **Auditoria:** 2026-07-10 · branch `main` · checkpoint pré-3C: `2b7caf2`
> **Fonte:** grep direto sobre o estado atual do código (fan-in por arquivo consumidor distinto, cobrindo todos os padrões de import). Cruzado com `docs/POS-FASE3B-AUDITORIA.md` e o agrupamento lógico original do `ARCHITECTURE.md` (pré-reorganização física).
> **Escopo:** apenas análise. Nenhum código foi alterado para gerar este documento.

---

## Achado principal (orienta todo o resto do relatório)

O agrupamento lógico original do `ARCHITECTURE.md §7` (escrito em 2026-07-08, antes de qualquer movimentação física) já continha os 8 arquivos-alvo desta fase, cada um dentro de um domínio que **hoje já existe e já tem todos os outros membros movidos**. Ou seja: a pasta-destino de cada um dos 8 não é uma decisão nova — é a conclusão de um agrupamento já feito:

| Service | Domínio original (ARCHITECTURE.md, 2026-07-08) | Domínio já existe? | Membros já lá |
|---|---|---|---|
| `photoHistory` | "Foto" (original) → **corrigido para `chat/`** por auditoria dedicada (2026-07-10, aprovado) | ✅ `chat/` existe | `messageHistoryService`, `interactionsService` |
| `customerProfileService` | "Cliente/CRM" | ✅ `crm/` existe | `contactAnalysisService`, `cobrancasService`, `stageHistory` |
| `followUpService` | "Cliente/CRM" | ✅ `crm/` existe | idem |
| `knowledgeDB` | "Conhecimento" | ✅ `conhecimento/` existe | `searchKnowledge`, `knowledgeGenerator`, `knowledgeParser`, `knowledgeExtractor`, `knowledgeTimestamps` |
| `catalog` | "Catálogo" | ✅ `catalogo/` existe | `catalogSyncService`, `googleDriveCatalog`, `scraperService`, `scrapingService`, `importBackupService` |
| `groq` | "IA" | ✅ `ia/` existe | `deepseek`, `deepseekBalanceService` |
| `gptmaker` | "Chat" | ✅ `chat/` existe | `messageHistoryService`, `interactionsService` |
| `opsHealthService` | "Plataforma/Util" | ✅ `plataforma/` existe | `supabaseStorage`, `systemHealthService`, `diagnosticService`, `avatarCacheService`, `tokenLoggingService`, `gptmakerCreditsService`, `weeklyInsightService` |

**Nenhum bloqueador de nomenclatura** — diferente do que aconteceu com `photoHistory` (que exigiu auditoria dedicada), os outros 7 têm destino não ambíguo.

---

## 1 e 2. Fan-in atualizado e consumidores de cada serviço

### `gptmaker.js` — fan-in total: **18**

| Tipo | Qtd | Consumidores |
|---|---|---|
| Externo (pages/components) | 12 | `App.jsx`, `ChatArea.jsx`, `RightPanel.jsx`, `AgentLabPage.jsx`, `AgentsPage.jsx`, `ChannelsPage.jsx`, `ContactsNewPage.jsx`, `ContactsPage.jsx`, `DealOncaPage.jsx`, `FollowUpPage.jsx`, `KnowledgePage.jsx`, `RelatoriosPage.jsx` |
| Interno (services) | 6 | `auditoria/instagramAuditService.js`, `auditoria/whatsappAuditService.js`, `catalog.js`, `followUpService.js`, `opsHealthService.js`, `plataforma/systemHealthService.js` |

### `catalog.js` — fan-in total: **11**

| Tipo | Qtd | Consumidores |
|---|---|---|
| Externo | 8 | `App.jsx`, `main.jsx`, `ChatArea.jsx`, `RightPanel.jsx`, `DealOncaPage.jsx`, `ExtractorPage.jsx`, `ImageExtractorPage.jsx`, `SimuladorClientePage.jsx` |
| Interno | 3 | `catalogo/importBackupService.js`, `conhecimento/knowledgeExtractor.js`, `foto/photoMatchingService.js` |

### `groq.js` — fan-in total: **7**

| Tipo | Qtd | Consumidores |
|---|---|---|
| Externo | 6 | `ChatArea.jsx`, `RightPanel.jsx`, `AgentLabPage.jsx`, `DealOncaPage.jsx`, `KnowledgePage.jsx`, `SimuladorClientePage.jsx` |
| Interno | 1 | `followUpService.js` |

### `knowledgeDB.js` — fan-in total: **6**

| Tipo | Qtd | Consumidores |
|---|---|---|
| Externo | 4 | `ChatArea.jsx`, `ContactsNewPage.jsx`, `DealOncaPage.jsx`, `KnowledgePage.jsx` |
| Interno | 2 | `auditoria/knowledgeAuditService.js`, `opsHealthService.js` |

### `customerProfileService.js` — fan-in total: **6**

| Tipo | Qtd | Consumidores |
|---|---|---|
| Externo | 5 | `App.jsx`, `ChatArea.jsx`, `ContactsNewPage.jsx`, `ContactsPage.jsx`, `DealOncaPage.jsx` |
| Interno | 1 | `groq.js` |

### `photoHistory.js` — fan-in total: **4**

| Tipo | Qtd | Consumidores |
|---|---|---|
| Externo | 4 | `ChatArea.jsx`, `RightPanel.jsx`, `PhotoHistoryPanel.jsx`, `SimuladorClientePage.jsx` |
| Interno | 0 | — |

### `followUpService.js` — fan-in total: **3**

| Tipo | Qtd | Consumidores |
|---|---|---|
| Externo | 3 | `App.jsx`, `DealOncaPage.jsx`, `FollowUpPage.jsx` |
| Interno | 0 | — |

### `opsHealthService.js` — fan-in externo: **1** (mas é hub — ver seção 3)

| Tipo | Qtd | Consumidores |
|---|---|---|
| Externo | 1 | `IntelligenceOpsPage.jsx` |
| Interno | 0 | — (ninguém importa `opsHealthService`, mas ele importa 10) |

---

## 3. Dependências entre os próprios 8 serviços da Fase 3C

```
catalog            → gptmaker
groq               → customerProfileService   (+ crm/stageHistory, ia/deepseek — já movidos)
followUpService    → gptmaker, groq
opsHealthService   → knowledgeDB, gptmaker     (+ 7 de auditoria/ + plataforma/systemHealthService — já movidos)
```

**Serviços "folha" dentro do grupo** (não dependem de nenhum outro dos 8): `gptmaker`, `knowledgeDB`, `customerProfileService`, `photoHistory`.

**Encadeamento mais profundo:** `followUpService → groq → customerProfileService` (3 níveis) e `opsHealthService → gptmaker`/`knowledgeDB` (2 níveis, mas hub de 10 no total contando os já movidos).

O grafo continua **DAG** — nenhuma dependência circular entre os 8.

---

## 4. Ordem recomendada de execução (baseada em acoplamento real)

| Ordem | Service | Fan-in | Justificativa |
|---|---|---|---|
| 1 | `followUpService` | 3 | Menor fan-in do grupo, zero dependência interna a resolver além de `gptmaker`/`groq` (que ficam no lugar até suas próprias vezes) |
| 2 | `photoHistory` | 4 | Já decidido (`chat/`), zero dependência interna, consumidores já mapeados |
| 3 | `customerProfileService` | 6 | Consumida só internamente por `groq.js` — baixo risco de quebrar algo fora do grupo |
| 4 | `knowledgeDB` | 6 | Consumida por `auditoria/` (já estável) — testável com a infra existente |
| 5 | `groq` | 7 | Depende de `customerProfileService` (mover depois dela evita 2 edições na mesma dependência) |
| 6 | `catalog` | 11 | Alto fan-in — precisa de regressão ampla (Catálogo, Extractor, Chat) |
| 7 | `gptmaker` | 18 | **Maior fan-in do sistema inteiro** — mover só depois de tudo mais validado, máxima cautela |
| 8 | `opsHealthService` | hub | **Último, sem exceção** — depende de `gptmaker` e `knowledgeDB` já estáveis, e é o agregador de tudo que já foi movido nas Fases 3A/3B/3C |

Esta ordem é a mesma lógica já usada com sucesso em 3A→3B (menor risco primeiro) — nenhuma mudança de critério.

---

## 5. Pasta de destino proposta

| Service | Pasta destino |
|---|---|
| `followUpService.js` | `src/services/crm/followUpService.js` |
| `photoHistory.js` | `src/services/chat/photoHistory.js` |
| `customerProfileService.js` | `src/services/crm/customerProfileService.js` |
| `knowledgeDB.js` | `src/services/conhecimento/knowledgeDB.js` |
| `groq.js` | `src/services/ia/groq.js` |
| `catalog.js` | `src/services/catalogo/catalog.js` |
| `gptmaker.js` | `src/services/chat/gptmaker.js` |
| `opsHealthService.js` | `src/services/plataforma/opsHealthService.js` |

Ao final da Fase 3C, `src/services/` terá **zero arquivos soltos na raiz** (exceto `__tests__/`) — os 49 arquivos completamente organizados em 8 domínios.

---

## 6. Páginas, componentes e serviços que precisarão de import atualizado

**Consolidado (união de todos os consumidores únicos dos 8 serviços):**

**16 páginas:** `App.jsx`, `main.jsx`, `DealOncaPage.jsx`, `FollowUpPage.jsx`, `ExtractorPage.jsx`, `ImageExtractorPage.jsx`, `SimuladorClientePage.jsx`, `AgentLabPage.jsx`, `AgentsPage.jsx`, `ChannelsPage.jsx`, `ContactsNewPage.jsx`, `ContactsPage.jsx`, `KnowledgePage.jsx`, `RelatoriosPage.jsx`, `IntelligenceOpsPage.jsx`

**3 componentes:** `ChatArea.jsx`, `RightPanel.jsx`, `PhotoHistoryPanel.jsx`

**7 services (imports internos entre os próprios 8 + cruzando pra domínios já movidos):** `catalog.js`↔`gptmaker.js`, `groq.js`↔`customerProfileService.js`, `followUpService.js`↔`gptmaker.js`+`groq.js`, `opsHealthService.js`↔`knowledgeDB.js`+`gptmaker.js`, mais os 3 já em domínios movidos que apontam pra `catalog` (`catalogo/importBackupService.js`, `conhecimento/knowledgeExtractor.js`, `foto/photoMatchingService.js`) e os 3 que apontam pra `gptmaker`/`knowledgeDB` de dentro de `auditoria/` (`instagramAuditService.js`, `whatsappAuditService.js`, `knowledgeAuditService.js`) e 1 de `plataforma/systemHealthService.js`.

**`DealOncaPage.jsx` volta a ser o arquivo mais tocado** — consome 5 dos 8 serviços desta fase (`groq`, `gptmaker`, `followUpService`, `catalog`, `knowledgeDB`, `customerProfileService` — na verdade 6 dos 8). Mesma atenção redobrada já aplicada na Fase 3B.

---

## 7. Estratégia de validação específica por serviço

| Service | Validação |
|---|---|
| `followUpService` | Abrir `FollowUpPage`, conferir resumo/agenda carrega; `DealOncaPage` não quebra |
| `photoHistory` | Abrir `PhotoHistoryPanel` (aba "Histórico de Fotos" dentro de `KnowledgePage`), enviar 1 foto de teste no Chat e conferir que aparece no histórico |
| `customerProfileService` | Abrir `ContactsPage`/`ContactsNewPage`, conferir scores carregam; `DealOncaPage` funil não quebra |
| `knowledgeDB` | Abrir `KnowledgePage` (Base Local), rodar a auditoria de Conhecimento em `IntelligenceOpsPage` de novo (já validado 2x, reconfirma) |
| `groq` | Abrir `DealOncaPage`/CODEX, enviar uma pergunta real, conferir resposta; testar seletor de modelo (Llama/DeepSeek) |
| `catalog` | Abrir `CatalogPage`, `ExtractorPage`, `ImageExtractorPage` — 544 produtos carregando; testar Chat com pedido de produto |
| `gptmaker` | **Regressão mais ampla da fase** — abrir Inbox (conversas reais carregando, não "0 conversas"), enviar mensagem no Chat, abrir Agentes, Canais, Contatos, Relatórios |
| `opsHealthService` | Abrir `IntelligenceOpsPage`, conferir "Saúde Geral" calcula (agregação de tudo), rodar 1 auditoria real de novo como fechamento simbólico da reorganização inteira |

Todas seguem o padrão já validado nos 8 lotes da 3B: `npm run build` → grep de caminho antigo → teste manual no navegador → registro no relatório → commit por serviço.

---

## 8. Riscos de regressão por serviço

| Service | Risco | Severidade | Mitigação |
|---|---|---|---|
| `followUpService` | Baixo — poucos consumidores, sem dependência interna complexa | 🟢 Baixo | — |
| `photoHistory` | Baixo — já auditado a fundo, domínio decidido | 🟢 Baixo | — |
| `customerProfileService` | `groq.js` depende dele — se mover fora de ordem, import de `groq.js` fica desatualizado até sua vez | 🟡 Médio | Mover antes de `groq`, conforme ordem recomendada |
| `knowledgeDB` | Consumido por `auditoria/knowledgeAuditService.js` e `opsHealthService.js` — testável com a auditoria real já validada | 🟢 Baixo | Rodar a auditoria de Conhecimento de novo após mover |
| `groq` | `followUpService.js` depende dele; ele mesmo depende de `customerProfileService`, `crm/stageHistory`, `ia/deepseek` — 3 imports internos a ajustar | 🟡 Médio | Mover só depois de `customerProfileService` estar estável |
| `catalog` | Alto fan-in (11) espalhado por Chat, Catálogo, Extractor — maior superfície de teste do grupo antes de `gptmaker` | 🟡 Médio-Alto | Regressão ampla: Catálogo + Chat + Extractor no mesmo lote |
| `gptmaker` | **Maior fan-in do sistema inteiro** (18) — toca praticamente todas as páginas de atendimento/CRM | 🔴 Alto | Mover por último entre os 7 primeiros; testar Inbox/Chat/Agentes/Canais/Contatos/Relatórios completos no mesmo lote |
| `opsHealthService` | Depende de `gptmaker` e `knowledgeDB` já estáveis + 7 de `auditoria/` já movidos — qualquer erro nos 7 imports quebra `IntelligenceOpsPage` inteira | 🔴 Alto | Mover absolutamente por último; reconferir os 10 imports (não só os 2 novos) no mesmo commit |

**Risco transversal (já documentado, não específico de nenhum serviço):** `npm run dev` local não valida páginas dependentes de `api/*.js` — nenhum dos 8 depende de `api/`, então não se aplica aqui (confirmado por grep nesta auditoria).

---

## 9. Critérios objetivos de conclusão da Fase 3C

```
[ ] Todos os 8 arquivos existem nos novos caminhos (crm/, chat/, conhecimento/, ia/, catalogo/, plataforma/)
[ ] src/services/ não tem mais nenhum arquivo solto na raiz (exceto __tests__/)
[ ] Todos os 8 caminhos antigos (src/services/<nome>.js) não existem mais
[ ] grep por caminho antigo em src/, api/, scripts/ retorna zero resultados
[ ] catalog.js, groq.js, followUpService.js, opsHealthService.js com imports internos corrigidos (uns para os outros e para domínios já movidos)
[ ] npm run build sem erros
[ ] npm run dev sobe sem erro novo no console
[ ] Todas as 16 páginas + 3 componentes consumidores abrem sem erro
[ ] DealOncaPage testada de ponta a ponta (consome 6 dos 8 serviços)
[ ] Inbox/ChatArea testado enviando mensagem real (valida gptmaker no local final)
[ ] IntelligenceOpsPage roda uma auditoria real com sucesso (valida opsHealthService no local final)
[ ] Cada serviço tem seu próprio commit (8 commits de código, rollback granular)
[ ] Commit final de fechamento aponta para o checkpoint correto (2b7caf2)
[ ] ARCHITECTURE.md atualizado refletindo 100% de src/services/ organizado por domínio
```

---

## Confirmação de bloqueadores

**Nenhum bloqueador técnico identificado.**

- `git status` limpo, `npm run build` passa antes de começar.
- Isolamento `api/`↔`src/services/` confirmado intacto (zero import real entre eles, só coincidências de texto).
- Grafo de dependências entre os 8 continua acíclico.
- Todas as 8 pastas-destino já existem e já têm outros membros — nenhuma decisão de nomenclatura em aberto (a única, `photoHistory`, já foi resolvida na auditoria anterior).
- Nenhum dos 8 depende de `syncCatalog.test.js` nem de qualquer outro risco já registrado nas fases anteriores.

**Único ponto de atenção não-bloqueante:** `gptmaker.js` e `opsHealthService.js` são os de maior risco (fan-in 18 e hub de 10, respectivamente) — recomendo tratá-los com o mesmo cuidado extra já usado nos lotes de maior acoplamento da Fase 3B (Auditoria e Plataforma), incluindo teste manual mais extenso antes de cada commit.

---

**Gerado em:** 2026-07-10 · Relatório de impacto da Fase 3C. Nenhum código foi alterado.
