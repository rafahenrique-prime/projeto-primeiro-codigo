# Graphify no IGNITE PRIME

## Objetivo

O Graphify funciona como um **mapa estrutural** do código do IGNITE PRIME. Ele ajuda o Claude a localizar, antes de editar algo:

- dependências entre módulos
- impacto de uma alteração
- caminhos entre módulos
- integrações
- funções centrais
- fluxos multi-arquivo
- possíveis efeitos colaterais

**Graphify é mapa/índice — o código real continua sendo a fonte da verdade.** Para decisões importantes, o Claude deve usar o Graphify para localizar os pontos relevantes e depois confirmar no código real antes de propor ou executar qualquer alteração.

## Instalação atual

- Instalado via `uv` (`uv tool install`), globalmente na máquina — não faz parte das dependências do projeto (`package.json`).
- Pacote: `graphifyy`
- Versão confirmada: **0.9.22**
- Suporte a SQL: sim — o extrator de AST cobre `.sql` (usado em `supabase/migrations/`)
- Executáveis disponíveis: `graphify` e `graphify-mcp` (o MCP não está configurado neste projeto — ver seção "MCP e Hooks")

## Construção do grafo

1. **Código extraído por AST** — `src/`, `api/`, `supabase/migrations/*.sql`, POCs relevantes, etc., sem custo de LLM.
2. **Documentação técnica selecionada adicionada posteriormente** — uma segunda passada, restrita a uma whitelist de ~19 documentos aprovados (arquitetura, integrações, decisões, relacionamentos entre módulos), usando extração semântica.
3. **Backend usado na extração documental:** `claude-cli` — roteia pelo CLI `claude` já instalado, cobrado pela assinatura Claude Code existente, não por crédito de API avulso (`GRAPH_REPORT.md` confirma `Token cost: 0 input · 0 output`).
4. **Estratégia de whitelist:** bloqueio por extensão de documento (`*.md`, `*.txt`, `*.yaml`, etc. via `--exclude`) com negação explícita (`!caminho/arquivo.md`) de cada um dos documentos aprovados — evita indexar backups, histórico de fases encerradas, conteúdo comercial ou documentos ainda não revisados. Essa lista de excludes fica persistida em `graphify-out/.graphify_build.json` e é reaproveitada automaticamente em futuras extrações.
5. **Resultado atual do grafo** (confirmado em `graphify-out/GRAPH_REPORT.md` nesta auditoria):
   - **1.953 nodes**
   - **3.697 edges**
   - **181 communities**
   - Construído a partir do commit `66697511`

## Documentação incluída no grafo

Documentos técnicos selecionados na extração documental (whitelist aprovada):

- `docs/ARCHITECTURE.md`
- `docs/SUPABASE.md`
- `docs/WEBHOOKS.md`
- `docs/integrations/GPTMAKER-API.md`
- `docs/integrations/PRIME-BRIDGE-FASE2.md`
- `docs/integrations/BAGY-SYNC.md`
- `docs/integrations/NEX-INTEGRATION.md`
- `docs/integrations/MCP-GUIDELINES.md`
- `docs/integrations/CATALOGO-V1.md`
- `docs/decisions/0001-bagy-sync-scraping-http-rpc-manual.md`
- `docs/relacionamentos/gptmaker-vs-webhooks.md`
- `docs/relacionamentos/ignite-prime-vs-catalogo-publico.md`
- `docs/relacionamentos/supabase-vs-catalogo.md`
- `docs/relacionamentos/vercel-vs-crons.md`
- `docs/knowledge/licoes-aprendidas-gptmaker-mcp.md`
- `docs/knowledge/licoes-aprendidas-whatsapp-provider-zapapi.md`
- `knowledge/gptmaker.md`
- `poc/zap-gptmaker-bridge/README.md`
- `poc/bagy-dooca-catalog-poc/README.md`

Demais documentos do repositório (backups, histórico de fases encerradas, conteúdo comercial/estratégico, POCs de dados) foram deliberadamente deixados fora do grafo.

## Uso pelo Claude

A skill local [`​.claude/skills/graphify-queries/SKILL.md`](../../.claude/skills/graphify-queries/SKILL.md) orienta o Claude sobre **quando usar** e **quando não usar** o Graphify — carrega automaticamente só quando a tarefa em andamento bate com o gatilho descrito, sem custo de contexto em tarefas triviais.

**Comandos principais permitidos pela skill** (conferidos contra o `--help` real da CLI instalada):

```bash
graphify explain "<nó>"                    # símbolo/nó conhecido → explicação + vizinhos
graphify affected "<nó>" --depth N         # o que é impactado por mudar esse nó
graphify path "<A>" "<B>"                  # caminho mais curto entre dois nós
graphify query "<pergunta>" --budget N     # perguntas abertas, sem nó de partida conhecido
```

`explain`/`affected`/`path` são preferidos quando já existe um símbolo/nó conhecido (determinísticos e baratos). `query` é para perguntas abertas — usar com cautela, pode retornar muitos nós.

## Fluxo recomendado

```
Tarefa estrutural/complexa
  → Claude identifica a necessidade
  → skill graphify-queries carrega (automático)
  → Graphify localiza relações relevantes (explain/affected/path/query)
  → Claude abre o código real
  → confirma comportamento (grafo é estrutural, não prova de runtime)
  → planeja/implementa a alteração
```

## Atualização

O grafo **não é atualizado automaticamente** — nem pela skill, nem por hook. Atualização continua manual, a critério do Rafael.

Conforme confirmado no `--help` da versão instalada:

- **Mudança só em código** (sem afetar os documentos indexados): `graphify update .` — re-extrai arquivos de código via AST, **sem custo de LLM**.
- **Mudança que inclui documentação** (novo doc aprovado, ou doc existente mudou de conteúdo): precisa rodar `graphify extract .` de novo, com `--backend claude-cli` explícito (o backend não é persistido entre execuções — só a lista de `--exclude` é, em `graphify-out/.graphify_build.json`).

Nenhuma extração foi executada para produzir esta documentação — os números acima refletem o estado já existente do grafo no momento da auditoria.

## MCP e Hooks

- **MCP não instalado/configurado** nesta fase (o executável `graphify-mcp` existe no sistema, mas não está registrado no projeto).
- **Hooks do Graphify não instalados** (`.claude/settings.json` não tem nenhum hook do Graphify).
- **`graphify claude install` não foi utilizado** — esse comando escreveria automaticamente um hook `PreToolUse` em `.claude/settings.json` e uma seção no `CLAUDE.md`, o que não foi desejado nesta fase.
- **Motivo:** a skill local (`graphify-queries`) já resolveu o objetivo — Claude sabe quando consultar o grafo — com bem menos complexidade e nenhum ponto de falha adicional no fluxo normal de trabalho.
- MCP e hooks ficam como evolução futura, só se houver necessidade comprovada de automação além do que a skill sob demanda já cobre.
