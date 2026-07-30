# docs/integrations/MCP-GUIDELINES.md — Diretrizes para ferramentas MCP do IGNITE PRIME

> **Fonte:** implementação e correção real de `consultar_cep` (2026-07-30), terceira ferramenta MCP do projeto após `verificar_conexao` e `consultar_cobrancas`.
> **Nota de organização:** este documento descreve *como construir* ferramentas MCP (guia de referência), não o estado atual completo do sistema — se `docs/ARCHITECTURE.md` (arquivo único, não pasta) for considerado o lugar correto para isso no futuro, avaliar migrar/linkar a partir de lá. Ver seção de melhorias no documento de lições aprendidas.

---

## 1. Arquitetura MCP utilizada neste projeto

O servidor MCP do IGNITE PRIME ("IGNITE PRIME MCP Lite") vive dentro de `api/system-tools.js`, na rota `?tool=mcp`, dentro do projeto Vercel `ignite-webhook`. Não é um serviço separado — é mais um branch do dispatcher `switch (tool)` já existente no arquivo.

- **Protocolo:** JSON-RPC 2.0 sobre HTTP POST ("Streamable HTTP", sem session IDs implementados).
- **Autenticação:** Bearer token (`MCP_LITE_SECRET`), checado só dentro do branch `case 'mcp'`.
- **Métodos suportados:** `initialize`, `notifications/initialized`, `tools/list`, `tools/call` — single ou batch (array de mensagens).
- **Ferramentas hoje (2026-07-30):** `verificar_conexao` (POC de handshake), `consultar_cobrancas` (Base44 PRIME, com regra de segurança que nunca retorna dado financeiro só por busca de nome), `consultar_cep` (ViaCEP, pública, sem autenticação externa).

## 2. Diferença entre `content` e `structuredContent`

Esta é a descoberta mais importante desta investigação — **um tool result MCP tem dois canais de saída diferentes, com visibilidade diferente para o modelo**:

| Campo | O que é | Visível ao modelo (LLM)? |
|---|---|---|
| `content` (array de blocos `text`/`image`/etc.) | Texto legível, "narração" do resultado | ✅ **Sim** — é o que o LLM efetivamente lê para formular a resposta |
| `structuredContent` (objeto JSON) | Dado estruturado, machine-parseable | ❌ **Não garantido** — em várias implementações de cliente MCP (LangChain, e confirmado no GPT Maker), fica isolado num canal separado ("artifact"), usado por widgets/aplicação, não injetado no contexto do modelo |

Confirmado pela especificação oficial do MCP e por múltiplas implementações de cliente (OpenAI Apps SDK, LangChain MCP adapters — pesquisado em 2026-07-30):

> "For backwards compatibility, a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block."

Ou seja, **o próprio protocolo já recomenda** duplicar a informação essencial em `content`, exatamente por saber que `structuredContent` pode não chegar ao modelo.

## 3. Quando usar cada um

- **`content`**: sempre que o resultado precisa influenciar a resposta que o modelo vai dar ao usuário. Deve conter **todos os dados que o modelo precisará para responder corretamente** — não um resumo incompleto assumindo que o resto "está em algum lugar acessível".
- **`structuredContent`**: dados para consumo programático (uma UI, um widget, uma etapa de pipeline determinística) — nunca a única fonte de um dado que o usuário final precisa ver na resposta do agente.

**Regra prática adotada neste projeto:** todo tool result MCP cujo consumidor final é um agente de IA (GPT Maker, Claude, etc.) deve colocar em `content` texto legível com **tudo que o modelo precisa para responder** — mesmo que o mesmo dado também exista, de forma estruturada, em `structuredContent`.

## 4. Caso real: bug e correção em `consultar_cep`

**Sintoma:** a Gabriela (agente GPT Maker) respondia ao cliente só com cidade/estado do CEP consultado, mesmo depois de o `behavior` dela ter sido atualizado com instruções detalhadas para usar logradouro e bairro.

**Causa raiz confirmada:** o `content` da ferramenta continha apenas um resumo (`"CEP encontrado: São Paulo/SP."`), enquanto logradouro e bairro só existiam em `structuredContent`. GPT Maker, como cliente MCP, entrega ao modelo somente o `content` — os campos estruturados nunca chegavam à Gabriela, então ela simplesmente não tinha essa informação disponível para usar (não era um problema no `behavior`).

**Correção aplicada** (`api/system-tools.js`, função `mcpToolCallConsultarCep`):

```javascript
// Antes — só cidade/estado
const textoResumo = `CEP encontrado: ${body.endereco.cidade}/${body.endereco.estado}.`

// Depois — todos os campos disponíveis, omitindo os vazios
function formatarTextoEnderecoCompleto(endereco) {
  const partes = [`CEP ${endereco.cep} encontrado.`]
  if (endereco.logradouro) partes.push(`Logradouro: ${endereco.logradouro}`)
  if (endereco.bairro) partes.push(`Bairro: ${endereco.bairro}`)
  partes.push(`Cidade: ${endereco.cidade}`)
  partes.push(`Estado: ${endereco.estado}`)
  if (endereco.complemento) partes.push(`Complemento: ${endereco.complemento}`)
  return partes.join('. ')
}
```

`structuredContent` continuou intocado, com todos os campos (incluindo IBGE, que deliberadamente **não** entra no `content` — não é informação útil para o cliente final).

## 5. Padrão recomendado para novas ferramentas MCP voltadas a LLM

Ao criar uma ferramenta cujo consumidor é um agente de IA:

1. **Liste, antes de codar, tudo que o modelo vai precisar para responder bem** — não só os campos "principais".
2. Construa o `content` como texto legível contendo esses dados, com omissão explícita de campos vazios (nunca `undefined`/`null`/string vazia visível).
3. Nunca exponha em `content` dados técnicos que o usuário final não precisa (IDs internos, códigos IBGE, JSON bruto, stack traces).
4. Espelhe os mesmos dados (mais os técnicos, se fizer sentido) em `structuredContent`, para consumo programático futuro (widgets, outras integrações).
5. Nunca assuma que o cliente MCP consumidor vai extrair dados de `structuredContent` para o modelo — trate isso como "não vai acontecer" por padrão.

## 6. Padrão estrutural já estabelecido no projeto (replicado em 3 ferramentas)

- **Helper file:** `api/_<nome>.js` — `export async function` (nunca `export default`), retorna `{httpStatus, body}`.
- **Rate limiter dedicado:** um `Map` em memória por ferramenta (nunca orçamento compartilhado entre ferramentas).
- **Entrada em `MCP_TOOLS`:** `name`, `description`, `inputSchema` com `additionalProperties: false`.
- **Branch de dispatch em `mcpToolCallDispatch`:** checa rate limit, loga a chamada (com IP truncado/hash, nunca dado sensível), chama o helper, delega a montagem do resultado a uma função `mcpToolCallXxx()`.
- **Função `mcpToolCallXxx()`:** monta `{isError, content, structuredContent}` — aqui é onde a regra da seção 3 se aplica.
- **Testes permanentes, dois arquivos por ferramenta:**
  - `api/__tests__/<nome>.test.js` — nível helper, mocka dependências externas.
  - `api/__tests__/system-tools-mcp-<nome>.test.js` — nível protocolo MCP, round-trip completo via `handler`.

## 7. Erros comuns (confirmados nesta investigação)

- **Assumir que `structuredContent` é suficiente** — não é, para a maioria dos clientes MCP hoje. Esse foi o bug real de `consultar_cep`.
- **Detectar notificação JSON-RPC pelo nome do método** em vez de pela ausência do campo `id` — corrigido em code review da primeira ferramenta (`verificar_conexao`).
- **Omitir `id` em respostas de sucesso** — usar sempre `id ?? null`, igual ao tratamento de erro.
- **Confiar no contrato documentado de uma API externa sem validar contra a resposta real** — o ViaCEP retorna `erro: "true"` (string), não `erro: true` (booleano); um teste com mock incorreto (usando booleano) não capturou esse bug, só a validação real em produção capturou.
- **Compartilhar rate limit entre ferramentas diferentes** — evitado desde o início; cada ferramenta tem seu próprio `Map`.

## 8. Checklist para novos MCPs (ferramentas voltadas a LLM)

- [ ] Levantei todos os campos que o modelo consumidor vai precisar para responder bem, antes de codar
- [ ] `content` contém texto legível com todos esses campos, omitindo vazios sem gerar `undefined`/`null` visível
- [ ] `content` não expõe dados técnicos/internos desnecessários (IDs, códigos internos, stack traces, JSON bruto)
- [ ] `structuredContent` espelha os dados para consumo programático, mas não é a única fonte de nada que o modelo precise
- [ ] Rate limiter dedicado (Map próprio, nunca compartilhado)
- [ ] Helper file segue o padrão `api/_<nome>.js`, retorna `{httpStatus, body}`
- [ ] `inputSchema` tem `additionalProperties: false`
- [ ] Testes permanentes em dois níveis (helper + protocolo MCP)
- [ ] Contrato de qualquer API externa validado contra uma chamada real, não só contra documentação/memória
- [ ] Erros nunca vazam detalhe interno (mensagem de rede, stack trace, secret) no `content`/`structuredContent`
