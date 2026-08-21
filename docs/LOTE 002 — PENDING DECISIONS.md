# LOTE 002 — PENDING DECISIONS

**Pacote:** LOTE 002 — Pacote A — Classificação e Governança Documental
**Base:** `main` em `6f64a6796ae34a9226c1187aab96d6ed142e6462`
**Estado:** registro de decisões pendentes; nenhuma decisão abaixo foi aplicada.

> Uma decisão pendente não é uma autorização implícita. O Pacote A documenta o que precisa de owner, evidência ou aprovação antes de qualquer alteração.

## 1. Matriz de decisões pendentes

| Decisão | Por que está pendente | Evidências disponíveis | Evidência ainda necessária | Risco de decidir agora | Lote/fase recomendada |
|---|---|---|---|---|---|
| Página canônica de Contacts: `ContactsPage` ou `ContactsNewPage` | Duas implementações, uma rota antiga e uma rota nova exposta no menu; não há decisão de produto. | Imports/rotas em `App.jsx`, exposição de `contacts-new` no `LeftNav`, diferenças estruturais e hashes distintos. | Owner de produto, métricas/uso real, contratos de inbox e decisão explícita. | Quebrar consumidores, perder fluxo de conversa ou consolidar a geração errada. | Decisão externa antes de V2; implementação somente em pacote funcional posterior. |
| Página canônica de Dashboard: `DashboardPage` ou `DashboardNewPage` | `DashboardNewPage` é exposta como `dashboard`; `DashboardPage` permanece em `reports`, sem prova de aposentação. | Imports/rotas, menu, componentes e preview histórico. | Owner, métricas, fluxos usados e definição de Dashboard versus Reports/Relatórios. | Remover KPIs, links ou contexto histórico necessário. | Decisão externa antes de V2. |
| Relação entre `DashboardPage` e `RelatoriosPage` | Nomes/rotas têm sobreposição semântica, mas equivalência funcional não foi comprovada. | Rotas distintas em `App.jsx` e navegações diferentes. | Matriz de capacidades e decisão de produto. | Duplicar ou ocultar relatórios. | Pacote de canonicidade de produto. |
| Destino futuro de `page-13-sync.mjs` a `page-21-sync.mjs` | Família faz escrita remota e possui dados hardcoded; consumidor do app não identificado. | Conteúdo estático, histórico e endpoints observados. | Owner dos dados, idempotência, logs, reconciliação e substituto oficial. | Duplicar ou corromper catálogo ao executar/alterar. | Pacote B/C após governança de scripts e dados. |
| Política de branches antigas e `preview/*`/`shadow/*` | Divergência Git não prova abandono nem necessidade de retenção. | SHAs, datas, mensagens e arquivos exclusivos. | Owners, finalidade atual, tickets e política de retenção. | Perder recuperação, contexto ou trabalho não mergeado. | Pacote C, individualmente. |
| Política de tags/backups | Tags e branches têm valor de rollback e histórico, mas podem sobrepor snapshots. | SHAs, nomes, datas e mensagens. | Política de retenção, restauração testada e owner. | Perder ponto de recuperação ou manter backup inválido. | Pacote C, com validação de restauração. |
| Destino de scripts históricos e arquivos soltos | Há scripts manuais, de diagnóstico, de escrita remota e destrutivos na raiz. | Catálogo estático e histórico por caminho. | Consumidores externos, owner, substituto e dry-run. | Execução acidental, perda de ferramenta ou alteração externa. | Pacote B para organização sem exclusão; Pacote D somente no último nível. |
| Fronteira futura do PRIME Bridge | POC possui núcleo reutilizado pelo handler, mas runtime externo não está confirmado. | POC, handler, testes, README e contratos. | Domínio/deploy, tráfego, logs, healthcheck e owner. | Arquivar ou refatorar uma integração ainda necessária. | Validação externa antes de qualquer pacote funcional. |
| Cutover de PRIME Cobranças/Base44/Lyra | Código e referências existem; produção e substituição não estão comprovadas. | Documentação, branches/configuração e consumidores estruturais. | Owner arquitetural, deploy, tráfego, dados e plano de rollback. | Interromper cobrança ou duplicar fonte de verdade. | Decisão arquitetural externa; não decidir no Lote 002. |
| Tratamento futuro de `api/system-tools.js` | Dispatcher concentra 19 tools, mas concentração não prova duplicidade nem todas as ferramentas têm o mesmo risco. | Cases, autenticações e referências estáticas. | Matriz de owners, permissões, consumidores, contratos e telemetria. | Abrir superfície administrativa ou quebrar diagnóstico. | Pacote de segurança/API posterior; reservado para Lote 003. |
| Fluxo canônico de tokens | `token-receiver.js` e `renovar-token.sh` concorrem e escrevem tokens locais. | Conteúdo, histórico e documentação Bitwarden-first. | Decisão de segurança, gestão de sessão, worktrees e owners. | Expor credenciais, sobrescrever ambiente errado ou criar drift. | Lote 003 de segurança; nenhum token alterar agora. |
| Itens de segurança reservados para Lote 003 | Há riscos estruturais em `VITE_*`, scripts de token, ACLs e tools administrativas. | Mapas documentais sem valores de secrets. | Revisão autorizada de ambiente, permissões e logs, sem exposição de valores. | Revelar ou alterar secret, quebrar integração ou gerar falsa segurança. | Lote 003, com autorização explícita. |
| Fonte canônica de documentação para agentes | `CLAUDE.md` e `AGENTS.md` são semelhantes, mas possuem diferenças de atualização e escopo. | Conteúdo, changelogs, `.agents/`, `.claude/skills` e documentos oficiais. | Owner de governança, precedência formal e política de atualização. | Agente seguir instruções conflitantes. | Decisão de governança antes de alterar playbooks. |
| Fonte canônica dos JSONs de catálogo/importação | `catalog-imported.json` e `import-report.json` parecem snapshots, mas validade atual não foi confirmada. | Arquivos, commits e contexto de importação. | Owner de dados, data freshness, reconciliação e consumidor. | Tratar snapshot como fonte operacional. | Pacote de dados/importação posterior. |
| Destino de `_archive/importBackupService.js` | README não confirma substituto vivo. | README e auditoria de órfãos; ausência de import estático. | Busca externa, owners e rollback. | Remover serviço ainda necessário. | Pacote B/D apenas após evidência. |
| Canonicidade de fotos: `PhotoRecognitionPage`, `ImageExtractorPage`, `ExtractorPage` | Ferramentas têm sobreposição nominal/semântica, mas contratos não são equivalentes por nome. | Rotas, menu, imports e referências AWS. | Comparação de entradas/saídas, owners e uso real. | Consolidar a ferramenta errada e perder fluxo de dados. | Decisão de produto/V2. |

## 2. GOVERNANÇA DE INSTRUÇÕES PARA AGENTES

### 2.1 Inventário

| Fonte | Finalidade | Público/agente | Escopo | Possíveis conflitos | Fonte superior proposta | Status observado |
|---|---|---|---|---|---|---|
| `docs/LOTE 001 — SOURCE OF TRUTH.md` | Entrada oficial para distinção entre código, configuração, documentação, decisão externa e runtime. | Humanos e agentes que auditam/organizam o projeto. | Governança documental e classificação. | Pode não conter regras operacionais específicas de cada ferramenta. | Fonte superior de classificação e precedência documental. | Presente na `main`; autorizado apenas complemento factual neste pacote. |
| `CLAUDE.md` | Playbook de trabalho, segurança, secrets, deploy, MCP/GPT Maker e convenções. | Claude/agentes compatíveis e colaboradores que o consultam. | Amplo, incluindo execução e integrações. | Pode divergir de `AGENTS.md` em atualização, nomes e regras mais recentes. | Subordinado ao Source of Truth para classificação; precedência operacional formal ainda precisa de decisão. | Presente; changelog observado até 2026-07-30. |
| `AGENTS.md` | Instruções paralelas para agentes e colaboradores. | Agentes e ferramentas que leem AGENTS. | Amplo, semelhante a `CLAUDE.md`. | Sobreposição de conteúdo e atualização aparentemente anterior; pode gerar interpretação concorrente. | Subordinado ao Source of Truth para classificação; precedência operacional não formalizada. | Presente; changelog observado até 2026-07-10. |
| `.agents/` | Diretório de instruções/recursos adicionais quando presente. | Agentes e automações que o reconhecem. | Escopo definido por seus arquivos. | Pode adicionar regras não indexadas nos playbooks principais. | Deve ser indexado sob a hierarquia do Source of Truth. | Existência/consumidores devem ser confirmados por inventário; não foi alterado. |
| `.claude/skills/` | Skills específicas, incluindo referência Bitwarden-first/secrets. | Claude/agentes que carregam skills. | Domínios específicos, como secrets. | Pode parecer contradizer documentação geral se a precedência não estiver explícita. | Regra específica de segurança prevalece dentro do seu domínio, sem superar aprovação humana. | Presente conforme documentação consultada; não alterado. |
| Documentos `docs/`, runbooks e relatórios | Contexto operacional, histórico e arquitetura. | Humanos/agentes conforme o documento. | Cada arquivo deve declarar escopo e data. | Muitos documentos históricos podem ser lidos como instrução atual. | Documentos históricos não superam Source of Truth nem autorização explícita. | Heterogêneo; requer indexação progressiva. |

### 2.2 Hierarquia futura proposta

1. **Autorização humana atual e limites do lote** prevalecem sobre qualquer arquivo.
2. `docs/LOTE 001 — SOURCE OF TRUTH.md` prevalece para classificação, precedência documental e distinção entre fato e inferência.
3. Políticas específicas de segurança, como a skill Bitwarden-first, prevalecem no domínio técnico correspondente, sem autorizar exposição ou alteração de secrets.
4. `CLAUDE.md` e `AGENTS.md` orientam processo, mas não podem contradizer autorização humana, Source of Truth ou políticas de segurança.
5. `.agents/`, `.claude/skills/` e documentos de domínio devem declarar escopo, público, data e relação com a fonte superior.
6. Relatórios históricos, checkpoints, POCs e previews são evidência contextual; não são instruções atuais salvo quando explicitamente marcados.

Esta hierarquia é proposta documentalmente. **Não reescreve, desabilita ou altera** `CLAUDE.md`, `AGENTS.md`, `.agents/`, skills ou qualquer governança funcional neste pacote.

## 3. Decisões reservadas

Não tomar automaticamente: escolher página canônica, executar scripts de escrita, consolidar tokens, fazer cutover de Base44/Lyra/PRIME Cobranças, reorganizar POCs, excluir branches/tags, alterar `system-tools.js`, modificar secrets ou implementar V2.

## Referências

[1]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/CLAUDE.md "CLAUDE.md"
[2]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/AGENTS.md "AGENTS.md"
[3]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/tree/main/.claude/skills "Skills"
[4]: https://github.com/rafahenrique-prime/projeto-primeiro-codigo/blob/main/docs/LOTE%20001%20%E2%80%94%20SOURCE%20OF%20TRUTH.md "Source of Truth"

## Encerramento

**Decisões registradas; nenhuma decisão pendente foi aplicada.**
