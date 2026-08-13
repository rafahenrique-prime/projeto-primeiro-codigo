# Alerta Inteligente — Handoff Humano com Resumo (V1 homologada)

**Data de referência deste documento:** 2026-08-13. Números de teste, estado de conexão por agente e exemplos de log refletem o estado do código/GPT Maker **nesse dia** — confirme no código atual (`api/_alertaInteligente.js`, `api/system-tools.js`) antes de tratar qualquer número como garantia permanente.

**Arquivos-fonte:** `api/_alertaInteligente.js` (lógica) · `api/system-tools.js` (`case 'alerta-inteligente'`, roteamento) · `api/__tests__/alertaInteligente.test.js` + `api/__tests__/systemToolsAlertaInteligente.test.js` (testes).

**ADRs relacionados:** [`docs/decisions/0002-identificacao-chat-whatsappphone-agentid.md`](../decisions/0002-identificacao-chat-whatsappphone-agentid.md) · [`docs/decisions/0003-alerta-inteligente-system-tools-telegram.md`](../decisions/0003-alerta-inteligente-system-tools-telegram.md)

---

## 1. Objetivo e por que Telegram

Hoje, quando a Gaby (GPT Maker) decide que uma conversa precisa de atendimento humano, ela dispara a intention **"Alerta rafael"**. O Alerta Inteligente enriquece esse alerta com um resumo real da conversa, em vez de um texto estático:

```
GPT Maker/Gaby detecta necessidade de atendimento humano
  → chama intention "Alerta rafael"
  → GET /api/system-tools?tool=alerta-inteligente
  → identifica a conversa correta (whatsappPhone + agentId)
  → recupera o histórico real da conversa
  → Groq gera um resumo estruturado (JSON, sem alucinação)
  → Telegram envia o alerta pro Rafael
  → dedup evita reenvio da mesma situação
```

**Por que Telegram como canal:** já era o canal operacional em uso (outras 4 intentions de alerta e os crons já mandam pra lá) — simples, gratuito para este volume, entrega quase instantânea, e a infraestrutura de envio (`sendTelegram`) é trivial de reaproveitar em qualquer notificação futura. Não foi uma decisão nova desta feature, foi herdada do que já funcionava (ver seção 15 sobre reuso).

## 2. Arquitetura ponta a ponta

```
GPT Maker (intention "Alerta rafael", por agente)
  │ GET /api/system-tools?tool=alerta-inteligente
  │      &telefone=${whatsappPhone}&contextId=${contextId}
  │      &secret=<ALERTA_INTELIGENTE_SECRET>&agentId=<fixo por agente>
  ▼
api/system-tools.js — case 'alerta-inteligente'
  │ monta `deps` a partir das env vars já existentes no arquivo
  │ try/catch isolado (uma exceção aqui nunca derruba outra tool)
  ▼
api/_alertaInteligente.js — processarAlertaInteligente(params, deps)
  │
  ├─ compararSegredoSeguro()           → 401 se inválido, nenhuma chamada externa
  ├─ normalizePhoneDigits()            → telefone só dígitos, sem inventar DDI
  ├─ listAllChats() + findChatByPhone()→ localiza o chat.id REAL (seção 5)
  ├─ getChatMessages(chat.id)          → histórico real (nunca via contextId)
  ├─ generateStructuredSummary()       → Groq, JSON estruturado (seção 6)
  ├─ sendTelegram()                    → HTTP POST direto na Bot API
  └─ registrarDedup()                  → só depois do Telegram confirmar sucesso
```

Nenhuma Serverless Function nova (seção 11): tudo vive dentro do `api/system-tools.js` já existente.

## 3. Descobertas importantes (custaram investigação real)

- **`contextId` NÃO é `chatId`.** Confirmado pelo próprio GPT Maker: não é possível buscar mensagens de uma conversa usando `contextId` diretamente. `contextId` é tratado neste código só como metadado auxiliar (repassado em log/retorno interno), **nunca** usado para localizar chat ou mensagens.
- **`whatsappPhone` é a âncora do cliente.** É o único campo confiável e documentado pela API do GPT Maker (`GET /v2/workspace/{workspaceId}/chats`) para achar a conversa certa.
- **Um mesmo telefone pode existir em vários chats do workspace.** Isso aconteceu de verdade: o telefone de teste do Rafael apareceu em 2 chats reais, de agentes diferentes (GABY LAB e Gabriela produção) — não foi um cenário hipotético, foi o que quebrou o primeiro teste real (`motivo: telefone_ambiguo`).
- **`agentId` é a segunda chave de desambiguação — não `agentName`.** A combinação oficial é `whatsappPhone + agentId`. `agentName` foi descartado de propósito (nome pode ser editado/duplicado no painel; `agentId` é estável).
- **Nunca escolher `candidates[0]` nem o chat "mais recente" (`time`).** Ambas as heurísticas foram avaliadas e rejeitadas — só fecham em 1 candidato de forma determinística (telefone, ou telefone+agentId); qualquer outra situação cai no fallback simples, nunca numa escolha arbitrária.
- **Não inferir telefone a partir do formato interno do `chatId`.** O `chatId` costuma ter o formato `{channelId}-{telefone}` nos canais WhatsApp/Z-API, mas isso é uma coincidência de implementação observada, **não um contrato documentado** — depender disso seria mais frágil do que usar o campo oficial `whatsappPhone`.
- **`GET /v2/workspace/{workspaceId}/interactions?agentId=...` foi investigado como alternativa.** Confirma que o `chatId` identificado por `whatsappPhone+agentId` é exatamente a interação ativa (boa fonte de confirmação cruzada) — mas **não resolve sozinho** qual cliente disparou o alerta, porque filtra só por agente, misturando interações de vários clientes diferentes do mesmo agente (inclusive mais de uma `RUNNING` ao mesmo tempo). Por isso `/chats` + `whatsappPhone` + `agentId` permaneceu a estratégia oficial — ver ADR 0002.
- **A sintaxe de interpolação de variáveis do GPT Maker pode variar conforme o tipo de recurso/configuração.** Não assumir uma sintaxe universal (`${}`, `{{}}`, `@`) sem confirmar empiricamente ou pela documentação daquele recurso específico antes de editar uma intention/ação. Ver `docs/investigations/2026-07-11-fase2a-context-id.md` (linha ~59) para um caso real documentado onde a sintaxe correta de uma Ação era diferente do que se presumia inicialmente.

## 4. Configuração no GPT Maker (estado real por agente)

**Nunca registrar o valor do secret aqui ou em qualquer outro documento.**

| Parâmetro | Valor | Observação |
|---|---|---|
| `tool` | `alerta-inteligente` | literal, fixo |
| `telefone` | `${whatsappPhone}` | variável de template — confirmar que resolve para o telefone real antes de assumir (ver seção 3, último item) |
| `contextId` | `${contextId}` | variável de template, só metadado auxiliar |
| `secret` | `<ALERTA_INTELIGENTE_SECRET>` | secret real — nunca em texto plano em nenhum documento |
| `agentId` | valor literal fixo, **diferente por cópia da intention** | não é uma variável — é o `agentId` daquele agente específico, copiado manualmente na configuração da intention daquele agente |

**Por que `agentId` é literal e fixo, não uma variável:** cada agente (Gabriela, GABY LAB, etc.) tem sua própria cópia independente da intention "Alerta rafael" no GPT Maker. Não existe (até onde confirmado) uma variável de template que devolva "o `agentId` do agente atual" — por isso o valor precisa ser copiado manualmente na config de cada agente, uma vez, no momento de conectar aquele agente ao Alerta Inteligente.

### ESTADO ATUAL — confirmado por leitura direta da API do GPT Maker em 2026-08-13

| Agente | `agentId` | Intention "Alerta rafael" |
|---|---|---|
| **GABY LAB** | `3F78AF104664B0D1CB84D23672FCADC5` | **Conectada** — `url: https://ignite-webhook.vercel.app/api/system-tools`, params `tool`/`telefone`/`contextId`/`secret`/`agentId` configurados. Teste real final homologado (seção 13). |
| **Gabriela (produção)** | `3F4713FF6FA970BC0ED406900922C6C1` | **NÃO conectada** — a intention ainda aponta direto para `api.telegram.org/bot.../sendMessage`, com os parâmetros antigos (`chat_id`, `text` estático). Conectar é uma decisão separada, ainda não tomada. |

Não presumir o estado de nenhum outro agente sem confirmar por leitura (`GET /v2/agent/{agentId}/intentions`) — não inferir a partir do estado da GABY LAB.

## 5. Algoritmo de desambiguação (`findChatByPhone`)

```
candidatosTelefone = chats cujo whatsappPhone é equivalente ao telefone informado
                      (normalização: só dígitos; aceita variante com/sem "55"
                      quando inequívoco — nunca inventa DDI)

SEM agentId:
  candidatosTelefone.length === 0  → fallback (chat_nao_encontrado)
  candidatosTelefone.length === 1  → aceita esse chat
  candidatosTelefone.length >= 2   → fallback (telefone_ambiguo)

COM agentId:
  candidatosAposAgentId = candidatosTelefone filtrados por chat.agentId === agentId

  candidatosTelefone.length === 0        → fallback (chat_nao_encontrado)
  candidatosAposAgentId.length === 0     → fallback (agente_nao_confere)
  candidatosAposAgentId.length === 1     → aceita esse chat (ÚNICO caminho de sucesso)
  candidatosAposAgentId.length >= 2      → fallback (telefone_ambiguo)
```

Importante: com `agentId` informado, mesmo que `candidatosTelefone` já tivesse encontrado exatamente 1 chat, esse chat só é aceito se o `agentId` dele também bater — nunca é "aceitar porque o telefone achou 1", é "aceitar porque telefone+agente juntos apontam pra 1 só".

## 6. Resumo inteligente (Groq)

**Entrada:** até as últimas 40 mensagens do chat (`MAX_MESSAGES_FOR_SUMMARY`), formatadas como `Cliente: ...` / `Atendente: ...`, em ordem cronológica.

**Contrato de saída (JSON estrito):**
```json
{"motivo_transferencia": null, "produto_mencionado": null, "tamanho_mencionado": null, "ultima_pergunta_cliente": null, "resumo_breve": ""}
```

**Regra anti-alucinação (preservada em toda a homologação):** usar só fatos literalmente presentes na conversa; nunca inventar produto/estoque/preço/tamanho/cor/disponibilidade/motivo/pedido; campo não presente vira `null`, nunca um valor inventado.

**Priorização temporal (correção homologada em 13/08/2026):** quando a conversa tem mais de um assunto, `motivo_transferencia` e `ultima_pergunta_cliente` devem refletir o assunto **mais recente** que levou ao pedido de atendimento humano — um assunto antigo pode aparecer em `resumo_breve` como contexto, mas nunca substitui a pendência atual.

### Caso real que motivou a correção (13/08/2026)

| | |
|---|---|
| 13:09 | Cliente: "Meu pedido não chegou" (assunto antigo, já com resposta padrão do bot) |
| 13:15 | Cliente: pergunta sobre New Balance 9060, tamanho 40, pede troca de produto e quer falar com o Rafael — **este é o motivo real do handoff** |

**Antes da correção:** a pendência produzida priorizava "pedido não chegou" (o assunto mais antigo).
**Depois da correção:** resumo manteve o contexto antigo mencionado, mas a pendência final priorizou "troca de produto" e a última mensagem refletiu o pedido mais recente — validado em teste real (seção 13).

## 7. Fallback

O sistema **sempre** tenta entregar algum alerta, mesmo quando não consegue produzir o resumo inteligente — o handoff nunca fica sem alerta por causa de uma etapa que falhou.

**Motivos reais de fallback (extraídos do código atual, `processarAlertaInteligente`):**

| `motivo` | Quando acontece |
|---|---|
| `telefone_ausente` | Nenhum telefone válido chegou no request |
| `chat_nao_encontrado` | Telefone não bate com nenhum chat do workspace |
| `telefone_ambiguo` | Telefone bate com 2+ chats (sem `agentId`, ou mesmo depois de filtrar por `agentId`) |
| `agente_nao_confere` | Telefone achou candidato(s), mas nenhum tem o `agentId` recebido |
| `sem_mensagens` | Chat encontrado, mas sem histórico recuperável |

Além desses, `modo: 'fallback_resumo'` acontece quando o chat/histórico foram encontrados normalmente, mas o Groq falhou ou devolveu algo não parseável — nesse caso o texto simples (`FALLBACK_MESSAGE`) ainda é enviado.

**Texto do fallback simples (idêntico ao alerta original que já existia antes desta feature):**
```
⚠️ RAFAEL, CLIENTE AGUARDANDO SEM RESPOSTA!
```

## 8. Deduplicação

- **Finalidade:** evitar reenviar alerta pra a mesma situação (ex.: a intention disparando mais de uma vez pro mesmo momento da conversa).
- **Chave:** `chat.id` + identificador/timestamp da **última mensagem relevante do cliente** — não é só `chat.id`, porque isso bloquearia indevidamente um novo handoff legítimo do mesmo cliente depois de uma nova mensagem.
- **Quando é registrado:** **só depois** que `sendTelegram()` confirma sucesso (`envio.ok === true`). Se o Telegram falhar, o dedup **não** é registrado — a falha de entrega é tratada como distinta do "já processei essa situação".
- **Armazenamento:** reaproveita a tabela `codex_alerts` já existente (mesmo padrão de `jaAlertadoRecenteStuck`/`registrarAlertaStuck` do healthcheck `?tool=stuck-check`), com `type: 'handoff_inteligente'` — nenhuma tabela nova.

## 9. Segurança e logs

**Nunca logado, em nenhuma circunstância:**
- valor de `ALERTA_INTELIGENTE_SECRET`
- token do Telegram, token do GPT Maker, chave do Groq, chave do Supabase
- telefone bruto
- `agentId` bruto
- `contextId` bruto
- query string completa / URL completa contendo secret
- headers de `Authorization`

**Sanitizado, pode aparecer em log:**
- `motivo` (um dos valores da seção 7)
- `modo` (`inteligente` / `fallback_simples` / `fallback_resumo`)
- `chatId` (identificador interno do GPT Maker — não é PII nem secret)
- `agentIdPresente` (booleano)
- `candidatosTelefone` / `candidatosAposAgentId` (números)
- `dedupKey`

## 10. Observabilidade — exemplos reais de log (2026-08-13, produção)

**Sucesso:**
```
[alerta-inteligente] Alerta enviado {
  chatId: '<id-do-chat>',
  modo: 'inteligente',
  agentIdPresente: true,
  candidatosTelefone: 2,
  candidatosAposAgentId: 1
}
```

**Fallback por ambiguidade não resolvida:**
```
[alerta-inteligente] Fallback simples enviado {
  motivo: 'chat_nao_encontrado',
  chatId: null,
  agentIdPresente: true,
  candidatosTelefone: 0,
  candidatosAposAgentId: 0
}
```

## 11. Restrição de 12 Serverless Functions (Vercel Hobby)

O Alerta Inteligente **não** é um arquivo-rota próprio. Ele nasceu como `api/alerta-inteligente.js` independente, mas isso levou a contagem de rotas de 12 para 13 — o deploy foi rejeitado (`Error` na etapa "Deploying outputs"). Migrado para dentro de `api/system-tools.js` (`case 'alerta-inteligente'`), com a lógica de negócio em `api/_alertaInteligente.js` (arquivo com prefixo `_`, que por convenção do projeto **não** conta como Serverless Function). Mesmo padrão já usado por `qwen-health`, `consultar-produto`, `stuck-check`, `nex-sync-clientes` e outros — `api/system-tools.js` é o agrupador/router que existe justamente para não estourar o limite. Contagem confirmada em 13/08/2026: **12** arquivos-rota em `api/*.js`.

## 12. Testes (estado em 13/08/2026 — reconfirme antes de citar)

| Categoria | Cobertura |
|---|---|
| Secret | válido, ausente, inválido |
| Telefone | normalização, com/sem `55`, ambiguidade sem `agentId` |
| `agentId` | correto, errado, isola exatamente 1, ainda deixa 2+, ausente (compatibilidade V1) |
| `contextId` | nunca usado como `chatId` |
| Caminho inteligente | telefone+agentId → chat → mensagens → Groq → Telegram → dedup |
| Fallback | todos os `motivo` da seção 7 |
| Telegram | sucesso, falha (dedup não registrado) |
| Dedup | mesma situação não duplica; nova mensagem gera novo handoff legítimo |
| Sanitização de logs | nenhum secret/telefone/`contextId`/`agentId` bruto em nenhum log, em nenhum cenário testado |
| Priorização temporal | conteúdo do prompt (regra anti-alucinação preservada + instruções de recência presentes) |
| Observabilidade | log de sucesso inclui `agentIdPresente`/`candidatosTelefone`/`candidatosAposAgentId` |

**Números em 13/08/2026:** 75/75 testes específicos (`alertaInteligente.test.js` + `systemToolsAlertaInteligente.test.js`); suíte completa do projeto: 585 passando / 1 falha pré-existente e não relacionada (`poc/zap-gptmaker-bridge`, falha de ordem entre suítes, confirmada como alheia a esta feature). **Não é uma garantia permanente** — rode a suíte de novo antes de confiar nesses números no futuro.

## 13. Linha do tempo dos testes reais (HISTÓRICO DA HOMOLOGAÇÃO)

| Marco | Resultado |
|---|---|
| 1º teste real | `fallback_simples`, `motivo: telefone_ambiguo` — telefone de teste batia com 2 chats de agentes diferentes |
| Correção 1 | `whatsappPhone + agentId` como identificação conjunta (seção 5) |
| 2º teste real | `modo: inteligente` funcionando — mas resumo priorizou um assunto antigo (13:09) em vez do motivo real do handoff (13:15) |
| Correção 2 | priorização temporal no prompt do Groq (seção 6) |
| 3º teste real (final) | **PASSOU** — pendência corretamente igual a "troca de produto", contexto antigo mencionado sem substituir a pendência |

**Resultado: ALERTA INTELIGENTE V1 — HOMOLOGADO ✅ (13/08/2026), na GABY LAB.** Gabriela produção segue não conectada (seção 4).

## 14. Troubleshooting

| Sintoma | Onde olhar |
|---|---|
| Caiu em `fallback_simples` | Ver `motivo` sanitizado no log (`[alerta-inteligente] Fallback simples enviado`) |
| `motivo: telefone_ambiguo` | Conferir se o `agentId` fixo da intention daquele agente está configurado e correto |
| `motivo: chat_nao_encontrado` | Conferir se `whatsappPhone`/interpolação da variável realmente resolveu pra um telefone real (não string literal `${whatsappPhone}` sem substituição) e se o canal da conversa está entre as ~250 conversas mais recentes do workspace (limite de paginação, seção 11 de `_alertaInteligente.js`) |
| `motivo: agente_nao_confere` | Telefone achou candidato(s), mas nenhum tem o `agentId` esperado — conferir se o `agentId` configurado na intention é realmente o do agente certo |
| Resumo mistura assuntos antigos e atuais de forma confusa | Conferir se as instruções de priorização temporal (seção 6) ainda estão em `buildSummaryPrompt` — lembrar que o Groq é probabilístico, a instrução reduz mas não garante 100% de aderência |
| Telegram não chega | Verificar `status: telegram_failed` no retorno/log **antes** de suspeitar do dedup — dedup só é registrado depois de confirmação de sucesso, então "não chegou" nunca deveria coincidir com "dedup registrado" |
| `status: internal_error` | Exceção não tratada dentro de `processarAlertaInteligente` — olhar `[system-tools:alerta-inteligente] Erro interno inesperado` no log de `system-tools.js` |
| `status: unauthorized` (401) | `secret` ausente ou não bate com `ALERTA_INTELIGENTE_SECRET` — nenhuma chamada externa é feita nesse caso |

## 15. Reutilização futura — "PRIME Notificações" (**PLANEJADO / NÃO IMPLEMENTADO**)

Esta arquitetura (identificação determinística → busca de dado → IA opcional para enriquecer → canal de notificação → dedup) é genérica o suficiente para outros eventos do IGNITE PRIME. Possíveis consumidores futuros, **nenhum implementado**:

- carrinho abandonado
- pedido novo
- pagamento aprovado / pagamento atrasado
- troca solicitada
- defeito/garantia
- erro de integração
- cliente aguardando atendimento (já existe hoje, separado — `?tool=stuck-check`)
- eventos críticos do IGNITE

Nenhum desses módulos deve ser implementado a partir só desta menção — é registro de possibilidade, não uma tarefa aprovada.

### Checklist para criar uma nova PRIME Notification

Checklist operacional curto, não a Skill (a Skill vem depois, separada):

1. Definir o evento/gatilho real
2. Decidir se precisa histórico/IA (como este) ou se um alerta simples já basta
3. Identificar a fonte de dados (API/tabela) e o campo que serve de âncora determinística
4. Definir o identificador determinístico (equivalente ao `whatsappPhone + agentId` aqui) — nunca heurística de "mais recente"
5. Definir o fallback — o alerta nunca pode depender só do sucesso da parte "inteligente"
6. Definir a chave de dedup e garantir que só é registrada após confirmação de entrega
7. Definir secret/autenticação próprios (nunca reaproveitar um secret de outra tool)
8. Verificar o limite de 12 Serverless Functions — entrar como `case` novo em `system-tools.js`, não como arquivo-rota próprio
9. Reaproveitar `sendTelegram`/padrão de envio já existente, em vez de duplicar
10. Escrever testes (mockando toda rede externa) antes de conectar o gatilho real
11. Validar que nenhum log expõe secret/dado bruto do cliente
12. Testar isoladamente (endpoint direto, sem passar pelo gatilho real) antes de conectar
13. Só depois conectar o gatilho real (ex.: intention do GPT Maker)
14. Documentar (mesmo padrão deste arquivo)

## 16. Decisões arquiteturais

Resumo — detalhe completo em cada ADR:

- **`whatsappPhone + agentId`, nunca heurística de recência** — [ADR 0002](../decisions/0002-identificacao-chat-whatsappphone-agentid.md)
- **`system-tools.js` (não Function nova) + Telegram + resumo best-effort** — [ADR 0003](../decisions/0003-alerta-inteligente-system-tools-telegram.md)
