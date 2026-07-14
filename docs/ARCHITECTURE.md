# docs/ARCHITECTURE.md — Arquitetura do IGNITE PRIME CRM

> **Snapshot:** 2026-07-08 · branch `main` · **atualizado 2026-07-10 pós-Fase-3C**
> **Fonte:** apenas código do repositório (`src/`, `api/`, `supabase/`, configs).

---

## 1. Camadas do sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CLIENTE (WhatsApp / Instagram)                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ mensagem
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│   GPT Maker (api.gptmaker.ai)  ──orquestra a Gabriela (IA)──        │
│   • recebe msg  • chama webhooks  • envia resposta  • modos         │
└──────┬───────────────────────┬──────────────────────┬───────────────┘
       │ /api/webhook          │ /api/auto-photo       │ REST (chats)
       ▼                       ▼                       ▼
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────────┐
│  webhook.js        │ │  auto-photo.js     │ │  App.jsx (frontend)    │
│  busca catálogo +  │ │  detecta "foto" →  │ │  Inbox/Chat/DealOnça   │
│  knowledge → ctx   │ │  envia img+preço   │ │  consome gptmaker.js   │
└─────────┬──────────┘ └─────────┬──────────┘ └──────────┬─────────────┘
          │                       │                       │
          ▼                       ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       SUPABASE (Postgres + Storage)                  │
│  products · knowledge · customer_profiles · codex_alerts ·           │
│  objections · diagnostics · agent_audits · agent_learnings ·         │
│  weekly_insights · *_audit_findings · system_health_runs ·           │
│  catalog_history · photo_history · avatar_cache                      │
└──────────────────────────────────────────────────────────────────────┘
          ▲                       ▲                       ▲
          │                       │                       │
┌─────────┴──────────┐                       ┌──────────┴─────────────┐
│  cron-diagnosis.js │                       │  src/services/*        │
│  (2x/dia) DealOnça │                       │  (frontend)            │
│  usa Groq LLM       │                       │  (frontend)            │
└────────────────────┘                       └────────────────────────┘
```

> **Alertas Telegram:** não há um webhook próprio no projeto — `cron-diagnosis.js`, `cron-stuck-check.js` e as 5 intenções de alerta configuradas no GPT Maker (Pedido grande, Cliente Insatisfeito, Novo Lead, Venda Confirmada, Alerta rafael) chamam `api.telegram.org` **diretamente**. A rota `api/telegram-alert.js` que existia para centralizar esse envio foi removida em 2026-07-11 por estar órfã — confirmado por auditoria ao vivo (nenhuma intenção do workspace GPT Maker apontava pra ela) — ver `docs/WEBHOOKS.md`.

> **Aprendizado automático de `size` (Fase 2C):** além dos dois caminhos acima, existe um terceiro gatilho do GPT Maker — o webhook de sistema **`onNewMessage`** (dispara em toda mensagem, não só nas classificadas como busca de produto), apontado para `api/onnewmessage.js`. Ver seção 6 para o fluxo completo.

### Separação frontend × serverless

**Importante:** `api/` (serverless) e `src/` (frontend) **compartilham o banco Supabase, mas não compartilham código**. O serverless é autossuficiente — **zero imports** de `src/services/`. Onde a mesma regra de negócio é necessária nos dois lados, ela foi **copiada à mão** (ver seção 5).

---

## 2. Estrutura de diretórios (estado atual)

```
PROJETO DO CLAUDECODE/
├── src/
│   ├── App.jsx                 ← roteador por `page` (switch) + Inbox
│   ├── main.jsx                ← entry point
│   ├── theme.jsx               ← tokens de cor (PRIME LIGHT V1)
│   ├── index.css
│   ├── api/                    ← cliente HTTP do frontend
│   ├── components/   (14)      ← UI (ChatArea, RightPanel, Sidebar, cards…)
│   ├── pages/        (30+)     ← uma página por funcionalidade
│   ├── data/
│   │   ├── catalog.json        ← catálogo bundled (fallback)
│   │   └── mockData.js
│   └── services/    (49)       ← 100% organizados em 8 domínios (Fases 3A+3B+3C) — zero arquivos soltos na raiz
│       ├── auditoria/    (10)  ├── catalogo/     (6)   ├── chat/  (4)
│       ├── conhecimento/ (5)   ├── crm/          (5)   ├── foto/  (5)
│       ├── ia/           (3)   ├── plataforma/   (8)   ├── _archive/ (3, sem consumidores)
│
├── api/            (18)        ← serverless Vercel (rotas /api/*)
│   ├── webhook.js              ← busca conhecimento p/ Gabriela + identidade + memória
│   ├── auto-photo.js           ← envio automático de fotos
│   ├── onnewmessage.js         ← aprendizado automático de size (Fase 2C, ver seção 6)
│   ├── cron-diagnosis.js       ← DealOnça (cron 2x/dia)
│   ├── cron-stuck-check.js     ← healthcheck (GitHub Action 5min)
│   ├── scraper.js              ← scraping server-side
│   ├── bagy-audit.js (+ ignore)← auditoria da loja Bagy
│   ├── cache-avatar.js         ← bypass CORS p/ avatares IG
│   ├── embed-knowledge.js      ← embeddings Cohere
│   ├── gptmaker-credits.js     ← saldo de créditos
│   ├── log-history.js          ← log de ações do catálogo
│   ├── system-tools.js         ← `?tool=vercel-status` (Dashboard) + `?tool=sync-lyra` (Cobranças, ver Fluxo F)
│   └── _*.js (6)               ← helpers internos (não viram rota) — inclui `_profileIdentity.js` (Fase 2A), `_profileMemory.js` (Fase 2B) e `_profileLearning.js` (Fase 2C, ver seção 6)
│
├── supabase/migrations/ (8)    ← SQL aplicado manualmente no SQL Editor
├── catalogo-publico/           ← projeto Vercel SEPARADO (HTML estático)
├── scripts/                    ← ferramentas operacionais
├── docs/ · knowledge/ · strategy/  ← documentação
└── .github/workflows/stuck-check.yml
```

---

## 3. Roteamento do frontend

`src/App.jsx` mantém o estado `page` e renderiza a página correspondente num `switch`-like de condicionais (não há React Router). As 25+ páginas incluem:

| `page` | Componente | Função |
|---|---|---|
| `inbox` | InboxList + ChatArea + RightPanel | Atendimento principal |
| `dealonca` | DealOncaPage | Supervisor comercial (CODEX) |
| `dashboard` / `reports` / `relatorios` | Dashboard*Page, RelatoriosPage | Relatórios |
| `catalogo` / `catalogo-rascunho` / `importar` / `importar-backup` | CatalogPage, DraftCatalogPage, ImportCatalogPage, ImportReviewPage | Catálogo |
| `photo` / `extrator` / `image-extractor` | PhotoRecognitionPage, ExtractorPage, ImageExtractorPage | Foto/scraping |
| `agents` / `lab` / `knowledge` / `simulador` | AgentsPage, AgentLabPage, KnowledgePage, SimuladorClientePage | IA/conhecimento |
| `intelligence-ops` / `bagy-audit` | IntelligenceOpsPage | Auditorias consolidadas |
| `contacts` / `contacts-new` / `cobrancas` / `followup` | ContactsPage, ContactsNewPage, CobrancasPage, FollowUpPage | CRM |
| `channels` | ChannelsPage | Canais |

### Ciclos de background no App.jsx
- **30s** — `loadChats()` rebusca conversas no GPT Maker; detecta novas mensagens (beep + notificação do browser).
- **60s** — `runFollowUpCheck()` motor de follow-up.
- **60s** — `getAllProfiles()` recarrega scores para priorizar a fila do Inbox.
- Em paralelo, `cacheAvatarsInBackground()` garante avatar de cada contato no Storage Supabase.

---

## 4. Matriz de dependências dos serviços (`src/services/`)

> **Status da reorganização (2026-07-10):** Fases 3A, 3B e 3C **concluídas** — 100% dos 47 arquivos vivem em subpastas por domínio (`auditoria/`, `catalogo/`, `chat/`, `conhecimento/`, `crm/`, `foto/`, `ia/`, `plataforma/`, mais `_archive/` para código sem consumidores). `src/services/` não tem mais nenhum arquivo `.js` solto na raiz. Ver `docs/FASE3C-RELATORIO-IMPACTO.md` (reorganização) e `docs/AUDITORIA-ORFAOS-SERVICES.md` (2 removidos, 3 arquivados — de onde vieram os 49→47).

### 4.1 Services mais consumidos (incoming — fan-in, contagem por arquivo consumidor distinto)

| Rank | Service | # consumers | Localização |
|---|---|---|---|
| 1 | `gptmaker` | 18 | `chat/` |
| 2 | `catalog` | 11 | `catalogo/` |
| 3 | `groq` | 7 | `ia/` |
| 4 | `knowledgeDB` | 6 | `conhecimento/` |
| 5 | `customerProfileService` | 6 | `crm/` |
| 6 | `photoHistory` | 4 | `chat/` |
| 7 | `deepseek` | 4 | `ia/` |
| 8 | `followUpService` | 3 | `crm/` |
| 9 | `agentLearningsService` | 3 | `auditoria/` |
| 10 | `agentAuditService` | 3 | `auditoria/` |

Os 7 primeiros lugares eram exatamente os 8 candidatos movidos na Fase 3C — confirma que eram estruturalmente os serviços mais centrais do sistema, por isso os últimos a mover.

### 4.2 Hub interno (services que importam muitos services)
- **`plataforma/opsHealthService`** importa **10** services — é o agregador de inteligência operacional: `auditoria/bagyAuditService, plataforma/systemHealthService, auditoria/knowledgeAuditService, auditoria/learningsAuditService, auditoria/whatsappAuditService, auditoria/instagramAuditService, auditoria/agentAuditService, conhecimento/knowledgeDB, auditoria/agentLearningsService, chat/gptmaker`.

### 4.3 Dependências service→service (grafo interno, 30 arestas)
```
catalogo/catalog             → chat/gptmaker
catalogo/catalogSyncService  → conhecimento/knowledgeGenerator
_archive/importBackupService → catalogo/catalog
conhecimento/knowledgeExtractor → catalogo/catalog
crm/contactAnalysisService   → ia/deepseek
crm/followUpService          → chat/gptmaker, ia/groq
foto/photoFlowService        → foto/photoCacheService (mesma pasta)
_archive/photoMatchingService → catalogo/catalog
ia/groq                      → crm/customerProfileService, crm/stageHistory, ia/deepseek (mesma pasta)
ia/deepseek                  → plataforma/tokenLoggingService
auditoria/instagramAuditService → chat/gptmaker
auditoria/knowledgeAuditService → conhecimento/knowledgeDB, ia/deepseek
auditoria/learningsAuditService → auditoria/agentLearningsService (mesma pasta), ia/deepseek
auditoria/whatsappAuditService → chat/gptmaker
plataforma/systemHealthService → chat/gptmaker
plataforma/opsHealthService  → (10 services — ver 4.2)
```
O grafo continua **DAG** (sem ciclos), confirmado ao final da Fase 3C. Todas as arestas agora apontam para caminhos de domínio finais — nenhuma referência à raiz de `src/services/` restante.

### 4.4 Services órfãos (0 consumers externos)
Nenhum órfão permanece em pasta de domínio ativa. Dos 5 originalmente identificados (`docs/AUDITORIA-ORFAOS-SERVICES.md`): `awsRekognitionService` e `searchKnowledge` (risco 0-1, sem valor de referência arquitetural) foram **removidos** em 2026-07-10; `importBackupService`, `photoMatchingService`, `photoRecognitionService` foram **arquivados** em `src/services/_archive/` no mesmo dia — tiveram refino de engenharia real ou representam decisões de arquitetura documentáveis, mas seguem sem nenhum consumidor. Ver `src/services/_archive/README.md`.

---

## 5. Duplicação de regra de negócio (api/ × src/services/)

Estas regras existem **como cópia** nos dois lados, não como import compartilhado:

| Regra | `src/services/` | `api/` | Risco |
|---|---|---|---|
| **Scoring de cliente** (`calcBuyScore`) | `customerProfileService.js:179` | `_scoring.js:54` | Score do painel pode divergir do que dispara alerta `lead_quente` |
| **Estágios de funil** (`detectFunnelStage`) | `groq.js:106` | `cron-diagnosis.js:34` (comentário confirma "cópia fiel") | Classificação do diagnóstico ≠ classificação do painel |
| **Motor de objeções** (`OBJECTION_PATTERNS`) | `groq.js` | `cron-diagnosis.js` | Padrão novo no frontend não entra no relatório diário |
| **Busca de conhecimento** | ~~`searchKnowledge.js`~~ (removido em 2026-07-10 — nunca teve consumidor no frontend) | `webhook.js` (`buscarKnowledge`+`buscarProdutos`) — **implementação canônica** | Resolvido: só existe uma implementação agora, em `api/webhook.js::searchKnowledge()`. Duplicação eliminada, não mitigada. |
| **Catálogo fallback** | `src/data/catalog.json` (sem consumidor ativo; único candidato, `_archive/photoRecognitionService.js`, nunca teve consumidor) | `auto-photo.js` (`CATALOG_FALLBACK`) | 2 fontes de verdade ativas do catálogo |
| **Boilerplate Supabase** | (em cada service) | replicado em **11 das 12** funções `api/` | Mudança de auth toca 11 arquivos |
| **Busca de perfil por identidade** (`context_id` → fallback `conv_id`) | — | `api/_profileIdentity.js` (escrita, Fase 2A) **e** `api/_profileMemory.js` (leitura, Fase 2B) — duas cópias dentro do próprio `api/` | Decisão deliberada (Fase 2B): manter os dois módulos desacoplados — identidade/escrita vs. memória/leitura — em vez de um importar o outro. Se a lógica de reconciliação mudar, **as duas cópias precisam ser atualizadas manualmente**; não há import compartilhado avisando a divergência |

> **Recomendação registrada (não executada):** unificar scoring/funil/objections num módulo compartilhado e extrair `api/lib/supabaseClient.js`. Exige análise de impacto prévia.

---

## 6. Fluxos end-to-end

### Fluxo A — Atendimento em tempo real
```
1. Cliente escreve no WhatsApp/Instagram
2. GPT Maker recebe → chama webhook POST /api/webhook com {pergunta, cliente_id, telefone}
3. webhook.js:
   a. warm-up Supabase (evita cold start)
   b. removerDollarInicial() — limpa `$` residual que o GPT Maker deixa na substituição
      de variável (${...}) em cliente_id/telefone (ver Fase 2A, item d)
   c. em paralelo (Promise.all): buscarProdutos()+buscarKnowledge() E getMemoryBlock()
      (Fase 2B, api/_profileMemory.js — timeout interno de 600ms, nunca atrasa a resposta)
   d. formatarRespostaGPT(resultado, memoriaBlock) → {contexto, dados:{produtos,
      informacao_adicional}} — o bloco de memória entra dentro de informacao_adicional,
      entre o total de variações e a base de conhecimento
4. GPT Maker incorpora contexto → Gabriela responde, agora personalizada
5. Paralelamente:
   - se cliente pediu foto → Fluxo B
   - upsertIdentity() (fire-and-forget, api/_profileIdentity.js) — captura de
     identidade, ver detalhe abaixo
```

#### `api/_profileIdentity.js` — captura automática de identidade (Fase 2A)

Responsabilidade: manter `customer_profiles` atualizada **sem depender do painel** — antes da Fase 2A, só `ChatArea.jsx`/`DealOncaPage.jsx` (client-side, exigia o app aberto) escreviam nessa tabela; `api/webhook.js` nunca tocava nela.

Chamado por `webhook.js` como `upsertIdentity({ contextId, telefone, canal })`, sempre fire-and-forget (`.catch(() => {})`) — uma falha aqui nunca pode atrasar ou quebrar a resposta da Gabriela. Fluxo interno:

1. Busca perfil por `context_id` (caso comum: cliente que já mandou mensagem antes)
2. Se não achar, busca por `conv_id = contextId` — **reconciliação com o perfil já criado pelo painel**, possível porque `conv_id` (chave do painel, vem de `listChats()`) e `context_id` (chave do webhook, vem do `${contextId}` do GPT Maker) foram observados coincidindo, tanto em WhatsApp quanto em Instagram
3. Se não achar por nenhum dos dois, cria linha nova com `conv_id = context_id = contextId` (sem gerar valor sintético — `conv_id` é `NOT NULL`+`UNIQUE` na tabela, então precisa ser preenchido; usar o próprio `contextId` satisfaz isso sem inventar dado)

Nunca sobrescreve campo existente com `null`/vazio. Não implementa memória nem entra no prompt da Gabriela — é só existência/identidade básica (memória: Fase 2B, ver abaixo).

Investigação completa (linha do tempo, causas raiz descartadas, evidências de produção): [`docs/investigations/2026-07-11-fase2a-context-id.md`](investigations/2026-07-11-fase2a-context-id.md).

#### `api/_profileMemory.js` — memória de personalização na resposta (Fase 2B)

**Responsabilidade única: leitura.** Busca o perfil do cliente, monta um bloco de memória curto, aplica timeout, trata fallback. **Nunca escreve no banco.** Não conhece `webhook.js` nem a configuração do GPT Maker — recebe só um `contextId` e devolve uma string (ou `''`).

**A memória aqui serve só para personalizar tom/abordagem. Ela nunca:**
- altera a busca de produtos (`buscarProdutos()`/`searchKnowledge()`)
- altera preços
- altera regras comerciais
- filtra o catálogo
- interfere em qualquer decisão de `formatarRespostaGPT()` além de acrescentar um parágrafo de texto em `informacao_adicional`

**Assinatura:** `getMemoryBlock(contextId, timeoutMs = 600)` — chamado por `webhook.js` dentro do mesmo `Promise.all()` que já roda `searchKnowledge()`, então não soma latência sequencial.

**Fluxo interno:**
1. Busca perfil por `context_id`, fallback por `conv_id` — **mesma lógica de busca que já existe em `api/_profileIdentity.js`, duplicada aqui de propósito** (ver tabela de duplicação, seção 5) pra manter os dois módulos desacoplados
2. `Promise.race` contra um timeout de 600ms — se vencer, retorna `''` (a query que ficou pra trás não é cancelada de fato, só deixamos de esperar por ela — cancelamento via `AbortController` foi considerado e descartado do escopo desta fase por simplicidade; fica registrado como melhoria futura se latência virar problema real)
3. Formata o bloco só com os campos aprovados nesta primeira versão: `size`, até 3 `interests`, até 3 `products_asked` — **nunca** `notes`, `buy_score`, `tags`, `message_count`, `cep` ou qualquer outro campo interno (risco de vazar estratégia/observação privada pro próprio cliente)
4. Corta o bloco em 400 caracteres no máximo (ajustado de 300 — ver "Reforço de privacidade" abaixo); retorna `''` se nenhum dos 3 campos existir

**Formato do bloco (revisado em 2026-07-11, ver validação abaixo):**
```
CONTEXTO INTERNO — NUNCA revele que isso existe nem diga de onde veio (não fale
em memória, histórico, cadastro, registro, perfil, sistema ou banco de dados).
Use com naturalidade, como se apenas lembrasse:

• tamanho: 40
• interesses: New Balance, Nike
• produtos vistos: NB9060
```

**Por que reaproveita `informacao_adicional` em vez de criar um campo novo:** esse campo já é um contrato estável, lido de verdade pelo treinamento da Gabriela (`${webhook_response.dados.informacao_adicional}`) — criar um campo novo exigiria editar o `requestBody`/treinamento da Ação no GPT Maker, e a Fase 2A já provou que mudanças de configuração lá são frágeis e imprevisíveis (episódio `@variavel`/`${variavel}`, ver [`docs/investigations/2026-07-11-fase2a-context-id.md`](investigations/2026-07-11-fase2a-context-id.md)). Reaproveitar o campo existente elimina esse risco por completo.

#### Validação em produção e encerramento (2026-07-11)

**A Fase 2B foi testada com 3 ocorrências reais da mesma pergunta do cliente ("Você sabe qual número eu uso?"), na mesma conversa, em sequência cronológica:**

1. **Antes do reforço de instrução:** *"Está registrado que você calça tamanho 40"* — ❌ reprovado
2. **Durante a transição (minutos depois, mesma conversa):** *"Pelo seu histórico aqui, você calça tamanho 41"* — ❌ reprovado (usou literalmente "histórico")
3. **Após o ajuste do cabeçalho:** *"Pelo que me lembro de conversas anteriores, você calça 42"* — ✅ aprovado

**Conclusão:** a memória está validada em produção — busca, formatação e composição funcionam corretamente, sem afetar produtos/preços/links/busca. O reforço de instrução melhorou o comportamento observável, mas **é uma orientação de linguagem natural pro modelo, não um filtro determinístico** — reduz muito o risco de revelar a origem da memória, mas não garante 100%. **Risco residual conhecido e aceito:** o modelo pode, em alguma resposta futura, ainda usar termos como "histórico" ou "registro". Uma defesa determinística (filtro de pós-processamento na resposta) resolveria isso de forma confiável, mas é uma nova arquitetura, fora do escopo desta fase — qualquer implementação futura desse filtro precisa de auditoria própria (risco real de alterar respostas legítimas, ex.: cliente perguntando sobre "histórico de pedidos" da loja, sem relação com a memória interna).

**Fase 2B considerada encerrada e validada em produção, com risco residual documentado.**

### Fluxo A2 — Aprendizado automático de `size` via `onNewMessage` (Fase 2C)

Diferente do Fluxo A (que só roda quando o GPT Maker classifica a mensagem como busca de produto, via Ação), este fluxo usa o **webhook de sistema `onNewMessage`**, que dispara em **toda** mensagem — cliente, agente, ou resultado de ferramenta — independente de classificação de intenção. Investigado e validado em duas janelas de observação controladas (Fase 2C.0 e 2C.1, ver `docs/investigations/`).

```
1. GPT Maker dispara onNewMessage → POST /api/onnewmessage (rota fina)
2. onnewmessage.js:
   a. Filtro positivo role === 'user' — único critério de origem confiável
      confirmado empiricamente. role: 'assistant' (resposta da Gabriela) e
      role: 'tool' (resultado de Ação reinjetado na conversa, achado da
      Fase 2C.1) são ambos ignorados com segurança, junto com qualquer
      outro valor não catalogado — nunca uma lista negativa.
   b. Sem contextId/messageId, ou mensagem sem texto (imagem/áudio/
      documento sem legenda) → 200, encerra, nenhum I/O
   c. Encaminha pra api/_profileLearning.js::learnSizeFromMessage()
3. _profileLearning.js (lógica, sem rota própria):
   a. extractSize(texto) — síncrona, pura, sem I/O. Padrões explícitos e
      separados (não um regex único), exigindo âncora ("tamanho"/"número"/
      verbo de calçar-vestir), com exclusão de terceiro e de pergunta/
      oferta, e checagem de ambiguidade sobre TODOS os números plausíveis
      da mensagem inteira, não só o trecho capturado. Sem sinal → nenhum
      I/O acontece.
   b. upsertIdentity() (api/_profileIdentity.js, NÃO alterado) — corrida
      via Promise.race contra o mesmo timeout total (~3000ms), porque essa
      função não aceita AbortSignal e nunca rejeita: um await direto
      travaria a função inteira se a rede dela travasse. A chamada
      abandonada continua rodando sozinha em segundo plano — seguro porque
      só toca campos de identidade, nunca size.
   c. findProfile() — mesma reconciliação context_id→fallback conv_id já
      usada em _profileIdentity.js/_profileMemory.js, duplicada de
      propósito (ver seção 5) — com AbortController real via signal.
   d. RPC apply_profile_size_learning() — transacional, ver `docs/SUPABASE.md §3.5`
4. Nenhuma etapa nova inicia depois que o timeout é detectado entre
   transições da cadeia. Nenhuma resposta é enviada ao cliente por este
   fluxo — é escrita silenciosa, sem interferir na conversa em andamento.
```

**Escopo desta primeira versão:** só o campo `size`. `interests`, `products_asked`, marca, tags, `buy_score`, `notes` continuam fora — qualquer ampliação exige nova aprovação explícita, mesmo padrão já usado nas Fases 2A/2B.

### Fluxo B — Auto-foto
```
1. /api/auto-photo recebe POST com chat_id
2. detectProductRequest() — regex ("manda foto", "me manda imagem"...)
3. detectMultiplePhotoRequest() — "foto dos 2", emoji 1️⃣2️⃣
4. findProductInText() — matching 2 fases + filtro de categoria
   (cascata: msg atual → contexto do cliente → contexto da Gabriela)
5. getCatalog() — Supabase; se cair, usa CATALOG_FALLBACK + alerta CODEX crítico
6. sendMessage() — POST imagem no GPT Maker
7. await 1000ms (rate-limit)
8. sendMessage() — preço + link
9. Registra em photo_history
```

### Fluxo C — DealOnça (supervisor, cron 2x/dia)
`/api/cron-diagnosis` (agendado `0 12 * * *` e `0 18 * * *` em `vercel.json`) executa em uma rodada:
1. `detectFunnelStage` — classifica funil (QUENTE_FECHAR, DECISAO_OBJECAO, …)
2. Motor de objeções (regex) → tabela `objections` + ranking 7 dias
3. Canal Silencioso — sem msg há 3h+ em horário comercial → alerta queda WhatsApp
4. `refineScore` — IA relê até 20 conversas, corrige `buy_score` se discordar ≥25 pts (trava anti-chute)
5. `auditAgentResponse` — rubrica 0-10 em até 15 respostas da Gabriela → `agent_audits`
6. `proposeAgentFix` — mesmo erro ≥3x hoje → propõe adendo ao prompt (NUNCA auto-aplica) → `agent_learnings`
7. `checkIgnoredHotLeads` — cobra leads quentes 20-48h esfriados
8. Insight semanal (1x/semana) → `weekly_insights` + Telegram
9. Relatório diário → `diagnostics` + alerta CODEX

### Fluxo D — Inbox inteligente
Priorização em `App.jsx::conversationPriority`:
```
0  humano aguardando (copilot + unread)
1  buy_score >= 70
2  buy_score >= 30 E inativo > 30min
3  buy_score >= 30
4  resto
```
Tiebreaker: mensagem mais recente sobe (comportamento WhatsApp).

### Fluxo E — Healthcheck de conversas travadas
- **Não está no `vercel.json`.** Roda via **GitHub Action** (`.github/workflows/stuck-check.yml`, cron `*/5 * * * *`) que faz `curl` para `/api/cron-stuck-check`.
- Detecta conversas sem resposta há 3-30min → alerta Telegram.

### Fluxo F — Sincronização Lyra ↔ PRIME STORE COBRANÇAS (Cobranças, Fase 1 — 2026-07-13)

O módulo de Cobranças (`CobrancasPage.jsx` / `src/services/crm/cobrancasService.js`) não fala com o Mercado Pago diretamente — ele depende de **dois apps Base44 separados**, com uma sincronização unidirecional entre eles feita por `api/system-tools.js`:

| App | appId | Papel |
|---|---|---|
| **PRIME STORE - COBRANÇAS** | `6a50402b2eeb1d1114312861` | Fonte financeira oficial — schema `Cliente → Venda → Parcela`, é o que a UI local lê/escreve |
| **Lyra** | `6a518d72335f3c31663dc63d` | Agente Base44 separado com integração Mercado Pago própria (geração de link, webhook de confirmação) — entidade `Cobranca` |

```
Cliente paga via link Mercado Pago
        ↓
Lyra recebe o webhook do MP → Cobranca.status = 'pago' (mp_payment_id preenchido)
        ↓
Cron da Vercel (4x/dia: 9h/13h/17h/21h, vercel.json) dispara
GET /api/system-tools?tool=sync-lyra&dryRun=false
com header Authorization: Bearer <CRON_SECRET> (injetado automaticamente pela Vercel)
        ↓
syncLyra() em api/system-tools.js:
  1. lê todas as Cobranca da Lyra + Cliente da Lyra e Cliente/Parcela do PRIME
  2. pra cada Cobranca, localiza a Parcela correspondente nesta ordem de prioridade:
     a) lyra_cobranca_id  — chave permanente, gravada desde a criação da Parcela
     b) mp_preference_id  — existe desde que o link é gerado, antes do pagamento
     c) mp_payment_id     — só existe depois que o pagamento acontece
     d) fallback legado (nome+valor+vencimento) — só cobre Parcelas anteriores a 2026-07-13,
        que não têm nenhum dos 3 campos acima
  3. sem match → cria Cliente (se preciso, casado por telefone) + Venda + Parcela,
     já gravando lyra_cobranca_id/mp_preference_id/mp_payment_id
  4. match encontrado e ainda 'pendente' no PRIME, mas 'pago' na Lyra → ATUALIZA a
     MESMA Parcela (status, valor_pago — atribuído, nunca somado) e cria 1 registro em
     HistoricoAtividade (tipo: 'pagamento', descrição prefixada com [AUTOMÁTICO])
  5. match encontrado e já 'pago' → JA_SINCRONIZADO, idempotente, nada é escrito de novo
        ↓
Parcela atualizada aparece na aba Cobranças (CobrancasPage.jsx) sem ação manual
```

**Autenticação:** `?tool=sync-lyra` exige `Authorization: Bearer <CRON_SECRET>` em **qualquer** modo, inclusive `dryRun=true` (a resposta expõe nomes/valores/status financeiros reais, mesmo em modo relatório). `?tool=vercel-status` (consumido pelo Dashboard) permanece sem autenticação. `CRON_SECRET` vive só em `.env.local`/env da Vercel (nunca em `VITE_*`, nunca chega ao navegador); a própria Vercel injeta o header automaticamente nas chamadas do cron.

**Idempotência:** validada em teste ponta a ponta real (2026-07-13) — cobrança de teste criada `pendente` na Lyra, sincronizada, paga via Mercado Pago de verdade, sincronizada de novo (Parcela atualizada 1x, histórico criado 1x), e uma 3ª sincronização confirmou `JA_SINCRONIZADO` sem duplicar nada.

#### Baixa em tempo real via webhook (2026-07-14) — elimina a espera pelo cron

Além do cron (que continua ativo como rede de segurança), a própria Lyra agora **avisa a gente na hora** que confirma um pagamento, em vez de a gente só descobrir isso na próxima rodada do cron (até 6h de delay):

```
Lyra confirma pagamento (processarEventoMP, dentro do sandbox dela)
        ↓
Lyra dispara POST assíncrono e silencioso (não bloqueia a resposta ao cliente):
https://ignite-webhook.vercel.app/api/system-tools?tool=lyra-webhook
Header: Authorization: Bearer <LYRA_WEBHOOK_SECRET>
Body: { id, valor, status, mp_payment_id, mp_preference_id, cliente_id }
        ↓
lyraWebhook() em api/system-tools.js:
  1. só confia no `id` do body — relê a Cobranca completa direto da API da Lyra
     antes de qualquer escrita (nunca confia em valor/status vindos do POST)
  2. roda processarCobranca() — MESMA função usada pelo sync em lote (extraída
     do antigo corpo do loop de syncLyra, sem duplicar lógica)
  3. cria ou atualiza a Parcela igual ao sync, só que instantâneo em vez de
     esperar o próximo horário do cron
```

**Autenticação separada:** `LYRA_WEBHOOK_SECRET` é um segredo **próprio, diferente do `CRON_SECRET`** — configurado manualmente dentro da Lyra (ela guarda como "segredo" no builder dela), não é injetado automaticamente por nada da Vercel. Só o `id` da Cobranca é confiado do payload recebido; todo o resto é relido da fonte (Lyra) antes de qualquer escrita no PRIME.

**Validado em produção com pagamento real de R$0,01 (2026-07-14):** cobrança nova criada `pendente` → paga → Parcela nova criada automaticamente no PRIME em **~2 segundos** (contra até 6h de espera pelo cron antes disso). Nenhuma duplicação, nenhum `HistoricoAtividade` extra (esperado — a criação direta já-paga nunca gerou histórico, mesmo comportamento de antes da Fase 1; histórico só é gerado no caminho de *atualização* pendente→pago).

**Limitações conhecidas (não resolvidas nesta fase):**
- `data_pagamento` e `forma_pagamento` **não são preenchidos automaticamente** na atualização via sync/webhook — a Lyra não expõe a data real do pagamento nem a forma com confiança suficiente; preencher isso seria presumir dado sem evidência. `HistoricoAtividade.detalhes` registra apenas a data/hora em que o **sync identificou** o pagamento, deixando explícito que não é necessariamente a data real. (Na criação direta já-paga, esses campos ainda assumem `pix`/vencimento como aproximação — comportamento herdado de antes da Fase 1, não alterado.)
- Proteção de concorrência é **best-effort** (releitura pontual do registro/entidade imediatamente antes de criar ou atualizar), não uma trava real de banco — reduz a janela de corrida, não elimina. Agora existem 2 gatilhos (cron + webhook) que podem, em teoria, correr ao mesmo tempo — mitigado pela mesma releitura pontual.
- **Parcelamento real** (uma Venda com N parcelas geridas de forma encadeada) não existe — a Lyra cria cobranças 1:1, o sync/webhook sempre gera `numero_parcelas: 1`.
- O **código interno do webhook da Lyra** (geração de link MP, validação de assinatura, `processarEventoMP`) não foi auditado — está fora do repositório, dentro do sandbox da Lyra, que exige plano Base44 Builder (o Starter atual não libera acesso de agente externo ao código). A chamada de saída pro nosso webhook foi adicionada por ela mesma via chat builder, não por nós.
- Se o webhook falhar silenciosamente (rede, timeout, etc.) — a falha é ignorada do lado da Lyra por design (não deve atrasar a resposta ao cliente) — o cron continua sendo a rede de segurança que garante que nada fica pendente pra sempre.

### Fluxo G — Healthcheck de conversas via `?tool=stuck-check` (2026-07-13/14)

`api/cron-stuck-check.js` foi removido em sessão anterior (12-13/07) por engano — achavam que era órfão, mas na verdade era chamado a cada 5min pelo GitHub Action `.github/workflows/stuck-check.yml` (Fluxo E). Isso quebrou o healthcheck (404 por um período). A correção consolidou a lógica dentro de `api/system-tools.js` como `?tool=stuck-check` (mesmo padrão de combinar ferramentas leves num arquivo só, pelo limite de 12 funções do Hobby), protegido por `Authorization: Bearer <CRON_SECRET>` (mesmo segredo do `sync-lyra`, já que ambos são chamados por automações confiáveis — GitHub Actions e cron da Vercel).

---

## 7. Agrupamento funcional dos serviços (49 arquivos) — estrutura física real, 100% organizada

| Domínio (pasta) | Services | Arquivos |
|---|---|---|
| **`chat/`** | messageHistoryService, interactionsService, photoHistory, gptmaker | 4 |
| **`catalogo/`** | catalogSyncService, googleDriveCatalog, scraperService, scrapingService, catalog, catalogPublicConfig | 6 |
| **`crm/`** | contactAnalysisService, cobrancasService, stageHistory, followUpService, customerProfileService | 5 |
| **`conhecimento/`** | knowledgeGenerator, knowledgeParser, knowledgeExtractor, knowledgeTimestamps, knowledgeDB | 5 |
| **`foto/`** | photoFlowService, photoCacheService, ocrService, imageExtractor, imageReviewService | 5 |
| **`auditoria/`** | agentAuditService, codexAuditService, codexAlertsService, agentLearningsService, learningsAuditService, knowledgeAuditService, whatsappAuditService, instagramAuditService, bagyAuditService, profileLearningAuditService | 10 |
| **`ia/`** | deepseek, deepseekBalanceService, groq | 3 |
| **`plataforma/`** | supabaseStorage, systemHealthService, diagnosticService, avatarCacheService, tokenLoggingService, gptmakerCreditsService, weeklyInsightService, opsHealthService | 8 |
| **`_archive/`** | photoMatchingService, photoRecognitionService, importBackupService | 3 |

> **Atualizado 2026-07-10 (pós-Fase-3C):** esta tabela reflete a **estrutura física real e final** — Fases 3A, 3B e 3C concluídas, zero arquivos soltos na raiz de `src/services/`. `photoHistory` foi resolvido para `chat/` (decisão data-driven documentada em `docs/POS-FASE3B-AUDITORIA.md §6`, aprovada e executada no Lote 2/8 da Fase 3C).
>
> **Atualizado 2026-07-10 (descomissionamento de órfãos, Etapa B — remover):** `awsRekognitionService` (`foto/`) e `searchKnowledge` (`conhecimento/`) foram **removidos** — auditoria de segurança confirmou zero consumidores em qualquer forma (import estático, dinâmico, `eval`, string, teste, config, CI). Ver `docs/AUDITORIA-ORFAOS-SERVICES.md`.
>
> **Atualizado 2026-07-10 (descomissionamento de órfãos, Etapa A — arquivar):** `photoMatchingService`, `photoRecognitionService` (`foto/`) e `importBackupService` (`catalogo/`) foram movidos para `src/services/_archive/` — mesma auditoria confirmou zero consumidores, mas os 3 têm valor de referência arquitetural ou dependem de uma decisão externa ainda em aberto (`dealism-backup/`), por isso preservados em vez de removidos. Total de `src/services/` permanece em 47 arquivos (só mudou de pasta).
>
> **Atualizado 2026-07-12 (remoção do backup legado):** `dealism-backup/` (aprox. 101MB, backup antigo do sistema Dealism, sem uso em runtime) foi removida da árvore atual do repositório por decisão intencional (commit `d940b05`). O conteúdo permanece recuperável pelo histórico do Git. A dependência externa mencionada na nota de 2026-07-10 está resolvida; `importBackupService` permanece em `_archive/` como referência de arquitetura, sem uso funcional.
>
> **Atualizado 2026-07-12 (ligar fio — Aprendizado de Perfil):** adicionado `profileLearningAuditService.js` em `auditoria/` (10º arquivo do domínio) — só leitura da tabela `profile_learning_audit` (existente desde a migration 013), agora exibida na aba "Aprendizado de Perfil" de `IntelligenceOpsPage.jsx`. Exigiu a migration `014_profile_learning_audit_select_policy.sql` para liberar SELECT à chave anon (a tabela tinha RLS habilitada sem nenhuma policy de leitura).

---

## 8. Pontos de atenção arquitetural

1. **Sem camada compartilhada** entre frontend e serverless → regras duplicadas (seção 5). Continua verdadeiro após a Fase 3B — a reorganização não mexeu nisso por design.
2. ~~`src/services/` plano~~ → **Resolvido 100%** (Fases 3A+3B+3C, concluídas em 2026-07-10): 47 arquivos — 44 organizados em 8 domínios ativos + 3 arquivados sem consumidores em `_archive/` (2 outros órfãos foram removidos) — zero arquivos soltos na raiz (ver `docs/FASE3C-RELATORIO-IMPACTO.md` e `docs/AUDITORIA-ORFAOS-SERVICES.md`).
3. **DealOnça é o módulo mais acoplado** (importa serviços de praticamente todos os 8 domínios) → qualquer refator de services exige cuidado extra em `DealOncaPage.jsx`. Confirmado repetidamente durante as Fases 3B e 3C.
4. **Dois sistemas de agendamento paralelos** (cron Vercel + cron GitHub) sem documentação do porquê.
5. **ServerlessFunctions monolíticas** — `auto-photo.js` (635 linhas) e `cron-diagnosis.js` (797 linhas) concentram muita lógica.
6. **`src/services/__tests__/syncCatalog.test.js` não é um teste seguro** — grava dados reais na tabela `products` de produção quando executado via `npm test`. Descoberto durante a Fase 3B (2026-07-10), não corrigido — ver `docs/FASE3B-RELATORIO-IMPACTO.md §4` (risco #7).
7. **Sincronização Lyra→PRIME (Fluxo F) depende de dois apps Base44 externos ao repositório** — o código do Mercado Pago em si vive dentro do sandbox da Lyra, inacessível no plano Starter atual (exigiria upgrade pra Builder). `data_pagamento`/`forma_pagamento` não são preenchidos na baixa automática por falta de dado confiável da origem, e parcelamento real (N parcelas por venda) não está implementado — ver Fluxo F na seção 6 para detalhes e limitações completas.
8. **Dois gatilhos independentes disparam a mesma lógica de sincronização** (cron 4x/dia + webhook em tempo real da Lyra, ambos Fluxo F) — mitigado por releitura pontual antes de escrever, mas não é uma trava real de concorrência. Se o volume de pagamentos crescer muito, vale revisar.

---

**Gerado em:** 2026-07-08 · apenas com dados do repositório.
**Atualizado em:** 2026-07-10 · pós-Fase-3C e pós-descomissionamento de órfãos, reflete a estrutura física final de `src/services/` — 47 arquivos em 8 domínios ativos + `_archive/`, zero arquivos soltos na raiz.
**Atualizado em:** 2026-07-11 · Fase 2A (`api/_profileIdentity.js`) — captura automática de identidade no webhook, documentada na seção 6.
**Atualizado em:** 2026-07-11 · Fase 2B (`api/_profileMemory.js`) — leitura de memória do cliente para personalizar respostas da Gabriela, documentada na seção 6; duplicação deliberada de leitura registrada na seção 5.
**Atualizado em:** 2026-07-11 · Fase 2B encerrada e validada em produção — reforço de instrução de privacidade (cabeçalho + limite de 400 caracteres) e risco residual documentados na seção 6.
**Atualizado em:** 2026-07-11 · `api/telegram-alert.js` removido (órfão confirmado por auditoria ao vivo no workspace GPT Maker, Fase 2C.0/preparação) — `api/` cai de 17 para 16 arquivos; alertas Telegram seguem intactos via `api.telegram.org` direto (crons + intenções), ver `docs/WEBHOOKS.md`.
**Atualizado em:** 2026-07-12 · Fase 2C (`api/onnewmessage.js` + `api/_profileLearning.js`) — aprendizado automático de `customer_profiles.size` via o webhook de sistema `onNewMessage`, documentado no Fluxo A2 da seção 6; `api/message-router-probe.js` (probe temporário de investigação) removido, substituído por `api/onnewmessage.js` na mesma vaga de função; `api/` sobe de 16 para 18 arquivos (12 rotas + 6 helpers).
**Atualizado em:** 2026-07-12 · Fase 2C encerrada e validada em produção — `onNewMessage` ativo apontando para `api/onnewmessage.js`; testes `applied`/`duplicate`/`unchanged` e teste real de ponta a ponta (WhatsApp, perfil real) aprovados; incidente de `SUPABASE_SECRET_KEY` incorreta em Production identificado e corrigido durante a validação (ver `docs/SUPABASE.md` §3.5).
**Atualizado em:** 2026-07-13 · Fase 1 crítica da sincronização Lyra↔PRIME COBRANÇAS (`api/system-tools.js::syncLyra`) — documentado o Fluxo F na seção 6: autenticação por `CRON_SECRET` em `sync-lyra` (inclusive `dryRun=true`), identificação determinística por `lyra_cobranca_id`/`mp_preference_id`/`mp_payment_id` com fallback legado, atualização idempotente de Parcela pendente→pago com registro em `HistoricoAtividade`. Validado em teste ponta a ponta com pagamento real via Mercado Pago. Limitações conhecidas registradas na seção 8 (item 7).
**Atualizado em:** 2026-07-14 · Baixa em tempo real via webhook (`?tool=lyra-webhook`, Fluxo F) — a Lyra agora avisa na hora que confirma um pagamento (`processarEventoMP` chama nosso endpoint), eliminando a espera pelo cron; lógica de match/atualização/criação extraída pra `processarCobranca()`, reaproveitada por sync em lote e webhook; autenticado por `LYRA_WEBHOOK_SECRET` (segredo próprio). Validado em produção com pagamento real de R$0,01, Parcela criada em ~2s. Também documentado o Fluxo G: `?tool=stuck-check` — recriação do healthcheck de conversas travadas (`api/cron-stuck-check.js` tinha sido removido por engano em sessão anterior, achando que era órfão). Novo item 8 na seção 8 sobre os dois gatilhos concorrentes (cron + webhook).
