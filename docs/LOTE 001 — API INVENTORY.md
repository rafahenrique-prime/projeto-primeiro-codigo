# IGNITE PRIME — API INVENTORY

**Status do mapa:** homologado e corrigido no LOTE 001
**Data:** 2026-08-20
**Fonte primária:** [`LOTE 001 — SOURCE OF TRUTH.md`](./LOTE%20001%20%E2%80%94%20SOURCE%20OF%20TRUTH.md)
**Regra:** este arquivo descreve implementação, consumidores, configuração e documentação observados; não altera contratos, endpoints, autenticação ou infraestrutura.

> `CÓDIGO CONFIRMADO` significa que a implementação existe no snapshot. `CONSUMIDOR CONFIRMADO` significa que há referência no código/configuração/documentação auditados. `CONFIGURADO` significa que há configuração correspondente. `PRODUÇÃO CONFIRMADA` não é usada neste inventário porque não foi obtida evidência operacional externa atual e datada. `CONSUMIDOR NÃO IDENTIFICADO` não equivale a ausência de consumidor externo ou dinâmico.

## Endpoints e helpers principais

| Endpoint/Tool | Implementação | Consumidor | Ambiente documentado/configurado | Runtime | Status | Autenticação estrutural | Evidência/limitação |
|---|---|---|---|---|---|---|---|
| `/api/webhook` | `CÓDIGO CONFIRMADO` | GPT Maker/Gabriela documentado | Vercel/serverless aparente | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | Contrato de webhook e validações do handler; nomes exatos fora deste mapa | `docs/WEBHOOKS.md`, código; contrato não prova tráfego atual. |
| `/api/auto-photo` | `CÓDIGO CONFIRMADO` | GPT Maker e serviços de catálogo documentados | Vercel/serverless aparente | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | Contrato GPT Maker; Supabase/integrações server-side | `docs/WEBHOOKS.md`, código; guarda de 1000 ms documentada. |
| `/api/cron-diagnosis` | `CÓDIGO CONFIRMADO` | Vercel Cron documentado/configurado | Cron Vercel aparente | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | Secret de cron e providers, sem valores | `vercel.json`, `docs/WEBHOOKS.md`; configuração não prova execução atual. |
| `/api/system-tools` | `CÓDIGO CONFIRMADO` | Frontend, GitHub Actions, MCP, serviços e consumidores integrados documentados | Vercel/serverless aparente | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` + `EXPERIMENTAL` | Varia por `tool` | Código do dispatcher; concentração de domínios não autoriza refatoração neste lote. |
| `/api/scraper` | `CÓDIGO CONFIRMADO` | `src/services/scraperService.js`; externo adicional não identificado | Serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | Validações e URL externa conforme código | Código e `docs/WEBHOOKS.md`; consumidor externo adicional não confirmado. |
| `/api/bagy-audit` | `CÓDIGO CONFIRMADO` | Painel/uso manual aparente | Serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | Supabase e controles de integração | Código e `docs/integrations/BAGY-SYNC.md`; chamada produtiva requer telemetria. |
| `/api/bagy-audit-ignore` | `CÓDIGO CONFIRMADO` | `bagy-audit`/painel aparente | Serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | Supabase e validação do handler | Código; consumidor estático completo não identificado. |
| `/api/cache-avatar` | `CÓDIGO CONFIRMADO` | Frontend/fluxo de contatos aparente | Serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / utilitária | Supabase server-side | Código e documentação; fallback retorna URL original em falha. |
| `/api/embed-knowledge` | `CÓDIGO CONFIRMADO` | Operador/manual documentado; automático não identificado | Serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / manual | Supabase + Cohere server-side | Código e `docs/WEBHOOKS.md`; não é cron documentado. |
| `/api/gptmaker-credits` | `CÓDIGO CONFIRMADO` | Frontend do dashboard confirmado | Serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | Token de usuário/documentação; valor não registrado | Código, `docs/WEBHOOKS.md`; fallback mockado deve ser distinguido de dado real. |
| `/api/log-history` | `CÓDIGO CONFIRMADO` | Serviços de catálogo confirmados | Serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / auxiliar | Supabase server-side | Código e `docs/WEBHOOKS.md`; fail-safe não prova operação atual. |
| `/api/_primeBridgeWebhook` | `CÓDIGO CONFIRMADO` | `system-tools?tool=prime-bridge-webhook`; POC bridge documentados | Handler serverless/Preview | Não confirmado externamente | `POC` / `PREVIEW` — runtime não confirmado | Secret do bridge; valores nunca registrados | Handler, integração, testes, contrato e Preview são evidências de arquitetura; `poc/` não torna o Bridge descartável/legado. |
| `/api/_codexAlerts` | `CÓDIGO CONFIRMADO` | `auto-photo`, `cron-diagnosis`, scoring confirmados por referência | Serverless helper configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | Supabase e contexto do caller | `docs/WEBHOOKS.md`, código; prefixo `_` indica helper, não rota pública. |
| `/api/_customerScoring` | `CÓDIGO CONFIRMADO` | Orquestrador/fluxo de mensagens; entrada não totalmente confirmada | Serverless helper configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | Supabase | `docs/WEBHOOKS.md`, código; consumidor de entrada permanece parcial. |
| `/api/_scoring` | `CÓDIGO CONFIRMADO` | `_customerScoring` e possível equivalente frontend | Serverless helper + equivalente frontend | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / duplicidade candidata | Supabase/caller; sem secret próprio aparente | `docs/WEBHOOKS.md`, código; unificação futura, não neste lote. |
| `base44/functions/enviarMensagemManualWhatsapp` | `CÓDIGO CONFIRMADO` | Proxy de `system-tools` e usuário autorizado documentados | Base44/provider interno | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA`; `LAB` por modo | Token de serviço, allowlist, `modo_teste`, idempotência | Código Base44, testes/documentação; gates não provam deploy/runtime atual. |
| `Lyra` | Referências/caminhos `CÓDIGO CONFIRMADO` | Consumidor atual não identificado com segurança | Integração/cutover documentado | Não confirmado externamente | `NÃO CONFIRMADO` | Secret estrutural de integração, sem valores | Não classificar automaticamente como `LEGADO`; decisão arquitetural externa necessária. |
| `PRIME Cobranças` | Referências/caminhos `CÓDIGO CONFIRMADO` | Consumidor atual não identificado com segurança | Domínio de cobrança/cutover | Não confirmado externamente | `NÃO CONFIRMADO` | Secret estrutural de integração, sem valores | Não classificar automaticamente como V2; decisão arquitetural externa necessária. |

## Tools concentradas em `api/system-tools.js`

| Tool/dispatch | Implementação | Consumidor | Ambiente documentado/configurado | Runtime | Status | Autenticação estrutural | Evidência/limitação |
|---|---|---|---|---|---|---|---|
| `bagy-sync-run` | `CÓDIGO CONFIRMADO` | Operação/cron/painel aparente | Serverless/diagnóstico | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | Secret de sync Bagy | Mesmo dispatcher não prova execução produtiva. |
| `bagy-sync-run-ui` | `CÓDIGO CONFIRMADO` | Painel/operador aparente | Serverless/diagnóstico | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | Secret de ação UI | Consumidor documentado, runtime não confirmado. |
| `bagy-exception-status` | `CÓDIGO CONFIRMADO` | Auditoria/painel aparente | Serverless/diagnóstico | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | Auth do dispatcher e Supabase | Implementação confirmada; tráfego não confirmado. |
| `vercel-status` | `CÓDIGO CONFIRMADO` | Diagnóstico operacional | Serverless/diagnóstico | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | Auth do dispatcher | Consulta implementada; execução atual não confirmada. |
| `qwen-health`, `openrouter-health`, `perplexity-health` | `CÓDIGO CONFIRMADO` | `cron-diagnosis`/operação documentados | Diagnóstico configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | Secrets dos providers, sem valores | Código e documentação; healthcheck não prova disponibilidade atual. |
| `prime-cobrancas` | `CÓDIGO CONFIRMADO` | Painel, MCP ou integração Lyra/Builder aparente | Cutover/integração documentado | Não confirmado externamente | `NÃO CONFIRMADO` | Secret de integração, sem valor | Não promover a V2 nem produção; decisão arquitetural externa necessária. |
| `lyra-proxy` | `CÓDIGO CONFIRMADO` | Integração de cobranças documentada | Histórico/cutover documentado | Não confirmado externamente | `NÃO CONFIRMADO` | Secret de integração, sem valor | Não promover a `LEGADO` sem decisão explícita. |
| `stuck-check` | `CÓDIGO/CONFIGURAÇÃO CONFIRMADOS` no dispatcher e workflow histórico | Workflow/diagnóstico documentados | `system-tools` atual aparente; workflow `disabled_manually` | Não confirmado externamente | `CONFIGURADO` / `HISTÓRICO`; runtime não confirmado | `CRON_SECRET`, sem valor | `api/cron-stuck-check.js` é referência histórica; não ativar workflow. |
| `mensagem-manual` | `CÓDIGO CONFIRMADO` | Frontend/operador/Base44 documentados | Base44/provider interno | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA`; `LAB` por modo | Token de serviço e controles do handler | Gates e idempotência confirmados no código/testes; runtime não confirmado. |
| `mcp` | `CÓDIGO CONFIRMADO` | Operação/agentes documentados | Serverless/MCP configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | `MCP_LITE_SECRET`, sem valor | Roteamento implementado; disponibilidade atual não confirmada. |
| `nex` | `CÓDIGO CONFIRMADO` | Integração NEX documentada | Integração configurada | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | `NEX_SYNC_SECRET`, sem valor | Sincronização implementada; execução atual não confirmada. |
| `consultar-produto` | `CÓDIGO CONFIRMADO` | PRIME Bridge/POC/serviços documentados | Preview/lab e possível compartilhado | Não confirmado externamente | `PREVIEW` / `POC` — runtime não confirmado | `BRIDGE_TOOLS_SECRET` ou auth do dispatcher | Implementação/contrato confirmados; não promover a produção. |
| `prime-bridge-webhook` | `CÓDIGO CONFIRMADO` | ZAP-API/Prime Bridge documentados | Homologação/Preview | Não confirmado externamente | `POC` / `PREVIEW` — runtime não confirmado | `BRIDGE_TOOLS_SECRET`, `BRIDGE_MODE`, sem valores | Handler, testes e contrato confirmados; runtime externo não confirmado. |
| `alerta-inteligente` | `CÓDIGO CONFIRMADO` | `cron-diagnosis`, Gaby Lab e operação documentados | Produção aparente/Gaby Lab documentado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA`; `LAB` por contexto | `ALERTA_INTELIGENTE_SECRET`, sem valor | Classificação anterior “V1 homologada” foi rebaixada quanto ao runtime; implementação/documentação preservadas. |

A lista deve ser confrontada com o dispatcher atual antes de qualquer novo consumidor. O fato de uma tool estar no mesmo arquivo não significa que tenha o mesmo ambiente ou o mesmo status. Nenhuma tool pode ser chamada de `PRODUÇÃO CONFIRMADA` sem evidência operacional externa atual.

## Correção documental: `stuck-check`

| Estado | Registro |
|---|---|
| **HISTÓRICO** | Documentos anteriores referem `api/cron-stuck-check.js` como rota dedicada. |
| **ATUAL NO REPOSITÓRIO** | O dispatcher atual observado concentra o fluxo em `api/system-tools.js`, via `system-tools?tool=stuck-check`. |
| **CONFIGURADO** | O workflow `.github/workflows/stuck-check.yml` existe no snapshot, mas foi reportado como `disabled_manually`. |
| **RUNTIME** | Não confirmado externamente. |
| **Conclusão** | A referência antiga foi preservada como histórico; nenhum caminho foi ativado, desativado ou modificado nesta correção. |

## Convenções de autenticação

Este mapa registra apenas nomes estruturais de secrets e modos, nunca valores. A origem e o valor efetivo devem ser consultados somente na fonte Bitwarden-first autorizada, sem reproduzir credenciais em documentação do projeto.
