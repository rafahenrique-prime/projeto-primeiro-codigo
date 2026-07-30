# Base de Conhecimento — IGNITE PRIME

Esta pasta reúne o conhecimento que não está no código nem se explica
sozinho: investigações concluídas, causas-raiz descobertas, decisões
técnicas e as lições que ficaram para não repetir o mesmo caminho.

## ⚠️ Não confundir com `knowledge/` na raiz do projeto

Existem **duas pastas chamadas "knowledge" neste repositório**, com propósitos completamente diferentes:

| Pasta | Conteúdo | Público |
|---|---|---|
| `/knowledge/` (raiz do projeto, fora de `docs/`) | Base de conhecimento de **produto/negócio** — `gptmaker.md`, `policy.md`, `pricing.md`, `products.md` | Consumida pela **IA Gabriela** (chatbot de vendas) para responder clientes sobre preços, políticas e catálogo |
| `docs/knowledge/` (esta pasta) | Base de conhecimento de **engenharia** — investigações técnicas concluídas, causas-raiz, lições aprendidas | Consumida por **quem for dar manutenção no sistema** (humano ou IA assistente de código) |

Se você (ou uma IA) estiver procurando "o que a Gabriela sabe sobre preço", isso está em `/knowledge/pricing.md`, não aqui. Se estiver procurando "por que aquele bug aconteceu e como foi resolvido", está aqui.

## Quando criar um documento aqui

Ao final de uma investigação técnica não trivial — especialmente quando o sintoma inicial enganou (hipótese descartada), a causa raiz não era óbvia, ou a correção exigiu decidir entre abordagens com trade-offs.

## Convenção de nomenclatura

Todos os arquivos em **minúsculas, kebab-case**:

```
licoes-aprendidas-<assunto-curto>.md
```

Exemplos:
- `licoes-aprendidas-whatsapp-provider-zapapi.md`
- `licoes-aprendidas-zap-api.md`

Sem data no nome do arquivo — a data fica registrada dentro do documento, no cabeçalho. Isso diferencia esta pasta de `docs/investigations/`, onde o registro é cronológico por natureza (`AAAA-MM-DD-<assunto>.md`); aqui o foco é o **assunto**, não quando aconteceu.

## Estrutura padrão de um documento de Lições Aprendidas

Todo documento nesta pasta deve conter, nesta ordem:

1. **Cabeçalho** — data, commit(s) relacionado(s), **Status**, **Categoria**, **Impacto**, **Palavras-chave**, **Arquivos relacionados**
2. Sintoma observado
3. Hipótese(s) descartada(s)
4. Causa raiz real
5. Como foi descoberta (método de investigação)
6. Auditorias importantes
7. Erros evitados durante a investigação
8. Solução aplicada
9. Validação
10. Boas práticas
11. Checklist para futuras alterações
12. Melhorias futuras
13. **Resumo Executivo** (máx. 15 linhas) — sempre por último

### Campos obrigatórios do cabeçalho

- **Status:** `Resolvido` / `Parcial` / `Recorrente` — indica se o problema está fechado, mitigado parcialmente, ou se é um padrão que já se repetiu mais de uma vez.
- **Categoria:** uma ou mais entre `Integrações` / `Base44` / `WhatsApp` / `IA` / `Supabase` / `Deploy` / `Frontend` / `Segurança` / outra que fizer sentido — usada para agrupar documentos quando a base crescer o suficiente para justificar um índice por categoria (ver nota abaixo).
- **Impacto:** quem/o que foi afetado e por quanto tempo (ex.: "envio automático de cobrança fora do ar", "nenhum impacto em produção — capturado em teste").
- **Palavras-chave:** termos livres para busca futura (ex.: `whatsapp, zap-api, z-api, provider, migração, secrets`).
- **Arquivos relacionados:** caminhos dos arquivos de código envolvidos na investigação/correção.

> **Identificadores permanentes (`KA-0001`, `KA-0002`, ...) e índice por categoria:** avaliados e conscientemente adiados — reavaliar quando esta pasta tiver ~5 documentos ou quando houver múltiplas categorias com vários documentos cada. Até lá, o nome do arquivo e a tabela simples abaixo bastam.

## Quando um documento vai para `architecture`, `integrations`, `adr` ou `knowledge`

| Pasta | Quando usar |
|---|---|
| `docs/ARCHITECTURE.md` | Descreve **o estado atual** do sistema — fluxos, componentes, contratos. Atualizado incrementalmente, nunca é uma retrospectiva. |
| `docs/integrations/` | Documenta **como uma integração externa funciona** (contratos de API, POCs, formato de payload de terceiros) — conhecimento de referência para *usar* a integração, não a história de um incidente nela. |
| `docs/adr/` (ainda não existe) | Reservado para **decisões arquiteturais com alternativas conscientemente descartadas** (formato ADR clássico: Contexto/Decisão/Consequências), registradas *no momento da decisão*, não depois de um incidente. Esta pasta ainda não existe — só será criada quando a primeira decisão desse tipo aparecer. Quando isso acontecer, decisões arquiteturais relevantes hoje registradas dentro de documentos de `docs/knowledge/` poderão ser migradas/referenciadas de lá. |
| `docs/knowledge/` (esta pasta) | **Retrospectiva de uma investigação já concluída** — sintoma, causa raiz, o que foi descartado no caminho, lições para não repetir. |

Regra prática de desempate: se o documento explica **como algo funciona agora**, vai para `ARCHITECTURE.md`/`integrations/`. Se explica **por que algo quebrou e como descobrimos**, vai para `knowledge/`. Se registra **uma escolha entre alternativas antes de implementar**, vai para `adr/` (quando existir).

## Índice

_(mantido manualmente — atualizar a cada novo documento)_

| Documento | Status | Categoria | Data | Palavras-chave |
|---|---|---|---|---|
| [licoes-aprendidas-whatsapp-provider-zapapi.md](licoes-aprendidas-whatsapp-provider-zapapi.md) | Resolvido | WhatsApp, Base44, Integrações | 2026-07-29 | whatsapp, zap-api, z-api, provider, migração, secrets |
