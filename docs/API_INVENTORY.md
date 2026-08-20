# IGNITE PRIME — API INVENTORY

**Status do mapa:** criado no LOTE 001  
**Data:** 2026-08-20  
**Regra:** este arquivo descreve rotas e ferramentas observadas; não altera contratos, endpoints, autenticação ou infraestrutura.

> “Consumidor conhecido” significa referência encontrada no código/documentação auditados. Não equivale a telemetria de produção. Quando não houve prova suficiente, foi usado `CONSUMIDOR NÃO IDENTIFICADO`.

## Endpoints e helpers principais

| Endpoint/Tool | Arquivo | Finalidade | Consumidor conhecido | Autenticação | Ambiente | V1/V2 | Status | Evidência |
|---|---|---|---|---|---|---|---|---|
| `/api/webhook` | `api/webhook.js` | Receber consulta do GPT Maker, buscar produto/knowledge e devolver payload de resposta | GPT Maker/Gabriela | Contrato de webhook e validações do handler; nomes exatos devem ser lidos do ambiente, nunca deste mapa | Vercel/serverless aparente | V1 | `PRODUÇÃO` aparente | `docs/WEBHOOKS.md`, código |
| `/api/auto-photo` | `api/auto-photo.js` | Detectar pedido de foto, selecionar catálogo, enviar imagem, preço e link | GPT Maker e serviços de catálogo | Contrato GPT Maker; Supabase e integrações server-side | Vercel/serverless aparente | V1 | `PRODUÇÃO` aparente | `docs/WEBHOOKS.md`, código |
| `/api/cron-diagnosis` | `api/cron-diagnosis.js` | Diagnóstico DealOnça, auditoria de respostas, alertas e verificações de providers | Vercel Cron/documentação operacional | Secret de cron e secrets de providers, não reproduzidos aqui | Vercel Cron aparente | V1 | `PRODUÇÃO` / diagnóstico | `vercel.json`, `docs/WEBHOOKS.md` |
| `/api/system-tools` | `api/system-tools.js` | Dispatcher para tools operacionais, MCP, integrações e diagnósticos | Frontend, GitHub Actions, MCP, serviços e consumidores integrados | Varia por `tool`; ver tabela de tools abaixo | Vercel/serverless aparente | V1 + direção V2 | `PRODUÇÃO` + `EXPERIMENTAL` | Código do dispatcher |
| `/api/scraper` | `api/scraper.js` | Buscar/scrapear dados de produto | `src/services/scraperService.js`; consumidor externo adicional não identificado | Validações e URL externa; detalhes no código | Serverless | V1 | `PRODUÇÃO` aparente | Código e `docs/WEBHOOKS.md` |
| `/api/bagy-audit` | `api/bagy-audit.js` | Auditar divergências Bagy/Dooca e catálogo interno | Painel/uso manual aparente | Supabase e controles de integração | Serverless | V1 | `PRODUÇÃO` / diagnóstico | Código e `docs/integrations/BAGY-SYNC.md` |
| `/api/bagy-audit-ignore` | `api/bagy-audit-ignore.js` | Registrar/gerenciar exceções de divergência | `bagy-audit` ou painel; consumidor estático completo não identificado | Supabase e validação do handler | Serverless | V1 | `PRODUÇÃO` / diagnóstico | Código |
| `/api/cache-avatar` | `api/cache-avatar.js` | Cache de avatar no Storage e bypass de CORS | Frontend/fluxo de contatos aparente | Supabase server-side | Serverless | V1 | `PRODUÇÃO` / utilitária | Código |
| `/api/embed-knowledge` | `api/embed-knowledge.js` | Gerar embeddings para `knowledge` | Operador/manual; consumidor automático não identificado | Supabase + Cohere server-side | Serverless | V1 | `PRODUÇÃO` / manual | Código e `docs/WEBHOOKS.md` |
| `/api/gptmaker-credits` | `api/gptmaker-credits.js` | Consultar créditos do GPT Maker para dashboard | Frontend do dashboard | Token de usuário/documentação; valor não registrado | Serverless | V1 | `PRODUÇÃO` aparente | Código, `docs/WEBHOOKS.md` |
| `/api/log-history` | `api/log-history.js` | Registrar histórico/auditoria de ações do catálogo | Serviços de catálogo | Supabase server-side | Serverless | V1 | `PRODUÇÃO` / auxiliar | Código e `docs/WEBHOOKS.md` |
| `/api/_primeBridgeWebhook` | `api/_primeBridgeWebhook.js` | Handler do PRIME Bridge | `system-tools?tool=prime-bridge-webhook`; POC bridge | Secret do bridge; valores nunca registrados | Homologação/preview aparente | Direção V2 | `POC` / `PREVIEW` | `docs/integrations/PRIME-BRIDGE-POC.md`, README da POC |
| `/api/_codexAlerts` | `api/_codexAlerts.js` | Helper para persistir alertas CODEX | `auto-photo`, `cron-diagnosis`, scoring | Supabase e contexto do caller | Serverless helper | V1 | `PRODUÇÃO` aparente | `docs/WEBHOOKS.md`, código |
| `/api/_customerScoring` | `api/_customerScoring.js` | Atualizar perfil, buy score e lead quente | Orquestrador de mensagens; consumidor de entrada não totalmente confirmado | Supabase | Serverless helper | V1 | `PRODUÇÃO` aparente | `docs/WEBHOOKS.md`, código |
| `/api/_scoring` | `api/_scoring.js` | Cálculo compartilhado de scoring/features | `_customerScoring` e possível equivalente no frontend | Sem secret próprio aparente; Supabase/caller | Serverless helper | V1 | `PRODUÇÃO` aparente / duplicidade candidata | `docs/WEBHOOKS.md`, código |

## Tools concentradas em `api/system-tools.js`

| Tool/dispatch | Finalidade observada | Consumidor conhecido | Autenticação estrutural | Ambiente | Status |
|---|---|---|---|---|---|
| `bagy-sync-run` | Executar/supervisionar sincronização Bagy/Dooca | Operação/cron/painel aparente | Secret de sync Bagy | Produção aparente | `PRODUÇÃO` / diagnóstico |
| `bagy-sync-run-ui` | Acionar sincronização por UI/ação controlada | Painel/operador aparente | Secret de ação UI | Produção aparente | `PRODUÇÃO` / diagnóstico |
| `bagy-exception-status` | Consultar exceções do catálogo | Auditoria/painel aparente | Auth do dispatcher e Supabase | Produção aparente | `PRODUÇÃO` / diagnóstico |
| `vercel-status` | Consultar status de deploy/infra | Diagnóstico operacional | Auth do dispatcher | Produção aparente | `PRODUÇÃO` / diagnóstico |
| `qwen-health`, `openrouter-health`, `perplexity-health` | Healthcheck de providers | `cron-diagnosis`/operação | Secrets dos providers | Diagnóstico | `PRODUÇÃO` / diagnóstico |
| `prime-cobrancas` | Fluxo de cobranças/leituras PRIME | Painel, MCP ou integração Lyra/Builder | Secret de integração | Cutover/produção aparente | `PREVIEW` / V1→V2 em transição |
| `lyra-proxy` | Proxy/ponte para caminho Lyra documentado | Integração de cobranças | Secret de integração | Histórico/cutover | `LEGADO` candidato / status final não confirmado |
| `stuck-check` | Healthcheck de conversas travadas | Workflow e diagnóstico | `CRON_SECRET` | GitHub Action/Vercel conforme histórico | `PRODUÇÃO` aparente, workflow atual desabilitado |
| `mensagem-manual` | Encaminhar envio manual para Base44/provider interno | Frontend/operador/Base44 | Token de serviço e controles do handler | Produção controlada/lab | `PRODUÇÃO` controlada / `LAB` por modo |
| `mcp` | Roteamento para tools MCP internas | Operação/agents | `MCP_LITE_SECRET` | Produção controlada | `PRODUÇÃO` controlada |
| `nex` | Sincronização/consulta NEX | Integração NEX | `NEX_SYNC_SECRET` | Produção aparente | `PRODUÇÃO` / integração |
| `consultar-produto` | Consulta compartilhada de produto para bridge e agentes | PRIME Bridge/POC/serviços de produto | `BRIDGE_TOOLS_SECRET` ou auth do dispatcher conforme caminho | Preview/lab e possível compartilhado | `PRODUÇÃO` controlada / `POC` |
| `prime-bridge-webhook` | Dispatch do webhook do bridge | ZAP-API/Prime Bridge | `BRIDGE_TOOLS_SECRET` e `BRIDGE_MODE` | Homologação/preview | `POC` / `PREVIEW` |
| `bagy-exception-status` | Leitura de exceções Bagy | UI/auditoria | Auth do dispatcher | Produção aparente | `PRODUÇÃO` / diagnóstico |
| `alerta-inteligente` | Alerta de handoff com resumo via Telegram/GPT Maker | `cron-diagnosis`, Gaby Lab e operação | `ALERTA_INTELIGENTE_SECRET` | Produção/Gaby Lab | `PRODUÇÃO` / V1 homologada |

A lista acima deve ser confrontada com o dispatcher atual antes de qualquer novo consumidor. O fato de uma tool estar no mesmo arquivo não significa que tenha o mesmo ambiente ou o mesmo status.

## Correção documental autorizada: stuck-check

| Estado | Registro |
|---|---|
| **HISTÓRICO** | Documentos anteriores referem `api/cron-stuck-check.js` como rota dedicada. |
| **ATUAL DOCUMENTADO** | O fluxo atual observado concentra o dispatch em `api/system-tools.js`, via `system-tools?tool=stuck-check`. |
| **Limite** | O workflow `.github/workflows/stuck-check.yml` está reportado como `disabled_manually`; este documento não ativa, desativa ou modifica o workflow. |
| **Conclusão** | A referência antiga foi preservada como histórico e não deve ser usada como endpoint atual sem confirmação adicional. |

## Convenções de autenticação

Este mapa registra apenas nomes estruturais de secrets e modos, nunca valores. A origem e o valor efetivo devem ser consultados somente na fonte Bitwarden-first autorizada, sem reproduzir credenciais em documentação do projeto.
