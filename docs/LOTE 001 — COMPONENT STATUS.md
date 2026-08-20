# IGNITE PRIME — COMPONENT STATUS

**Status do mapa:** homologado e corrigido no LOTE 001
**Data:** 2026-08-20
**Fonte primária de navegação:** [`LOTE 001 — SOURCE OF TRUTH.md`](./LOTE%20001%20%E2%80%94%20SOURCE%20OF%20TRUTH.md)

> A classificação abaixo separa evidência de implementação, documentação/configuração, consumidor e runtime. `PRODUÇÃO APARENTE / NÃO CONFIRMADA` significa que código/configuração/documentação sugerem uso produtivo, mas o runtime externo atual não foi comprovado. `PRODUÇÃO CONFIRMADA` exigiria evidência operacional externa, atual e datada. `CONSUMIDOR NÃO IDENTIFICADO` não significa “sem consumidor”.

## Como interpretar o mapa

Cada linha deve ser lida em camadas. **Implementação** responde se há código no snapshot; **consumidor** responde se há referência comprovada no código/configuração/documentação; **ambiente** registra o que a documentação ou configuração declara; **runtime** indica se houve evidência operacional externa atual. Neste lote, o runtime externo não foi comprovado automaticamente, portanto os caminhos antes chamados genericamente de `PRODUÇÃO` aparecem como `PRODUÇÃO APARENTE / NÃO CONFIRMADA` ou `CONFIGURADO`.

## Mapa de componentes

| Componente | Implementação | Consumidor | Ambiente documentado/configurado | Runtime | Classificação | V1/V2 | Evidência e observação |
|---|---|---|---|---|---|---|---|
| `src/` + `src/App.jsx` | Confirmada no snapshot | Roteamento/navegador | Painel React/Vite | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `src/App.jsx`, `package.json`, `docs/DEPLOY.md`; rotas de páginas e laboratório coexistem. |
| `src/components/LeftNav.jsx` | Confirmada | `src/App.jsx` | Navegação do painel | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | Código do frontend; ausência no menu não prova que uma página esteja morta. |
| `src/pages/InboxList.jsx` | Confirmada | Roteamento principal | Inbox/conversas | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `src/App.jsx`, documentação de arquitetura; caminho operacional aparente. |
| `src/pages/DealOncaPage.jsx` | Confirmada | Roteamento principal | CRM/diagnóstico comercial | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `CLAUDE.md`, `docs/ARCHITECTURE.md`; nomes Deal Codex/Deal Claude permanecem ambíguos. |
| `src/pages/AgentLabPage.jsx` | Confirmada | Roteamento e uso interno | Laboratório | Não confirmado externamente | `LAB` | V1/Lab | `src/App.jsx` e nome da página; não tratar como produção apenas por estar no app. |
| `src/pages/DraftCatalogPage.jsx` | Confirmada | Roteamento principal | Painel interno | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `CLAUDE.md`, `docs/DEPLOY.md`; rascunho funcional, não o catálogo público separado. |
| `catalogo-publico/` | Confirmada | Cliente público aparente | Projeto/deploy Vercel separado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `docs/DEPLOY.md`, `CLAUDE.md`; aplicação independente no mesmo repositório. |
| `api/webhook.js` | Confirmada | GPT Maker documentado | Vercel/serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `docs/WEBHOOKS.md`, código; contrato de payload documentado, sem prova de tráfego atual. |
| `api/auto-photo.js` | Confirmada | GPT Maker documentado | Vercel/serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `docs/WEBHOOKS.md`, código; guarda de 1000 ms é requisito documentado. |
| `api/cron-diagnosis.js` | Confirmada | Vercel cron configurado | Cron Vercel aparente | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `vercel.json`, `docs/WEBHOOKS.md`; supervisão e alertas documentados. |
| `api/system-tools.js` | Confirmada | Frontend, GitHub Action, GPT Maker/MCP e consumidores integrados documentados | Serverless/configuração | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` + `EXPERIMENTAL` | V1 + transição V2 | Código e documentação; dispatcher concentra domínios; separação não faz parte deste lote. |
| `api/_primeBridgeWebhook.js` | Confirmada | `system-tools?tool=prime-bridge-webhook` documentado | Handler serverless/Preview | Não confirmado externamente | `POC` / `PREVIEW` — runtime não confirmado | Direção V2 | Há handler, integração com `system-tools`, testes, contrato e fluxo Preview; localização em `poc/` não torna o Bridge descartável ou legado. |
| `api/cron-stuck-check.js` | Não encontrado no snapshot atual | Documentação/workflow antigos | Histórico | Não confirmado | `HISTÓRICO` / `NÃO CONFIRMADO` | V1 histórico | `docs/WEBHOOKS.md` versus árvore atual; rota anterior distinta do caminho atual aparente `system-tools?tool=stuck-check`. |
| `api/scraper.js` | Confirmada | `src/services/scraperService.js` | Serverless configurado | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `docs/WEBHOOKS.md`, código; consumidor externo adicional não confirmado. |
| `api/bagy-audit.js` | Confirmada | Painel/uso manual aparente | Serverless | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | V1 | Código e `docs/integrations/BAGY-SYNC.md`; chamada produtiva requer telemetria. |
| `api/bagy-audit-ignore.js` | Confirmada | `bagy-audit`/painel aparente | Serverless | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / diagnóstico | V1 | Código; consumidor estático completo não identificado. |
| `api/cache-avatar.js` | Confirmada | Frontend/contatos aparente | Serverless | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | Código e documentação; fallback retorna URL original em falha. |
| `api/embed-knowledge.js` | Confirmada | Operador/manual documentado | Serverless | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / manual | V1 | `docs/WEBHOOKS.md`, código; não é cron documentado. |
| `api/gptmaker-credits.js` | Confirmada | Dashboard | Serverless | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `docs/WEBHOOKS.md`, frontend; fallback mockado deve ser distinguido de dado real. |
| `api/log-history.js` | Confirmada | Serviços de catálogo | Serverless | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | Código, `docs/WEBHOOKS.md`; fail-safe evita bloquear ação principal. |
| `api/_codexAlerts.js` | Confirmada | `auto-photo`, `cron-diagnosis`, scoring | Helper serverless | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `docs/WEBHOOKS.md`; prefixo `_` indica helper, não rota pública. |
| `api/_customerScoring.js` | Confirmada | Orquestrador/fluxo de mensagens | Helper serverless | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` | V1 | `docs/WEBHOOKS.md`, código; entrada não totalmente confirmada por busca estática. |
| `api/_scoring.js` | Confirmada | `_customerScoring.js` | Helper serverless + equivalente frontend | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` / duplicidade candidata | V1 | `docs/WEBHOOKS.md`; existe cópia declarada em `customerProfileService.js`. |
| `base44/functions/enviarMensagemManualWhatsapp` | Confirmada | Proxy do `system-tools` e usuário autorizado | Base44/provider interno | Não confirmado externamente | `PRODUÇÃO APARENTE / NÃO CONFIRMADA`; `LAB` por modo | V1 | Código Base44, testes/documentação; `modo_teste`, allowlist e token de serviço são gates documentados. |
| `Lyra` | Referências confirmadas | Consumidor atual não identificado com segurança | Integração/cutover documentado | Não confirmado externamente | `NÃO CONFIRMADO` | Transição | O repositório não basta para concluir `LEGADO`; decisão arquitetural externa necessária. |
| `PRIME Cobranças` | Referências e caminhos confirmados | Consumidor atual não identificado com segurança | Domínio de cobrança/cutover | Não confirmado externamente | `NÃO CONFIRMADO` | V1/V2 não resolvido | O repositório não basta para concluir `V2`; decisão arquitetural externa necessária. |
| `poc/zap-gptmaker-bridge/` | Confirmada | Testes próprios e handler relacionado | Laboratório/Preview | Não confirmado externamente | `POC` — runtime não confirmado | V2 potencial | README e 8 testes; testes locais não provam produção. |
| `supabase/migrations/` | Confirmada | Supabase/configuração | Banco | Não confirmado externamente | `HISTÓRICO` executável | V1 | Árvore e `docs/SUPABASE.md`; não alterar/executar migrations neste lote. |
| `.github/workflows/bitwarden-test.yml` | Confirmada | GitHub Actions | Workflow configurado | Execução atual não confirmada | `CONFIGURADO` / governança | V1 | API de workflows e YAML; configuração não prova execução recente. |
| `.github/workflows/stuck-check.yml` | Confirmada | Endpoint de stuck-check | GitHub Actions | Desabilitado no snapshot | `HISTÓRICO` / `NÃO CONFIRMADO` operacional | V1 histórico | Workflow reportado como `disabled_manually`; não ativar neste lote. |
| `docs/backup-gptmaker-2026-07-04/` | Confirmada | Restauração/auditoria | Repositório | Não aplicável | `HISTÓRICO` / `BACKUP` | Referência | Preservar como histórico. |
| `docs/backups/` | Confirmada | Restauração/auditoria | Repositório | Não aplicável | `HISTÓRICO` / `BACKUP` | Árvore e auditoria | Retenção ainda não formalizada. |
| `src/services/_archive/` | Confirmada | Consumidor runtime não confirmado | Repositório | Não confirmado | `HISTÓRICO` / `LEGADO` candidato | Referência | `_archive/README.md`; não excluir sem mapa e autorização. |
| `.agents/`, `.claude/`, `SKILL.md` | Confirmada | Agentes e operadores | Repositório | Não confirmado externamente | `CONFIGURADO` / governança | V1/V2 | Árvore, `CLAUDE.md`, Skills; possível sobreposição de precedência. |

## Regra de atualização

Nenhuma linha pode ser promovida a `PRODUÇÃO CONFIRMADA` apenas porque o arquivo está na `main`, porque a documentação usa a palavra “produção” ou porque existe uma branch de deploy. A promoção exige evidência operacional externa suficiente.

Para Lyra, PRIME Cobranças e Base44, o status operacional permanece `NÃO CONFIRMADO` quando a decisão arquitetural externa não estiver disponível. Para o PRIME Bridge, a origem em `poc/` não basta para concluir que seja descartável, legado ou apenas experimental: handler, integração, testes, contrato e Preview são evidências de implementação/arquitetura, mas não provam runtime produtivo.

Qualquer mudança futura de status deve incluir data, evidência, consumidor conhecido e impacto V1/V2. Quando a evidência for insuficiente, registrar `NÃO CONFIRMADO` ou `CONSUMIDOR NÃO IDENTIFICADO`; nunca converter ausência de referência estática em prova de código morto.
