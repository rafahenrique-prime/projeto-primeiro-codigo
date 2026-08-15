---
name: base44-mcp-ops
description: Como operar o Base44 (apps/functions/secrets) via MCP e CLI no IGNITE PRIME — hierarquia MCP-nativo > CLI > UI, distinção run_command≠MCP nativo, deployment lock, secrets.get() vs Deno.env.get(), playbook WAHA/Cloudflare
type: reference
version: 1.0.0
last-updated: 2026-08-15
applies-to: [IGNITE PRIME]
load-trigger: auto
load-priority: high
dependencies: [none]
max-size: 4KB
---

# BASE44 MCP OPS

## Objetivo

Conhecimento de **ferramenta** (como operar o Base44), não de domínio.
Complementa `ignite-base44-cobrancas` (regras financeiras) e
`docs/integrations/MENSAGEM-MANUAL-WHATSAPP.md` (playbook completo do
incidente que originou esta skill, 14-15/08/2026).

## Quando usar

Qualquer operação em app/Function/secret do Base44 via ferramentas
(MCP `mcp__base44__*`, CLI `base44`, ou dashboard).

## Hierarquia operacional

🥇 **MCP nativo primeiro** — se existe tool MCP pra operação, use-a.
🥈 **CLI** só quando não existir tool MCP equivalente e a CLI estiver
adequada.
🥉 **UI/dashboard** quando: não exposto no MCP; CLI instável/timeout;
necessidade de ação manual segura.

Não é "MCP sempre" — é "MCP nativo primeiro quando houver tool
compatível".

## `run_command` NÃO é "deploy via MCP"

`mcp__base44__run_command` é só shell dentro do sandbox. Rodar
`base44 functions deploy` por dentro dele continua sendo **CLI**, não
MCP nativo. Nunca reportar isso como "usei o MCP" — é MCP→shell→CLI.

## Capabilities confirmadas no MCP atual

`create_base44_app`, `edit_base44_app`, `get_app_status`,
`get_app_preview_url`, `list_user_apps`, schemas/CRUD de entities,
connectors, `list_directory`/`read_file`/`edit_file`/`grep`,
`run_command`, `create_checkpoint`, import de design.

❌ **Sem tool nativa de:** deploy de Backend Function, status de
deployment de Function, listar deployments, liberar lock/fila.

⚠️ `get_app_status` é status do **builder de IA** (`edit_base44_app`),
não de deployment de Backend Function — não confundir.

## Deploy: regras aprendidas (CLI instável neste ambiente)

- Timeout repetido em `base44 functions deploy` → **não repetir
  indefinidamente**.
- Erro `"Another deployment is in progress. Please try again."` →
  **deployment lock**. Não empilhar tentativas, não usar
  nohup/background pra contornar, não forçar. Aguardar; se persistir,
  suporte Base44.
- **Publicação manual pelo dashboard é o caminho confiável validado
  neste ambiente** quando a CLI travar — não é fallback de última
  hora, é o método preferido quando a CLI já demonstrou instabilidade
  na sessão.

## `secrets.get()` vs `Deno.env.get()` — hipótese prática, não fato universal

Doc oficial descreve auto-redeploy ao rotacionar secret
**especificamente pra `secrets.get()`** (`base44:runtime`). Nesta
investigação, Function usando `Deno.env.get()` direto continuou com
valor antigo até publicação manual. Tratar como sinal de alerta
(`Deno.env.get()` pode exigir republish manual pós-rotação), nunca como
regra documentada/garantida.

## Base44 é nuvem — serviço local (WAHA etc.) não é alcançável direto

Precisa de endpoint público (túnel/host) entre Base44 e qualquer
serviço rodando no Mac local. Ordem de diagnóstico: container → sessão
→ endpoint local → túnel → `readyConnections` (`cloudflared` vivo ≠
túnel conectado) → endpoint público → só então a lógica de negócio
(ex. PN→LID). Detalhe completo:
`docs/integrations/MENSAGEM-MANUAL-WHATSAPP.md`.

## Referências

`docs/integrations/MENSAGEM-MANUAL-WHATSAPP.md` (playbook completo) ·
`ignite-base44-cobrancas` (regras de domínio financeiro) ·
`base44/shared/whatsappSender.ts`
