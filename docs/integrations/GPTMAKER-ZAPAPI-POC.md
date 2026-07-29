# POC — GPTMaker Conversation API + ZAP-API

**Período:** 2026-07-28 a 2026-07-29
**Status:** POC concluída e encerrada com sucesso. Ambiente de teste desligado.
**Produção:** não alterada em nenhum momento.

---

## 1. Resumo executivo

Esta POC testou se era possível substituir o canal de WhatsApp nativo do GPTMaker (que custa R$ 97/mês) por uma arquitetura própria: WhatsApp conectado via ZAP-API, uma bridge Node isolada fazendo a orquestração, e o GPTMaker atuando apenas como "cérebro" de resposta através da sua Conversation API.

O teste final, com uma mensagem real enviada por WhatsApp, funcionou de ponta a ponta: a mensagem chegou, foi processada, a Gabi teste respondeu, e a resposta voltou ao WhatsApp do remetente — sem loop, sem duplicação, em cerca de 3,3 segundos.

A POC provou que a arquitetura funciona tecnicamente. Ela não prova, e não tinha como provar, que essa arquitetura está pronta para atender clientes reais — isso depende de trabalho adicional descrito nas seções 15 a 18.

---

## 2. Objetivo da POC

Validar, com o menor risco e esforço possível, se a seguinte cadeia funciona de ponta a ponta:

```
WhatsApp → ZAP-API → Bridge Node → GPTMaker Conversation API → Bridge Node → ZAP-API → WhatsApp
```

Critério de sucesso definido antes de começar: enviar uma mensagem de teste pelo WhatsApp e receber de volta uma resposta gerada pela Gabi teste (agente de teste no GPTMaker), sem alterar nada do ambiente de produção do IGNITE PRIME.

---

## 3. Escopo e isolamento da produção

A POC foi conduzida sob as seguintes restrições, respeitadas do início ao fim:

- Nenhum arquivo do projeto principal (`src/`, `api/`, services existentes) foi alterado.
- Nenhum commit foi feito.
- Nenhum deploy foi feito.
- Nenhuma credencial de produção foi usada — apenas token temporário do GPTMaker (agente "Gabi teste") e instância Trial da ZAP-API (conta separada "TESTE", número de WhatsApp de teste).
- Todo o código novo ficou isolado dentro da pasta `poc/`.
- Confirmado via `git status` ao final: a pasta `poc/` inteira aparece como não rastreada (`??`), sem nenhuma modificação em arquivos existentes do repositório.

---

## 4. Arquitetura validada

```
WhatsApp (número de teste)
    ↓
ZAP-API (instância Trial) — webhook "message.received"
    ↓
Bridge Node (poc/zap-gptmaker-bridge/server.mjs)
    ↓
GPTMaker Conversation API (agente "Gabi teste")
    ↓
Bridge Node
    ↓
ZAP-API — endpoint /send
    ↓
WhatsApp (número de teste)
```

A bridge é o único componente novo. GPTMaker e ZAP-API são serviços de terceiros já existentes, usados via API pública.

---

## 5. Estrutura de arquivos da POC

```
poc/
├── gptmaker-conversation-test/
│   └── gptmaker-conversation-test.mjs   (POC 1 — teste isolado da Conversation API)
└── zap-gptmaker-bridge/
    ├── server.mjs                        (POC 2 — bridge completa)
    └── README.md                         (instruções de uso da bridge)
```

Nenhuma dependência externa foi instalada — os dois scripts usam apenas módulos nativos do Node (`http`, `fetch` global). Nenhum `package.json` do projeto foi tocado.

---

## 6. Configurações e variáveis de ambiente

A bridge (`server.mjs`) é configurada inteiramente via variáveis de ambiente, passadas na hora de iniciar o processo — nenhuma credencial fica hardcoded no código:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `AGENT_ID` | Sim | ID do agente no GPTMaker (Gabi teste) |
| `GPT_TOKEN` | Sim | Token de autenticação do GPTMaker |
| `ZAPI_INSTANCE_ID` | Sim | ID da instância Trial na ZAP-API |
| `ZAPI_TOKEN` | Sim | Token `tk_...` da instância ZAP-API |
| `ZAPI_BASE_URL` | Não | Base da API da ZAP-API — default `https://api.zap-api.tech/v1` |
| `DRY_RUN` | Não | Se `"true"`, intercepta o fluxo antes de chamar GPTMaker ou ZAP-API. Qualquer outro valor (incluindo variável ausente) resulta em modo real. |
| `PORT` | Não | Porta local do servidor — default `3344` |

⚠️ **Ponto de atenção registrado:** como o valor é lido com `process.env.DRY_RUN === 'true'`, a ausência da variável já significa modo real (`false`), não modo seguro. Isso está detalhado na seção 15.

---

## 7. Fluxo completo de mensagens

1. ZAP-API recebe uma mensagem no WhatsApp da instância Trial e dispara um webhook `POST /webhook` para a bridge.
2. A bridge responde `HTTP 200` imediatamente, antes de processar (evita deixar a ZAP-API esperando).
3. A bridge filtra o evento: só segue adiante se `event === 'message.received'`.
4. Extrai `phone` do campo `data.phone` (com fallback para `data.from`), `text` de `data.body`, `messageId` de `data.messageId`.
5. Se `data.fromMe === true`, descarta imediatamente (mensagem originada pelo próprio número).
6. Se não for texto, descarta.
7. Deduplica por `messageId` usando um `Set` em memória.
8. Se `DRY_RUN` estiver ativo, registra o recebimento no log e para — não chama nada externamente.
9. Caso contrário, chama a Conversation API do GPTMaker (`POST /v2/agent/{agentId}/conversation`) usando `contextId = phone` e `prompt = text`.
10. Recebe a resposta da Gabi e envia via ZAP-API (`POST /instances/{id}/send`, `{ phone, type: "text", body: resposta }`).
11. Registra a latência total do ciclo.

---

## 8. Testes executados

### Testes intermediários

| Teste | O que validou | Resultado |
|---|---|---|
| Conversation API isolada (`poc-teste-fixo-001`, prompt "teste prime") | Que a Conversation API do GPTMaker responde e mantém `contextId` | ✅ HTTP 200, ~2259ms |
| Payload simulado via `curl` (`dryruncheck3`, `tunnelcheck`) | Que a bridge recebe webhook e o `DRY_RUN` intercepta corretamente | ✅ |
| Evento `instance.test` via Webhook Tester da ZAP-API | Que o filtro de evento ignora eventos que não são `message.received` | ✅ Ignorado corretamente |
| Evento `instance.connected` | Confirmar reconexão da instância WhatsApp Trial | ✅ Recebido e ignorado corretamente |
| Mensagens reais "teste prime" e "Entrada brigde 001" via LocalTunnel | Entrega real via túnel gratuito | ❌ Não chegaram à bridge — `HTTP 408` no lado da ZAP-API (ver seção 11) |
| Diagnóstico manual repetido (`diag-check`, `diag-1`, `diag-2`, `diag-3`) | Isolar se a falha era da ZAP-API, da bridge ou do túnel | Confirmou instabilidade intermitente do LocalTunnel — reproduzida diretamente |
| "Teste Cloudflare 001" (mensagem real, primeira via Cloudflare Tunnel) | Confirmar entrega estável pelo novo túnel | ✅ Chegou — e revelou que o payload real usa `data.phone`, não `data.from` (ver seção 11) |
| `cf-check-20260728-001` (payload simulado) | Validar conectividade do Cloudflare Tunnel antes de trocar a URL no painel | ✅ HTTP 200 |
| `fix-check-001` (payload simulado) | Validar a correção do mapeamento `phone` | ✅ `phone` resolvido corretamente |
| `fromme-true-check` / `fromme-false-check` (payloads simulados) | Validar a proteção contra `fromMe` | ✅ Mensagem própria ignorada; mensagem de cliente seguiu o fluxo normalmente |
| Validação do `DRY_RUN` em todos os testes acima | Garantir que nenhuma chamada real a GPTMaker/ZAP-API ocorresse durante a fase de testes | ✅ Confirmado em cada teste, via log |

### Teste final

Único teste com `DRY_RUN=false`, mensagem real, ciclo completo — descrito em detalhe na seção 9.

---

## 9. Resultado do teste final

| Item | Valor |
|---|---|
| Mensagem enviada | "Teste final 001" |
| Telefone de origem | `553491791296` |
| `contextId` usado na Conversation API | `553491791296` (igual ao telefone, por decisão de design) |
| Resposta da Gabi teste | "Olá! Bem-vindo à PRIME STORE! 😊 Sou a Gabriela. Como posso te ajudar hoje? 🚀" |
| Tempo de resposta do GPTMaker | ≈ 2,3 segundos |
| Latência total do ciclo (recebimento → resposta entregue) | 3280ms |
| Loop | Não ocorreu |
| Duplicação de resposta | Não ocorreu |
| Resultado | ✅ Sucesso |

A própria resposta enviada pela bridge gerou, do lado da ZAP-API, um evento `message.sent` (não `message.received`) — que foi corretamente ignorado pela bridge, confirmando que não houve reprocessamento.

---

## 10. Descobertas técnicas

- O payload real de webhook da ZAP-API usa o campo **`data.phone`** para identificar o remetente — a documentação consultada durante a POC indicava `data.from`, o que gerava `phone: undefined` até a correção.
- A ZAP-API real (zap-api.tech) autentica apenas com `Authorization: Bearer tk_...` — não existe "Client-Token" separado, apesar de uma referência inicial (de outro provedor, Z-API) sugerir isso.
- A ZAP-API separa claramente eventos de entrada (`message.received`) de eventos de saída (`message.sent`) e de status (`message.status`) — não existe um único evento genérico com um campo de direção.
- O LocalTunnel gratuito apresentou falhas **intermitentes** com `HTTP 408`, inclusive reproduzidas de forma independente (fora do fluxo da ZAP-API, via `curl` direto), enquanto outros eventos chegavam normalmente na mesma janela de tempo e na mesma URL.
- O Cloudflare Quick Tunnel (`cloudflared tunnel --url ...`) funcionou de forma estável em todos os testes realizados após a troca, sem nenhuma falha observada.
- A mensagem promocional observada durante a POC foi identificada, após investigação manual do usuário nos painéis da ZAP-API e do WhatsApp Business, como sendo a **mensagem de saudação nativa do WhatsApp Business** da loja. Ela não foi enviada pela bridge, nem pelo GPTMaker, nem pela ZAP-API — é um recurso nativo do próprio WhatsApp Business, não uma automação desconhecida.
- `DRY_RUN` depende inteiramente da variável de ambiente estar presente e igual à string `"true"`; sem isso, o código roda em modo real por padrão.
- A deduplicação de mensagens (`messageId`) está implementada apenas em memória (`Set`), sendo perdida a cada reinício do processo.
- A POC processa exclusivamente mensagens de texto — imagem, áudio, vídeo e documento não foram implementados nem testados.
- Rate limit da Conversation API do GPTMaker: **não auditado durante a POC.**

---

## 11. Problemas encontrados e soluções

| Problema | Causa raiz | Solução aplicada |
|---|---|---|
| `phone: undefined` nos logs, mesmo com mensagem real chegando | Código lia `data.from`; payload real usa `data.phone` | `const phone = data.phone \|\| data.from` (mantém compatibilidade com ambos os nomes) |
| Duas mensagens reais ("teste prime", "Entrada brigde 001") não chegaram à bridge | Instabilidade intermitente do LocalTunnel gratuito — confirmada via Webhook Logs da ZAP-API (`message.received` retornando 408 enquanto `message.sent`/`message.status` na mesma janela retornavam 200) e reproduzida via `curl` direto | Substituição do LocalTunnel pelo Cloudflare Quick Tunnel (`cloudflared`) |
| Endpoint `/connect` da ZAP-API retornando timeout/502 | Instabilidade do backend da própria ZAP-API (confirmada inclusive no painel oficial deles, fora do controle da bridge) | Nenhuma ação do lado da bridge — aguardou normalização do lado do fornecedor |
| Ausência de proteção explícita contra mensagens enviadas pelo próprio número (`fromMe`) | Não fazia parte do código original — dependia apenas do filtro de tipo de evento | Filtro adicional `if (data?.fromMe === true) return` (ver seção 12) |

---

## 12. Proteções implementadas

Existem **duas camadas independentes** de proteção contra loop, com propósitos diferentes:

1. **Filtro estrutural por tipo de evento** (`if (event !== 'message.received') return`, existente desde a primeira versão da bridge): a ZAP-API já separa mensagens recebidas (`message.received`) de mensagens enviadas (`message.sent`). Como a bridge só processa `message.received`, a própria resposta que ela envia — que gera um evento `message.sent` do lado da ZAP-API — nunca é reprocessada. Essa é a proteção estrutural, baseada em como a ZAP-API modela os eventos.

2. **Filtro explícito por `data.fromMe === true`** (adicionado depois, durante a auditoria de pré-produção): protege contra o cenário em que, por mudança de comportamento do provedor ou bug pontual, uma mensagem originada pelo próprio número chegue rotulada como `message.received`. Sem essa camada, a proteção dependeria inteiramente do comportamento atual da ZAP-API se manter — o que é uma suposição sobre um sistema de terceiros, não uma garantia do próprio código.

As duas camadas juntas tornam a proteção contra loop menos dependente de uma única suposição sobre o comportamento do fornecedor.

---

## 13. O que a POC provou

- A Conversation API do GPTMaker responde corretamente e mantém contexto por `contextId`.
- É possível receber mensagens reais de WhatsApp via webhook da ZAP-API.
- É possível orquestrar o ciclo completo (recebimento → GPTMaker → envio) numa bridge própria, sem o canal nativo do GPTMaker.
- O ciclo completo funciona sem loop e sem duplicação, com as proteções implementadas.
- A latência do ciclo completo, num teste isolado, ficou em torno de 3,3 segundos.

---

## 14. O que a POC não provou

- Comportamento sob concorrência (múltiplas mensagens simultâneas, de números diferentes ou do mesmo número).
- Comportamento com mensagens em sequência rápida do mesmo remetente.
- Comportamento em caso de falha do GPTMaker (indisponibilidade, timeout, erro 5xx).
- Comportamento em caso de falha da ZAP-API (já observada de forma real durante a POC, mas fora de um teste controlado).
- Comportamento em caso de reinício do processo da bridge no meio de um processamento.
- Limites reais de uso/volume da Conversation API (rate limit).
- Comportamento com tipos de mensagem além de texto.
- Estabilidade em uso contínuo por período prolongado (a POC rodou por poucas horas, em ambiente local).

---

## 15. Riscos para produção

- Concorrência não testada — duas mensagens quase simultâneas do mesmo número podem gerar duas chamadas paralelas ao GPTMaker com o mesmo `contextId`.
- Falha do GPTMaker não testada — não há tratamento definido para quando a Conversation API não responde.
- Falha da ZAP-API não testada de forma controlada — mas já observada como evento real durante a POC (instabilidade do endpoint `/connect`, visível inclusive no painel oficial do fornecedor).
- Reinício do processo no meio do processamento não testado — não há persistência de estado.
- Rate limit da Conversation API não auditado — não se sabe o comportamento em volume real de mensagens.
- Não há retry, timeout explícito, fila ou persistência implementados.
- Logs atuais existem apenas no console do processo — não sobrevivem a um reinício e não são consultáveis depois do fato.
- Deduplicação em memória — perdida a cada reinício, reabrindo janela de reprocessamento em caso de reentrega pela ZAP-API.

---

## 16. Auditoria Técnica

**Fatos encontrados:**
- `DRY_RUN` inseguro por padrão: ausência da variável de ambiente resulta em modo real (`false`), não em modo seguro.
- Nenhuma chamada `fetch` no código atual tem timeout explícito configurado — uma chamada pendurada ao GPTMaker ou à ZAP-API ficaria aguardando indefinidamente.
- A deduplicação por `messageId` é feita com um `Set` em memória, sem persistência.
- Não existe fila, lock ou serialização por telefone — mensagens do mesmo remetente em sequência rápida seriam processadas em paralelo, sem garantia de ordem na resposta.
- A bridge suporta apenas mensagens de texto; qualquer outro tipo (`data.type !== 'text'`) é descartado silenciosamente (apenas logado).

**Riscos identificados:** listados na íntegra na seção 15.

**Pendências antes da produção:** listadas na íntegra na seção 17.

---

## 17. Requisitos obrigatórios antes de produção

- Persistência de deduplicação (Supabase ou Redis), substituindo o `Set` em memória.
- Fila ou lock por `contextId`/telefone, para serializar mensagens do mesmo remetente.
- Timeout explícito em toda chamada HTTP externa (GPTMaker e ZAP-API).
- Retry com backoff no envio da resposta via ZAP-API.
- Logging estruturado e persistente (não apenas `console.log` em processo efêmero).
- Hospedagem estável (serviço Node persistente), substituindo o modelo de túnel local + processo na máquina do desenvolvedor.
- `LIVE_MODE` (ou equivalente) seguro por padrão — modo real precisa ser uma ativação explícita, não a ausência de uma flag.
- Confirmação de limites de uso da Conversation API junto ao suporte do GPTMaker.

---

## 18. Itens que podem ficar para fase 2

- Suporte a imagem, áudio, vídeo e documento.
- Suporte a múltiplos agentes/instâncias.
- Dashboard de observabilidade.
- Uso de `callbackUrl` (resposta assíncrona) em vez do modelo síncrono atual.
- Métricas históricas de latência e volume.

---

## 19. Procedimento seguro para repetir a POC

1. Confirmar que nenhum processo antigo da bridge ou de túnel está rodando (`pgrep -fl server.mjs`, `pgrep -fl cloudflared`, `pgrep -fl localtunnel`).
2. Iniciar a bridge **sempre com `DRY_RUN=true`** primeiro:
   ```bash
   AGENT_ID="..." GPT_TOKEN="..." ZAPI_INSTANCE_ID="..." ZAPI_TOKEN="..." DRY_RUN=true node poc/zap-gptmaker-bridge/server.mjs
   ```
3. Subir um túnel público com Cloudflare (preferível ao LocalTunnel, por estabilidade observada nesta POC):
   ```bash
   cloudflared tunnel --url http://localhost:3344
   ```
4. Validar conectividade com um `POST` simulado antes de configurar o webhook real na ZAP-API.
5. Configurar a URL do túnel no painel da ZAP-API, evento `message.received`.
6. Enviar uma mensagem real e conferir, em `DRY_RUN=true`, que o payload chega, o `phone` é resolvido corretamente e o fluxo para antes de qualquer chamada externa.
7. Só então reiniciar com `DRY_RUN=false` para o teste real completo.
8. Encerrar sempre revertendo para `DRY_RUN=true` antes de derrubar o processo (boa prática, ainda que o efeito só valha para a próxima subida).

---

## 20. Procedimento de encerramento

Executado ao final desta POC, nesta ordem:

1. Servidor Node reiniciado com `DRY_RUN=true` (para deixar registrado explicitamente antes de encerrar).
2. Processo do servidor Node encerrado.
3. Processo do Cloudflare Tunnel encerrado.
4. Processo remanescente do LocalTunnel (de uma etapa anterior da POC) identificado e encerrado.
5. Confirmado, via `pgrep`, que nenhum processo de servidor ou túnel da POC permanecia ativo.
6. Nenhum arquivo alterado, nenhum commit, nenhum deploy.

---

## 21. Decisões Arquiteturais

Decisões efetivamente tomadas durante esta POC:

- O GPTMaker será utilizado como "cérebro" de resposta (via Conversation API), não como canal de WhatsApp.
- A ZAP-API será responsável pelo transporte do WhatsApp (entrada e saída de mensagens).
- Uma bridge própria será responsável pela orquestração entre os dois.
- A POC permanece isolada da produção — nenhum componente dela será promovido diretamente.
- A produção, quando implementada, será um **projeto novo**, não uma evolução direta dos arquivos desta POC.
- O canal de WhatsApp atual do GPTMaker (R$ 97/mês) só será cancelado depois que a nova arquitetura provar estabilidade rodando em produção.

---

## 22. Plano recomendado para PRIME Bridge 1.0

1. Investigar e documentar completamente a automação de saudação do WhatsApp Business (já identificada como nativa — seção 10), garantindo que ela não gere confusão quando a bridge de produção entrar no ar.
2. Confirmar com o suporte do GPTMaker os limites de uso/rate limit da Conversation API em volume real.
3. Criar um projeto novo (fora de `poc/`), com:
   - fila/lock por telefone;
   - deduplicação persistente (Supabase);
   - timeout e retry em toda chamada externa;
   - `LIVE_MODE` seguro por padrão;
   - logging estruturado e persistente.
4. Hospedar em um serviço Node persistente (não serverless sem estado, e não túnel local).
5. Rodar em paralelo com o canal atual do GPTMaker por 1 a 2 semanas, monitorando de perto.
6. Só então avaliar a migração definitiva e o cancelamento do canal de R$ 97.

---

## 23. Critérios para cancelar o canal do GPTMaker de R$ 97

O cancelamento só deve ocorrer quando **todos** os critérios abaixo forem atendidos:

- A nova bridge estiver rodando em produção, hospedada de forma estável (não mais em máquina local nem túnel efêmero).
- Tiver rodado em paralelo ao canal atual por pelo menos 1 a 2 semanas sem incidentes relevantes.
- Os requisitos obrigatórios da seção 17 estiverem implementados (persistência, fila, timeout/retry, logging).
- A automação de saudação nativa do WhatsApp Business (seção 10) estiver compreendida e não gerar conflito com a nova bridge.
- Houver monitoramento ativo capaz de alertar sobre falhas na nova arquitetura.

---

## 24. Lições Aprendidas

Registradas para economizar tempo de quem repetir ou evoluir esta POC:

- **Nunca confiar apenas na documentação de terceiros sem validar o payload real** — a documentação da ZAP-API indicava `data.from`; o payload real usa `data.phone`. Só foi descoberto processando uma mensagem real de verdade.
- **Sempre testar primeiro em `DRY_RUN`** — permitiu validar payload, mapeamento de telefone, `contextId` e proteção `fromMe` sem nenhum risco de chamar GPTMaker ou enviar mensagens reais por engano.
- **Validar o `phone` antes de confiar no `contextId`** — um campo mal mapeado silenciosamente (`undefined`) só foi percebido porque o log registrava o valor resolvido, não apenas o payload bruto.
- **Preferir Cloudflare Quick Tunnel a LocalTunnel gratuito para desenvolvimento** — o LocalTunnel gratuito se mostrou instável de forma intermitente e difícil de diagnosticar (a mesma URL funcionava para alguns eventos e falhava para outros, no mesmo intervalo de tempo).
- **Não assumir que todos os tipos de evento de um webhook se comportam da mesma forma** — `message.sent`, `message.status` e `message.received` tiveram taxas de sucesso diferentes contra o mesmo túnel na mesma janela de tempo; isolar por tipo de evento ajudou a identificar que o problema não era sistemático.
- **Isolar completamente a produção desde o primeiro commit da POC** — nenhuma dúvida surgiu, durante todo o processo, sobre se algo tinha vazado para produção, porque o isolamento foi definido e respeitado desde o início.
- **Corrigir um problema por vez, com diagnóstico antes da correção** — cada mudança no código (mapeamento de `phone`, proteção `fromMe`) foi precedida de uma auditoria somente-leitura mostrando exatamente o que estava errado, o que evitou correções especulativas.
- **Documentar cada descoberta antes de continuar** — a auditoria de pré-produção (seção 12) só identificou a lacuna do `fromMe` porque o fluxo já estava documentado passo a passo; sem isso, a lacuna provavelmente passaria despercebida até acontecer em produção.
- **Verificar processos remanescentes ao trocar de ferramenta** — ao trocar de LocalTunnel para Cloudflare Tunnel, um processo antigo do LocalTunnel continuou rodando sem necessidade até ser identificado e encerrado manualmente mais tarde.
- **Uma resposta automática observada no WhatsApp durante testes não é necessariamente parte do sistema que está sendo construído** — a mensagem promocional que pareceu, a princípio, uma automação desconhecida era na verdade um recurso nativo do WhatsApp Business, não relacionado à bridge, ao GPTMaker ou à ZAP-API. Vale sempre investigar a origem antes de assumir que é parte do próprio fluxo.

---

## 25. Histórico cronológico resumido

1. Auditoria inicial da Conversation API do GPTMaker (documentação + teste isolado).
2. POC 1: teste isolado da Conversation API — sucesso.
3. Auditoria da ZAP-API (payload de webhook, endpoint de envio).
4. POC 2: criação da bridge (`server.mjs`), com filtro de evento e dedupe por `messageId`.
5. Primeiros testes de webhook via LocalTunnel — sucesso nos testes simulados e no evento `instance.test`.
6. Instabilidade da instância ZAP-API Trial (`/connect` com timeout/502) — diagnóstico técnico realizado, causa raiz atribuída ao backend do fornecedor.
7. Instância reconectada — evento `instance.connected` recebido com sucesso.
8. Mensagens reais ("teste prime", "Entrada brigde 001") não chegaram à bridge — diagnóstico apontou `HTTP 408` intermitente do LocalTunnel, confirmado nos Webhook Logs da ZAP-API e reproduzido manualmente.
9. Instalação e adoção do Cloudflare Quick Tunnel como substituto.
10. Mensagem real "Teste Cloudflare 001" chega com sucesso — revela o uso de `data.phone` em vez de `data.from`.
11. Correção do mapeamento de telefone, validada com teste simulado.
12. Auditoria de pré-produção (somente leitura) identifica ausência de proteção explícita contra `fromMe`.
13. Proteção `fromMe` implementada e validada com testes simulados (positivo e negativo).
14. Investigação manual (pelo usuário) identifica a origem da mensagem promocional como saudação nativa do WhatsApp Business.
15. Teste final com `DRY_RUN=false`: mensagem real "Teste final 001" processada de ponta a ponta com sucesso.
16. Encerramento do ambiente: `DRY_RUN` revertido para `true`, servidor e túneis (Cloudflare e LocalTunnel remanescente) encerrados.
17. Segunda opinião técnica registrada (riscos, requisitos, recomendação de seguir com ajustes).
18. Documentação oficial da POC criada.

---

## 26. Checklist final

- [x] Objetivo da POC definido antes de iniciar
- [x] Produção isolada durante toda a POC
- [x] Nenhum commit realizado
- [x] Nenhum deploy realizado
- [x] Teste isolado da Conversation API validado
- [x] Bridge completa implementada e testada
- [x] Payload real da ZAP-API auditado e corrigido
- [x] Proteção contra loop implementada em duas camadas
- [x] Teste final ponta a ponta com sucesso
- [x] Ambiente de teste encerrado com segurança
- [x] Riscos e pendências documentados
- [ ] Requisitos obrigatórios de produção implementados (fase seguinte, fora do escopo desta POC)
- [ ] Rate limit da Conversation API auditado (pendente, fora do escopo desta POC)
- [ ] Canal de R$ 97 cancelado (não deve ocorrer até os critérios da seção 23 serem atendidos)

---

## 27. Referência dos arquivos criados

```
poc/gptmaker-conversation-test/gptmaker-conversation-test.mjs
poc/zap-gptmaker-bridge/server.mjs
poc/zap-gptmaker-bridge/README.md
```

Nenhum outro arquivo do repositório foi criado, modificado ou removido durante esta POC.

---

## 28. Conclusão técnica — Migração do `whatsappProvider` (Cobranças) para ZAP-API (2026-07-29)

Auditoria independente, realizada no mesmo período desta POC, encontrou e corrigiu um problema não relacionado à bridge GPTMaker↔ZAP-API acima, mas ao **piloto de WhatsApp do módulo Cobranças** (`base44/functions/whatsappProvider`, appId `6a50402b2eeb1d1114312861`). Resumo para referência cruzada:

- **Causa raiz encontrada:** o `whatsappProvider` publicado no Base44 estava hardcoded para a **Z-API antiga** (`api.z-api.io`, secrets `ZAPI_INSTANCE_ID`/`ZAPI_INSTANCE_TOKEN`/`ZAPI_CLIENT_TOKEN`), enquanto os secrets da **ZAP-API atual** (`ZAPAPI_INSTANCE_ID`/`ZAPAPI_TOKEN`) já existiam no app, nunca usados pelo código publicado.
- **Diferença entre Z-API e ZAP-API:** dois provedores distintos, de nomes parecidos — `api.z-api.io` (autenticação por `Client-Token` + `instanceId`/`instanceToken` no path, payload `{phone, message}`) vs `api.zap-api.tech/v1` (autenticação por `Authorization: Bearer`, payload `{phone, type, body}`).
- **Motivo do erro "subscribe again":** a instância configurada na Z-API antiga estava com a assinatura vencida — a própria Z-API respondia `HTTP 400` com `{"error":"To continue sending a message, you must subscribe to this instance again"}`. Não era um bug de código; era a instância errada, com assinatura inativa.
- **Patch mínimo aplicado:** só 4 pontos em `whatsappProvider/main.ts` — troca dos 3 secrets Z-API pelos 2 secrets ZAP-API, endpoint (`.../instances/{id}/send`), headers (`Authorization: Bearer` em vez de `Client-Token`) e payload (`{phone, type:"text", body:message}` em vez de `{phone, message}`). Contrato de entrada, autenticação interna, normalização de telefone, idempotência e formato de resposta permaneceram intactos.
- **Validação HTTP 200:** confirmada — a ZAP-API aceitou a requisição e retornou um `message_id` real.
- **Recebimento confirmado no telefone de teste:** confirmado manualmente pelo usuário no número de teste (RAFAEL TESTE, `34991791296`).
- **Registros criados:** 1 `HistoricoEnvioWhatsApp` (`status: "sucesso"`) e 1 `LogNotificacao` (`status: "sucesso"`, `http_status: 200`), ambos com a mesma `idempotency_key` do envio validado.
- **Data da validação:** 2026-07-29.

Esta seção é só uma referência cruzada — os detalhes completos da investigação (auditoria de credenciais, comparação Manual × Automático, instrumentação temporária e remoção) não fazem parte do escopo desta POC e não estão documentados neste arquivo.

---

## 29. Histórico de Revisões

**v1.0** — 2026-07-29
- Documentação inicial da POC, cobrindo GPTMaker Conversation API + ZAP-API + Bridge Node.
