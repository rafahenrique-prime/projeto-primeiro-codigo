---
name: graphify-queries
description: Consultar o grafo de arquitetura do IGNITE PRIME (Graphify) quando a tarefa envolver dependências entre módulos, impacto de uma alteração, refactor estrutural, fluxo de webhook, integração externa, código legado/acoplamento, descoberta de quem chama quem, ou bug com causa desconhecida. Não ativar para edição de texto, CSS, ajuste visual, typo ou tarefa isolada em arquivo já conhecido.
type: reference
version: 1.0.0
last-updated: 2026-08-10
applies-to: [IGNITE PRIME]
load-trigger: auto
load-priority: medium
dependencies: [none]
max-size: 5KB
---

# GRAPHIFY QUERIES

## Objetivo

Grafo de arquitetura já extraído em `graphify-out/graph.json` (código + SQL/migrations + documentação técnica selecionada — ver `docs/ARCHITECTURE.md`). Serve para navegar dependências e impacto sem reler o repositório inteiro do zero. Não substitui leitura de código.

## Quando usar

- Investigar dependências entre módulos
- Analisar impacto de uma alteração antes de editar
- Refactor estrutural
- Fluxo de webhook (ex.: `api/webhook.js`, `api/auto-photo.js`)
- Integração externa (GPT Maker, Bagy, NEX, PRIME Bridge)
- Fluxo que atravessa vários arquivos
- Código legado/acoplamento pouco óbvio
- Descobrir quem chama quem
- Bug com causa desconhecida
- Mudança em função central (usada por múltiplos pontos)
- Alteração que pode afetar mais de um domínio (`src/services/*`)

**Não ativar** para: edição simples de texto, CSS, ajuste visual pequeno, typo, edição isolada em arquivo já conhecido, mudança pequena sem dependências relevantes, tarefa puramente documental, ou leitura simples de arquivo já identificado.

## Comandos (nesta ordem de preferência)

```bash
graphify explain "<nó>"                    # símbolo/nó conhecido → explicação + vizinhos
graphify affected "<nó>" --depth N         # o que é impactado por mudar esse nó
graphify path "<A>" "<B>"                  # caminho mais curto entre dois nós
graphify query "<pergunta>" --budget N     # só quando não há nó conhecido de partida
```

`explain`/`affected`/`path` são preferidos sempre que já existe um símbolo/nó conhecido — são determinísticos e baratos. `query` é para perguntas abertas quando não há nó de partida — usar com cautela, pode retornar muitos nós e diluir o sinal; preferir `--budget` para limitar.

## Regras de interpretação

1. **Mapa de navegação, não prova de runtime.** Uma função estruturalmente alcançável no grafo pode estar desativada por config/env, feature flag, ou nunca chamada no caminho real de produção. O grafo mostra "pode chegar", não "está ativo agora".
2. **Sempre confirmar no código real antes de agir.** Depois de localizar arquivos/nós relevantes via Graphify, abrir e ler o código de fato antes de propor ou executar qualquer alteração. O grafo encurta a busca, não substitui a leitura.
3. **Nomes genéricos são ambíguos.** `handler`, `sendMessage`, `request`, `main` e similares podem casar com múltiplos nós no grafo. Se houver dúvida, confirmar caminho/arquivo exato antes de concluir qualquer coisa a partir do resultado.

## Segurança

- Nunca usar Graphify (nem os comandos acima) para tentar localizar, listar ou exibir secrets, tokens, API keys, senhas, valores de `.env` ou credenciais — mesmo que apareçam como nome de nó.
- Não abrir arquivos ignorados pelo `.graphifyignore` só para "completar" uma resposta de consulta Graphify — se um dado está fora do grafo por decisão de `.graphifyignore`, essa decisão vale também para a investigação manual que segue a consulta.

## Atualização do grafo — NÃO fazer automaticamente

Esta skill é só de **consulta**. Nunca rodar `graphify extract`, `graphify update`, `graphify cluster-only` ou `graphify label` a partir dela. Se o grafo parecer desatualizado (código mudou muito desde a última extração), informar:

```
⚠️ O grafo do Graphify pode estar desatualizado. Recomendo atualizar antes de confiar nesta análise.
```

e não seguir adiante sozinho — atualização continua manual, decisão do Rafael.

**Nota interna:** `graphify-out/.graphify_build.json` guarda os filtros `--exclude` usados na última extração documental (whitelist de docs técnicos aprovados). Isso não afeta `explain`/`affected`/`path`/`query` (só leem `graph.json` já pronto), mas é reaproveitado automaticamente em qualquer extração futura — relevante só se algum dia se decidir rodar `extract`/`update` de novo, não para o uso desta skill.

## Referências

`docs/ARCHITECTURE.md` · `graphify-out/GRAPH_REPORT.md` · `graphify-out/graph.html`
