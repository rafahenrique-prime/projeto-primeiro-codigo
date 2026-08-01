# POC 2 — Ponte ZAP-API Trial ↔ GPTMaker Conversation API

POC isolada e descartável. Nenhuma dependência nova, nenhum arquivo do projeto principal tocado.

**Status atual (Fase 3, Etapas 3.1-3.6 concluídas localmente):** o fluxo de
enriquecimento de contexto (Gatekeeper → Tool Router → Tool API → Context
Builder) está implementado, integrado ao `server.mjs` e coberto por 131
testes automatizados (100% locais, com mocks — nenhum passou por
GPTMaker/ZAP-API/Supabase/Tool API reais). **Ainda não foi validado contra
produção** — ver "Limitações atuais" e "Próximos passos" abaixo antes de
assumir que qualquer parte da Fase 3 já roda de verdade.

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

```bash
AGENT_ID="..." \
GPT_TOKEN="..." \
ZAPI_INSTANCE_ID="..." \
ZAPI_TOKEN="..." \
node poc/zap-gptmaker-bridge/server.mjs
```

Onde:
- `AGENT_ID` / `GPT_TOKEN` → mesmos da POC 1 (Gabi teste)
- `ZAPI_INSTANCE_ID` → ID da instância ZAP-API Trial
- `ZAPI_TOKEN` → token `tk_...` da instância (usado como `Authorization: Bearer`)
- `WEBHOOK_PATH_SECRET` → **obrigatória** (Fase 2B.1). Segredo usado como segmento privado da rota do webhook. Sem ela o servidor não inicia.

Não há Client-Token nesse provedor — a doc oficial (zap-api.tech) usa só `Authorization: Bearer tk_...`.

### Proteção do webhook (Fase 2B.1)

A rota `POST /webhook` (sem segredo) não processa mais nada — sempre responde `404`. A única rota válida é:

```
POST /webhook/<WEBHOOK_PATH_SECRET>
```

Onde `<WEBHOOK_PATH_SECRET>` é o valor exato da variável de ambiente `WEBHOOK_PATH_SECRET`. Qualquer segredo incorreto também responde `404`, sem indicar se o problema foi o segredo ou a rota em si.

Esta é uma proteção temporária — o suporte a header customizado ou assinatura HMAC no painel da ZAP-API ainda não foi confirmado; quando for, pode ser somado como camada adicional.

### Variáveis opcionais (Fase 2A)

- `LIVE_MODE` — **seguro por padrão**. Se ausente, vazio, ou diferente de exatamente `"true"` (após trim + lowercase), o servidor roda em modo seguro: recebe e valida os webhooks, mas NUNCA chama o GPTMaker nem envia mensagem real pela ZAP-API, nem acessa o Supabase, nem o Gatekeeper/Tool Router/Tool API/Context Builder são acionados. Só `LIVE_MODE=true` ativa o fluxo real completo (dedupe persistente + logging persistente + Fase 3 incluídos).
  - Substitui o antigo `DRY_RUN` (que tinha o comportamento inverso e inseguro: ausência da variável = modo real).
- `EXTERNAL_TIMEOUT_MS` — tempo máximo (em milissegundos) para cada chamada externa ao GPTMaker e à ZAP-API antes de abortar. Padrão: `10000` (10s). Valores ausentes, inválidos, negativos ou zero caem no padrão, com aviso no console.

### Variáveis do dedupe e logging persistentes (Fase 2B.2-2B.4)

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

- `IGNITE_PRIME_URL` — URL base do projeto principal (IGNITE PRIME) onde a Tool API está publicada. Tem fallback só para `NEXT_PUBLIC_VERCEL_URL` (convenção já usada no projeto principal) — nunca um domínio inventado.
- `BRIDGE_TOOLS_SECRET` — **exclusiva da PRIME Bridge.** Autentica as chamadas da Bridge à Tool API (`Authorization: Bearer`). **Nunca reutilizar `NEX_SYNC_SECRET`, `WEBHOOK_PATH_SECRET`, `SUPABASE_SECRET_KEY`, nem tokens de GPTMaker/ZAP-API** — são consumidores/integrações sem relação funcional entre si (ver `docs/SECURITY/SECRETS.md` para a análise completa de isolamento de credenciais).
- `IGNITE_TOOLS_TIMEOUT_MS` — timeout dedicado para a chamada à Tool API. Padrão: `8000` (8s).

**Segurança:** os valores reais dessas variáveis nunca devem aparecer neste
README (nem em nenhum outro arquivo commitado). O fluxo correto é: gerar
localmente → salvar imediatamente no **Apple Passwords** (fonte de verdade
do operador) → configurar no ambiente de execução como **Sensitive** → nunca
tentar recuperar o valor de volta depois disso (ver `docs/SECURITY/SECRETS.md §6`
para o processo completo).

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
IGNITE_PRIME_URL="..." \
BRIDGE_TOOLS_SECRET="..." \
IGNITE_TOOLS_TIMEOUT_MS=8000 \
node poc/zap-gptmaker-bridge/server.mjs
```

### Variável só para testes locais (Fase 2B.5)

- `GPTMAKER_BASE_URL` — **opcional, só para testabilidade local.** Se ausente, o comportamento é idêntico ao anterior: `https://api.gptmaker.ai`. Permite apontar `askGabi()` para um mock local durante testes, sem tocar o domínio real. Nunca deve ser configurada em uso normal/produção.
- `ZAPI_BASE_URL` — mesmo princípio, para `replyOnWhatsApp()`. Padrão: `https://api.zap-api.tech/v1`.

## Passo 2 — Abrir túnel público (em outro terminal)

```bash
npx localtunnel --port 3344
```

Isso imprime uma URL tipo `https://algo-aleatorio.loca.lt`. A URL do webhook será:

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

## Limitações atuais

- O Gatekeeper não tem nenhuma regra real ainda — só o modo permissivo/observação.
- A IGNITE PRIME Tool API (`?tool=consultar-produto`) **ainda não está publicada em Production** — o código existe localmente (`api/_toolConsultarProduto.js`, `api/system-tools.js`), mas não foi commitado/enviado ao GitHub, então a Vercel não o builda ainda.
- `BRIDGE_TOOLS_SECRET` **ainda não foi criada em nenhum ambiente** — não existe hoje nem em Production nem em nenhum gerenciador de senhas.
- **Nenhum teste real da Fase 3 foi executado ainda** — nem contra a Tool API real, nem contra o catálogo real do Supabase, nem via WhatsApp de verdade. Tudo até aqui é validação local com mocks.

## Próximos passos (fora do escopo desta documentação)

1. Revisão final consolidada de toda a Fase 3.
2. Commit.
3. Push.
4. Deploy (build da Vercel a partir do código publicado).
5. Gerar `BRIDGE_TOOLS_SECRET` e salvar imediatamente no Apple Passwords.
6. Configurar a variável como `Sensitive` na Vercel.
7. Teste real somente leitura (Bridge local → Tool API real → catálogo real do Supabase, sem GPTMaker/ZAP-API/WhatsApp).
8. Teste supervisionado ponta a ponta via WhatsApp.

## Encerrar a POC

`Ctrl+C` nos dois terminais (server e túnel). Nada fica rodando, nada foi instalado no projeto, nada foi commitado.
