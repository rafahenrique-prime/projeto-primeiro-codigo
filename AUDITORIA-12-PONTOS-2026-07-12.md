# 🔍 RELATÓRIO DE AUDITORIA PROFUNDA (somente leitura)
**Projeto:** PROJETO DO CLAUDECODE · **Data:** 2026-07-12 · **Base:** código-fonte, 13 migrations, 18 endpoints `api/`, 47 services, 29 páginas

Nada foi alterado. Nada foi implementado. Tudo abaixo é constatação direta do código.

---

## PARTE 1 — Os 12 pontos auditados

---

### Ponto 1 — Conversa → histórico completo no CRM

**A. O que já existe**
- Service `src/services/chat/messageHistoryService.js` (tabela `message_history`, não versionada): `syncMessages`, `getConvHistory`, `deleteConvHistory`, `archiveConvHistory`, `getHistoryStats`.
- Escrita: `src/components/ChatArea.jsx:170` chama `syncMessages()` a cada nova mensagem do cliente — **cópia silenciosa para o Supabase**.
- Leitura: `src/components/ChatArea.jsx:314` chama `getConvHistory()` **só dentro do handler "Gerar"** (resposta IA), e só se `memEnabled` estiver ativo — usado como contexto para o Groq, **nunca exibido em tela**.
- `getHistoryStats()` definido mas **sem consumidor** (zero fan-in).
- A exibição do histórico na própria conversa vem **100% da API live do GPT Maker** (`getChatMessages`), nunca do Supabase.

**B. Estado real:** `parcialmente implementado` — gravação funciona; **leitura/exibição no CRM não existe**. O histórico está sendo coletado mas nenhuma tela do CRM o mostra.

**C. Fluxo atual comprovado**
```
Cliente msg → GPT Maker → ChatArea.jsx (getChatMessages, live)
                      └→ syncMessages() → Supabase message_history (ESCRITA, sem tela que leia)
```
Nenhum caminho termina numa tela "histórico do cliente no CRM".

**D. O que falta ligar**
- Uma consulta/aba em `ContactsNewPage` ou `ContactsPage` que chame `getConvHistory(convId)` e renderize.
- Decisão: histórico unificado por `conv_id` (painel) ou `context_id` (webhook)? Hoje o `message_history` grava por `conv_id` (ChatArea), mas o webhook grava identidade por `context_id`. A reconciliação que existe em `customer_profiles` não foi replicada para `message_history`.
- Campo `archived_at` é gravado por `archiveConvHistory` mas não há UI que dispare isso (função órfã de UI).

**E. Arquivos reutilizáveis:** `messageHistoryService.js` (inteiro), `ChatArea.jsx` (padrão de sync), `ContactsNewPage.jsx` (tem aba "Conversa" que mostra msgs via GPT Maker — é o ponto natural de troca/merge).

**F. Duplicações/conflitos:** **2 fontes de verdade para o histórico**: GPT Maker (live, volátil) e `message_history` (Supabase, persistente). Não há reconciliação. Se o GPT Maker apagar conversa antiga, o Supabase ainda tem — mas nada lê isso.

**G. Evidência:** `messageHistoryService.js:6` (`TABLE = 'message_history'`), `ChatArea.jsx:170` (sync), `:314` (getConvHistory só no Gerar), `grep` confirma que `messageHistoryService` tem exatamente **1 consumidor** (`ChatArea.jsx`).

---

### Ponto 2 — Conversa → interesses e produtos perguntados

**A. O que já existe**
- Tabela `customer_profiles` (não versionada) com campos: `interests` (array), `products_asked` (array), `size`, `cep`, `tags`, `buy_score`.
- Extração heurística em `customerProfileService.js:151-177` (`extractInterests` — lista hardcoded de ~30 marcas/categorias; `extractProducts` — pega últimas 10 msgs de agente com imagem).
- Escrita: `ChatArea.jsx:168` (`upsertProfile`) e `DealOncaPage.jsx:441` (`upsertProfile` em lote das 20 primeiras).
- Leitura: `ContactsPage.jsx` aba "🧠 Perfil IA" (`:387-388` mostra `interests` e `products_asked` reais); `ContactsNewPage.jsx:317` (`products_asked`).
- **Já entra no prompt da Gabriela** (Fase 2B): `api/_profileMemory.js:85` lê `interests.slice(-3)` e `products_asked.slice(-3)` e embute no bloco de memória.

**B. Estado real:** `pronto e funcionando` para `interests` (heurístico, client-side); `parcialmente implementado` para `products_asked` (só conta mensagens de agente com imagem — não extrai o nome do produto que o **cliente** perguntou).

**C. Fluxo atual comprovado**
```
ChatArea abre conversa → upsertProfile(conv, msgs) → extractFromMessages
  → interests/products_asked gravados em customer_profiles
  → ContactsPage "Perfil IA" lê e mostra (REAL)
  → webhook.js → getMemoryBlock() → lê de volta → entra no prompt da Gabriela
```

**D. O que falta**
- `products_asked` só capta produtos que **a Gabriela mostrou** (msg de agente com imagem), não o que o **cliente perguntou**. Para "interesses e produtos perguntados" no sentido estrito, falta extração do texto do cliente.
- `interests` é regex de lista fixa — não aprende marcas novas.
- Extração roda só quando o painel está aberto (client-side). Não há coleta automática server-side (o `onNewMessage` da Fase 2C só aprende `size`).

**E. Reutilizáveis:** `customerProfileService.js` (tudo), `extractInterests`/`extractProducts`, `_profileMemory.js` (já lê esses campos).

**F. Conflitos:** 3 extrações de `size` independentes: `customerProfileService.js:133` (frontend, regex amplo 38-47), `api/_profileLearning.js:65` (server, padrões estritos 33-46), `api/_scoring.js:10`. `interests` não tem essa divergência.

**G. Evidência:** `customerProfileService.js:151-177`, `ContactsPage.jsx:387-388`, `_profileMemory.js:83-85`, `DealOncaPage.jsx:436-449`.

---

### Ponto 3 — Perfil do cliente → tela do CRM

**A. O que já existe**
- **2 telas de contatos** coexistindo:
  - `ContactsPage.jsx` (menu "Contatos"? não — verifiquei: `contacts` está em App.jsx mas **não está no LeftNav**). Tem aba "🧠 Perfil IA" mostrando `buy_score`, `size`, `cep`, `message_count`, `last_seen`, `tags`, `interests`, `products_asked`, `notes` — **tudo REAL do Supabase**.
  - `ContactsNewPage.jsx` (menu "Contatos" no LeftNav `:21`). Experimental, com abas Conversa/Análise IA/Aprendizados/Insights. Lê `getAllProfiles` + `getProfile` + `getAnalysis` (tabela `contact_ai_analysis`).
- `ContactsNewPage` tem coluna lateral com `last_seen`, `objetivo`, `products_asked`, `tags`, score — **REAL**.

**B. Estado real:** `pronto e funcionando` (existem **duas** telas; `ContactsNewPage` é a ativa no menu). Observação: o comentário em `ContactsNewPage.jsx:1` diz "módulo experimental — não afeta Contacts atual", mas no menu só uma aparece (`contacts-new`).

**C. Fluxo atual comprovado**
```
LeftNav "Contatos" → setPage('contacts-new') → ContactsNewPage
  → listContacts (GPT Maker) + getAllProfiles (Supabase) em paralelo
  → detalhe: getChatMessages + getProfile(chatId) + getAnalysis(chatId)
  → renderiza produtos_asked, tags, score, last_seen (REAL)
```

**D. O que falta**
- Confirmar qual das duas permanece (`contacts` vs `contacts-new`) — **decisão do Rafael**.
- `contact_ai_analysis` (aba Análise IA do ContactsNew) **não tem migration** — o SQL está só em comentário no `contactAnalysisService.js:76-97`. Se não rodou, a aba mostra warning amarelo (`ContactsNewPage.jsx:371`).
- Aba "Aprendizados" (`ContactsNewPage.jsx:379`) só funciona depois de rodar "Análise IA" manualmente — não é automática.

**E. Reutilizáveis:** Ambas as páginas são reutilizáveis; `customerProfileService.js` é a base.

**F. Duplicações:** **2 páginas de contatos** (`ContactsPage` e `ContactsNewPage`) fazem quase a mesma coisa com foco diferente. É uma duplicação real pendente de decisão.

**G. Evidência:** `LeftNav.jsx:21` (`contacts-new`), `App.jsx:315-316` (ambas registradas), `ContactsNewPage.jsx:371` (warning de tabela ausente).

---

### Ponto 4 — Conversa → alertas do CODEX/DealOnça

**A. O que já existe**
- Tabela `codex_alerts` (migration `001`, versionada). Campos: `type`, `severity`, `conversation_id`, `message`, `data`, `resolved`.
- **Escritores** (4): `api/_codexAlerts.js::logCodexAlert` (helper, chamado por `cron-diagnosis`, `_customerScoring`, `auto-photo`), `api/cron-stuck-check.js` (direto).
- **Leitor**: `src/services/auditoria/codexAlertsService.js` → consumido **só por `DealOncaPage.jsx`** (`getUnresolvedAlerts`, `countUnresolvedAlerts`, `resolveAlert`, `resolveAllAlerts`).
- `DealOncaPage.jsx:193-197` faz polling de alertas a cada 60s; exibe badge "🚨 N" no header (`:1069`), painel lateral com lista (`:1059`), e ação "Reviver lead" (`:222 handleReviveLead`).
- 9 tipos de alerta emitidos pelo `cron-diagnosis`: `canal_silencioso`, `cobranca`, `score_corrigido`, `auditoria_baixa`, `aprendizado_registrado`, `insight_semanal`, `diagnostico_pronto`, `objecao_recorrente`, mais `chat_travado` (cron-stuck-check), `lead_quente` (_customerScoring), `produto_fallback` (auto-photo).

**B. Estado real:** `pronto e funcionando` — escrita backend + leitura frontend + ação de resolver, tudo conectado.

**C. Fluxo atual comprovado**
```
Cron 9h/15h (vercel.json) → cron-diagnosis.js → logCodexAlert → codex_alerts
GitHub Action 5min → cron-stuck-check.js → codex_alerts (chat_travado) + Telegram
_customerScoring (webhook) → lead cruzou 70 → codex_alerts (lead_quente)
                                              ↓
DealOnça (polling 60s) → getUnresolvedAlerts → badge + painel + "Reviver" → resolveAlert(actioned=true)
```

**D. O que falta**
- ⚠️ **Drift de schema confirmado:** o campo `actioned` é gravado por `codexAlertsService.js:51` e filtrado por `cron-diagnosis.js:414`, mas **NÃO existe na migration 001**. Ou foi adicionado manualmente ao banco (provável) ou os PATCH/GET falham silenciosamente. **Risco real**.
- Os alertas só aparecem na página DealOnça — não há badge global no `LeftNav` nem no Inbox.

**E. Reutilizáveis:** `codexAlertsService.js`, `_codexAlerts.js`, `DealOncaPage.jsx` (bloco de alertas).

**F. Duplicações:** `codex_alerts` é a tabela única — sem duplicação aqui. Mas `chat_travado` (cron-stuck) e `canal_silencioso` (cron-diagnosis) são **conceitos sobrepostos** (cliente sem resposta) com thresholds diferentes (3-30min vs 3h+).

**G. Evidência:** migration `001_codex_alerts.sql` (sem `actioned`), `codexAlertsService.js:46-52`, `cron-diagnosis.js:414`, `DealOncaPage.jsx:183-212`.

---

### Ponto 5 — Alertas → ação prática

**A. O que já existe**
- `DealOncaPage.jsx:222 handleReviveLead` — botão "Reviver agora" em alerta de lead quente → `setPendingSend({chatId, name, text})` → card de confirmação de envio → `gptSendMessage` (real).
- `DealOncaPage.jsx:199 handleResolveAlert` — "✓ marcar como visto" → `resolveAlert(id, false)`.
- `resolveAlert(id, true)` marca `actioned=true` quando a ação foi real (Reviver); `false` quando só dispensado. Usado pelo "Ciclo de Cobrança" do `cron-diagnosis.js:409 checkIgnoredHotLeads` (leads quentes 20-48h não `actioned` viram alerta `cobranca`).
- `suggestKnowledgeFromLoss`/`suggestKnowledgeFromWin` (`DealOncaPage.jsx:1338, 1357`) — ao registrar perda/venda, propõe adendo à base de conhecimento (salvar é manual).

**B. Estado real:** `pronto e funcionando` para o fluxo principal (Reviver lead → envia mensagem → marca actioned). `parcial` para os demais tipos de alerta — só "resolver/dispensar", sem ação específica por tipo.

**C. Fluxo atual comprovado**
```
Alerta lead_quente → DealOnça "Reviver" → pendingSend → confirmar → gptSendMessage
                                                  └→ resolveAlert(id, actioned=true)
                                                                       ↓
                                              cron-diagnosis checkIgnoredHotLeads vê actioned=true → não cobra de novo
```

**D. O que falta**
- Ações específicas por tipo: `canal_silencioso`, `objecao_recorrente`, `produto_fallback` hoje só podem ser "dispensados". Não há botão "ver conversa", "treinar Gabriela", "corrigir produto".
- Painel de aprendizados (`showLearningPanel`) existe mas o `proposeAgentFix` **nunca auto-aplica** — só propõe (`cron-diagnosis.js:456-458`). Falta UI para aprovar e aplicar a correção no GPT Maker.

**E. Reutilizáveis:** `handleReviveLead` (padrão de ação 1-clique), `pendingSend` (card de confirmação).

**F. Conflitos:** `actioned` (drift de schema acima) — se o campo não existe de fato no banco, todo o Ciclo de Cobrança queima.

**G. Evidência:** `DealOncaPage.jsx:217-230` (reviveConversation/handleReviveLead), `:1152-1181` (card pendingSend), `cron-diagnosis.js:409-454`.

---

### Ponto 6 — Cliente/perfil → catálogo e estoque

**A. O que já existe**
- Catálogo real no Supabase: `products` (538 itens), `catalog_history` (auditoria add/edit/delete), bucket Storage `produtos`.
- Catálogo Drive (rascunho): `src/services/catalogo/googleDriveCatalog.js` + `DraftCatalogPage.jsx`.
- Catálogo público: `catalogo-publico/index.html` (site separado, lê Drive + `catalog_public_config`).
- Service `catalog.js`: `searchProduct`, `getProducts`, `syncCatalogFromSupabase`, etc. **Fan-in 11** (mais consumido depois do `gptmaker`).
- Ligação perfil→catálogo **indireta**: `products_asked` em `customer_profiles` guarda nomes de produtos, mas **não há link/chave estrangeira** entre `customer_profiles` e `products`.

**B. Estado real:** `pronto e funcionando` o catálogo em si; `parcialmente implementado` a ligação **perfil ↔ catálogo** — existe só como texto livre em `products_asked`.

**C. Fluxo atual comprovado**
```
Catálogo:  Drive → googleDriveCatalog → DraftCatalogPage → syncCatalogFromSupabase → products (Supabase)
Estoque:   products.imagem/link/preco → catalogo-publico (leitura) + webhook.js buscarProdutos (Gabriela)
Perfil:    products_asked = [nomes de produtos como texto]  ← sem FK para products.id
```

**D. O que falta**
- Nenhum conceito de "estoque" (quantidade/disponibilidade) em `products` — só `disponibilidade: 'SIM'` hardcoded no webhook (`webhook.js:292`). Não há campo real de estoque.
- Nenhuma tela mostra "este cliente perguntou sobre estes produtos do catálogo" com link clicável para o produto.
- `catalog_history` é gravado por `log-history.js` mas não há **tela** que mostre essa auditoria (confirmar — `grep` não achou página consumindo).

**E. Reutilizáveis:** `catalog.js` (todas as queries), `products_asked` (já coletado).

**F. Conflitos:** 2 fontes de catálogo fallback: `src/data/catalog.json` (bundle, **sem consumidor ativo**) e `CATALOG_FALLBACK` hardcoded em `auto-photo.js:45-94` (~49 produtos). Documentado em ARCHITECTURE.md §5.

**G. Evidência:** `catalog.js` (service), `webhook.js:107` (select products), `auto-photo.js:45` (fallback), ARCHITECTURE.md §5 (2 fontes).

---

### Ponto 7 — Catálogo/produto perguntado → memória do cliente

**A. O que já existe**
- `customer_profiles.products_asked` (array) — já coletado, já lido pela memória da Gabriela (`_profileMemory.js:85`).
- `webhook.js::buscarProdutos` — quando o cliente pergunta, busca produtos no Supabase e retorna top 5.
- **Mas:** o nome do produto que o **cliente perguntou** NÃO é gravado em `products_asked`. Só é gravado o que a **Gabriela mostrou** (msg de agente com imagem — `customerProfileService.js:171-177`).

**B. Estado real:** `parcialmente implementado` — a memória lê `products_asked`, mas o campo é preenchido com o produto errado (mostrado, não perguntado).

**C. Fluxo atual comprovado**
```
Hoje:  cliente "queria o 9060?" → webhook busca 9060 no catálogo → Gabriela mostra
                              └→ ChatArea upsertProfile → products_asked ← [última msg agente c/ imagem]
                                  (NÃO grava "9060" como produto perguntado pelo cliente)
Futuro desejado: cliente pergunta "9060" → grava "9060" em products_asked → memória usa
```

**D. O que falta**
- Extração server-side do produto perguntado. O `onNewMessage` (Fase 2C) é o lugar natural, mas hoje só aprende `size`. Ampliar exige nova aprovação (documentado em ARCHITECTURE.md §6 Fluxo A2).
- `extractProducts` no `customerProfileService.js:171` tem lógica invertida (filtra `m.role === 'agent' && m.image`).

**E. Reutilizáveis:** `_profileLearning.js` (arquitetura transacional validada — copiar o padrão para `products_asked`), `apply_profile_size_learning` (modelo de RPC segura), `buscarProdutos` do webhook (já detecta o produto).

**F. Conflitos:** Ver Ponto 2 — 3 implementações de `extractSize`, `extractProducts` dividido entre `_scoring.js`, `customerProfileService.js`, `_profileLearning.js`.

**G. Evidência:** `customerProfileService.js:171-177`, `_profileMemory.js:85`, ARCHITECTURE.md §6 (escopo da Fase 2C explicitamente só `size`).

---

### Ponto 8 — Conversa → follow-up automático

**A. O que já existe**
- `src/services/crm/followUpService.js` — motor completo: `runFollowUpCheck`, `getFollowUpSummary`, `getFollowUpLog`, `getResponseRate`, schedule, stages editáveis.
- 3 tabelas Supabase (nenhuma versionada): `followup_config` (config global), `followup_sent` (reserva atômica via constraint unique `conv_id+stage`), `followup_log` (histórico).
- Roda **a cada 60s** em 2 lugares: `App.jsx:123-131` (passa `convsRef.current`) e dentro do DealOnça.
- Geração de mensagem via Groq (`generateFollowUpText`) com fallback de textos fixos por estágio.
- Detecção de inatividade em janelas: 30min / 23h45 / 24h (configurável).
- `FollowUpPage.jsx` (menu "Follow-up") — dashboard completo: KPIs, taxa de resposta, distribuição de inatividade, editor de estágios, simulação, envio real.

**B. Estado real:** `pronto e funcionando` — escrita, leitura, UI, simulação e envio real, tudo conectado. **É o fluxo mais maduro dos 12.**

**C. Fluxo atual comprovado**
```
App.jsx setInterval 60s → runFollowUpCheck(convsRef) → followUpService
  → getScheduleAsync (followup_config) → isWithinSchedule?
  → getStagesAsync → por conversa: getInactiveMinutes → detectStage
  → claimSend (followup_sent, trava unique) → generateFollowUpText (Groq) → sendMessage (GPT Maker)
  → appendLog (followup_log) → getResponseRate lê de volta → FollowUpPage mostra
```

**D. O que falta**
- ⚠️ **3 tabelas sem migration versionada** (`followup_config`, `followup_sent`, `followup_log`). Se o Supabase zerar, não há como recriar do repo.
- Toggle ON/OFF é `localStorage` (`followup_enabled`), não config server — cada dispositivo tem o seu.
- `finalize` action não funciona mais (GPT Maker removeu endpoint finishChat — comentado em `followUpService.js:296-298`).

**E. Reutilizáveis:** `followUpService.js` (inteiro — referência arquitetural para outros fluxos), `followup_sent` (padrão de trava atômica).

**F. Conflitos:** O `onNewMessage` da Fase 2C e o `runFollowUpCheck` ambos reagem a inatividade/mensagens em caminhos diferentes — sem sobreposição real, mas conceito afim.

**G. Evidência:** `followUpService.js:109-129` (claimSend/releaseSend), `App.jsx:123-131` (ciclo 60s), `FollowUpPage.jsx` (UI completa), `followup_config`/`followup_sent`/`followup_log` sem migration.

---

### Ponto 9 — Follow-up → WhatsApp/canal

**A. O que já existe**
- `followUpService.js` chama `sendMessage(conv.id, text)` → `src/services/chat/gptmaker.js::sendMessage` → `POST /v2/chat/{chatId}/send-message` no GPT Maker.
- O GPT Maker roteia para WhatsApp ou Instagram conforme o `chatId` (o canal já vem do `listChats`).
- `FollowUpPage.jsx` tem filtro por canal (`channelFilter` WhatsApp/Instagram) antes de rodar.
- Rate-limit de 1000ms respeitado (CLAUDE.md Regra 5).

**B. Estado real:** `pronto e funcionando` — herda o canal da conversa no GPT Maker, não há integração direta com WhatsApp/Instagram APIs (não precisa — o GPT Maker é o barramento).

**C. Fluxo atual comprovado**
```
followUpService.runFollowUpCheck → sendMessage(convId, text) → gptmaker.js
  → POST api.gptmaker.ai/v2/chat/{chatId}/send-message → GPT Maker roteia → WhatsApp/Instagram
```

**D. O que falta**
- Nada estrutural. Dependência externa: GPT Maker estar online e token válido (~24h).
- `finalize` não funciona mais (Ponto 8).

**E. Reutilizáveis:** `gptmaker.js::sendMessage` (uso direto).

**F. Conflitos:** Nenhum.

**G. Evidência:** `followUpService.js:302, 308, 314` (sendMessage), `App.jsx` importa `gptmaker.sendMessage`.

---

### Ponto 10 — Conversa → resultado da venda

**A. O que já existe**
- Tabela `interactions` (não versionada): `conv_id`, `client_name`, `channel`, `outcome` (`closed_won`/`closed`/`loss`/`em_aberto`), `loss_reason`, `objections`, `scripts_used`, `notes`.
- Escrita: `DealOncaPage.jsx:1316 saveInteraction` (form "Registrar Resultado" no painel direito) + `autoCloseInactiveConversations` (`interactionsService.js:52`, auto-fecha 24h+).
- Leitura: `RelatoriosPage.jsx::ConversaoTab` (`:219 getConversionStats`) — mostra taxa de conversão, motivos de perda, distribuição, últimas interações.
- Pós-venda/perda inteligente: ao registrar `closed_won` → `suggestKnowledgeFromWin`; ao `loss` → `suggestKnowledgeFromLoss` (propõe entrada na base de conhecimento).

**B. Estado real:** `pronto e funcionando` — registro manual no DealOnça + auto-close + leitura no Relatórios → Conversões. **Mas é 100% registro manual** — a venda não é detectada automaticamente.

**C. Fluxo atual comprovado**
```
DealOnça "Registrar Resultado" → seleciona conversa + outcome → saveInteraction → interactions
autoClose (24h inativo) → saveInteraction(outcome='closed') → interactions
                                                                      ↓
RelatoriosPage aba Conversões → getConversionStats → taxa/motivos/distribuição (REAL)
```

**D. O que falta**
- ⚠️ `interactions` **sem migration versionada**.
- Detecção automática de venda (PIX confirmado, "comprei", link clicado) — não existe.
- O `DashboardPage` (menu "Relatórios" antigo, `reports`) **não lê** `interactions` — só `RelatoriosPage` (aba Conversões). Não há visão unificada.

**E. Reutilizáveis:** `interactionsService.js`, `getConversionStats`, `saveInteraction`, `RelatoriosPage::ConversaoTab`.

**F. Conflitos:** 2 dashboards (`DashboardPage` = `reports`, `DashboardNewPage` = `dashboard`) + `RelatoriosPage` = `relatorios` — 3 páginas de relatório com escopos sobrepostos. Nenhum dos três mostra tudo.

**G. Evidência:** `interactionsService.js:10-22` (save), `:33-50` (stats), `DealOncaPage.jsx:1316`, `RelatoriosPage.jsx:219`, `App.jsx:319-321` (3 páginas de dashboard).

---

### Ponto 11 — Resultados → Dashboard

**A. O que já existe**
- `DashboardNewPage.jsx` (menu "Dashboard"): KPIs de `conversations` (total, não lidas, canais) — REAL; cards `SupabaseStorageCard`, `TokenUsageCard` (lê `token_usage`), `DeepSeekBalanceCard` — REAIS. **Mas o gráfico semanal é `Math.random()` para dias que não hoje** (`DashboardNewPage.jsx:45`, comentário "Semana simulada").
- `DashboardPage.jsx` (menu "Relatórios" = `reports`): 100% computado de `conversations` em memória — **não lê Supabase**, não lê `interactions`.
- `RelatoriosPage.jsx` (menu "Relatórios" submenu = `relatorios`): abas "Visão Geral"/"Atendimento" via `getDashboardData()` (API GPT Maker, REAL); aba "Conversões" via `getConversionStats()` (Supabase `interactions`, REAL).

**B. Estado real:** `parcialmente implementado` — dados de **resultado de venda** (interactions) só aparecem em **1 das 3 telas** (RelatoriosPage aba Conversões). Dashboard principal (DashboardNewPage) não mostra vendas. Gráfico semanal mockado.

**C. Fluxo atual comprovado**
```
DashboardNewPage (menu Dashboard): conversations (memória) + cards Supabase (storage/tokens) + SEMANA MOCK
DashboardPage (reports):           conversations (memória) — zero Supabase de CRM
RelatoriosPage (relatorios):       GPT Maker getDashboardData (geral/atend) + interactions Supabase (conversões)
```

**D. O que falta**
- Conectar `interactions`/`customer_profiles` ao `DashboardNewPage` (vendas, ticket, top produtos).
- Substituir `Math.random()` do gráfico semanal por dado real (`interactions` por dia, ou `gptmaker_consumption` — tabela referenciada mas sem fan-in visível).
- Unificar ou extinguir dashboards duplicados.

**E. Reutilizáveis:** `DashboardNewPage.jsx` (estrutura), `RelatoriosPage::ConversaoTab` (já lê interactions), `getConversionStats`, `getAllProfiles`.

**F. Conflitos:** **3 dashboards** coexistem — é a maior duplicação do projeto. Nenhum é completo.

**G. Evidência:** `App.jsx:319-321`, `DashboardNewPage.jsx:43-45` (Math.random comentado), `DashboardPage.jsx` (sem import Supabase), `RelatoriosPage.jsx:4` (import interactionsService).

---

### Ponto 12 — Erros/logs → painel de diagnóstico

**A. O que já existe**
- `IntelligenceOpsPage.jsx` (menu "Inteligência Operacional") — hub de auditorias consolidadas via `opsHealthService.js` (importa **10 services**).
- Abas/tabs: `SystemHealthTab` (`system_health_runs`), `BagyAuditPage` (`bagy_audit_log`), `CodexAuditTab` (`codex_audit_findings`), `KnowledgeAuditTab` (`knowledge_audit_findings`), `LearningsAuditTab` (`learnings_audit_findings`), `WhatsappAuditTab` (`whatsapp_audit_findings`), `InstagramAuditTab` (`instagram_audit_findings`), `GabrielaAuditTab` (`agent_audits`).
- `cron-diagnosis.js::diagnosticService` grava relatórios em `diagnostics` (lido por DealOnça).
- `api/cron-diagnosis.js` (cron 9h/15h) gera diagnóstico; `cron-stuck-check` (GitHub Action 5min) + Telegram.
- `systemHealthService` + `diagnosticService` + `opsHealthService` formam a camada de observabilidade.

**B. Estado real:** `pronto e funcionando` para **saúde técnica** (Supabase/WhatsApp/Instagram/Groq/webhook/filas) e **auditorias de dados**. `parcial` para **erros de runtime da Gabriela** — não há agregação central de erros/429/exceções do webhook; os logs são `console.error` no serverless (Vercel), sem tabela própria.

**C. Fluxo atual comprovado**
```
cron-diagnosis 2x/dia → system_health_runs + diagnostics → IntelligenceOpsPage/SystemHealthTab
cron-diagnosis → auditorias (knowledge/learnings/whatsapp/instagram/codex) → *_audit_findings → tabs
agent_audits (rubrica Gabriela 0-10) → GabrielaAuditTab + DealOnça
[ERROS runtime do webhook] → console.error no Vercel (sem tabela) — NÃO chegam a painel
```

**D. O que falta**
- Tabela de **erros/logs de runtime** (429, timeouts, exceções do webhook/auto-photo). Hoje são `console.error` efêmeros.
- `codex_audit_findings` (migration 008) é preenchido **manualmente** pelo Claude Code — não roda no app (arquivo_orfao, funcao_sem_uso, etc.). Não é automático.

**E. Reutilizáveis:** `IntelligenceOpsPage.jsx` (hub), `opsHealthService.js` (agregador), `system_health_runs` (padrão de schema).

**F. Conflitos:** `codex_audit_findings` vs `codex_alerts` — nomes parecidos, conceitos diferentes (auditoria de código vs alertas operacionais). Confusão nominal real.

**G. Evidência:** `IntelligenceOpsPage.jsx`, `opsHealthService.js` (10 imports), migration `008_codex_audit.sql` (comentário confirma gravação manual), `system_health_runs`.

---

## PARTE 2 — Verificações transversais

**1. Menus com dados reais:** Inbox (GPT Maker live), Dashboard (`DashboardNewPage` — parcial real/parcial mock), DealOnça (Supabase + GPT Maker), Follow-up (Supabase), Relatórios (GPT Maker + Supabase), Contatos (`contacts-new` — Supabase + GPT Maker), Catálogo (Supabase), Conhecimento (Supabase), Inteligência Operacional (Supabase), Cobranças (Base44 — backend separado).

**2. Só mock/placeholder/local-state:** `DashboardNewPage` gráfico semanal (`Math.random`); `CobrancasPage` com fallback `MOCK_COBRANCAS` quando Base44 falha; RightPanel "progresso do objetivo" (heurística local, não persiste); `PlaceholderPage` de Configurações (`App.jsx:335`).

**3. Já consultam Supabase:** Inbox (ChatArea → message_history, customer_profiles), DealOnça (codex_alerts, diagnostics, customer_profiles, interactions, agent_audits, weekly_insights), Follow-up (followup_*), Relatorios/Conversões (interactions), Contatos-new (customer_profiles, contact_ai_analysis), Catálogo (products, catalog_history), Conhecimento (knowledge), Inteligência Operacional (todas `*_audit_findings`, `system_health_runs`), DashboardNew cards (token_usage, storage).

**4. Tabelas sem página consumidora:** `instagram_audit_findings` (tem tab, confirmar população), `learnings_audit_findings` (idem), `gptmaker_consumption` (referenciada no grep mas **nenhum service encontrado** — órfã), `photo_cache` (service `photoCacheService` existe, confirmar consumidor), `avatar_cache` (consumido por `avatarCacheService`/`cache-avatar.js`). **`gptmaker_consumption` é a mais provável órfã.**

**5. Páginas sem dados reais:** `ContactsPage` (existente mas **fora do menu** — só `contacts-new` aparece); abas de `ContactsNewPage` "Análise IA"/"Aprendizados" só têm dados se rodar manualmente; `DashboardPage` (reports) é 100% memória sem persistência.

**6. Services fan-in zero / sem consumidores:** `getHistoryStats` (função órfã dentro de `messageHistoryService`), `_archive/*` (3 arquivados), `extract-with-ids-test.mjs` (script solto). Dentre ativos, `contactAnalysisService` tem **1 consumidor** (ContactsNewPage) e depende de tabela sem migration.

**7. Ações visuais sem backend:** `DashboardNewPage.jsx:109` ("Ver tudo →" sem onClick); `RightPanel.jsx:335` ("Eu respondo" só setState) e `:333` ("Usar" só fillInput); `ChatArea.jsx:783` ("Ocultar mensagem" — local only); `ContactsPage.jsx:86` (`syncContacts` só refaz load).

**8. Dados da Gabriela que já alimentam telas:** `customer_profiles` (size, interests, products_asked, buy_score, tags) já alimenta Contatos, DealOnça (Score ao vivo), Inbox (priorização por score). `profile_learning_audit` NÃO alimenta tela (auditoria da Fase 2C sem UI).

**9. Dados do CRM já usáveis pela Gabriela:** `size` (já — Fase 2C), `interests` (já — Fase 2B), `products_asked` (já — Fase 2B, mas campo mal preenchido). `buy_score`, `tags`, `cep`, `notes` **poderiam** mas foram **excluídos deliberadamente** da memória por risco de vazamento (ARCHITECTURE.md §6).

**10. Fluxos ≥70% prontos só faltando interligar:**
- **Follow-up completo** (Ponto 8+9): ~95%.
- **Perfil → tela CRM** (Ponto 3): ~85% (decisão entre 2 telas).
- **Alertas DealOnça → ação** (Ponto 4+5): ~80% (drift `actioned`).
- **Histórico no CRM** (Ponto 1): ~50% (grava, não exibe).
- **Resultado → Dashboard** (Ponto 10+11): ~60% (existe, fragmentado em 3 dashboards).

---

## PARTE 3 — Matriz dos 12 pontos

| # | Ponto | Estado | % pronto | Arquivos principais | Tabelas | Principal lacuna | Risco | Prioridade |
|---|---|---|---|---|---|---|---|---|
| 1 | Histórico no CRM | parcial | 50% | `messageHistoryService.js`, `ChatArea.jsx` | `message_history` | Sem tela que leia; só escreve | Médio | Alta |
| 2 | Interesses/produtos perguntados | parcial/pronto | 75% | `customerProfileService.js`, `_profileMemory.js` | `customer_profiles` | `products_asked` capta errado (mostrado, não perguntado) | Baixo | Média |
| 3 | Perfil → tela CRM | pronto (duplicado) | 85% | `ContactsPage.jsx`, `ContactsNewPage.jsx` | `customer_profiles`, `contact_ai_analysis` | 2 telas coexistem; 1 tabela sem migration | Médio | Média |
| 4 | Alertas CODEX/DealOnça | pronto | 90% | `codexAlertsService.js`, `_codexAlerts.js`, `cron-diagnosis.js` | `codex_alerts` | Campo `actioned` fora da migration | **Alto** | Alta |
| 5 | Alertas → ação | pronto | 80% | `DealOncaPage.jsx` (handleReviveLead) | `codex_alerts` | Só lead_quente tem ação específica | Médio | Média |
| 6 | Perfil → catálogo/estoque | parcial | 55% | `catalog.js`, `DraftCatalogPage.jsx` | `products`, `catalog_history` | Sem estoque real; sem FK perfil↔produto | Médio | Baixa |
| 7 | Produto perguntado → memória | parcial | 40% | `_profileLearning.js`, `_profileMemory.js` | `customer_profiles.products_asked` | Extração invertida; só size aprende sozinho | Médio | Média |
| 8 | Follow-up automático | **pronto** | 95% | `followUpService.js`, `FollowUpPage.jsx`, `App.jsx` | `followup_config/sent/log` | 3 tabelas sem migration versionada | **Alto** | Alta |
| 9 | Follow-up → WhatsApp | **pronto** | 95% | `followUpService.js`, `gptmaker.js` | — | Depende token GPT Maker 24h | Baixo | Baixa |
| 10 | Resultado da venda | pronto (manual) | 70% | `interactionsService.js`, `DealOncaPage.jsx` | `interactions` | Sem migration; só manual, sem auto-detecção | Médio | Média |
| 11 | Resultados → Dashboard | parcial | 45% | `DashboardNewPage.jsx`, `DashboardPage.jsx`, `RelatoriosPage.jsx` | `interactions`, `token_usage` | 3 dashboards; semana mockada; vendas ausentes | Médio | Alta |
| 12 | Erros/logs → diagnóstico | parcial/pronto | 75% | `IntelligenceOpsPage.jsx`, `opsHealthService.js` | `system_health_runs`, `*_audit_findings`, `diagnostics` | Sem agregação de erros runtime do webhook | Baixo | Baixa |

---

## PARTE 4 — Listas categorizadas

**🟢 Já existe e deve ser reaproveitado (não criar de novo):**
- `customerProfileService.js` (base de memória/perfil)
- `followUpService.js` (referência arquitetural completa — trava atômica, config server, log)
- `codexAlertsService.js` + `_codexAlerts.js` (padrão de alertas escrita/leitura)
- `messageHistoryService.js` (já grava — só precisa de leitor)
- `interactionsService.js` + `getConversionStats` (registro de venda já lido pelo RelatoriosPage)
- `opsHealthService.js` (agregador de 10 services — base do painel de diagnóstico)
- `apply_profile_size_learning` RPC (modelo de RPC transacional segura — copiar padrão)
- `ContactsNewPage.jsx` e/ou `ContactsPage.jsx` (Perfil IA já mostra campos reais)
- `RelatoriosPage::ConversaoTab` (já lê `interactions`)

**🟡 Existe parcialmente (completar, não recriar):**
- Histórico no CRM (Ponto 1) — falta UI de leitura
- `products_asked` (Ponto 2/7) — extração invertida, ampliar aprendizado
- Dashboard de vendas (Ponto 11) — conectar `interactions` ao `DashboardNewPage`
- Ações por tipo de alerta (Ponto 5) — só `lead_quente` age
- Detecção automática de venda (Ponto 10) — hoje só manual

**🔴 Precisa ser criado (não há equivalente):**
- Migration versionada para `followup_config`, `followup_sent`, `followup_log`, `interactions`, `message_history`, `contact_ai_analysis` (6 tabelas críticas sem registro)
- Migration para adicionar `actioned` em `codex_alerts` (drift)
- Tabela de erros/logs de runtime do webhook (Ponto 12)
- Conceito de estoque real em `products` (se desejado — Ponto 6)

**⛔ Não deve ser criado porque já há equivalente:**
- NÃO criar novo motor de follow-up
- NÃO criar novo sistema de alertas
- NÃO criar nova tabela de perfil (já é `customer_profiles`)
- NÃO criar novo dashboard do zero (existem 3 — consolidar primeiro)
- NÃO criar novo service de histórico (já é `messageHistoryService`)

**🗑 Pode ser removido ou arquivado:**
- `ContactsPage.jsx` (fora do menu, sobreposta por `ContactsNewPage`) — **sob decisão**
- `src/data/catalog.json` (sem consumidor ativo, ARCHITECTURE.md §5)
- `getHistoryStats` (função órfã)
- Scripts soltos na raiz (`page-13-sync.mjs`...`page-21-sync.mjs`, `find-duplicates.mjs`, etc. — operacionais one-shot, candidatos a `scripts/`)
- `_archive/*` (já arquivado, manter)

**❓ Precisa de decisão do Rafael:**
- **Qual dashboard permanece?** (`DashboardNewPage` vs `DashboardPage` vs consolidar com `RelatoriosPage`)
- **Qual tela de Contatos permanece?** (`ContactsPage` vs `ContactsNewPage`)
- **Ampliar o aprendizado automático da Fase 2C para além de `size`?** (`interests`, `products_asked` — exige nova aprovação explícita, como foi para `size`)
- **Incluir `buy_score`/`tags` na memória da Gabriela?** (hoje excluídos por privacidade)
- **Criar conceito de estoque real?** (hoje só `disponibilidade: 'SIM'` hardcoded)
- **Versionar as 6 tabelas sem migration?** (risco de drift/perda em recriação)

---

## PARTE 5 — Mapa visual da arquitetura atual

```
                        CLIENTE (WhatsApp / Instagram)
                                    │
                                    ▼
                           GPT Maker (Gabriela)
                                    │
            ┌───────────────────────┼─────────────────────────┐
            ▼                       ▼                         ▼
     Ação "Buscar Produtos"   onNewMessage (toda msg)    intenções (5)
     → /api/webhook           → /api/onnewmessage        → Telegram direto
            │                       │
            │  ✅ funcionando       │  ✅ funcionando (Fase 2C)
            ▼                       ▼
     ┌──────────────────────────────────────────┐
     │  api/webhook.js                          │
     │   ├─ _profileIdentity (upsert)  ✅ F2A   │
     │   ├─ buscarProdutos + knowledge ✅       │
     │   └─ _profileMemory (leitura)   ✅ F2B   │
     └──────────────────────────────────────────┘
                                    │
                                    ▼
                    customer_profiles (memória)
                    context_id/telefone/size/interests/products_asked
                                    │
            ┌───────────────────────┼───────────────────────────┐
            ▼                       ▼                           ▼
     ✅ Inbox prioriza         ✅ Contatos mostra          ✅ DealOnça Score ao vivo
       por buy_score            Perfil IA (size, tags)       (leadProfiles)
                                    │
                                    ▼
                       ╔══════════════════════╗
                       ║  CRM (telas)         ║
                       ║  ChatArea → sync     ║ ✅ funcionando (escrita)
       Pontos 1,2,3    ║  message_history     ║ ⚠️ parcial (sem leitura em tela)
                       ╚══════════════════════╝
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │  Alertas codex_alerts  │ ✅ funcionando (Ponto 4)
                       │  (cron 9h/15h + 5min)  │
                       └────────────────────────┘
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │  DealOnça → ação       │ ⚠️ parcial (Ponto 5)
                       │  Reviver lead ✅        │   só 1 tipo age
                       │  Outros → só dismiss   │
                       └────────────────────────┘
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │  Follow-up automático  │ ✅ funcionando (Ponto 8)
                       │  App.jsx 60s + config  │   3 tabelas sem migration
                       └────────────────────────┘
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │  sendMessage → GPT     │ ✅ funcionando (Ponto 9)
                       │  Maker → WA/IG         │
                       └────────────────────────┘

    ╔═══════════════════════════════════════════════╗
    ║  PERFIL ↔ CATÁLOGO      ⚠️ parcial (Ponto 6)  ║
    ║  products_asked = texto livre, sem FK         ║
    ║  sem estoque real                             ║
    ╚═══════════════════════════════════════════════╝

    ╔═══════════════════════════════════════════════╗
    ║  PRODUTO PERGUNTADO → MEMÓRIA  ⚠️ parcial(7)  ║
    ║  só size aprende sozinho (Fase 2C)            ║
    ║  products_asked capta "mostrado", não "perg." ║
    ╚═══════════════════════════════════════════════╝

                       ┌────────────────────────┐
                       │  Resultado da venda    │ ⚠️ parcial (Ponto 10)
                       │  saveInteraction       │   manual + auto-close 24h
                       │  interactions (s/migr) │   sem auto-detecção
                       └────────────────────────┘
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │  Dashboard             │ ❴ parcial (Ponto 11)
                       │  3 dashboards          │   semana mockada
                       │  vendas só em 1        │   vendas ausentes do principal
                       └────────────────────────┘
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │  Diagnóstico/Logs      │ ✅ saúde técnica (Ponto 12)
                       │  IntelligenceOpsPage   │   ⚠️ sem erros runtime webhook
                       └────────────────────────┘
```

**Legenda:** ✅ funcionando · ⚠️ parcial · ❌ ausente

---

## PARTE 6 — Ordem recomendada de implementação (por dependência real)

> Não segue a ordem da lista. Segue o que destrava o resto.

1. **Bloco Fundações (primeiro — corrige débito técnico que corrói tudo):**
   - **F0. Versionar as 6 tabelas sem migration** (`followup_*`, `interactions`, `message_history`, `contact_ai_analysis`) + adicionar `actioned` a `codex_alerts`. Sem isso, qualquer recriação de ambiente perde dados silenciosamente e o Ciclo de Cobrança pode estar queimando.

2. **Bloco Consolidar (decisões do Rafael que reduzem duplicação):**
   - **F1. Definir dashboard único** (mesclar `DashboardNewPage`/`DashboardPage`/`RelatoriosPage`).
   - **F2. Definir tela de contatos única** (`ContactsPage` vs `ContactsNewPage`).

3. **Bloco Ligações de alto valor e baixo esforço (usam o que já existe):**
   - **F3. Histórico no CRM** (Ponto 1) — `getConvHistory` já existe, só falta uma aba. Depende de F0 (versionar `message_history`).
   - **F4. Dashboard de vendas** (Ponto 11) — `getConversionStats` já existe, só plugar no dashboard consolidado de F1.

4. **Bloco Aprendizado (amplia Fase 2C — exige aprovação explícita):**
   - **F5. Corrigir `products_asked`** (Ponto 2/7) — extração do produto **perguntado** pelo cliente, não do mostrado. Pode ser client-side primeiro, depois migrar para `onNewMessage` no padrão da Fase 2C.

5. **Bloco Ações (depois dos alertas consolidados):**
   - **F6. Ações por tipo de alerta** (Ponto 5) — estender `handleReviveLead` para outros tipos.

6. **Bloco Observabilidade:**
   - **F7. Tabela de erros de runtime** (Ponto 12) — capturar 429/timeout do webhook.

7. **Bloco Opcional:**
   - **F8. Estoque real + FK perfil↔produto** (Ponto 6) — só se o modelo de negócio exigir.

---

## PARTE 7 — Plano em fases pequenas

### Fase F0 — Versionar tabelas órfãs (blocker)
- **Objetivo:** deixar o banco recriável do zero e sanar drifts.
- **Reutilizar:** migrations existentes (padrão das `001`-`013`), `docs/SUPABASE.md §3.1`.
- **Provavelmente mexe:** `supabase/migrations/` (6 novos `.sql` + 1 ALTER), `docs/SUPABASE.md`, `docs/ARCHITECTURE.md`.
- **Banco:** `followup_config`, `followup_sent`, `followup_log`, `interactions`, `message_history`, `contact_ai_analysis`, `codex_alerts` (ADD COLUMN actioned), `gptmaker_consumption` (investigar).
- **Aceite:** `vercel env` + re-criar schema em projeto Supabase limpo reproduz todas as tabelas; `actioned` passa a existir formalmente.
- **Riscos:** snake_case vs nome real no painel; RLS `allow all` replicada; constraints únicas (`followup_sent` unique conv_id+stage, `message_history` unique msg_id) **devem ser preservadas** ou o motor quebra.
- **Não fazer:** não alterar semântica de coluna existente; não renomear.

### Fase F1 — Dashboard único
- **Objetivo:** 1 dashboard com tudo (KPIs live + vendas + consumo).
- **Reutilizar:** `DashboardNewPage.jsx` (shell), `RelatoriosPage::ConversaoTab` (lógica de interactions), `getDashboardData` (GPT Maker), `getConversionStats`.
- **Provavelmente mexe:** o dashboard escolhido; remover/arquivar os outros 2; `LeftNav.jsx`; `App.jsx` rotas.
- **Banco:** leitura de `interactions`, `token_usage`, `customer_profiles`.
- **Aceite:** vendas/taxa de conversão aparecem no dashboard principal; sem `Math.random`.
- **Riscos:** regressão visual; perda de uma aba específica dos dashboards extintos.
- **Não fazer:** não criar 4º dashboard.

### Fase F2 — Contatos único
- **Objetivo:** 1 tela de contatos com Perfil IA + Conversa + Histórico.
- **Reutilizar:** `ContactsNewPage.jsx` (já tem abas), `ContactsPage::ProfileIATab` (campos), `messageHistoryService::getConvHistory`.
- **Provavelmente mexe:** a página escolhida; `LeftNav.jsx`; `App.jsx`.
- **Aceite:** Perfil IA mostra size/interests/products_asked/tags reais; aba Conversa tem histórico mesclado (live GPT Maker + `message_history` quando live falhar).
- **Riscos:** `contact_ai_analysis` sem migration (depende de F0).
- **Não fazer:** não duplicar ContactsPage.

### Fase F3 — Histórico no CRM (Ponto 1)
- **Objetivo:** histórico completo do cliente visível e persistente.
- **Reutilizar:** `messageHistoryService.js`, aba Conversa já existente.
- **Provavelmente mexe:** aba Conversa para renderizar `getConvHistory` quando live falhar ou para mesclar.
- **Banco:** `message_history` (depende F0).
- **Aceite:** ao abrir cliente sem conversa ativa no GPT Maker, o histórico do Supabase aparece.
- **Riscos:** reconciliação `conv_id`↔`context_id` (hoje só em `customer_profiles`).
- **Não fazer:** não parar de usar live do GPT Maker como primário.

### Fase F4 — Dashboard de vendas (Ponto 11, parte de F1)
- **Objetivo:** vendas/taxa/motivos de perda no dashboard principal.
- **Reutilizar:** `getConversionStats`, `RelatoriosPage::ConversaoTab`.
- **Aceite:** KPIs de venda atualizam sem recarregar.
- **Riscos:** nenhum além de F1.

### Fase F5 — Corrigir `products_asked` (Ponto 2/7)
- **Objetivo:** produto **perguntado** pelo cliente vira memória.
- **Reutilizar:** `buscarProdutos` do `webhook.js` (já detecta), `_profileLearning.js` (padrão RPC transacional).
- **Provavelmente mexe:** `customerProfileService::extractProducts` (lógica invertida); avaliar ampliar `onNewMessage`.
- **Banco:** `customer_profiles.products_asked` (escrita); opcional nova RPC no padrão `apply_profile_*`.
- **Aceite:** cliente pergunta "9060" → "9060" aparece em `products_asked` → memória da Gabriela usa.
- **Riscos:** exige **aprovação explícita do Rafael** (mesmo padrão das Fases 2A/2B/2C — qualquer ampliação do que entra no prompt precisa de auditoria de privacidade).
- **Não fazer:** não abrir exceção à regra de aprovação.

### Fase F6 — Ações por tipo de alerta (Ponto 5)
- **Objetivo:** cada tipo de alerta ter ação específica.
- **Reutilizar:** `handleReviveLead` (padrão), `pendingSend` (card confirmação).
- **Aceite:** `objecao_recorrente` → "Treinar Gabriela"; `canal_silencioso` → "Abrir conversa"; `produto_fallback` → "Revisar produto".
- **Riscos:** `actioned` drift (depende F0).
- **Não fazer:** não auto-aplicar `proposeAgentFix` (sempre manual).

### Fase F7 — Erros de runtime no diagnóstico (Ponto 12)
- **Objetivo:** 429/timeout/exceção do webhook aparecem no painel.
- **Reutilizar:** `opsHealthService`, `system_health_runs` (padrão de schema), `_codexAlerts` (para os críticos).
- **Provavelmente mexe:** `api/webhook.js`/`auto-photo.js` (registrar erro em vez de só `console.error`).
- **Banco:** nova tabela `webhook_errors` (ou reusar `codex_alerts` type=`erro_runtime`).
- **Aceite:** erro 429 no webhook aparece em <5min no IntelligenceOps.
- **Riscos:** volume de logs; rotação necessária.

---

## PARTE 8 — Resumo para leigo

**O que já está pronto (de verdade):**
A Gabriela já funciona ponta a ponta: recebe a mensagem, identifica quem é o cliente, lembra do tamanho dele, responde personalizada, e tudo isso está testado em produção. O motor de follow-up (reengajamento automático de quem para de responder) é o mais maduro do projeto — funciona sozinho, com trava contra envios duplicados, horário configurável e tudo. Os alertas do "CODEX/DealOnça" chegam, aparecem numa tela, e o alerta de lead quente já tem botão de "reviver" que manda mensagem de verdade. O perfil do cliente (interesses, tags, score) já aparece numa tela de Contatos com dados reais do banco. O painel de saúde técnica (Inteligência Operacional) funciona.

**O que só parece pronto:**
- O **histórico das conversas** está sendo gravado no banco (toda mensagem é copiada), mas **nenhuma tela mostra esse histórico** — você só vê pela API ao vivo do GPT Maker, que descarta conversas antigas.
- O **dashboard** tem 3 telas diferentes (`Dashboard`, `Relatórios`, `Relatorios`) que parecem completas, mas: uma tem gráfico semanal com números **inventados** (`Math.random`); outra não lê o banco de jeito nenhum; só uma (aba Conversões) mostra resultado de venda real.
- O campo `products_asked` ("produtos perguntados") existe e a Gabriela lê, mas ele é preenchido com o produto que **ela mostrou**, não o que o **cliente perguntou** — então a "memória" pode estar errada.
- **6 tabelas importantes do banco não têm "receita" (migration)** guardada no código. Se o Supabase precisar ser recriado, some. Uma delas (`codex_alerts`) tem um campo (`actioned`) que o código usa mas a receita não descreve — pode estar quebrando silenciosamente o "Ciclo de Cobrança".
- Existem **2 telas de Contatos** e **3 de Dashboard** fazendo quase a mesma coisa — duplicação pendente de decisão.

**O que falta conectar:**
Basicamente, **ligar as pontas que já existem**: o histórico que já é gravado precisa de uma tela que leia; o resultado de venda que já é registrado precisa subir para o dashboard principal; os alertas que não sejam "lead quente" precisam de uma ação prática (hoje só podem ser dispensados); e o produto que o cliente pergunta precisa ser gravado como memória (não só o que a Gabriela mostra). Nada disso exige criar do zero — é plugar o que existe.

**Qual seria o próximo passo mais inteligente:**
Antes de qualquer funcionalidade nova, fazer a **Fase F0**: escrever as "receitas" (migrations) das 6 tabelas que estão sem registro e corrigir o campo `actioned` do `codex_alerts`. É trabalho invisível (não muda nada na tela), mas é o que protege o projeto contra perda silenciosa de dados e contra o Ciclo de Cobrança estar quebrando sem ninguém perceber. Depois disso, **ligar o histórico no CRM** (Ponto 1) é o ganho mais barato: o dado já está sendo coletado, só falta mostrar — é a ligação que dá mais retorno com menos esforço. Em paralelo, você decide qual dashboard e qual tela de contatos permanecem (são decisões suas, não técnicas) — isso elimina duplicação antes que vire confusão.

---

## Anexo — Drifts e riscos confirmados no código (não especulativos)

| # | Drift | Evidência | Risco |
|---|---|---|---|
| D1 | `codex_alerts.actioned` usado mas não está na migration 001 | `codexAlertsService.js:51`, `cron-diagnosis.js:414` vs `001_codex_alerts.sql` | **Alto** — Ciclo de Cobrança pode falhar |
| D2 | 6 tabelas sem migration versionada | `followup_config/sent/log`, `interactions`, `message_history`, `contact_ai_analysis` | **Alto** — banco não recriável |
| D3 | `products_asked` capta produto mostrado, não perguntado | `customerProfileService.js:171-177` (`m.role === 'agent' && m.image`) | Médio — memória pode estar errada |
| D4 | 3 extrações de `size` divergentes | `customerProfileService.js:133`, `_profileLearning.js:65`, `_scoring.js:10` | Médio — score do painel ≠ webhook |
| D5 | Gráfico semanal mockado | `DashboardNewPage.jsx:43-45` (`Math.random`) | Baixo — visual enganoso |
| D6 | 2 telas de Contatos, 3 de Dashboard | `App.jsx:315-321`, `LeftNav.jsx` | Médio — duplicação/confusão |
| D7 | `gptmaker_consumption` referenciada, sem service | grep `rest/v1/gptmaker_consumption` | Baixo — tabela possivelmente órfã |
| D8 | `finalize` do follow-up não funciona mais | `followUpService.js:296-298` | Baixo — degradado gracefully |
| D9 | `getHistoryStats` órfão | `messageHistoryService.js:104` | Baixo — código morto |
| D10 | RLS `allow all` em todas as tabelas versionadas | migration 001-009 | Médio — anon key exposta no frontend dá acesso total |

---

**Fim do relatório.** Nenhum arquivo foi alterado, nenhum commit feito, nenhum deploy, nenhuma tabela/API/service/componente criado. Tudo acima é leitura direta do código, migrations, services e endpoints existentes no repositório em 2026-07-12.
