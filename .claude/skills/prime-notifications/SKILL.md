---
name: prime-notifications
description: Playbook pra criar/auditar/modificar uma PRIME Notification (alerta via Telegram, com ou sem IA) reaproveitando a arquitetura homologada do Alerta Inteligente — identificação determinística, fallback best-effort, dedup pós-confirmação
type: playbook
version: 1.0.0
last-updated: 2026-08-13
applies-to: [IGNITE PRIME]
load-trigger: auto
load-priority: high
dependencies: [none]
max-size: 4KB
---

# PRIME NOTIFICATIONS

## Quando usar

Criar/auditar/modificar notificação operacional (Telegram ou similar): handoff, carrinho abandonado, pagamento, pedido novo, erro de integração, troca, defeito/garantia, evento crítico, ou qualquer PRIME Notification nova.

## Leia primeiro (fonte da verdade — não duplicada aqui)

- `docs/integrations/ALERTA-INTELIGENTE.md` — arquitetura, algoritmo de desambiguação, resumo, fallback, dedup, segurança, troubleshooting
- `docs/decisions/0002-identificacao-chat-whatsappphone-agentid.md` — por que `whatsappPhone`+`agentId`, nunca recência
- `docs/decisions/0003-alerta-inteligente-system-tools-telegram.md` — por que `system-tools.js` + Telegram + IA best-effort
- Secret novo → skill `prime-secrets`

## Classificar antes de implementar

**TIPO A — Simples:** `evento → validar → formatar → Telegram`. Sem IA quando o dado já chega completo.
**TIPO B — Inteligente:** `evento → identificar registro correto → recuperar dado/histórico → IA resume → Telegram → fallback`.

**Regra:** nunca adicionar IA só porque está disponível. Dado já completo no evento = TIPO A.

## Fluxo de decisão

1. Evento/gatilho? 2. Fonte confiável dos dados? 3. TIPO A ou B? 4. Identificador determinístico existe? 5. Risco de ambiguidade? 6. Fallback se a parte "inteligente" falhar? 7. Dedup — qual chave? 8. Autenticação/secret? 9. Cabe em `system-tools.js` sem Function nova? 10. Reaproveita Telegram existente? 11. Testes (tudo mockado)? 12. Logs sem dado sensível? 13. Só depois, conectar o gatilho real.

## Regras invariantes (nunca quebrar)

**Conversa GPT Maker:**
- `contextId` ≠ `chatId`; `whatsappPhone` é a âncora do cliente
- múltiplos chats/agentes → `agentId` como 2ª chave (nunca `agentName`)
- nunca `candidates[0]`, nunca "mais recente" pra resolver ambiguidade
- nunca inferir telefone pelo formato do `chatId`
- `/interactions` só confirma — não substitui identificação determinística

**Todas:**
- identificação determinística sempre separada do resumo por IA
- IA nunca escolhe o registro certo quando dá pra resolver deterministicamente
- resumo por IA é sempre best-effort — falha da IA nunca bloqueia o alerta
- dedup só conclui depois do canal confirmar entrega; falha do canal ≠ entrega
- nunca logar secret/token/`Authorization`/payload bruto
- Bitwarden é fonte de verdade pra secret novo (`prime-secrets`)
- reaproveitar `system-tools.js` antes de cogitar Function nova
- testar isolado (mockado) antes de conectar o gatilho real

## Checklist de homologação

Testes mockados passando → diff isolado revisado → deploy `Ready` (conferir contagem de Functions) → secret/config corretos → teste isolado real (endpoint direto) → logs sanitizados conferidos → conectar gatilho real → teste real ponta a ponta → documentar (padrão `ALERTA-INTELIGENTE.md`).

## Quando PARAR e pedir decisão ao Rafael

- Antes de criar secret novo
- Antes de conectar o gatilho real
- Identificação determinística não fecha em exatamente 1 registro
- Parece necessário criar Serverless Function nova
- Não está claro se é TIPO A ou B

## Referências

`docs/integrations/ALERTA-INTELIGENTE.md` · `docs/decisions/0002-identificacao-chat-whatsappphone-agentid.md` · `docs/decisions/0003-alerta-inteligente-system-tools-telegram.md` · skill `prime-secrets`
