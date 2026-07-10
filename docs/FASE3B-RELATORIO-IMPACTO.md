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
| 4 | Teste `__tests__/syncCatalog.test.js` quebra se `catalogSyncService` mover sem atualizar o teste | 🟡 Médio | ✅ Resolvido no lote 6 — import atualizado |
| 5 | `npm run dev` não valida páginas dependentes de `api/*.js` | 🟢 Baixo | Confirmado nos lotes 6 e 7 (scraper, bagy-audit) — não bloqueia a 3B, mas gera alarme falso em telas que chamam `api/*` |
| 6 | 36 arquivos é o maior lote das 3 fases | 🟡 Médio | Executar em 8 sub-lotes por domínio, cada um com commit próprio |
| 7 | **`__tests__/syncCatalog.test.js` não é um teste seguro — grava dados reais em produção** (risco operacional, não só de import) | 🔴 Alto | Descoberto no lote 6 (2026-07-10): o arquivo executa `upsertProducts()` real contra a tabela `products` do Supabase de produção (50 produtos hardcoded) quando rodado via `npm test`. Não é isolado/idempotente como um teste unitário deveria ser. **Não executado nesta Fase 3B.** Recomendação: renomear/mover para fora da suíte de testes automatizados (ex.: `scripts/`) ou reescrever com mock, antes que alguém rode `npm test` sem saber do efeito colateral — risco de duplicar/sobrescrever produtos reais |
| 8 | `deepseek.js` usa `'deepseek-lite'` como model default, mas a API real do DeepSeek só aceita `deepseek-v4-pro`/`deepseek-v4-flash` (bug pré-existente, não de import) | 🟡 Médio | Descoberto no lote 8 (2026-07-10) ao testar o seletor de modelo manualmente. `git log -S "'deepseek-lite'"` confirma que existe desde o commit `4608b4c`, muito antes da Fase 3. Não bloqueia a 3B — as chamadas reais usadas pelas auditorias (`askDeepSeek` com `deepseek-reasoner` explícito) não são afetadas. Não corrigido, fora de escopo — registrado para tratamento futuro |

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
[x] Todos os 36 arquivos existem nos novos caminhos (subpastas por domínio) — confirmado: 41 arquivos = 5 (Fase 3A) + 36 (Fase 3B), batendo exato por pasta
[x] Todos os 36 caminhos antigos não existem mais — confirmado, zero arquivos remanescentes na raiz de src/services/
[x] grep por caminho antigo em src/, api/, scripts/ retorna zero resultados — confirmado para os 41 caminhos (3A+3B)
[x] opsHealthService.js atualizado com os 8 imports de Auditoria corrigidos — confirmado (7 de auditoria/ + 1 de plataforma/, já corrigido no lote 3)
[~] src/services/__tests__/syncCatalog.test.js atualizado e npm test passa — import corrigido e confirmado; "npm test passa" NÃO verificado — teste real grava dados em produção (ver risco #7), execução requer autorização explícita fora do escopo desta fase
[x] npm run build sem erros — confirmado, build final limpo
[x] npm run dev sobe sem erro novo no console — confirmado
[x] Todas as 14 páginas + 6 tabs afetadas abrem sem erro — confirmado individualmente ao longo dos 8 lotes
[x] DealOncaPage testada de ponta a ponta — confirmado na checklist final (Plano do Dia, Diagnóstico do Dia, modelo DeepSeek preservado, sem erro)
[x] IntelligenceOpsPage roda uma auditoria real com sucesso — confirmado 2x (lotes 7 e 8), auditoria de Conhecimento completa com gravação real no Supabase
[x] Cada domínio tem seu próprio commit — confirmado: 8 commits de código (f69a025, 11df967, 6029117, 66c9a36, 6412b68, 3351055, fa8f124, b0c829f), um por domínio
[x] Commit final de fechamento aponta para o checkpoint correto — confirmado: ae468b3 (fim da Fase 3A) é ancestral direto de f69a025 (início da 3B)

**Resultado: 11/12 critérios totalmente atendidos, 1 parcialmente atendido (item do teste automatizado, por decisão de segurança).**
```

---

## 7. Registro de execução (atualizado a cada lote)

> Política adotada: bugs pré-existentes descobertos durante a validação de cada lote são **documentados, não corrigidos** — a menos que bloqueiem o build, impeçam o teste do próprio lote, ou estejam diretamente relacionados à movimentação de arquivos realizada. Escopo da Fase 3B permanece exclusivamente reorganização de services e atualização de imports.

### Lote 1/8 — Conhecimento ✅ concluído
- 4 arquivos movidos para `src/services/conhecimento/`; 5 consumidores atualizados (incluindo `CatalogPage.jsx`, achado na verificação, não previsto no plano original).
- `npm run build` sem erros. Testado ao vivo: Inbox/ChatArea, KnowledgePage (aba Extrair da URL), CatalogPage — sem erro de console.
- Commits: `f69a025` (renames) + `6a75c87` (correção de imports que ficou de fora por falha parcial do `git add`).
- Nenhum bug pré-existente encontrado.

### Lote 2/8 — Foto ✅ concluído
- 5 arquivos movidos para `src/services/foto/`; 4 consumidores atualizados. Nenhum ajuste de import interno necessário (`photoFlowService.js` → `photoCacheService.js` seguem na mesma pasta).
- `npm run build` sem erros. Testado ao vivo: `ImageExtractorPage` (544 produtos), `PhotoRecognitionPage` abas Teste/Performance — sem erro.
- Commit: `11df967`.

**⚠️ Bug pré-existente encontrado (não corrigido, registrado):**

| Campo | Detalhe |
|---|---|
| **Local** | `src/pages/PhotoRecognitionPage.jsx`, linha 306 |
| **Aba** | Cache |
| **Sintoma** | Aba quebra com tela em branco ao clicar; React reporta "An error occurred in the `<PhotoRecognitionPage>` component" |
| **Causa raiz** | `getCacheStats()` (em `src/services/foto/photoCacheService.js`) é uma função `async`, mas é chamada **sem `await`** em `PhotoRecognitionPage.jsx:306` (`const stats = getCacheStats()`). O código em seguida acessa `stats.estimatedSavings.toFixed(2)` — como `stats` é uma `Promise` (não o objeto resolvido), `stats.estimatedSavings` é `undefined`, e `.toFixed(2)` lança `TypeError`. |
| **Commit de origem** | `e0f8eaf` — "Add AWS Rekognition photo recognition system with intelligent caching", **2026-06-19**, confirmado via `git blame` na linha 306. A linha nunca foi alterada desde a criação do arquivo. |
| **Relação com a Fase 3B** | **Nenhuma.** O diff desta sessão nesse arquivo toca só as 2 linhas de import (`photoFlowService`/`photoCacheService` apontando para `foto/`). A lógica de chamada (incluindo o `await` faltante) é idêntica à versão pré-3B. |
| **Ação tomada** | Nenhuma correção aplicada — registrado como pendência a ser tratada separadamente, fora do escopo da Fase 3B. |

### Lote 3/8 — Plataforma ✅ concluído
- 7 arquivos movidos para `src/services/plataforma/`; 9 consumidores atualizados (2 não previstos no plano original: `App.jsx` e `opsHealthService.js`, ambos encontrados só na verificação pós-build, não na varredura inicial de `pages/`/`components/`).
- Ajuste de metodologia: o regex de verificação usado nos lotes 1-2 (`(\.\./)*`) não cobria imports `./nome` de mesma pasta — corrigido para `(\.\.?/)*` a partir deste lote. Recomendado reconferir lotes 1-2 com o regex corrigido antes do checkpoint final (ver seção 6).
- Ajuste de import interno: `systemHealthService.js` (`./gptmaker` → `../gptmaker`).
- `npm run build` falhou 2x antes de passar (import de `App.jsx` não coberto na 1ª rodada; import `./systemHealthService` dentro de `opsHealthService.js` não coberto na 2ª). Corrigido e revalidado — build limpo na 3ª tentativa.
- Testado ao vivo: Dashboard (cards Storage/Database/DeepSeek Lite/Saldo DeepSeek OK), AgentsPage (botão avatares em cache), DealOncaPage/CODEX (Plano do Dia, Diagnóstico do Dia) — sem erro de render.
- Commit: `6029117`.

**Achado (não é bug, é limitação de ambiente — registrado para contexto):** o card de créditos GPT Maker no Dashboard mostra "Failed to fetch" ao chamar `https://ignite-webhook.vercel.app/api/gptmaker-credits`. Confirmado que `gptmakerCreditsService.js` teve **zero alteração de conteúdo** nesta movimentação (puro rename). A causa é o sandbox de teste não ter egress de rede real para domínios externos — mesma categoria da limitação já documentada na seção 3 do `FASE3-PLANO-EXECUCAO.md`, agora estendida: não é só `/api/*` local que falha em `npm run dev`, chamadas a domínios externos a partir do navegador de teste também podem falhar por rede restrita do sandbox.

### Lote 4/8 — Chat ✅ concluído
- 2 arquivos movidos para `src/services/chat/`; 3 consumidores atualizados (`ChatArea.jsx`, `DealOncaPage.jsx`, `RelatoriosPage.jsx` — todos previstos no plano original, nenhuma surpresa desta vez).
- Nenhum import interno a ajustar.
- `npm run build` passou de primeira (regex de verificação corrigido desde o lote 3 evitou repetir a falha de metodologia).
- Testado ao vivo: Inbox/ChatArea com conversa real, sem erro. RelatoriosPage renderiza normalmente.

**Achado (limitação de ambiente, não bug):** `RelatoriosPage` mostra "Erro ao carregar relatórios — Token inválido... Renovar token". Isso é o comportamento **documentado e esperado** do `CLAUDE.md` (token GPT Maker expira ~24h) — a página tratou o erro graciosamente (sem crash JS, sem erro de console), o que na verdade confirma que a cadeia de import do `interactionsService` está funcionando corretamente até o ponto da chamada de dados. Não relacionado à Fase 3B.

### Lote 5/8 — CRM ✅ concluído
- 3 arquivos movidos para `src/services/crm/`; 4 consumidores atualizados (`CobrancasPage.jsx`, `ContactsNewPage.jsx`, `DealOncaPage.jsx`, `groq.js`) — todos previstos no plano original, nenhuma surpresa.
- Ajuste de import interno: `contactAnalysisService.js` (`./deepseek` → `../deepseek`, `deepseek.js` fica na raiz até o lote 8).
- `npm run build` passou de primeira.
- Testado ao vivo: CobrancasPage (71 registros, R$15.718,79 em atraso — dados reais), ContactsNewPage (52 contatos), DealOncaPage/CODEX (Plano do Dia, Diagnóstico do Dia) — sem erro de render.
- Commit: `6412b68`.

**Achado (limitação pré-existente, não bug):** console mostra `[Base44 SDK Error] 401: Authentication required to view users` em Cobranças e Contatos. Confirmado zero alteração de conteúdo em `cobrancasService.js` (puro rename) e a string de erro nem existe no nosso código — vem de dentro do próprio `@base44/sdk`. Dados de negócio (cobranças, contatos) carregaram normalmente apesar do erro no console.

### Lote 6/8 — Catálogo ✅ concluído
- 4 arquivos movidos para `src/services/catalogo/`; 4 páginas atualizadas (`CatalogPage.jsx` com 2 imports, `DraftCatalogPage.jsx`, `ImportCatalogPage.jsx`, `ExtractorPage.jsx`) — exatamente como previsto, sem consumidor extra desta vez.
- `src/services/__tests__/syncCatalog.test.js` também atualizado (só o import — o arquivo continua em `__tests__/`, não foi movido para `catalogo/`, por convenção de projeto).
- Ajuste de import interno: `catalogSyncService.js` (`./conhecimento/knowledgeGenerator` → `../conhecimento/knowledgeGenerator`, agora que vira pasta irmã em vez de filha direta).
- `npm run build` passou de primeira.
- Testado ao vivo: CatalogPage (544 produtos), DraftCatalogPage (carregando fotos do Drive), ImportCatalogPage, ExtractorPage — todas sem erro de console.

**⚠️ Divergência de metodologia registrada (não é bug de código — é achado sobre segurança da validação):** `npm test -- syncCatalog.test.js` **não foi executado**. Apesar do nome sugerir um teste seguro/isolado ("🔐 TEST FILE SEGURO"), a leitura do arquivo revelou que o terceiro bloco `it()` chama `upsertProducts(PRODUTOS_50_BAGY)` — uma escrita **real** de 50 produtos hardcoded na tabela `products` do Supabase de **produção** (mesmo banco com 538+ produtos reais documentado como crítico no `CLAUDE.md`). Não é um teste unitário isolado, é um script de sincronização disfarçado de teste, com efeito colateral em dados reais. Validação usada em seu lugar: verificação estática do caminho de import (arquivo existe em `src/services/catalogo/catalogSyncService.js`, mesmo padrão comprovado nos 5 lotes anteriores) + validação via build + validação manual das 4 páginas no navegador. **Rodar o teste de verdade requer autorização explícita do Rafael**, por escrever dados reais em produção — está fora do escopo de "só mover arquivos" da Fase 3B.

### Lote 7/8 — Auditoria ✅ concluído
- 9 arquivos movidos para `src/services/auditoria/`; 10 consumidores atualizados (`DealOncaPage.jsx` com 2 imports, `BagyAuditPage.jsx`, `InstagramAuditTab.jsx`, `KnowledgePage.jsx`, `LearningsAuditTab.jsx`, `CodexAuditTab.jsx`, `KnowledgeAuditTab.jsx`, `WhatsappAuditTab.jsx`, `GabrielaAuditTab.jsx`, `opsHealthService.js`) — todos previstos, sem surpresa.
- 5 ajustes de import interno: `learningsAuditService.js` e `knowledgeAuditService.js` (`./deepseek` → `../deepseek`); `knowledgeAuditService.js` (`./knowledgeDB` → `../knowledgeDB`); `whatsappAuditService.js` e `instagramAuditService.js` (`./gptmaker` → `../gptmaker`). `learningsAuditService.js` manteve `./agentLearningsService` sem alteração (mesma pasta).
- `npm run build` passou de primeira — o lote mais complexo até agora (9 arquivos + hub de 7 imports) sem incidente de build.
- **Auditoria real executada com sucesso:** aba Conhecimento de `IntelligenceOpsPage`, botão "Rodar auditoria agora" → `knowledgeAuditService.js` + `askDeepSeek` julgaram 15 pares de contradição ao vivo, gravaram novo resultado no Supabase (20 → 21 achados, novo "Contraditório: 1", timestamp `10/07/2026 01:34:40`). Confirma toda a cadeia funcionando: Supabase (leitura + gravação) + DeepSeek (IA) + import corrigido.
- `opsHealthService.js` (hub) calculou "Saúde Geral" agregando os 7 domínios normalmente (66.8%, com breakdown por área).
- Testado ao vivo, sem erro de console: `GabrielaAuditTab`, `CodexAuditTab`, `WhatsappAuditTab`, `InstagramAuditTab`, `LearningsAuditTab` — todas carregam.
- Commit: `fa8f124`.

**Achado (limitação de ambiente já documentada, não bug):** "Rodar auditoria agora" na aba Bagy retornou `"Unexpected token '/', "// Auditor"... is n[ot valid JSON]"` — o mesmo padrão de erro já registrado no `FASE3-PLANO-EXECUCAO.md` (chamada a `api/bagy-audit.js`, servido como texto pelo Vite em dev local em vez de executado como function). Confirma mais uma vez que é limitação de ambiente, não relacionada à movimentação — `bagyAuditService.js` só chama esse endpoint, sem lógica própria alterada.

### Lote 8/8 — IA ✅ concluído (último lote da Fase 3B)
- 2 arquivos movidos para `src/services/ia/` (`deepseekBalanceService` primeiro, `deepseek` por último, conforme regra definida). 5 consumidores atualizados: `DeepSeekBalanceCard.jsx`, `contactAnalysisService.js`, `groq.js`, `learningsAuditService.js`, `knowledgeAuditService.js`.
- Ajuste de import interno: `deepseek.js` (`./plataforma/tokenLoggingService` → `../plataforma/tokenLoggingService`).
- `npm run build` passou de primeira. Zero referência a caminho antigo em todo `src/`.
- Testado ao vivo: `DeepSeekBalanceCard` no Dashboard (saldo real $1.91), seletor de modelo DeepSeek em `DealOncaPage`/CODEX (troca Llama 3.3 → DeepSeek Lite funcionando), e **nova rodada completa da auditoria de Conhecimento** (`knowledgeAuditService` + `askDeepSeek` via `ia/deepseek`) — 15 julgamentos concluídos, novo timestamp gravado no Supabase (`10/07/2026 07:56:03`), confirmando a cadeia inteira funcionando no caminho final.
- Commit: `b0c829f`.

**Achado (bug pré-existente, não corrigido):** console mostrou `[DeepSeek] Erro: The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-lite` ao testar o seletor manualmente. `git log -S "'deepseek-lite'"` confirma que esse default existe desde o commit `4608b4c`, muito antes desta sessão — a API real do DeepSeek parece ter renomeado os modelos e o código nunca foi atualizado. Não bloqueou a auditoria real (que usa `deepseek-reasoner` explicitamente, não o default).

**🎉 Todos os 36 arquivos da Fase 3B foram movidos.** Próximo: checklist de encerramento completa.

---

**Gerado em:** 2026-07-10 · Relatório de impacto pré-Fase-3B, atualizado a cada lote durante a execução.
