# PRIME Bridge — Prova de Conceito (POC) da Fase 1

**Data:** 2026-07-30  
**Status:** ✅ Concluída  
**Commit:** `183f35e`  
**Objetivo:** Validar o fluxo funcional completo de uma ponte entre WhatsApp (via ZAP-API) e GPTMaker (via Conversation API)

---

## 1. Objetivo da POC

O PRIME Bridge foi criado para investigar uma alternativa ao canal nativo de WhatsApp do GPTMaker, que custa R$97/mês. A POC prova que é tecnicamente viável construir uma ponte customizada que:

- Receba mensagens de WhatsApp via webhook do provedor ZAP-API
- Processe a mensagem e consulte o GPTMaker via sua API de Conversation
- Mantenha histórico de conversa por cliente usando `contextId`
- Retorne a resposta ao cliente via ZAP-API

Se validada e estabilizada, essa ponte poderia eliminar a dependência de um canal pago, reduzindo custos operacionais.

---

## 2. Arquitetura

### Fluxo completo (ponta a ponta)

```
Cliente WhatsApp
  ↓ (envia mensagem)
ZAP-API (webhook provider)
  ↓ (POST /webhook com dados da mensagem)
PRIME Bridge (Node.js local + Cloudflare tunnel)
  ↓ (valida, filtra, prepara)
GPTMaker Conversation API
  ↓ (POST com contextId=telefone, prompt=mensagem)
GPTMaker responde
  ↓ (reply com message text)
PRIME Bridge
  ↓ (prepara payload de envio)
ZAP-API (/instances/{id}/send)
  ↓ (envia mensagem de resposta)
Cliente WhatsApp
  ↓ (recebe resposta)
Fim do ciclo
```

### Componentes principais

- **ZAP-API:** provedor de WhatsApp Business que fornece webhook com eventos (message.received, message.sent, message.status, etc.)
- **PRIME Bridge:** aplicação Node.js que roda localmente, exposta via Cloudflare Quick Tunnel; recebe webhooks, gerencia lógica de filtros, coordena chamadas
- **GPTMaker Conversation API:** endpoint `/v2/agent/{agentId}/conversation` que mantém memória de conversa por `contextId`

### Mecanismo de memória de conversa

Cada cliente (identificado por seu telefone) tem um `contextId` único no GPTMaker. Quando o cliente envia múltiplas mensagens usando o mesmo telefone, o GPTMaker acessa automaticamente o histórico anterior, permitindo que respostas usem contexto de mensagens passadas.

---

## 3. Ambiente utilizado

### Stack técnico

- **Node.js** com módulos nativos (`http`, `fetch` global)
- **Cloudflare Quick Tunnel** para expor a aplicação local na internet (usando `cloudflared`)
- **ZAP-API** (zap-api.tech) como provedor de WhatsApp Business
- **GPTMaker** endpoint oficial `https://api.gptmaker.ai/v2/agent/{agentId}/conversation`
- **Agent de teste:** "Gabi teste" (agente dedicado para esta POC)

### Configuração

- Porta local: 3344
- Variáveis de ambiente necessárias:
  - `AGENT_ID` (ID do agente no GPTMaker)
  - `GPT_TOKEN` (token de autenticação)
  - `ZAPI_INSTANCE_ID` (ID da instância na ZAP-API)
  - `ZAPI_TOKEN` (token de autenticação)
  - `DRY_RUN` (opcional, padrão: false)
  - `PORT` (opcional, padrão: 3344)
  - `ZAPI_BASE_URL` (opcional, padrão: `https://api.zap-api.tech/v1`)

**Nota:** nenhum valor específico de token, ID ou URL é registrado neste documento.

---

## 4. Testes executados

### Fase 1A: Validação em DRY_RUN (7 cenários)

Com `DRY_RUN=true`, a bridge processa o webhook mas interrompe antes de chamar GPTMaker ou ZAP-API. Foram testados os seguintes casos:

1. **Payload válido com mensagem de texto**
   - Entrada: evento `message.received`, tipo `text`, `data.phone` preenchido, `fromMe=false`
   - Esperado: mensagem processada, log "📩 Mensagem recebida", depois "🧪 DRY_RUN ativo"
   - Resultado: ✅ conforme esperado

2. **Evento de tipo incorreto (message.sent)**
   - Entrada: evento `message.sent` (mensagem saída)
   - Esperado: filtrada por verificação `event !== 'message.received'`
   - Resultado: ✅ log mostra "⏭️ Ignorado (evento não é message.received)"

3. **Mensagem própria (fromMe=true)**
   - Entrada: evento `message.received`, mas `fromMe=true`
   - Esperado: filtrada por verificação defensiva de `fromMe === true`
   - Resultado: ✅ log mostra "⏭️ Ignorado (fromMe=true — mensagem própria)"

4. **Payload sem telefone**
   - Entrada: evento `message.received`, tipo `text`, mas sem `data.phone` nem `data.from`
   - Esperado: filtrada por guard clause `if (!phone)`
   - Resultado: ✅ log mostra "⏭️ Ignorado (payload sem telefone — sem data.phone nem data.from)"

5. **Mensagem não-textual (image)**
   - Entrada: evento `message.received`, tipo `image`
   - Esperado: filtrada por verificação `type !== 'text'`
   - Resultado: ✅ log mostra "⏭️ Ignorado (não é mensagem de texto)"

6. **messageId duplicado**
   - Entrada: duas mensagens com o mesmo `messageId`
   - Esperado: primeira é aceita, segunda é filtrada por dedupe em `Set`
   - Resultado: ✅ primeira processa, segunda mostra "⏭️ Ignorado (messageId duplicado)"

7. **JSON inválido no corpo do POST**
   - Entrada: body com JSON malformado
   - Esperado: capturado no `try/catch` de parse, logado como erro, descartado
   - Resultado: ✅ log mostra "❌ Payload inválido (não é JSON)"

### Fase 1C: Testes com modo real (DRY_RUN=false, 2 mensagens)

Após validação de todos os filtros em modo seguro, duas mensagens reais foram enviadas pelo WhatsApp de teste para o número conectado na instância ZAP-API.

**Teste 1: Mensagem simples**
- Mensagem enviada: "TESTE PRIME BRIDGE 001"
- GPTMaker respondeu: "Olá! 😊 Sou a Gabriela, da PRIME STORE. Como posso ajudar no seu teste hoje? 🚀"
- Status na ZAP-API: entregue e confirmado visualmente no cliente
- Logs confirmam: uma chamada ao GPTMaker, um envio pela ZAP-API, nenhuma duplicação

**Teste 2: Teste de contexto/memória**
- Mensagem enviada: "Qual foi o código da mensagem anterior?"
- GPTMaker respondeu: "O código da mensagem anterior foi **TESTE PRIME BRIDGE 001** 😊"
- Status na ZAP-API: entregue e confirmado visualmente no cliente
- Logs confirmam: Gabriela recuperou corretamente a mensagem anterior usando o mesmo `contextId` (telefone)
- Uma chamada ao GPTMaker, um envio pela ZAP-API, nenhuma duplicação

**Verificação de loop:** durante ambos os testes, eventos `message.sent` e `message.status` foram gerados automaticamente pela ZAP-API (em resposta às respostas que enviamos). Esses eventos foram filtrados corretamente pelo `event !== 'message.received'`, impedindo reprocessamento. O filtro adicional de `fromMe === true` permanece como segunda camada defensiva caso o formato de eventos varie.

---

## 5. Correção realizada (Fase 1B)

### Problema identificado

Durante a Fase 1A (teste 4 — payload sem telefone), a bridge aceitava payloads sem `data.phone` nem `data.from`, processando-os com `phone: undefined` até atingir o bloco de DRY_RUN. Em modo real, isso teria tentado fazer uma chamada ao GPTMaker com `contextId: undefined`, causando erro.

### Solução implementada

Adicionado um guard clause no início da função `handleIncoming`, após resolver o telefone:

```javascript
if (!phone) {
  log('⏭️  Ignorado (payload sem telefone — sem data.phone nem data.from)', { messageId })
  return
}
```

**Localização:** `poc/zap-gptmaker-bridge/server.mjs`, linhas 81-84

**Posicionamento:** imediatamente após `const phone = phoneField || from`, antes do filtro de `fromMe`

**Motivo:** garantir que todo processamento subsequente tenha um identificador válido que será usado como `contextId` na API do GPTMaker

### Validação

Após a aplicação da correção, todos os 7 cenários da Fase 1A foram re-executados sem nenhuma regressão. Teste 4 agora é bloqueado corretamente.

---

## 6. Resultados dos testes reais

### Mensagem 1: "TESTE PRIME BRIDGE 001"

| Aspecto | Resultado |
|---|---|
| Recebimento | ✅ Webhook recebido em tempo real |
| Processamento | ✅ Filtros passaram, nenhuma rejeição |
| Chamada ao GPTMaker | ✅ 1 chamada, sem retry |
| Resposta | ✅ Recebida com sucesso |
| Envio pela ZAP-API | ✅ 1 envio, sem retry |
| Entrega ao cliente | ✅ Confirmada visualmente no WhatsApp |
| Contexto | N/A (primeira mensagem) |
| Loop | ✅ Sem loop detectado |
| Duplicidade | ✅ Sem duplicação |

### Mensagem 2: "Qual foi o código da mensagem anterior?"

| Aspecto | Resultado |
|---|---|
| Recebimento | ✅ Webhook recebido em tempo real |
| Processamento | ✅ Filtros passaram, nenhuma rejeição |
| Chamada ao GPTMaker | ✅ 1 chamada, contextId reutilizado do telefone |
| Resposta | ✅ Recebida com sucesso, com contexto da Msg 1 |
| Envio pela ZAP-API | ✅ 1 envio, sem retry |
| Entrega ao cliente | ✅ Confirmada visualmente no WhatsApp |
| Contexto | ✅ Gabriela recuperou "TESTE PRIME BRIDGE 001" corretamente |
| Loop | ✅ Sem loop detectado |
| Duplicidade | ✅ Sem duplicação |

**Conclusão:** O fluxo funcional foi validado com sucesso. A memória de conversa via `contextId` funciona como esperado em um ciclo de 2+ mensagens.

---

## 7. Latências observadas

### Primeira mensagem

- **Tempo total:** 4765 ms
- **Tempo estimado no GPTMaker:** ~3460 ms
- **Tempo no processamento + ZAP-API:** ~1305 ms

### Segunda mensagem

- **Tempo total:** 7679 ms
- **Tempo estimado no GPTMaker:** ~6680 ms (resposta mais longa, contexto maior)
- **Tempo no processamento + ZAP-API:** ~999 ms

### Observações

As latências variam dependendo do tamanho da resposta e do comprimento do histórico de conversa. O GPTMaker é responsável pela maior parte da latência (70-87% do tempo total). Tempos de ~4-8 segundos por ciclo são aceitáveis para um teste, mas precisarão ser avaliados em produção com volume real.

---

## 8. Lições aprendidas

1. **ZAP-API é o provedor correto** — confirmação de que a integração é com zap-api.tech (não Z-API). Header de autenticação é `Authorization: Bearer`, não `Client-Token`.

2. **Campo de telefone é data.phone nos payloads reais** — durante esta POC, o telefone sempre chegou em `data.phone`. Manter `data.from` como fallback defensivo é recomendado para robustez, mas não foi necessário nos testes.

3. **Estrutura de eventos na ZAP-API separa fluxos automaticamente** — eventos `message.received` (entrada) e `message.sent` (saída) são tipos diferentes. Filtrar por tipo de evento é suficiente para evitar loop, sem precisar verificar cada header.

4. **ContextId como identificador único funciona bem** — usar o telefone como `contextId` é uma estratégia simples e eficaz para manter histórico por cliente. O GPTMaker gerencia automaticamente o histórico no backend.

5. **LocalTunnel é instável, Cloudflare Quick Tunnel é robusto** — durante esta POC, LocalTunnel apresentou intermitências (HTTP 408). Cloudflare Quick Tunnel funcionou consistentemente em todos os testes.

6. **Validação de entrada simples previne erros sutis** — o guard clause de telefone ausente identificou uma falha de validação que não teria sido óbvia em testes mais curtos. Validação de entrada é crítica mesmo em POCs.

7. **DRY_RUN como padrão de testes é eficiente** — executar 7 cenários de teste em modo simulado primeiro, antes de ativar modo real, reduz riscos e economiza chamadas de API.

8. **Eventos gerados pela própria aplicação precisam ser ignorados** — os eventos `message.sent` e `message.status` gerados pelas respostas que enviamos chegam no webhook, mas devem ser descartados para não criar loops.

---

## 9. Limitações atuais (pendentes para produção)

| Limitação | Categoria de Risco | Descrição |
|---|---|---|
| Deduplicação em memória | Médio | `Set` de `messageId` é perdido a cada restart do processo. Reinício → risco de reprocessamento de mensagem. |
| Sem timeout nas chamadas externas | Alto | `fetch` para GPTMaker e ZAP-API não têm timeout. Chamada travada trava todo o processamento daquela mensagem. |
| Sem normalização de telefone | Médio | Telefone é aceito como-está. Formatos variáveis (com/sem 55, espaços, dashes) podem fragmentar o histórico de conversa. |
| Sem verificação de assinatura de webhook | Alto | Endpoint `/webhook` aceita qualquer POST bem formado. Sem HMAC ou segredo compartilhado. |
| Sem mascaramento de dados em log | Baixo | Telefone completo e detalhes de payload aparecem em logs. Exposição acidental em relatórios. |
| Sem taxonomia de erro estruturada | Médio | Erros são apenas logados como `err.message`. Sem distinção entre erro de validação, timeout, autenticação, rate-limit. |
| `DRY_RUN` com padrão inseguro | Médio | Ausência da variável de ambiente resulta em modo real por padrão. Deploy mal configurado executa ao vivo sem aviso. |
| Hospedagem local + túnel efêmero | Operacional | Aplicação roda em máquina local com URL temporária do Cloudflare. Adequado para testes, não para clientes reais. |
| Suporte apenas a mensagens de texto | Funcional | Imagens, áudio, documentos e outros tipos de mídia não são processados. |

---

## 10. Próxima fase em alto nível

### PRIME Bridge — Fase 2: Robustez e Preparação para Produção

Após a validação da Fase 1, a evolução natural seria incorporar melhorias de estabilidade e segurança, prioritariamente:

1. **Timeout e AbortController** — aplicar timeout de 10s nas chamadas externas (como já existe em `base44/functions/whatsappProvider/main.ts`)

2. **Normalização e validação de telefone** — reaproveitamento do padrão `normalizePhone()` já validado em produção

3. **Persistência de dedupe** — migrar de `Set` em memória para tabela no Supabase

4. **Verificação de assinatura** — implementar verificação HMAC-SHA256 no webhook (ZAP-API suporta via header `X-ZapAPI-Signature-256`)

5. **Taxonomia de erro** — estruturar respostas com `error_code` padronizado (como existe em `whatsappProvider`)

6. **Logging persistente** — enviar logs para Supabase ou serviço de observabilidade, não apenas console

7. **Segurança por padrão** — inverter `DRY_RUN` para `LIVE_MODE`, modo seguro como padrão

8. **Hospedagem persistente** — avaliar movimento para serviço Node.js gerenciado (Vercel, Railway, etc.) em vez de túnel local

Esta fase não está incluída neste documento; decisão de priorização fica para aprovação do Rafael.

---

## 11. Fase Serverless — decisão de hospedagem, POCs e Teste Funcional Final (2026-08-01)

**Contexto:** depois de Fases 2/3 (dedupe/log persistente, Gatekeeper/Tool Router/Tool API/Context Builder) e da Fase 4 (teste supervisionado real via terminal local + Cloudflare Quick Tunnel, aprovado), a pendência restante era decidir a **hospedagem definitiva** da Bridge — até então dependente de um processo manual em terminal.

### 11.1 Auditoria de hospedagem: Railway vs. Serverless (Vercel)

Auditoria técnica comparou hospedar `server.mjs` como processo persistente (Railway/Render/Fly.io/VPS) contra adaptar a Bridge para rodar como Vercel Serverless Function. Conclusão: `server.mjs` era 100% portável — toda a lógica de negócio (`handleIncoming` e dependências) já estava desacoplada de `http.createServer()`/`.listen()`. **Decisão: não contratar nenhuma hospedagem nova — adaptar para serverless na Vercel**, reaproveitando a infraestrutura já paga e administrada (projeto `ignite-webhook`). Railway, Render, Fly.io, VPS e Base44 Builder ficaram registrados como **alternativas de reserva**, só a considerar se uma limitação técnica concreta aparecesse.

### 11.2 POC 1 — casca serverless (`waitUntil`)

Validou, isoladamente (sleep artificial, sem tocar `handleIncoming`), que uma Vercel Function consegue responder `200` imediatamente e continuar processando em segundo plano via `waitUntil()` (`@vercel/functions`) — confirmado em Preview real, 5,002s de janela observada, zero chamada externa.

### 11.3 POC 2A — extração de `bridgeCore.js`

Auditoria identificou que importar `server.mjs` diretamente numa Function seria perigoso: o arquivo executa `process.exit(1)` (validação fatal de env no boot) e `http.createServer().listen()` no nível superior do módulo — ambos incompatíveis com import em ambiente serverless. Extraído `poc/zap-gptmaker-bridge/bridgeCore.js`: todo o núcleo (`handleIncoming` e dependências) movido para lá, com `getBridgeConfig(env)` e `validateRequiredEnv(config)` como funções puras, **nunca capturando env nem validando de forma fatal no import** — cada consumidor decide (o `server.mjs` local continua validando e encerrando o processo no boot; a Function decide via resposta HTTP). `server.mjs` virou só a casca HTTP local, reexportando de `bridgeCore.js`. 131 testes existentes passaram sem nenhuma edição; 8 testes novos comprovaram import seguro.

### 11.4 POC 2B.1 — `handleIncoming` real numa Function

Provou, com `LIVE_MODE=false` e dependências espiãs, que `bridgeCore.js` roda dentro de uma Vercel Function real sem tocar GPT Maker/ZAP-API/Supabase/WhatsApp — validado em Preview.

### 11.5 POC 2B.2 — Supabase controlado

Provou, via `POST` autenticado por confirmação explícita no corpo (`{"confirm":"RUN_POC_SUPABASE"}`) e validação do project ref do Supabase antes de qualquer chamada, que `processBridgeMessage`/`confirmCompletion` funcionam a partir de uma Function real: `check_or_start` → `process` → `mark_completed` → `completed`, sem nenhuma linha presa em `received`.

### 11.6 Handler definitivo e bloqueios encontrados/resolvidos

Implementado `api/_primeBridgeWebhook.js` (rota `POST /api/system-tools?tool=prime-bridge-webhook&secret=<WEBHOOK_PATH_SECRET>` — segredo via query string, não path segment, para não exigir uma 13ª Function; comparação `timingSafeEqual`; `404` uniforme para qualquer rejeição). Três problemas reais surgiram e foram diagnosticados/corrigidos em sequência, cada um com evidência de log:

1. **`401` da Vercel Deployment Protection** — bloqueava a requisição antes mesmo de chegar à Function (nenhum log de runtime, nenhuma exceção — evidência decisiva foi a ausência total de log). Corrigido usando o mecanismo oficial "Protection Bypass for Automation" (token existente recuperado via `vercel api` — não regenerado).
2. **`404` do próprio handler (`secretMatch: false`)** — diagnosticado com logs temporários seguros (`DIAG-TEMP`: método, presença/tipo/comprimento do secret recebido vs. esperado, nomes de query params, presença/tipo do body — nunca o valor) e, num segundo momento, hashes SHA-256 comparativos (nunca os valores). Causa: `WEBHOOK_PATH_SECRET` colado incorretamente na URL da ZAP-API. Corrigido recolando o valor certo.
3. **`401` da própria ZAP-API no envio (`replyOnWhatsApp`)** — GPT Maker respondia com sucesso, mas o envio de volta ao WhatsApp falhava. Causa: `ZAPI_TOKEN` desatualizado em Preview. Corrigido rotacionando só essa variável (escopo Preview, nunca Production) e reimplantando.

Todo o diagnóstico temporário (`DIAG-TEMP`, hashes SHA-256) foi removido do código definitivo após a causa raiz de cada problema ser confirmada — nunca ficou no código final, nunca apareceu em nenhum log de forma que expusesse um segredo (confirmado por testes automatizados dedicados que varrem os logs capturados).

### 11.7 Teste Funcional Final — aprovado

Deployment Preview `fd6l52jby`, mensagem real via WhatsApp, `messageId` real, sequência completa:

```
POST recebido → secretMatch=true, bodyValid=true
  → dedupe check_or_start = 'process'
  → Gatekeeper = CONTINUE
  → Tool Router / Tool API (quando aplicável, testado em mensagens subsequentes na mesma sessão)
  → Context Builder
  → GPT Maker respondeu
  → ZAP-API /send aceitou (provider_accepted)
  → resposta chegou ao WhatsApp
  → message.sent / message.status corretamente ignorados
  → mark_completed confirmado → completed
  → zero duplicidade, zero exceção
  → latência total: 4971 ms
```

**Estado final:** PRIME Bridge operacional de ponta a ponta em Vercel Serverless (Preview). Pendências reais remanescentes: rotação do `WEBHOOK_PATH_SECRET` de teste antes de uso contínuo, definição de URL/webhook estável, regras reais no Gatekeeper (hoje permissivo por decisão), e a etapa futura "GPT Tuning".

---

## Fontes de referência

- Código da bridge (núcleo): `poc/zap-gptmaker-bridge/bridgeCore.js`
- Código da bridge (casca local): `poc/zap-gptmaker-bridge/server.mjs`
- Handler serverless definitivo: `api/_primeBridgeWebhook.js` (via `api/system-tools.js`, `?tool=prime-bridge-webhook`)
- README da POC: `poc/zap-gptmaker-bridge/README.md`
- Documentação anterior: `docs/integrations/GPTMAKER-ZAPAPI-POC.md`
- Commit da correção (Fase 1B): `183f35e` ("fix: adiciona guard clause para payload sem telefone na PRIME Bridge POC")
- Padrões de produção: `base44/functions/whatsappProvider/main.ts` (referência de práticas recomendadas)

---

**Fim do documento**  
**Status:** ✅ Fase Serverless concluída — Teste Funcional Final aprovado (2026-08-01)  
**Próximo passo:** commit/push no encerramento formal da fase (aguardando aprovação do Rafael)
