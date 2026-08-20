# IGNITE PRIME — GLOSSARY

**Status do glossário:** homologado e corrigido no LOTE 001
**Data:** 2026-08-20
**Documento de precedência:** [`LOTE 001 — SOURCE OF TRUTH.md`](./LOTE%20001%20%E2%80%94%20SOURCE%20OF%20TRUTH.md)

> Este glossário define como os nomes são usados na documentação deste lote. Quando o repositório usa mais de uma grafia ou quando o estado operacional não é comprovável, a ambiguidade é registrada em vez de ser resolvida por suposição.

## Produtos, gerações e ambientes

| Termo | Definição documental | Status/limite |
|---|---|---|
| **IGNITE PRIME** | Nome do sistema/repositório que reúne painel, APIs serverless, catálogo, integrações, agentes, automações e documentação. | Não implica que todos os subdiretórios sejam produção. |
| **IGNITE PRIME V1** | Conjunto de implementações, configurações e documentos associados ao caminho operacional atual aparente: painel React/Vite, Supabase/catalogo, webhook de conhecimento, auto-photo, diagnósticos e integrações. | `PRODUÇÃO APARENTE / NÃO CONFIRMADA` quando o runtime externo não estiver comprovado. |
| **IGNITE PRIME V2** | Direção de evolução e migração para novas fronteiras de provider, bridge, tools e separação arquitetural. | Não é uma implementação automaticamente ativa; não implementar neste lote. |
| **PRODUÇÃO CONFIRMADA** | Caminho com evidência operacional externa atual, suficiente e datada. | Não foi usado automaticamente neste lote. Código/documentação/configuração sozinhos não bastam. |
| **PRODUÇÃO APARENTE / NÃO CONFIRMADA** | Código/configuração/documentação sugerem uso produtivo, mas o runtime externo atual não foi comprovado. | Classificação padrão para APIs e componentes antes chamados genericamente de `PRODUÇÃO`. |
| **LAB** | Ambiente/página/agent destinado a experimentos e validações controladas. | Não tratar como produção. |
| **PREVIEW** | Estado de pré-visualização, teste de cutover ou branch de validação anterior à promoção. | Não promover sem autorização. |
| **POC** | Proof of Concept/prova de conceito de uma integração ou arquitetura. | Testes da POC não provam produção. |
| **EXPERIMENTAL** | Caminho em experimentação, shadow ou homologação. | Consumidor e retenção devem ser confirmados. |
| **HISTÓRICO** | Backup, investigação, snapshot, tag ou estado temporal preservado com evidência suficiente dessa finalidade. | Preservar até política de retenção. |
| **LEGADO** | Caminho substituído com evidência suficiente de alternativa posterior ou decisão explícita. | Não significa removível. Topologia/idade/nome isolados não bastam. |
| **NÃO CONFIRMADO** | Estado que não pode ser concluído com as evidências disponíveis. | Classificação obrigatória quando houver lacuna. |
| **CONSUMIDOR NÃO IDENTIFICADO** | Nenhuma referência estática suficiente foi localizada. | Não equivale a ausência de consumidor runtime. |

## Agentes e plataformas

| Termo | Definição documental | Ambiguidade/observação |
|---|---|---|
| **Gabriela** | Agente GPT Maker associado ao atendimento/consulta de produtos e ao fluxo principal documentado. | Alguns documentos usam “Gaby” de forma abreviada; preservar `Gabriela` para produção quando o contexto permitir. |
| **Gaby Lab** | Caminho/ambiente de laboratório relacionado a testes e evoluções da Gabriela, incluindo alertas e dados comerciais de Fase 2A. | Não é sinônimo automático de Gabriela em produção. |
| **GPT Maker** | Plataforma/API externa usada para agentes, sessões, trainings, webhooks e dashboard. | O cliente frontend também possui capacidades administrativas; isso é risco estrutural, não classificação de exposição efetiva. |
| **Base44** | Plataforma/ambiente de funções e integração usado, entre outros, para envio manual de WhatsApp. | Não é sinônimo de Vercel serverless. |
| **Supabase** | Banco, Storage e serviços de dados usados pelo catálogo, knowledge, histórico, auditoria e integrações. | Chaves client-side e server-side têm escopos diferentes. |
| **Vercel** | Plataforma de deploy do painel/APIs e de cron documentado. | `catalogo-publico/` é descrito como projeto/deploy separado no mesmo repositório. |
| **Bitwarden Secrets Manager** | Fonte oficial de verdade para secrets técnicos do IGNITE PRIME. | Decisão oficial deste lote; não implica migração ou rotação executada. |
| **Source of Truth** | Fonte cuja informação prevalece em caso de conflito, conforme domínio. | Para secrets técnicos: Bitwarden Secrets Manager; para contratos efetivos: código/configuração auditados, com limites de runtime. |

## Integrações e fluxos

| Termo | Definição documental | Status/limite |
|---|---|---|
| **PRIME Bridge** | Handler/arquitetura de bridge entre provider de WhatsApp e ferramentas/serviços do PRIME, com `api/_primeBridgeWebhook.js`, integração com `system-tools`, testes, contrato documentado e POC ZAP-API ↔ GPT Maker. | Origem/estrutura `POC`/`PREVIEW`; estado operacional atual `NÃO CONFIRMADO`. Não é automaticamente descartável, legado ou substituto do V1. |
| **ZAP-API** | Provider/integração de WhatsApp usado na POC do bridge. | `POC`/experimental; status produtivo não confirmado. |
| **WhatsApp providers** | Conjunto de providers/caminhos de mensageria que inclui fluxo GPT Maker, provider interno/Base44 e ZAP-API/Prime Bridge. | Não há um único provider canônico documentado para todos os contextos. |
| **PRIME Cobranças** | Domínio de cobrança/leituras e integração com caminhos Lyra/Builder. | `NÃO CONFIRMADO` quando o repositório não permitir determinar estado atual; decisão arquitetural externa necessária. Consultar `LOTE 001 — API INVENTORY.md` e arquitetura. |
| **Lyra** | Integração/caminho de transição associado a cobranças PRIME. | `NÃO CONFIRMADO` quando o repositório não permitir determinar estado atual; não classificar automaticamente como legado. Decisão arquitetural externa necessária. |
| **Builder** | Caminho/serviço associado ao cutover de cobranças e previews. | `PREVIEW`/transição documentada; runtime e papel final não confirmados sem evidência externa. |
| **DealOnça** | Nome usado no frontend e em partes da documentação para o domínio de CRM/diagnóstico comercial. | Também aparece como `Deal Codex`, `Deal Claude` ou CODEX; equivalência semântica deve ser confirmada. |
| **Codex** | Nome usado para auditoria, scoring, alertas, página e Skills associados ao domínio comercial/operacional. | Nem toda ocorrência de CODEX prova que é a mesma unidade de produto. |
| **Alerta Inteligente** | Fluxo de alerta/handoff com resumo e Telegram, concentrado em `system-tools` segundo commits/documentação recentes. | Implementação/documentação confirmadas; runtime `NÃO CONFIRMADO`. Gaby Lab pode ser caminho distinto. |
| **stuck-check** | Healthcheck de conversas travadas. | `HISTÓRICO`: `api/cron-stuck-check.js`; `ATUAL NO REPOSITÓRIO`: `system-tools?tool=stuck-check`; runtime externo não confirmado; workflow reportado como desabilitado manualmente. |
| **system-tools** | Dispatcher de tools operacionais, MCP, NEX, cobranças, bridge, stuck-check, Bagy e alertas. | Concentra domínios heterogêneos; decomposição é lote futuro. |
| **MCP** | Camada/ferramentas de consulta interna roteadas por `system-tools` e documentação de integração. | Auth própria; não confundir com qualquer API externa. |

## Arquivos, branches e documentação

| Termo | Definição documental | Regra |
|---|---|---|
| **Preview branch** | Branch criada para validação, cutover ou teste antes da promoção. | Não excluir por estar atrás ou divergente. |
| **Shadow** | Estado experimental paralelo/espelho de validação. | Não tratar como produção sem confirmação. |
| **Archive** | Diretório/serviço marcado como arquivo histórico ou substituído. | Ausência de import estático não prova que possa ser removido. |
| **Backup** | Snapshot de restauração, comparação ou preservação temporal. | Deve ter retenção e restauração definidas. |
| **Skill** | Documento/procedimento modular para agentes ou operadores. | Segue a precedência arquitetural; não autoriza alteração sozinho. |
| **CLAUDE.md** | Manual operacional associado ao fluxo de agente Claude/Codex do projeto. | Contém regras mais recentes de governança em parte do histórico; deve ser reconciliado com `AGENTS.md`. |
| **AGENTS.md** | Manual operacional geral para agentes. | Contém instruções parcialmente duplicadas e mais antigas em pontos identificados. |
| **Graphify** | Orientações/artefatos para mapear relações e consultas estruturais do projeto. | Ferramenta documental/analítica; não é prova de runtime produtivo. |
| **V1/V2** | Rótulos de geração/estado de evolução. | Usar sempre com ambiente e consumidor; o rótulo sozinho não determina deploy. |

## Regras de escrita

1. Use `Gabriela` para o agente de produção quando o contexto permitir; use `Gaby Lab` para laboratório.
2. Use `PRIME Bridge` para a arquitetura/handler do bridge e `ZAP-API` para o provider da POC.
3. Use `DealOnça/Codex` quando a equivalência entre os nomes não tiver sido formalmente resolvida.
4. Use `NÃO CONFIRMADO` e `CONSUMIDOR NÃO IDENTIFICADO` em vez de `MORTO`, `ABANDONADO` ou `REMOVÍVEL` sem evidência suficiente.
5. Para secrets técnicos, escreva **Bitwarden Secrets Manager — Source of Truth**; Apple Passwords permanece apenas como **HISTÓRICO / POLÍTICA SUBSTITUÍDA**.
6. Nunca use `PRODUÇÃO CONFIRMADA` por inferência do repositório. Quando o runtime não estiver comprovado, escreva `PRODUÇÃO APARENTE / NÃO CONFIRMADA` ou `NÃO CONFIRMADO`.
7. Para `VITE_*`, descreva `RISCO ESTRUTURAL CONFIRMADO` sem declarar secret real exposto ou credencial comprometida sem auditoria específica.
