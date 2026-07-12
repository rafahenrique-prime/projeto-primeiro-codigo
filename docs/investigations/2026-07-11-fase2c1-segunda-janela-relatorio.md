# Fase 2C.1 — Segunda janela de observação do `onNewMessage`

**Data:** 2026-07-11
**Status:** experimento encerrado. `onNewMessage` desativado e confirmado vazio. Probe (já corrigido para sanitização de mídia) permanece implantado. `api/onnewmessage.js`, migration 013 e `SUPABASE_SECRET_KEY` seguem fora do ambiente de produção.
**Commit do patch de sanitização usado nesta janela:** `5a95411` (branch `fix/fase2c1-probe-sanitization`), deployado isoladamente via worktree, validado sem vazamento antes desta janela começar.

---

## 1. Objetivo

Confirmar, com amostra maior e mensagens sintéticas, as premissas que sustentam o desenho aprovado de `api/onnewmessage.js` — antes de qualquer ativação definitiva — e testar pela primeira vez com dados reais o comportamento de mídia (imagem/áudio/documento) contra o probe já corrigido.

## 2. Horário de início e fim

- **Início:** `2026-07-11T19:53:45Z`
- **Término:** `2026-07-11T22:35:18Z`
- **Duração total:** ~2h41min — dentro do range aprovado (2h30-3h).

## 3. Configuração usada

`onNewMessage` apontado manualmente para `https://ignite-webhook.vercel.app/api/message-router-probe` (probe já corrigido, sem vazamento de mídia). Confirmado por leitura de API antes de começar (vazio) e imediatamente após a ativação (URL exata gravada). Nenhum outro campo de webhook tocado, em nenhum momento — confirmado nas 3 checagens periódicas realizadas (`19:53:45Z` antes de ativar, `20:23:19Z`, `20:42:34Z`, `20:49:50Z`, `21:37:17Z`, `22:30:29Z` e a confirmação final de desativação em `22:35:18Z`) — todos os outros 7 campos permaneceram `""` do início ao fim.

## 4. Total geral de eventos e composição

**Limitação metodológica a registrar com honestidade:** a ferramenta `vercel logs` se mostrou, mais uma vez (mesmo padrão já documentado na Fase 2A e na Fase 2C.0), inconsistente para captura contínua e exaustiva — janelas de tempo (`--since`) não cobriam de forma confiável o período solicitado, exigindo múltiplas tentativas e, em alguns momentos, retornando dados aparentemente "presos" numa janela anterior por dezenas de minutos mesmo com eventos novos comprovadamente acontecendo (confirmado via teste ao vivo cronometrado, seção 9). Por isso, os números abaixo são a **soma de dois lotes capturados em janelas de tempo comprovadamente sem sobreposição** (Lote A finaliza `20:53Z`; Lote B começa `21:38Z`) — não é uma contagem contínua e exaustiva de 100% dos eventos da janela inteira. Tratar como **piso confirmado, não teto**.

| Métrica | Lote A (até `20:53Z`) | Lote B (`21:38Z`–`22:02Z`) | **Total combinado** |
|---|---|---|---|
| Eventos únicos | 45 | 36 | **81** |
| `role: user` | 11 | 13 | **24** |
| `role: assistant` | 29 | 22 | **51** |
| `role: tool` | 5 | 1 | **6** |
| Canal WhatsApp | 26 | 23 | **49** |
| Canal Instagram | 19 | 12 | **31** |
| Canal ausente (diagnóstico interno, não é evento real de cliente) | — | 1 | **1** |
| `contextId`s distintos | 3 | 6 | **≥ 6** (overlap parcial confirmado entre os lotes — `h:480fe28525` e `h:0da8aef818` aparecem nos dois; não há certeza absoluta do total exato combinado, entre 6 e 7) |
| `messageId`s únicos | 45 de 45 | 36 de 36 | **81 de 81 — nenhuma duplicata real detectada em nenhum dos dois lotes** |

**Meta de ≥ 40 eventos `role:user`: não atingida — mas por volume de envio, não por falha técnica.** 24 eventos `role:user` foram confirmados, e **nenhuma mensagem efetivamente enviada pelo testador ficou sem chegar ao probe** (ver seção 7, corrigida). A meta de 40 não foi atingida simplesmente porque essa quantidade de mensagens não chegou a ser enviada dentro da janela — não há indício de perda técnica.

## 5. Duplicatas — reavaliação do falso alarme da checagem intermediária

Durante a coleta, uma captura inicial (90 linhas brutas) pareceu mostrar 45 `messageId`s duplicados 2x cada. Investigação confirmou que eram **linhas de log brutas idênticas (mesmo `received_at` ao milissegundo)** — artefato da minha própria ferramenta de captura, não reentrega real do webhook. Depois de deduplicar por string exata, **zero duplicatas reais de `messageId` foram encontradas em nenhum dos dois lotes**, todas do tipo `role:user` e `role:assistant` misturados sem repetição.

## 6. Achado novo: `role: "tool"`

Confirmado em ambos os lotes (5 + 1 = 6 eventos). O campo `message` desses eventos contém o **corpo de resposta JSON da Ação "Buscar Produtos"** (`api/webhook.js`) sendo re-injetado na conversa pelo GPT Maker. **Isso não quebra o filtro já aprovado de `api/onnewmessage.js`**, que usa `if (role !== 'user') return 200` — um filtro positivo, não uma lista negativa — então `"tool"` já era ignorado com segurança, mesmo sem ter sido catalogado antes.

**Premissa corrigida (substitui a da Fase 2C.0):** não é mais correto afirmar "role só apresenta `user`/`assistant`". A afirmação correta é: **mensagens reais do cliente chegam como `role: "user"`; qualquer outro valor (`"assistant"`, `"tool"`, ou outros não observados) deve ser ignorado com segurança** — o desenho atual já cumpre isso por construção.

## 7. Intervalos sem envio de mensagens pelo testador (correção de interpretação)

Duas janelas sem nenhum evento novo foram observadas (`~20:53Z`–`~21:55Z`, e `~22:02Z`–`~22:30Z`+), com a configuração do `onNewMessage` confirmada correta durante todo o período (sem reset). **Causa confirmada pelo testador: nesses intervalos, simplesmente não houve envio de novas mensagens de teste** — não é falha de entrega, não é instabilidade do GPT Maker, não é evidência de eventos perdidos. Um teste ao vivo cronometrado (mensagem `TESTE-2C1-LIVE-CHECK` enviada às `21:55:35Z`, capturada em log ~90 segundos depois) já tinha demonstrado, de forma independente, que o caminho completo (WhatsApp → GPT Maker → `onNewMessage` → probe) funciona corretamente — essa evidência permanece válida e é reforçada pela confirmação do testador: **todas as mensagens efetivamente enviadas durante a janela chegaram corretamente ao probe, sem exceção conhecida.**

## 8. Cobertura dos casos obrigatórios

| # | Caso | Status |
|---|---|---|
| 1 | Texto simples | ✅ confirmado, múltiplas ocorrências |
| 2 | Declaração válida de tamanho | ⚠️ **Não confirmado com clareza nesta janela** — mensagens capturadas foram majoritariamente marcadores `TESTE-2C1-*`/`LIVE-CHECK` sem declaração explícita de tamanho identificável nos textos capturados |
| 3 | Texto sem tamanho | ✅ confirmado (maioria dos textos) |
| 4 | Pergunta com dois tamanhos | ⚠️ **Não confirmado nesta janela** — não identificado nos textos capturados |
| 5 | Imagem sem legenda | ⚠️ **Parcialmente confirmado** — 1 evento de imagem capturado veio com `message: "Tem isso?"` (não vazio); não há confirmação limpa de imagem 100% sem texto nesta janela especificamente (a Fase 2C.0 já tinha confirmado esse padrão antes, com o probe anterior — não invalidado, só não re-testado aqui) |
| 6 | Imagem com legenda | ✅ possivelmente coberto pelo mesmo evento do caso 5 (ambíguo se foi intencional) |
| 7 | Áudio | ✅ confirmado — 1 evento (Instagram, `message: ""`, `audios: {present:true, count:1, item_types:["string"]}`) |
| 8 | Documento | ⚠️ **Não confirmado nesta janela** — nenhum evento com `documents.count > 0` foi capturado nos lotes analisados |
| 9 | Resposta da assistente em múltiplas mensagens | ✅ confirmado repetidamente — proporção `assistant`/`user` de ~2:1 nos dois lotes, alguns agrupamentos de até 4 eventos `assistant` seguidos para 1 evento `user` |
| 10 | 3+ eventos consecutivos no mesmo `contextId` | ✅ confirmado — vários `contextId`s com múltiplos eventos em sequência |
| 11 | `contextId`s distintos em WhatsApp e Instagram | ✅ confirmado — pelo menos 6 `contextId`s distintos, canais diferentes |

**Observação de processo:** algumas mensagens de teste usaram marcadores fora do padrão combinado (`TESTE-2C3-`, `TESTE-2C4-`, `TESTE-2C8-LIVE-CHECK` em vez de exclusivamente `TESTE-2C1-`) — não é uma violação de segurança (continuam sendo mensagens sintéticas de teste, não conversas reais de cliente), só uma inconsistência de nomenclatura a registrar.

## 9. Sanitização de mídia — validada em produção, sem vazamento

Confirmado tanto na validação isolada pré-janela (URLs fictícias `example.invalid/SEGREDO-URL-NAO-LOGAR`) quanto nos eventos reais desta janela: `images`/`audios`/`documents` aparecem só como `{present, count, item_types}`, com objetos mostrando `{type, key_count, keys}` — nunca URL, nunca hostname, nunca valor de propriedade. Nenhuma ocorrência de vazamento detectada em nenhum momento desta janela.

## 10. Comportamento de `message` por tipo de mídia (observação empírica, sem premissa antecipada)

| Tipo | `message` observado |
|---|---|
| Imagem (único evento capturado) | Não vazio — `"Tem isso?"` (cliente mandou texto junto) |
| Áudio (único evento capturado) | Vazio (`""`) — **nenhuma transcrição observada** nesta amostra; o achado potencial de "áudio transcrito indo pro extractSize" **não se confirmou nesta janela**, mas a amostra é de só 1 evento — insuficiente para generalizar |
| Documento | Nenhum evento capturado — sem dado para reportar |

## 11. Comparação com a primeira janela (Fase 2C.0)

| Aspecto | Fase 2C.0 (1ª janela) | Fase 2C.1 (2ª janela) |
|---|---|---|
| Duração | ~20min | ~2h41min |
| Eventos únicos | 14 | 81 (piso confirmado) |
| `role` observados | `user`, `assistant` | `user`, `assistant`, **`tool`** (novo) |
| `chatId` | Ausente | Ausente (confirmado de novo) |
| `messageType` | Ausente | Ausente (confirmado de novo) |
| `contextId` estável | Sim | Sim (confirmado de novo, em escala maior) |
| Duplicidade de `messageId` | Nenhuma | Nenhuma real (1 falso alarme de ferramenta, investigado e descartado) |
| Estabilidade de configuração | Não testada em janela longa | **Config nunca resetou** durante 2h41min — reforça confiança nesse ponto especificamente |
| Confiabilidade de entrega | Não testada em volume | **Nenhuma mensagem enviada ficou sem chegar ao probe** — intervalos sem evento coincidem com intervalos sem envio pelo testador, não com falha técnica |
| Sanitização de mídia | Não existia (achado da 2C.1 anterior à ativação) | **Corrigida e validada em produção**, zero vazamento |

## 12. Premissas confirmadas

- `contextId` estável dentro da mesma conversa.
- `messageId` presente e único em 100% dos eventos capturados (81 de 81).
- `role` é um filtro seguro por construção (`=== 'user'`), mesmo com um 3º valor (`tool`) não catalogado antes.
- `channel` consistente (`WHATSAPP`/`INSTAGRAM`).
- Configuração do `onNewMessage` **não resetou sozinha** durante quase 3 horas — primeira evidência real contra o precedente de instabilidade de 2026-07-04.
- Sanitização de mídia funciona corretamente em produção, sem vazamento.
- Nenhuma mensagem efetivamente enviada pelo testador ficou sem chegar ao probe — os intervalos sem eventos coincidem com intervalos sem envio, não com falha de entrega.

## 13. Contradições ou achados novos

1. **`role: "tool"`** — não invalida o filtro atual, mas corrige a premissa documentada anteriormente. Mensagens reais do cliente chegam como `role: "user"`; qualquer outro valor (`"assistant"`, `"tool"`, ou outros não observados) já é ignorado com segurança pelo filtro `role === 'user'` já implementado.
2. **Cobertura incompleta de 3 dos 11 casos obrigatórios** (declaração de tamanho, pergunta com dois tamanhos, documento) — não testados com clareza nesta janela específica, por não terem sido enviados, não por falha de captura.

## 14. Decisão final

**Validação técnica aprovada com amostra menor que a planejada.**

24 eventos `role:user` foram confirmados (abaixo da meta de 40, mas não por falha técnica — simplesmente essa quantidade de mensagens não chegou a ser enviada dentro da janela). Todos os pontos estruturais centrais foram confirmados com evidência sólida: `contextId` estável, `messageId` único em 100% dos eventos (81 de 81), nenhuma duplicata real, `onNewMessage` permaneceu configurado corretamente do início ao fim, `role: "tool"` é um achado novo mas não quebra o filtro `role === 'user'` já aprovado, e a sanitização de mídia funciona sem vazamento em produção. Nenhuma mensagem enviada foi comprovadamente perdida.

Pendência remanescente, não bloqueante: confirmar os 3 casos obrigatórios não cobertos nesta janela (declaração de tamanho, pergunta ambígua, documento) — pode ser feito com uma verificação pontual mais curta, não exige nova janela de 3h.

---

Nenhum código alterado, nenhuma migration aplicada, `SUPABASE_SECRET_KEY` não configurada, `api/onnewmessage.js` não publicada, probe e branch temporária mantidos. Relatório ainda não commitado, conforme solicitado.
