---
name: ignite-base44-cobrancas
description: Contexto real de Base44 no módulo Cobranças do IGNITE PRIME — dois apps, entities observadas, idempotência, card PRIME Cobranças (Fases A/B/C)
type: reference
version: 1.4.0
last-updated: 2026-07-28
applies-to: [IGNITE PRIME]
load-trigger: auto
load-priority: high
dependencies: [none]
max-size: 4KB
---

# IGNITE BASE44 COBRANÇAS

## Objetivo

Complementa `/base44:base44-sdk` com contexto específico deste repo.
Nunca substitui o código — em conflito, código e
`docs/ARCHITECTURE.md` têm prioridade.

## Quando Usar

Ao mexer em `entities.*` ou nestas Functions: `cobrancasService.js`,
`api/_gerarCobrancaLyra.js`, `api/system-tools.js` (tools `sync-lyra`,
`lyra-webhook`, `gerar-cobranca-lyra`, `prime-cobrancas-status`),
`primeCobrancasStatusService.js`, `CobrancasPage.jsx`,
`base44/functions/whatsappProvider`.

## Apps Base44 e Organização Local

| App | appId | Papel |
|---|---|---|
| PRIME STORE Starter | `6a50402b2eeb1d1114312861` | Fonte oficial: `Cliente→Venda→Parcela` |
| Lyra | `6a518d72335f3c31663dc63d` | Mercado Pago próprio, entidade `Cobranca` |

`base44/functions/` = 10 Functions oficiais do PRIME Starter
(confirmadas idênticas ao remoto, 2026-07-28). `base44/lyra-functions/`
= Functions da Lyra (`consultarStatusCobranca` é da Lyra, não do PRIME).
`.app.jsonc` deve apontar pro PRIME Starter antes de qualquer deploy —
conferir com `functions list`, nunca assumir.

Entities confirmadas (não é schema oficial): `Cliente`, `Parcela`,
`Venda`, `HistoricoAtividade`, `LogNotificacao` (PRIME); `Cobranca`
(Lyra). Autoridade: MP → pagamento (webhook→Lyra); Lyra → `Cobranca`;
PRIME → o resto.

## Regras Críticas (financeiro)

1. Match `Cobranca`↔`Parcela`: `lyra_cobranca_id`→`mp_preference_id`→
   `mp_payment_id`→fallback legado (pré-2026-07-13). Ignora
   `prime_parcela_id` prefixado `teste-`.
2. Reler o registro antes de todo `update`/`create`. ❌ Nunca sem reler.
3. `valor_pago` sempre atribuído, nunca somado. ❌ Nunca somar.
4. Divergência bloqueia pra auditoria manual. ❌ Nunca resolver sozinho.
5. Secrets isolados por finalidade (`CRON_SECRET`,
   `LYRA_WEBHOOK_SECRET`, `GERAR_COBRANCA_SECRET`,
   `COBRANCA_FRONTEND_TOKEN`, `WHATSAPP_INTERNAL_TOKEN`). ❌ Nunca
   reaproveitar entre tools.

⚠️ `VITE_BASE44_API_KEY` exposta no bundle (`cobrancasService.js`) é
dívida técnica conhecida (`docs/ARCHITECTURE.md` §8.10) — migração
planejada, não implementada.

## Card PRIME Cobranças — Fases A/B/C (2026-07-28)

`tool=prime-cobrancas-status` consolida: **`HistoricoAtividade`** (só
`created_date` mais recente, nunca o registro) · **`LogNotificacao`**
agregada (envios/falhas hoje, última tentativa, último erro sanitizado
por allowlist, duração média só se `duracao_ms` existir) ·
**`whatsappProvider action:"status"`** — somente leitura, nunca envia
mensagem/cria `LogNotificacao`/altera entity. Estados:
`connected|disconnected|not_configured|auth_error|provider_unavailable|unknown`.
`smartphoneConnected:null` é esperado na ZAP-API (não é falha).

⚠️ Nenhum endpoint de status pode expor `instanceId`, token, QR code,
telefone, CPF, PIX, valores ou payload bruto — só agregados.

## Procedimento Antes de Alterar

App certo confirmado (`.app.jsonc`)? Campo/entity confirmado por grep
(não suposto)? Regras Críticas 1-5 verificadas?

## Gatilhos para Revisão

Mudança em: sync PRIME↔Lyra, idempotência, ownership de entities,
autenticação Base44, fluxo MP, estrutura `functions/`/`lyra-functions/`,
ou contrato de `prime-cobrancas-status`/`whatsappProvider status`.

## Referências

`docs/ARCHITECTURE.md` (Fluxo F, §8) · `cobrancasService.js` ·
`_gerarCobrancaLyra.js` · `system-tools.js` · `whatsappProvider/main.ts`
