# PRIME Bridge — Fase 2: Robustez e Preparação para Produção

**Data:** 2026-07-31
**Status:** ✅ Concluída (código + validação integrada local) — **teste real de WhatsApp ainda não realizado**
**Commits relacionados à Fase 1:** `183f35e`, `845a474` (ver `docs/integrations/PRIME-BRIDGE-POC.md`, registro histórico imutável da Fase 1 — este documento não o altera)

---

## 1. Objetivo desta fase

A Fase 1 (`docs/integrations/PRIME-BRIDGE-POC.md`) provou que o fluxo funcional da PRIME Bridge (WhatsApp → ZAP-API → Bridge → GPTMaker → Bridge → ZAP-API → WhatsApp) funciona, mas identificou riscos altos: webhook sem verificação de origem, dedupe só em memória (perdido a cada restart), ausência de timeout, telefone sem normalização, e nenhuma observabilidade persistente.

A Fase 2 endereça esses riscos em etapas pequenas e testáveis (2A, 2B.1-2B.6), sempre reaproveitando padrões já validados em produção no restante do projeto, em vez de inventar soluções novas.

---

## 2. Fase 2A — Robustez local e segurança básica

Implementada e aprovada antes da Fase 2B. Mudanças em `poc/zap-gptmaker-bridge/server.mjs`:

- **`LIVE_MODE` seguro por padrão** — substitui o antigo `DRY_RUN`, que tinha o comportamento inverso e inseguro (ausência da variável = modo real). Agora, ausência ou qualquer valor diferente de `"true"` mantém o modo seguro.
- **Timeout via `AbortController`** (`fetchWithTimeout`, reaproveitável) — `EXTERNAL_TIMEOUT_MS`, padrão 10s, aplicado a GPTMaker e ZAP-API.
- **Normalização de telefone** — adaptada de `base44/functions/whatsappProvider/main.ts` (`normalizePhone`): remove não-dígitos, trata prefixo `00`, força `55`, valida tamanho e DDD.
- **Mascaramento de telefone em logs** — adaptado do mesmo arquivo (`maskPhone`), só primeiros 2 e últimos 4 dígitos visíveis.
- **Taxonomia de erro estruturada** — `bridgeError(errorCode, source, extra)` + `errorCodeFromHttpStatus()`, com `error_code`/`source` consistentes em toda a bridge.
- **Ordem de filtros corrigida** — `fromMe`/tipo de mensagem passaram a rodar **antes** da normalização de telefone, evitando que uma mensagem irrelevante (eco da própria bridge, mídia não suportada) fosse incorretamente classificada como `invalid_phone` só porque o telefone daquele payload específico não normalizava.

---

## 3. Fase 2B.1 — Proteção do webhook por path secreto

`WEBHOOK_PATH_SECRET`, obrigatória para a bridge iniciar (`process.exit(1)` se ausente). A rota deixou de ser `POST /webhook` e passou a ser:

```
POST /webhook/<WEBHOOK_PATH_SECRET>
```

- Path incorreto ou ausente → `404` (não `401` — não revela ao atacante se o problema foi o segredo ou a rota em si)
- Comparação via `crypto.timingSafeEqual`, com checagem de comprimento antes (evita a exceção nativa de buffers de tamanho diferente)
- Segredo nunca aparece em log, nem o path completo da requisição
- Escolhida em vez de header customizado/HMAC porque não depende de nenhuma capacidade não confirmada do painel da ZAP-API — usa exatamente a mesma superfície de configuração (colar uma URL) que já sabemos que funciona

---

## 4. Fase 2B.2 — Infraestrutura Supabase (migrations 017 e 018)

### 4.1 Decisão de arquitetura: Opção B simplificada

O desenho original considerado (posse por tentativa via `claim_token`, lease temporizado, coluna `provider_accepted` separada) foi **avaliado e descartado** após uma auditoria comparativa explícita entre a arquitetura completa e uma simplificada. Conclusão: a PRIME Bridge roda como **um único processo Node**, sem múltiplas instâncias concorrentes — a proteção contra corrida entre tentativas concorrentes que a arquitetura completa oferece defende contra um cenário que **estruturalmente não pode ocorrer** na topologia atual (só existe uma "tentativa antiga" e uma "tentativa nova" se o processo crashar e reiniciar — nunca duas rodando ao mesmo tempo). Além disso, a arquitetura completa **não fechava melhor** o único risco residual real (Supabase indisponível + crash simultâneo) — o risco é idêntico nas duas opções.

A Opção B preserva um **caminho de evolução aditivo**: se a bridge um dia rodar em múltiplas instâncias (Docker, Railway, Fly.io, Kubernetes, serverless), adicionar `claim_token`/lease é uma migration aditiva (`ALTER TABLE ADD COLUMN`) + extensão pontual da função existente — sem reescrever o resto da bridge.

### 4.2 `bridge_message_processing` (017)

```sql
message_id             text primary key
status                 text not null default 'received'  -- 'received'|'completed'|'failed'
attempts               integer not null default 1
error_code             text
processing_started_at  timestamptz not null default now()
failed_at              timestamptz
completed_at           timestamptz
created_at             timestamptz not null default now()
updated_at             timestamptz not null default now()
-- constraint chk_bridge_message_status check (status in ('received','completed','failed'))
```

### 4.3 Contrato da RPC `process_bridge_message`

Única função, `p_action text, p_message_id text, p_error_code text default null`, `LANGUAGE plpgsql`, `SECURITY INVOKER`, `search_path = public, pg_temp`.

**`check_or_start`:**

| Estado da linha | Ação | Retorno |
|---|---|---|
| Não existe | Cria `status='received'`, `attempts=1` | `process` |
| `completed` | Nenhuma | `duplicate_completed` (nunca reaberta) |
| `failed` | `status='received'`, `attempts+1`, limpa `failed_at`/`error_code`/`completed_at` | `retry_failed` (retry imediato) |
| `received`, dentro da janela de 60s | Nenhuma | `already_processing` |
| `received`, fora da janela de 60s | `attempts+1`, `processing_started_at=now()` | `retry_stale` (crash presumido) |

**`mark_completed`** — só `received → completed`; **`mark_failed`** — só `received → failed`, nunca toca `completed`. Ambos usam `WHERE status = 'received'` como garantia estrutural, não lógica condicional.

**Concorrência dentro do mesmo processo:** `INSERT ... ON CONFLICT DO NOTHING` (mensagem nova) + `SELECT ... FOR UPDATE` (linha existente) — mesmo padrão de `apply_profile_size_learning` (migration 013).

**Janela de `retry_stale` — 60 segundos, constante interna (não parâmetro).** Calculada com margem de mais de 2x sobre o pior caso teórico observado (GPTMaker + ZAP-API, timeouts de 10s cada = até 20s combinados; latências reais da Fase 1: 4,7s e 7,7s).

### 4.4 `bridge_operation_logs` (018)

```sql
id, level ('info'|'warning'|'error'), event (15 valores fechados via CHECK),
error_code, source ('bridge'|'gptmaker'|'zap_api'|null),
http_status, duration_ms, message_id, created_at
-- Index: (created_at desc), (level, created_at desc)
```

Vocabulário de `event` fechado deliberadamente — nenhuma coluna `jsonb` de metadata livre, para eliminar (não só mitigar) o risco de a tabela virar um depósito de payload.

### 4.5 Segurança

Ambas as tabelas: RLS habilitada, **zero policies**, `revoke all` explícito em nível de tabela (camada extra além do RLS) para `public`/`anon`/`authenticated`. A função: `revoke all` + `grant execute` só para `service_role`. `SECURITY INVOKER` (não `DEFINER`) — sem necessidade de elevar privilégio além do que `service_role` já tem.

### 4.6 Migrations aplicadas

`supabase/migrations/017_bridge_message_processing.sql` e `018_bridge_operation_logs.sql` — validadas manualmente pelo Rafael no SQL Editor do Supabase, com 11 checagens aprovadas (existência de tabela, RLS, zero policies, sequência completa de resultados da RPC: `process`→`already_processing`→`failed`→`retry_failed`→`completed`→`duplicate_completed`→`error`/`invalid_action`).

---

## 5. Fase 2B.3 — Integração do dedupe persistente ao código

`processBridgeMessage(action, messageId, errorCode)` — único ponto de contato com o Supabase, nunca `Authorization: Bearer` (só `apikey`, confirmado suficiente em `docs/SUPABASE.md §3.5`). Nunca lança exceção — retorna `{ok, result, reason}`, permitindo ao chamador decidir o fallback sem `try/catch`.

**Fluxo do `Set` em memória (segunda camada, não a fonte de verdade):**
- Mensagem nova não entra no `Set` antes do retorno `process`/`retry_failed`/`retry_stale` da RPC.
- `already_processing` → ignora, não toca o `Set`.
- `duplicate_completed` → adiciona ao `Set` como cache.
- Sucesso completo → `Set` recebe o `messageId` só depois de `mark_completed` confirmado.
- Falha (GPTMaker ou ZAP-API) → remove do `Set` (defensivo/real conforme o caminho).
- RPC indisponível → fallback ao `Set`, mesmo comportamento da Fase 1/2A para aquela ocorrência; removido do `Set` se a tentativa em fallback falhar, mantido se tiver sucesso.

---

## 6. Fase 2B.4 — Logging persistente

`logToSupabase(level, event, details)` — fire-and-forget, nunca aguardada no caminho crítico:
- Toda `Promise` interna tem `.then/.catch/.finally` — nenhuma promise solta.
- Timeout dedicado (`SUPABASE_TIMEOUT_MS`, padrão 3000ms) via `fetchWithTimeout`.
- Teto de **5 gravações simultâneas** — acima disso, a ocorrência é descartada só da persistência (o log local continua).
- Aviso local de indisponibilidade limitado a **1x a cada 60 segundos**.
- Sem retry automático do próprio log — falha de gravação é definitiva para aquele evento, evitando agravar uma indisponibilidade já em curso.
- Nunca chama a si mesma dentro do próprio tratamento de erro (sem recursão).

**Campos gravados:** `level`, `event`, `error_code`, `source`, `http_status`, `duration_ms`, `message_id` — nunca telefone, texto, prompt, resposta da IA, token, IDs de agente/instância, `Authorization`, segredo do webhook ou payload bruto.

---

## 7. Fase 2B.5 — Validação integrada

**Alteração de testabilidade aprovada** (única mudança funcional desta etapa): `GPTMAKER_BASE_URL`, opcional, fallback `https://api.gptmaker.ai` — comportamento padrão idêntico ao anterior, permite apontar `askGabi()` para um mock local em testes.

**Todos os 13 blocos de teste rodaram contra o `server.mjs` real** (não um harness paralelo), com GPTMaker, ZAP-API e Supabase totalmente mockados localmente (servidores HTTP em `/tmp`, nunca commitados) — **zero chamada externa real** em nenhum teste desta etapa.

| # | Teste | Resultado |
|---|---|---|
| 2 | Fluxo integrado de sucesso | ✅ 1 chamada GPTMaker, 1 ZAP-API, 5 eventos persistidos, `Set` só após `completed` |
| 3 | Duplicidade pós-`completed` (mesmo processo e após restart simulado) | ✅ Bloqueado pelo `Set` / `duplicate_completed`, zero reprocessamento |
| 4 | Concorrência (mesmo `messageId`) | ✅ Só 1 autorizada, a outra recebe `already_processing` |
| 5 | Retry após falha GPTMaker | ✅ `failed` → `retry_failed` → `completed`, mensagem não abandonada |
| 6 | Retry após falha ZAP-API | ✅ Idem, GPTMaker rechamado corretamente |
| 7 | `retry_stale` após crash simulado | ✅ Dentro da janela: `already_processing`; fora: `retry_stale`, `attempts` incrementado, nenhuma linha presa para sempre |
| 8 | Falha de `mark_completed` (recuperável e persistente) | ✅ Cenário A: 2 tentativas, sucesso; Cenário B: 3 tentativas, backoff ~2110ms, protegido no `Set`, sem `mark_failed`, sem unhandled rejection |
| 9 | Supabase indisponível (RPC e só logs) | ✅ Fallback ao `Set` funcional; logs: dedupe/atendimento seguem, aviso rate-limited |
| 10 | `LIVE_MODE=false` | ✅ Zero RPC, zero GPTMaker, zero ZAP-API, zero log persistente |
| 11 | Segurança do webhook | ✅ 404 sem segredo/segredo errado, 200 com correto, sem var não abre porta, nunca logado |
| 12 | Segurança dos dados | ✅ 22 logs inspecionados, 0 violações |
| 13 | Regressão geral (8 filtros + 2 timeouts) | ✅ Todos corretos |

Detalhe completo de cada teste (comandos, contagens exatas, evidência) no histórico da sessão de validação — resumo consolidado aqui.

---

## 8. Confirmações de terminologia e escopo

- **`completed` não significa `delivered`.** Significa que a bridge concluiu seu próprio ciclo interno de registro, depois que a ZAP-API já confirmou (`2xx`) o aceite da requisição de envio — não uma confirmação de entrega no aparelho do cliente. Confirmação real de entrega viria de um evento `message.status` separado do webhook, que a bridge não correlaciona nesta fase.
- **Nenhuma chamada externa real foi feita durante os testes finais** (Fase 2B.5) — GPTMaker, ZAP-API e Supabase totalmente mockados localmente.
- **Nenhum teste real de WhatsApp foi realizado desde as mudanças da Fase 2** — a última validação real de ponta a ponta com um dispositivo de verdade é a da Fase 1 (`docs/integrations/PRIME-BRIDGE-POC.md`), anterior a todas as mudanças de 2A-2B.5.

---

## 9. Risco residual composto — não eliminado, documentado explicitamente

Se o Supabase ficar indisponível durante **toda** a janela de retry de `mark_completed` (3 tentativas, ~2,1s de backoff total) **e** o processo reiniciar antes de o Supabase voltar, uma nova entrega do mesmo webhook (após a janela de `retry_stale`, 60s) pode reprocessar a mensagem — GPTMaker e ZAP-API rechamados, resposta potencialmente duplicada ao cliente.

Este é o único risco não eliminado nesta fase, por decisão de escopo (Opção B simplificada, §4.1). Exige a combinação de duas falhas simultâneas (Supabase fora do ar por tempo suficiente **e** um crash do processo dentro dessa mesma janela), tornando-o raro, mas não impossível. Foi **testado explicitamente** na Fase 2B.5 (Teste 9) para confirmar seu comportamento real, não apenas descrito em teoria. Uma eliminação completa exigiria um mecanismo mais pesado (outbox/2PC) ou a arquitetura completa com `claim_token`, deliberadamente adiados até que a topologia real da bridge exija essa evolução.

---

## 10. Melhorias que permanecem fora do escopo desta fase

- Retry automático de mensagem (fora do escopo do dedupe — só o dedupe/estado persiste, sem orquestração de retry ativa)
- Hospedagem persistente (a bridge continua rodando localmente atrás de um túnel Cloudflare)
- Fila/lock por telefone
- Rate limiting próprio na bridge
- Correlação com eventos `message.status` para confirmação real de entrega
- Header customizado/HMAC no webhook (path secreto continua como único mecanismo — pendência de confirmação manual no painel da ZAP-API, sem bloquear esta fase)
- Suporte a mensagens não-texto (imagem, áudio, documento)

---

## Fontes de referência

- Código: `poc/zap-gptmaker-bridge/server.mjs`, `poc/zap-gptmaker-bridge/README.md`
- Migrations: `supabase/migrations/017_bridge_message_processing.sql`, `018_bridge_operation_logs.sql`
- Schema documentado: `docs/SUPABASE.md §3.8`
- Referência arquitetural: `docs/ARCHITECTURE.md` item 13 da seção 8
- Registro histórico da Fase 1 (imutável): `docs/integrations/PRIME-BRIDGE-POC.md`
- Padrões reaproveitados: `base44/functions/whatsappProvider/main.ts`, `api/_profileLearning.js`, `supabase/migrations/013_profile_learning_audit.sql`, `supabase/migrations/015_qwen_health_state.sql`

---

**Fim do documento**
**Próximo passo (fora do escopo desta fase, pendente de decisão do Rafael):** teste real de WhatsApp com as mudanças da Fase 2, seguido de avaliação sobre operação contínua ou migração definitiva do canal.
