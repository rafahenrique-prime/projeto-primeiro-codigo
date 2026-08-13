# ADR 0002 — Identificação determinística do chat no Alerta Inteligente: `whatsappPhone` + `agentId`, nunca heurística de recência

**Status:** Aceita
**Data:** 2026-08-13

## Decisão

Localizar o chat real de um handoff usando exclusivamente dois campos oficiais retornados por `GET /v2/workspace/{workspaceId}/chats`: `whatsappPhone` (âncora do cliente) e, quando disponível, `agentId` (segunda chave, para desambiguar quando o mesmo telefone aparece em chats de agentes diferentes). O candidato só é aceito quando a combinação fecha em **exatamente 1** chat — qualquer outro resultado (0 ou 2+) cai em fallback. Nunca se escolhe arbitrariamente entre candidatos.

## Contexto que motivou a decisão

O primeiro teste real do Alerta Inteligente (13/08/2026) caiu em `fallback_simples` com `motivo: telefone_ambiguo`: o telefone de teste batia com 2 chats reais no mesmo workspace — um no agente GABY LAB, outro (antigo, encerrado) na Gabriela de produção. Não foi um cenário hipotético.

## Alternativas consideradas

1. **Usar o chat mais recente (`time`) entre os candidatos** — descartada: não é uma garantia formal (dois chats podem ter atividade genuinamente simultânea), e transformaria uma decisão de identificação de cliente numa aposta estatística. Contraria diretamente a regra "nunca escolher arbitrariamente" que rege todo o desenho do fallback.
2. **Usar `agentName` em vez de `agentId`** — descartada: `agentName` é um campo editável no painel do GPT Maker (sujeito a duplicação/edição futura), enquanto `agentId` é o identificador estável do recurso.
3. **Escolher `candidates[0]` (primeiro da lista) quando ambíguo** — descartada: é uma escolha arbitrária disfarçada de determinismo, sem nenhuma garantia de que a ordem retornada pela API corresponde à conversa correta.
4. **Inferir o telefone a partir do formato interno do `chatId`** (`{channelId}-{telefone}` nos canais WhatsApp/Z-API) — descartada como estratégia principal: é uma coincidência de implementação observada empiricamente, não um contrato documentado da API — mais frágil que usar o campo oficial `whatsappPhone`.
5. **`GET /v2/workspace/{workspaceId}/interactions?agentId=...` como fonte primária** — investigada e não adotada como substituta: confirma corretamente o `chatId` já identificado por `whatsappPhone+agentId` (boa confirmação cruzada), mas filtra só por agente — mistura interações de vários clientes diferentes do mesmo agente (inclusive mais de uma `RUNNING` simultânea), então não resolve sozinha qual cliente disparou o alerta. Continuaria exigindo `whatsappPhone` de qualquer forma.

## Consequência prática

`agentId`, quando usado, precisa ser configurado como valor **literal e fixo** por cópia da intention/agente no GPT Maker (não existe variável de template confirmada que devolva "o agente atual"). Sem `agentId`, o comportamento cai para telefone sozinho (compatibilidade com o desenho original, antes desta correção).

## Referências

- [`docs/integrations/ALERTA-INTELIGENTE.md`](../integrations/ALERTA-INTELIGENTE.md) — seções 3 e 5 (detalhe técnico completo, algoritmo, exemplos)
- `api/_alertaInteligente.js` — `findChatByPhone()`
