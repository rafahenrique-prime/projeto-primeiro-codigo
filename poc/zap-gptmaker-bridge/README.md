# POC 2 — Ponte ZAP-API Trial ↔ GPTMaker Conversation API

**Status atual: fluxo completo validado ponta a ponta, em produção de teste (Vercel Preview), com hospedagem definitiva decidida.**

**Decisão arquitetural de hospedagem (2026-08-01):** a Bridge roda como
**Vercel Serverless Function**, usando `waitUntil()` (`@vercel/functions`)
para processar o webhook em segundo plano após responder `200` imediatamente
à ZAP-API. Essa abordagem foi auditada, comparada tecnicamente e validada
através de uma sequência de POCs (ver `docs/integrations/PRIME-BRIDGE-POC.md`
para o histórico completo). **Railway, Render, Fly.io, VPS e Base44 Builder
foram avaliados e ficam registrados como alternativas de reserva — nenhum
foi contratado.** A escolha por serverless evita administrar infraestrutura
nova, reaproveita a conta Vercel já existente (`ignite-webhook`), e manteve
o projeto dentro do limite de 12 Serverless Functions do plano Hobby (a
Bridge inteira vive como um `case` a mais dentro do dispatcher já existente
`api/system-tools.js`, não como Function própria).

**Handler definitivo:** [`api/_primeBridgeWebhook.js`](../../api/_primeBridgeWebhook.js)
— roteado via `POST /api/system-tools?tool=prime-bridge-webhook&secret=<WEBHOOK_PATH_SECRET>`.
Importa `handleIncoming`/`getBridgeConfig` de
[`bridgeCore.js`](./bridgeCore.js) (núcleo extraído da Bridge, sem nenhum
efeito colateral no import — seguro para rodar tanto localmente quanto numa
Function). `server.mjs` continua existindo, mas **só para uso e teste
local** (processo `http.createServer` standalone) — não é mais o caminho de
produção.

**Teste funcional final aprovado (2026-08-01, deployment Preview
`fd6l52jby`):** uma mensagem real via WhatsApp → ZAP-API → webhook Preview →
`bridgeCore.js` → Gatekeeper → Tool Router → Tool API → Context Builder →
GPT Maker → ZAP-API → WhatsApp, fechou o ciclo completo com sucesso:
- Dedupe: `check_or_start` → `process` → `mark_completed` → **`completed`**
- Gatekeeper: `CONTINUE`
- GPT Maker: respondeu corretamente
- ZAP-API `/send`: aceitou o envio (`provider_accepted`)
- Resposta chegou ao WhatsApp
- `message.sent`/`message.status` corretamente ignorados (a Bridge só
  processa `message.received`)
- **Zero duplicidade, zero exceção não tratada**
- **Latência total: 4971 ms**

A **IGNITE PRIME Tool API** (`?tool=consultar-produto`) segue publicada em
Production, validada com três testes reais contra o catálogo real do
Supabase (ver "Validação Real da Tool API" abaixo), e agora também exercida
como parte do fluxo completo (não mais só isolada).

## Visão geral e fluxo atual

```
Cliente WhatsApp
  → ZAP-API (webhook)
    → PRIME Bridge (server.mjs)
      → Gatekeeper (decide())
        → BLOCK / IGNORE / ANSWER_WITHOUT_GPTMAKER / CONTINUE
      → [se CONTINUE] Tool Router (routeTools())
        → [se alguma ferramenta casar] IGNITE PRIME Tool API
      → Context Builder (buildContext())
    → GPTMaker (Conversation API)
  → ZAP-API (envio da resposta)
→ Cliente WhatsApp
```

**Quando nenhuma ferramenta é necessária** (ex.: "Oi", "tudo bem?"), o Tool
Router não encontra nada relevante e o Context Builder devolve o **texto
original do cliente, sem nenhuma alteração** — o GPTMaker recebe exatamente
a mesma mensagem que receberia sem nenhuma dessas etapas existirem. Nenhum
custo ou latência extra é adicionado nesse caso.

## Ferramentas disponíveis (Fase 3)

**`consultar_produto`** — única ferramenta implementada até agora. Busca por
palavra-chave (marca/categoria conhecidas) na IGNITE PRIME Tool API
(`?tool=consultar-produto`, ver `docs/SECURITY/SECRETS.md` e o código em
`api/_toolConsultarProduto.js` no projeto principal).

**Importante — produto cadastrado ≠ produto em estoque.** A ferramenta só
confirma que um produto existe no catálogo (`foundInCatalog`). Ela nunca
afirma disponibilidade real (`availabilityStatus` é sempre `"unknown"`), nem
tamanho/cor confirmados (`sizeConfirmed`/`colorConfirmed` sempre `false`) —
essas informações não existem na fonte de dados atual. O Context Builder
transforma isso em instrução explícita para a IA nunca inventar preço,
estoque, tamanho ou cor.

**Fallback em erro/timeout da ferramenta:** se a Tool API falhar, der timeout,
ou devolver algo inesperado, o atendimento **continua normalmente** — o
GPTMaker ainda é chamado, só que o prompt inclui uma instrução para não
afirmar dados não confirmados. Uma falha na ferramenta nunca derruba o
atendimento.

## Gatekeeper — permissivo/observação

O `gatekeeper.js` decide, para cada mensagem, uma entre quatro ações:
`BLOCK`, `IGNORE`, `ANSWER_WITHOUT_GPTMAKER`, `CONTINUE`. **Nesta fase, o
Gatekeeper é 100% permissivo — todas as mensagens válidas (e também
entradas inválidas) resultam em `CONTINUE`.** As outras três ações existem
no contrato e estão corretamente orquestradas no `server.mjs` (dedupe
fechado de forma diferente para cada uma — ver abaixo), mas **nenhuma regra
real ainda decide bloquear, ignorar, ou responder localmente** — isso fica
para uma etapa futura.

## Dedupe e encerramento dos quatro caminhos

O dedupe persistente (Supabase, `process_bridge_message`) é fechado de forma
diferente conforme a decisão do Gatekeeper:

| Caminho | Encerramento |
|---|---|
| `BLOCK` | `mark_completed` (nunca é tratado como falha) |
| `IGNORE` | `mark_completed` |
| `ANSWER_WITHOUT_GPTMAKER` | provider aceitou → `mark_completed`; provider falhou → `mark_failed` |
| `CONTINUE` (fluxo normal) | GPTMaker/ZAP-API ok → `mark_completed`; GPTMaker ou ZAP-API falhou → `mark_failed` |

Nenhum caminho deixa uma mensagem presa em `received`, e nenhum caminho
chama `mark_failed` depois que o provedor (ZAP-API) já aceitou o envio.

## Passo 1 — Subir o servidor local

Onde:
- `AGENT_ID` / `GPT_TOKEN` → mesmos da POC 1 (Gabi teste)
- `ZAPI_INSTANCE_ID` → ID da instância ZAP-API Trial
- `ZAPI_TOKEN` → token `tk_...` da instância (usado como `Authorization: Bearer`)
- `WEBHOOK_PATH_SECRET` → **obrigatória**. Segredo usado como segmento privado da rota do webhook. Sem ela o servidor não inicia.

Não há Client-Token nesse provedor — a doc oficial (zap-api.tech) usa só `Authorization: Bearer tk_...`.

O comando completo de inicialização (com todas as variáveis, incluindo as da
Fase 3) está no final desta seção, em "Comando oficial de inicialização".

### Proteção do webhook

A rota `POST /webhook` (sem segredo) não processa mais nada — sempre responde `404`. A única rota válida é:

```
POST /webhook/<WEBHOOK_PATH_SECRET>
```

Onde `<WEBHOOK_PATH_SECRET>` é o valor exato da variável de ambiente `WEBHOOK_PATH_SECRET`. Qualquer segredo incorreto também responde `404`, sem indicar se o problema foi o segredo ou a rota em si.

Esta é uma proteção temporária — o suporte a header customizado ou assinatura HMAC no painel da ZAP-API ainda não foi confirmado; quando for, pode ser somado como camada adicional.

### Variáveis opcionais

- `LIVE_MODE` — **seguro por padrão**. Se ausente, vazio, ou diferente de exatamente `"true"` (após trim + lowercase), o servidor roda em modo seguro: recebe e valida os webhooks, mas NUNCA chama o GPTMaker nem envia mensagem real pela ZAP-API, nem acessa o Supabase, nem o Gatekeeper/Tool Router/Tool API/Context Builder são acionados. Só `LIVE_MODE=true` ativa o fluxo real completo (dedupe persistente + logging persistente + Fase 3 incluídos).
  - Substitui o antigo `DRY_RUN` (que tinha o comportamento inverso e inseguro: ausência da variável = modo real).
- `EXTERNAL_TIMEOUT_MS` — tempo máximo (em milissegundos) para cada chamada externa ao GPTMaker e à ZAP-API antes de abortar. Padrão: `10000` (10s). Valores ausentes, inválidos, negativos ou zero caem no padrão, com aviso no console.

### Variáveis do dedupe e logging persistentes

Só exigidas quando `LIVE_MODE=true` — com `LIVE_MODE=false` (ou ausente), nenhuma delas é lida nem validada, e o Supabase nunca é contatado.

- `SUPABASE_URL` (ou `VITE_SUPABASE_URL` como fallback) — URL do projeto Supabase. Não é segredo.
- `SUPABASE_SECRET_KEY` — Secret key do Supabase (autentica como `service_role`, ignora RLS). **Nunca** a anon/publishable key. Nunca logada, nunca commitada.
- `SUPABASE_TIMEOUT_MS` — timeout dedicado (mais curto que `EXTERNAL_TIMEOUT_MS`) para as chamadas ao Supabase (RPC `process_bridge_message` e inserção em `bridge_operation_logs`). Padrão: `3000` (3s).

Ver `docs/integrations/PRIME-BRIDGE-FASE2.md` para o contrato completo da RPC e o schema das tabelas (`supabase/migrations/017_bridge_message_processing.sql`, `018_bridge_operation_logs.sql`).

### Variáveis da Fase 3 — IGNITE PRIME Tool API

Só exigidas quando `LIVE_MODE=true` **e** quando uma ferramenta (ex.:
`consultar_produto`) realmente precisar chamar a Tool API. Nunca lidas nem
exigidas no boot do processo — a ausência de qualquer uma delas nunca
derruba o servidor; a ferramenta correspondente só fica indisponível
(`tool_not_configured`), sem impedir GPTMaker/ZAP-API de funcionarem.

- `IGNITE_PRIME_URL` — URL base do projeto principal (IGNITE PRIME) onde a Tool API está publicada. Em Production: `https://ignite-webhook.vercel.app`. Tem fallback só para `NEXT_PUBLIC_VERCEL_URL` (convenção já usada no projeto principal) — nunca um domínio inventado.
- `BRIDGE_TOOLS_SECRET` — **exclusiva da PRIME Bridge.** Autentica as chamadas da Bridge à Tool API (`Authorization: Bearer`). Já existe, está configurada como `Sensitive` em Production na Vercel e guardada no Apple Passwords. **Nunca reutilizar `NEX_SYNC_SECRET`, `WEBHOOK_PATH_SECRET`, `SUPABASE_SECRET_KEY`, nem tokens de GPTMaker/ZAP-API** — são consumidores/integrações sem relação funcional entre si (ver `docs/SECURITY/SECRETS.md` para a análise completa de isolamento de credenciais).
- `IGNITE_TOOLS_TIMEOUT_MS` — timeout dedicado para a chamada à Tool API. Padrão: `8000` (8s).

**Segurança:** os valores reais dessas variáveis nunca devem aparecer neste
README (nem em nenhum outro arquivo commitado). Para uso local, copiar cada
valor do Apple Passwords diretamente na linha de comando (ver "Comando
oficial de inicialização" abaixo) — nunca colar em arquivo, nunca commitar.

### Variável só para testes locais

- `GPTMAKER_BASE_URL` — **opcional, só para testabilidade local.** Se ausente, o comportamento é idêntico ao anterior: `https://api.gptmaker.ai`. Permite apontar `askGabi()` para um mock local durante testes, sem tocar o domínio real. Nunca deve ser configurada em uso normal/produção.
- `ZAPI_BASE_URL` — mesmo princípio, para `replyOnWhatsApp()`. Padrão: `https://api.zap-api.tech/v1`.

### Comando oficial de inicialização

Único comando de referência para subir a Bridge — cada valor deve ser
colado diretamente na linha (do Apple Passwords ou do gerenciador em uso),
nunca salvo em arquivo:

```bash
AGENT_ID="..." \
GPT_TOKEN="..." \
ZAPI_INSTANCE_ID="..." \
ZAPI_TOKEN="..." \
WEBHOOK_PATH_SECRET="..." \
LIVE_MODE=true \
EXTERNAL_TIMEOUT_MS=10000 \
SUPABASE_URL="..." \
SUPABASE_SECRET_KEY="..." \
SUPABASE_TIMEOUT_MS=3000 \
IGNITE_PRIME_URL="https://ignite-webhook.vercel.app" \
BRIDGE_TOOLS_SECRET="..." \
IGNITE_TOOLS_TIMEOUT_MS=8000 \
node poc/zap-gptmaker-bridge/server.mjs
```

## Passo 2 — Abrir túnel público (em outro terminal)

**Cloudflare Quick Tunnel é a opção recomendada** — mais estável que
LocalTunnel (que sofre com erros 408 intermitentes):

```bash
cloudflared tunnel --url http://localhost:3344
```

Isso imprime uma URL tipo `https://palavra-aleatoria.trycloudflare.com`. A URL do webhook será:

```
https://palavra-aleatoria.trycloudflare.com/webhook/<WEBHOOK_PATH_SECRET>
```

**Alternativa (LocalTunnel)** — funcional, mas menos estável:

```bash
npx localtunnel --port 3344
```

```
https://algo-aleatorio.loca.lt/webhook/<WEBHOOK_PATH_SECRET>
```

## Passo 3 — Configurar o webhook na ZAP-API Trial

No painel da instância Trial, configurar o Webhook para o evento `message.received`, colando a URL do túnel + `/webhook/<WEBHOOK_PATH_SECRET>` (ver "Proteção do webhook" acima).

## Passo 4 — Testar

Do celular, mandar "teste prime" pro número de teste conectado na instância Trial.

Acompanhar os logs no terminal do `server.mjs` — cada etapa é impressa (recebido → Gatekeeper decidiu → [ferramenta casou/concluída, se aplicável] → contexto construído → chamando Gabi → resposta → enviando → latência total).

## Testes automatizados

**131/131 testes passando** (`npx vitest run poc/zap-gptmaker-bridge/__tests__/`),
100% locais — nenhum toca GPTMaker, ZAP-API, Supabase ou a Tool API reais:

- `gatekeeper.test.js` — 14 testes
- `toolRouter.test.js` — 28 testes
- `consultarProduto.test.js` — 31 testes
- `contextBuilder.test.js` — 33 testes
- `server.integration.test.js` — 25 testes (integração real do `server.mjs`, todo I/O externo mockado)

## Validação Real da Tool API

A IGNITE PRIME Tool API (`?tool=consultar-produto`) foi validada em
Production contra o catálogo real do Supabase, com três chamadas isoladas
(Bridge/cliente local → Tool API real → Supabase real), sem passar por
GPTMaker, ZAP-API ou WhatsApp em nenhum momento.

**Teste A — produto encontrado** (`query: "Nike Dunk"`)
`foundInCatalog: true`, 3 resultados (`truncated: true`, `ambiguous: true` —
catálogo tem mais de 3 produtos correspondentes ao termo).

**Teste B — produto inexistente** (`query: "ProdutoInexistenteXYZ987654321"`)
`foundInCatalog: false`, `results: []`.

**Teste C — tamanho solicitado** (`query: "Nike Dunk Cacau"`, `requestedSize: "41"`)
`requestedSize` preservado na resposta; `sizeConfirmed` permanece `false`.

**Fatos confirmados empiricamente nos três testes, sem exceção:**
- `availabilityStatus` sempre `"unknown"` — a Tool API nunca afirma disponibilidade real.
- `sizeConfirmed` sempre `false`.
- `colorConfirmed` sempre `false`.
- Allowlist de campos respeitada em todo resultado: somente `nome`, `preco`, `link`, `imagem` — nenhum campo extra.
- Somente leitura — nenhuma escrita no Supabase em nenhum dos três testes.
- Nenhum acionamento de GPTMaker.
- Nenhum acionamento da ZAP-API.
- Nenhum acionamento do WhatsApp.

## Estado Atual da Validação

| Componente | Status |
|------------|--------|
| Tool API consultar-produto | ✅ Validada em Production |
| BRIDGE_TOOLS_SECRET | ✅ Configurada (Production e Preview) |
| Contrato da Tool API | ✅ Validado |
| Gatekeeper | ✅ Validado em Preview real (`CONTINUE`) |
| Tool Router | ✅ Validado em Preview real (`consultar_produto` executada com sucesso em testes) |
| Context Builder | ✅ Validado em Preview real |
| GPTMaker | ✅ Validado em Preview real |
| ZAP-API | ✅ Validado em Preview real (`provider_accepted`) |
| Fluxo WhatsApp ponta a ponta | ✅ **Validado em Preview real — teste funcional final aprovado** |
| Hospedagem serverless (Vercel + waitUntil) | ✅ Aprovada e definitiva |
| Dedupe persistente (Supabase) | ✅ Validado (`completed`, sem linha presa em `received`) |

## Variáveis de ambiente necessárias (Preview) — só nomes, nunca valores

`AGENT_ID`, `GPT_TOKEN`, `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `WEBHOOK_PATH_SECRET`,
`IGNITE_PRIME_URL`, `BRIDGE_TOOLS_SECRET`, `LIVE_MODE`, `SUPABASE_SECRET_KEY`
(ou `VITE_SUPABASE_URL`/`SUPABASE_URL` como fallback). Cadastradas via
`vercel env add <NOME> preview` — nunca em Production através desta POC, e
os valores nunca aparecem em nenhum log (confirmado por testes automatizados
dedicados) nem em nenhum documento deste projeto.

## Pendências reais restantes (fora do escopo desta fase)

- Rotação do `WEBHOOK_PATH_SECRET` de teste antes de qualquer uso contínuo/produção (decisão já registrada anteriormente).
- Definição de URL/webhook estável e permanente na ZAP-API (o webhook de teste é desativado manualmente após cada validação).
- Regras reais no Gatekeeper (hoje 100% permissivo, por decisão consciente).
- Etapa futura "GPT Tuning" — alinhar a Gabriela usando os recursos nativos do GPT Maker, comparando o canal oficial com o canal ZAP-API+Bridge.

## Encerrar a POC / uso local

`Ctrl+C` no terminal do `server.mjs` (uso local/desenvolvimento). Em Preview/produção, o handler roda como Vercel Function (`api/_primeBridgeWebhook.js`) — não há processo para encerrar manualmente; desativar o webhook no painel da ZAP-API é suficiente para parar o recebimento de eventos.
