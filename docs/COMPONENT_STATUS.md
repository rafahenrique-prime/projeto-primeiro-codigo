# IGNITE PRIME — COMPONENT STATUS

**Status do mapa:** criado no LOTE 001  
**Data:** 2026-08-20  
**Fonte primária de navegação:** [`IGNITE_PRIME_SOURCE_OF_TRUTH.md`](./IGNITE_PRIME_SOURCE_OF_TRUTH.md)

> A classificação abaixo é documental. `PRODUÇÃO` significa caminho operacional aparente no código/configuração/documentação; não substitui verificação de deploy ou telemetria. `CONSUMIDOR NÃO IDENTIFICADO` não significa “sem consumidor”.

## Mapa de componentes

| Componente | Finalidade | Status | Ambiente | V1/V2 | Consumidor conhecido | Fonte/Evidência | Observação |
|---|---|---|---|---|---|---|---|
| `src/` + `src/App.jsx` | Painel operacional React/Vite | `PRODUÇÃO` | Produção aparente/local | V1 | Navegador/usuário operacional | `src/App.jsx`, `package.json`, `docs/DEPLOY.md` | Rotas de páginas e laboratório coexistem no mesmo app. |
| `src/components/LeftNav.jsx` | Navegação principal | `PRODUÇÃO` | Produção aparente | V1 | `src/App.jsx` e usuário | Código do frontend | Ausência no menu não prova que uma página esteja morta. |
| `src/pages/InboxList.jsx` | Inbox e conversas | `PRODUÇÃO` | Produção aparente | V1 | Roteamento principal | `src/App.jsx`, documentação de arquitetura | Caminho operacional principal. |
| `src/pages/DealOncaPage.jsx` | CRM/diagnóstico comercial CODEX | `PRODUÇÃO` | Produção aparente | V1 | Roteamento principal | `CLAUDE.md`, `docs/ARCHITECTURE.md` | Documentos também usam `Deal Codex`/`Deal Claude`; nomenclatura ambígua. |
| `src/pages/AgentLabPage.jsx` | Laboratório de agentes e testes | `LAB` | Laboratório | V1/Lab | Roteamento e uso interno | `src/App.jsx`, nomes da página | Não tratar como caminho de produção apenas por estar no app. |
| `src/pages/DraftCatalogPage.jsx` | Catálogo rascunho via Google Drive | `PRODUÇÃO` | Painel interno | V1 | Roteamento principal | `CLAUDE.md`, `docs/DEPLOY.md` | É rascunho funcional dentro do painel, não o catálogo público separado. |
| `catalogo-publico/` | Site HTML público de catálogo | `PRODUÇÃO` | Projeto Vercel separado | V1 | Cliente público | `docs/DEPLOY.md`, `CLAUDE.md` | Aplicação independente no mesmo repositório. |
| `api/webhook.js` | Busca de produtos/knowledge para Gabriela | `PRODUÇÃO` | Vercel/serverless aparente | V1 | GPT Maker | `docs/WEBHOOKS.md`, código | Contrato de payload consumido pelo treinamento. |
| `api/auto-photo.js` | Envio de fotos, preço e link | `PRODUÇÃO` | Vercel/serverless aparente | V1 | GPT Maker | `docs/WEBHOOKS.md`, código | Guarda de 1000 ms é requisito operacional. |
| `api/cron-diagnosis.js` | Supervisão DealOnça, auditoria e alertas | `PRODUÇÃO` | Cron Vercel aparente | V1 | Vercel cron | `vercel.json`, `docs/WEBHOOKS.md` | Diagnóstico automatizado com múltiplas integrações. |
| `api/system-tools.js` | Dispatcher de tools administrativas, MCP, NEX, cobranças, bridge e alertas | `PRODUÇÃO` + `EXPERIMENTAL` | Serverless | V1 + transição V2 | Frontend, GitHub Action, GPT Maker/MCP e consumidores integrados | Código e documentação de integração | Concentra domínios diferentes; separar não faz parte do LOTE 001. |
| `api/_primeBridgeWebhook.js` | Handler do PRIME Bridge | `POC` / `PREVIEW` | Homologação/laboratório aparente | Direção V2 | `system-tools?tool=prime-bridge-webhook` | `docs/integrations/PRIME-BRIDGE-POC.md`, README da POC | Pendências declaradas de segredo, URL estável e Gatekeeper. |
| `api/cron-stuck-check.js` | Rota antiga de healthcheck | `HISTÓRICO` / `NÃO CONFIRMADO` como arquivo atual | Histórico | V1 histórico | Documentação/workflow antigos | `docs/WEBHOOKS.md` versus árvore atual | Fluxo atual aparente está em `system-tools?tool=stuck-check`; manter contexto. |
| `api/scraper.js` | Scraping server-side de produto | `PRODUÇÃO` | Serverless | V1 | `src/services/scraperService.js` | `docs/WEBHOOKS.md`, código | Consumidor externo adicional não confirmado. |
| `api/bagy-audit.js` | Auditoria Bagy/Dooca contra catálogo | `PRODUÇÃO` / diagnóstico | Serverless | V1 | Painel/uso manual aparente | Código e `docs/integrations/BAGY-SYNC.md` | Status de chamada em produção requer telemetria. |
| `api/bagy-audit-ignore.js` | Registrar exceção de divergência Bagy | `PRODUÇÃO` / diagnóstico | Serverless | V1 | `bagy-audit`/painel aparente | Código | Consumidor estático completo não identificado. |
| `api/cache-avatar.js` | Bypass CORS e cache de avatar | `PRODUÇÃO` | Serverless | V1 | Frontend/fluxo de contatos aparente | Código e documentação de webhooks | Fallback retorna URL original em falha. |
| `api/embed-knowledge.js` | Embeddings da tabela `knowledge` | `PRODUÇÃO` / manual | Serverless | V1 | Operador/manual | `docs/WEBHOOKS.md`, código | Não é cron documentado. |
| `api/gptmaker-credits.js` | Proxy de créditos para dashboard | `PRODUÇÃO` | Serverless | V1 | Dashboard | `docs/WEBHOOKS.md`, frontend | Fallback mockado exige distinção entre dado real e fallback. |
| `api/log-history.js` | Auditoria de ações de catálogo | `PRODUÇÃO` | Serverless | V1 | Serviços de catálogo | Código, `docs/WEBHOOKS.md` | Fail-safe evita bloquear ação principal. |
| `api/_codexAlerts.js` | Persistir alertas CODEX | `PRODUÇÃO` | Helper serverless | V1 | `auto-photo`, `cron-diagnosis`, scoring | `docs/WEBHOOKS.md` | Prefixo `_` indica helper, não rota pública. |
| `api/_customerScoring.js` | Atualização de perfil e lead quente | `PRODUÇÃO` aparente | Helper serverless | V1 | Orquestrador/fluxo de mensagens | `docs/WEBHOOKS.md`, código | Consumidor de entrada não totalmente confirmado por busca estática. |
| `api/_scoring.js` | Cálculo de buy score e features | `PRODUÇÃO` aparente / duplicado candidato | Helper + frontend equivalente | V1 | `_customerScoring.js` | `docs/WEBHOOKS.md` | Existe cópia declarada em `customerProfileService.js`; unificação futura. |
| `base44/functions/enviarMensagemManualWhatsapp` | Envio manual com gates e idempotência | `PRODUÇÃO` controlada / `LAB` conforme modo | Base44/provider interno | V1 | Proxy do `system-tools` e usuário autorizado | Código Base44, testes/documentação | `modo_teste`, allowlist e token de serviço são obrigatórios por contrato. |
| `poc/zap-gptmaker-bridge/` | Bridge ZAP-API ↔ GPT Maker | `POC` | Laboratório/preview | V2 potencial | Testes próprios e handler relacionado | README e 8 testes da POC | Não confundir testes locais com prova de produção. |
| `supabase/migrations/` | Evolução de schema/RLS | `HISTÓRICO` executável | Banco | V1 | Supabase | Árvore e `docs/SUPABASE.md` | Não alterar nem executar migrations neste lote. |
| `.github/workflows/bitwarden-test.yml` | Teste/integração de secrets | `PRODUÇÃO` de governança | GitHub Actions | V1 | GitHub Actions | API de workflows e arquivo YAML | Estado ativo no snapshot. |
| `.github/workflows/stuck-check.yml` | Ping do healthcheck | `HISTÓRICO`/`NÃO CONFIRMADO` operacional | GitHub Actions | V1 histórico | Endpoint de stuck-check | API de workflows e documentação | Workflow reportado como `disabled_manually`; não ativar neste lote. |
| `docs/backup-gptmaker-2026-07-04/` | Snapshot de agente/configuração | `HISTÓRICO` / `BACKUP` | Repositório | Referência | Restauração/auditoria | Nomes e conteúdo documental | Preservar como histórico. |
| `docs/backups/` | Backups de comportamento | `HISTÓRICO` / `BACKUP` | Repositório | Referência | Restauração/auditoria | Árvore e auditoria | Retenção ainda não formalizada. |
| `src/services/_archive/` | Serviços substituídos ou sem equivalente declarado | `HISTÓRICO` / `LEGADO` candidato | Repositório | Referência | Consumidor runtime não confirmado | `_archive/README.md` | Não excluir sem mapa de consumidores e autorização. |
| `.agents/`, `.claude/`, `SKILL.md` | Governança e instruções para agentes | `PRODUÇÃO` de governança | Repositório | V1/V2 | Agentes e operadores | Árvore, `CLAUDE.md`, Skills | Existe possível sobreposição de precedência; ver Source of Truth. |

## Regra de atualização

Qualquer mudança futura de status deve incluir data, evidência, consumidor conhecido e impacto V1/V2. Quando a evidência for insuficiente, registrar `NÃO CONFIRMADO` ou `CONSUMIDOR NÃO IDENTIFICADO`; nunca converter ausência de referência estática em prova de código morto.
