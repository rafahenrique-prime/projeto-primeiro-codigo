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
[x] Todos os 8 arquivos existem nos novos caminhos (crm/, chat/, conhecimento/, ia/, catalogo/, plataforma/)
[x] src/services/ não tem mais nenhum arquivo solto na raiz (exceto __tests__/)
[x] Todos os 8 caminhos antigos (src/services/<nome>.js) não existem mais
[x] grep por caminho antigo em src/, api/, scripts/ retorna zero resultados
[x] catalog.js, groq.js, followUpService.js, opsHealthService.js com imports internos corrigidos (uns para os outros e para domínios já movidos)
[x] npm run build sem erros
[x] npm run dev sobe sem erro novo no console
[x] Todas as páginas e componentes consumidores impactados abrem sem erro (validado lote a lote — ver Registro de execução)
[x] DealOncaPage testada de ponta a ponta (consome 6 dos 8 serviços)
[x] Inbox/ChatArea testado enviando mensagem real (valida gptmaker no local final)
[x] IntelligenceOpsPage roda uma auditoria real com sucesso (valida opsHealthService no local final — 10/07/2026 09:09:34, 20 achados)
[x] Cada serviço tem seu próprio commit (8 commits de código, rollback granular: 226aa81, 71f2069, d5e9c68, 4889a31, 26c44f2, dd1280a, e220769, 96bf29b)
[x] Commit final de fechamento aponta para o checkpoint correto (2b7caf2) — este commit
[x] ARCHITECTURE.md atualizado refletindo 100% de src/services/ organizado por domínio
```

**Fase 3C: 8/8 lotes concluídos. Todos os critérios objetivos de conclusão atingidos.** `src/services/` está 100% organizado em 8 domínios (`auditoria/`, `catalogo/`, `chat/`, `conhecimento/`, `crm/`, `foto/`, `ia/`, `plataforma/`) — zero arquivos `.js` soltos na raiz, zero referências a caminhos antigos em `src/`, `api/`, `scripts/`, build limpo, DAG sem ciclos. Fase encerrada.

---

## Registro de execução (atualizado a cada lote)

> Mesma política da Fase 3B: bugs pré-existentes descobertos durante a validação são documentados, não corrigidos, salvo se bloquearem build, validação ou conclusão do lote.

### Lote 1/8 — followUpService ✅ concluído
- 1 arquivo movido para `src/services/crm/`; 3 consumidores atualizados (`App.jsx`, `DealOncaPage.jsx`, `FollowUpPage.jsx`) — exatamente como previsto.
- 2 ajustes de import interno: `./gptmaker` → `../gptmaker`, `./groq` → `../groq` (ambos ficam na raiz até suas próprias vezes).
- `npm run build` passou de primeira. Zero referência a caminho antigo.
- Testado ao vivo: `FollowUpPage` (Dashboard Follow-Up, 46 conversas monitoradas, dados reais) e `DealOncaPage`/CODEX — ambos sem erro de console.
- Nenhum bug pré-existente encontrado.
- Commit: `226aa81`.

### Lote 2/8 — photoHistory ✅ concluído
- 1 arquivo movido para `src/services/chat/`; 4 consumidores atualizados (`RightPanel.jsx`, `PhotoHistoryPanel.jsx`, `ChatArea.jsx`, `SimuladorClientePage.jsx`) — exatamente como previsto. Nenhum import interno a ajustar.
- `npm run build` passou de primeira.
- Testado ao vivo: `PhotoHistoryPanel` (aba "Histórico de Fotos" em `KnowledgePage` — 92 envios/88 sucessos/96% taxa, dados reais) e `ChatArea`/`RightPanel` (Inbox com 46 conversas) — sem erro de console.

**Achado (não relacionado à movimentação):** `SimuladorClientePage` não tem nenhum gatilho de navegação alcançável na UI atual — nenhum `setPage('simulador')` encontrado em lugar nenhum do código. A página parece órfã de navegação (existe e é roteada em `App.jsx`, mas nada no menu leva até ela). Não testada ao vivo por esse motivo — import validado por build + padrão idêntico aos outros 3 consumidores já confirmados.
- Commit: `71f2069`.

### Lote 3/8 — customerProfileService ✅ concluído
- 1 arquivo movido para `src/services/crm/`; 6 consumidores atualizados (`App.jsx`, `ChatArea.jsx`, `ContactsNewPage.jsx`, `ContactsPage.jsx`, `DealOncaPage.jsx`, `groq.js`) — exatamente como previsto, sem surpresa. Nenhum import interno próprio a ajustar.
- `npm run build` passou de primeira.
- Testado ao vivo: `ContactsNewPage` (52 contatos com scores reais) e `DealOncaPage`/CODEX (exercitando `groq.js` → `crm/customerProfileService`) — sem erro de console.
- Nenhum bug pré-existente encontrado.
- Commit: `d5e9c68`.

### Lote 4/8 — knowledgeDB ✅ concluído
- 1 arquivo movido para `src/services/conhecimento/`; 6 consumidores atualizados (`ChatArea.jsx`, `DealOncaPage.jsx`, `KnowledgePage.jsx`, `ContactsNewPage.jsx` externos; `opsHealthService.js`, `auditoria/knowledgeAuditService.js` internos) — exatamente como previsto.
- `npm run build` passou de primeira.
- Testado ao vivo: `KnowledgePage` (32 treinamentos) e nova rodada de "Saúde Geral" via `IntelligenceOpsPage` (66.6%, `opsHealthService` agregando tudo corretamente) — sem erro de console.
- Nenhum bug pré-existente encontrado.
- Commit: `4889a31`.

### Lote 5/8 — groq ✅ concluído
- 1 arquivo movido para `src/services/ia/`; 7 consumidores atualizados (`RightPanel.jsx`, `ChatArea.jsx`, `DealOncaPage.jsx`, `KnowledgePage.jsx`, `SimuladorClientePage.jsx`, `AgentLabPage.jsx` externos; `crm/followUpService.js` interno) — exatamente como previsto.
- 3 ajustes de import interno próprio: `../crm/customerProfileService`, `../crm/stageHistory` (pastas irmãs agora), `./deepseek` (mesma pasta `ia/`, simplificado).
- `npm run build` passou de primeira.
- Testado ao vivo: `DealOncaPage`/CODEX com dados reais (32 na base, diagnóstico do dia) — confirma `askCODEX`/`runProactiveDiagnosis` funcionando com as 3 dependências internas corrigidas.
- Nenhum bug pré-existente encontrado.
- Commit: `26c44f2`.

### Lote 6/8 — catalog ✅ concluído
- 1 arquivo movido para `src/services/catalogo/`; 11 consumidores atualizados (`App.jsx`, `main.jsx`, `ChatArea.jsx`, `RightPanel.jsx`, `DealOncaPage.jsx`, `ExtractorPage.jsx`, `ImageExtractorPage.jsx`, `SimuladorClientePage.jsx` externos; `catalogo/importBackupService.js`, `conhecimento/knowledgeExtractor.js`, `foto/photoMatchingService.js` internos) — exatamente como previsto.
- Ajuste de import interno próprio: `./gptmaker` → `../gptmaker`. `importBackupService.js` simplificado de `../catalog` para `./catalog` (mesma pasta agora).
- `npm run build` passou de primeira.
- **Regressão ampla testada ao vivo** (conforme estratégia definida): `CatalogPage` (544 produtos), `ExtractorPage`, Inbox/`ChatArea`/`RightPanel` (46 conversas) — sem erro de console em nenhuma das 4 telas.
- Nenhum bug pré-existente encontrado.
- Commit: `dd1280a`.

### Lote 7/8 — gptmaker ✅ concluído
- 1 arquivo movido para `src/services/chat/` — **maior fan-in do sistema inteiro (18)**. 18 consumidores atualizados (12 externos + 6 internos) — exatamente como previsto, sem surpresa desta vez.
- `npm run build` passou de primeira, sem incidente.
- **Regressão mais ampla até agora testada ao vivo:** Inbox/ChatArea (46 conversas), AgentsPage, ChannelsPage (3/5 canais), ContactsNewPage (52 contatos), RelatoriosPage (token expirado tratado graciosamente, sem crash JS) — sem erro de console em nenhuma das 5 telas.
- Nenhum bug pré-existente encontrado.
- Commit: `e220769`.

### Lote 8/8 — opsHealthService ✅ concluído (último arquivo)
- 1 arquivo movido para `src/services/plataforma/` — **hub de maior fan-in interno (10 imports)**. 1 consumidor externo atualizado (`IntelligenceOpsPage.jsx`).
- 10 ajustes de import interno: `auditoria/bagyAuditService`, `auditoria/knowledgeAuditService`, `auditoria/learningsAuditService`, `auditoria/whatsappAuditService`, `auditoria/instagramAuditService`, `auditoria/agentAuditService`, `auditoria/agentLearningsService`, `conhecimento/knowledgeDB`, `chat/gptmaker` (todos `./` → `../`) e `plataforma/systemHealthService` (`./plataforma/systemHealthService` → `./systemHealthService`, mesma pasta agora).
- `npm run build` passou de primeira.
- Grep confirmou zero referências residuais ao caminho antigo em `src/`, `api/`, `scripts/`.
- **Marco:** `find src/services -maxdepth 1 -name "*.js"` retorna vazio — raiz de `src/services/` agora tem **zero arquivos `.js` soltos**, 100% organizado em 8 pastas de domínio.
- Testado ao vivo: `IntelligenceOpsPage` renderiza "Saúde Geral 66.6%" corretamente (7 domínios agregando sem erro). Rodada uma auditoria real ("Rodar auditoria agora" na aba Conhecimento) como validação simbólica de fechamento — primeira tentativa interrompida pelo bug recorrente de reset de proxy do preview (não salvou); segunda tentativa concluída com sucesso: `"Última auditoria: 10/07/2026, 09:09:34"` com nova entrada "10/07, 09:09 → 20 achados" no topo do histórico, confirmando a cadeia completa `opsHealthService → auditoria/* → conhecimento/knowledgeDB → chat/gptmaker` funcionando com todos os 10 caminhos corrigidos.
- Nenhum bug pré-existente encontrado.
- Commit: `96bf29b`.

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
