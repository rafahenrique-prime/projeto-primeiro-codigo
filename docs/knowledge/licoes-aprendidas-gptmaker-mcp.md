# Lições Aprendidas — Integração MCP `consultar_cep` e administração da Gabriela via API GPT Maker

**Data da investigação:** 2026-07-30
**Commits relacionados:** `6df4f67` (feat: adiciona consulta pública de CEP), `cdc7242` (fix: corrige CEP inexistente no ViaCEP), `58ce72d` (fix: inclui endereço completo no conteúdo de CEP)
**Status:** Resolvido
**Categoria:** IA, Integrações, MCP, GPT Maker
**Impacto:** A Gabriela (agente de vendas em produção) respondia incompleto a perguntas de CEP (só cidade/estado) mesmo após instruções corretas no `behavior` — nenhum dado sensível foi exposto, mas a experiência do cliente ficava pior que o esperado até a correção.
**Palavras-chave:** mcp, model context protocol, gpt maker, gptmaker, consultar_cep, viacep, content, structuredContent, behavior, api oficial, put, backup
**Arquivos relacionados:** `api/system-tools.js`, `api/_consultarCep.js`, `api/__tests__/consultarCep.test.js`, `api/__tests__/system-tools-mcp-cep.test.js`, `docs/integrations/GPTMAKER-API.md`, `docs/integrations/MCP-GUIDELINES.md`

---

## 1. Qual era o sintoma observado?

Depois de publicar a ferramenta MCP `consultar_cep` e atualizar o `behavior` da Gabriela com instruções detalhadas para responder com logradouro, bairro, cidade e estado, um teste real (via API de conversa e depois via WhatsApp) mostrou a Gabriela respondendo apenas com cidade e estado — como se as instruções novas não tivessem efeito algum.

## 2. Qual hipótese inicial parecia correta mas depois foi descartada?

A hipótese natural seria "a instrução do `behavior` não foi salva corretamente" ou "o texto da instrução está ambíguo". Ambas foram descartadas rapidamente: o `GET` de confirmação pós-`PUT` mostrou a seção 📍 CEP presente, íntegra e no lugar certo do `behavior`. O problema não estava na instrução — estava nos dados que a Gabriela efetivamente recebia para seguir essa instrução.

## 3. Qual foi a causa raiz verdadeira?

O tool result do MCP `consultar_cep` retornava os dados completos (logradouro, bairro, etc.) apenas em `structuredContent`, e um resumo incompleto ("CEP encontrado: São Paulo/SP.") em `content`. Conforme a especificação do MCP e a prática confirmada em múltiplas implementações de cliente (OpenAI Apps SDK, LangChain, e o próprio GPT Maker), **apenas o campo `content` é entregue ao contexto do modelo LLM** — `structuredContent` é tratado como canal separado para consumo programático (UI/widget/aplicação), não necessariamente visível ao modelo. A Gabriela nunca "viu" logradouro/bairro, então não havia como ela seguir a instrução do `behavior` — a informação simplesmente não estava no seu contexto.

## 4. Como ela foi descoberta?

1. Confirmação de que o `behavior` estava correto via `GET` na API oficial.
2. Chamada direta ao MCP `consultar_cep` em produção (`tools/call`), inspecionando a resposta JSON-RPC completa — revelou visualmente a diferença entre o `content` (resumido) e o `structuredContent` (completo).
3. Pesquisa dirigida sobre como clientes MCP tratam `structuredContent`, confirmando que a separação `content`/`structuredContent` é um comportamento documentado e esperado do protocolo, não uma peculiaridade do GPT Maker.

## 5. Auditorias importantes

- Antes de qualquer alteração de código, foi feita uma auditoria explícita para verificar se existia API oficial ou MCP oficial do GPT Maker para administrar agentes, evitando depender de automação de navegador desnecessariamente. Resultado: existe API REST oficial (`api.gptmaker.ai`, documentada em `developer.gptmaker.ai`); não existe MCP oficial do GPT Maker.
- Auditoria do `behavior` atual da Gabriela antes de qualquer alteração, incluindo backup integral via `GET` salvo em arquivo local com timestamp antes do primeiro `PUT`.

## 6. Erros evitados durante a investigação (e um que não foi evitado a tempo)

**Evitado:** a auditoria prévia da API oficial impediu o uso desnecessário de automação de navegador (mais lenta, mais frágil, exige login manual) para uma tarefa que a API resolvia de forma determinística.

**Não evitado (mas corrigido na hora):** o primeiro `PUT` no `behavior` da Gabriela foi enviado com apenas `{"behavior": "..."}`, presumindo que a API faria merge parcial. Ela não faz — o `PUT` substituiu o objeto inteiro, apagando `name`, `communicationType`, `type`, `jobName`, `jobDescription`, `jobSite` e trocando o `avatar`. O erro foi detectado imediatamente pelo `GET` de confirmação (parte do processo já estabelecido) e corrigido reenviando um `PUT` com o objeto completo reconstruído a partir do backup. Nenhum dado foi perdido permanentemente porque o backup já existia antes do primeiro `PUT`.

## 7. Qual foi a solução aplicada?

Duas correções distintas, em momentos diferentes:

**a) CEP inexistente retornando "encontrado" vazio** (`cdc7242`): o ViaCEP retorna `{"erro": "true"}` — uma **string**, não um booleano. O código original comparava `dados?.erro === true`, que nunca era verdadeiro. Corrigido para `dados?.erro === true || dados?.erro === 'true'`.

**b) Content incompleto para o modelo** (`58ce72d`): criada a função `formatarTextoEnderecoCompleto()`, que monta o texto do `content` com todos os campos disponíveis (CEP, logradouro, bairro, cidade, estado, complemento), omitindo campos vazios sem gerar `undefined`/`null` visível, e nunca expondo o código IBGE (informação técnica sem utilidade para o cliente final). `structuredContent` permaneceu intocado.

**c) Instrução de comportamento da Gabriela**: adicionada a seção 📍 CEP ao `behavior`, via API oficial (`PUT /v2/agent/{agentId}`), com backup prévio e restauração de campo após o incidente descrito na seção 6.

## 8. Como foi validada a correção?

1. Testes permanentes automatizados (`api/__tests__/consultarCep.test.js`, `api/__tests__/system-tools-mcp-cep.test.js`) cobrindo: `erro: true` booleano, `erro: "true"` string, `content` contendo todos os campos, `content` sem IBGE, campos vazios omitidos sem `undefined`/`null`, `structuredContent` completo. Suíte completa do projeto: 78 PASS, 0 FAIL.
2. Chamada real ao endpoint MCP publicado em produção, confirmando `content[0].text` com todos os campos esperados e ausência de dados técnicos.
3. `GET` de confirmação do `behavior` da Gabriela pós-`PUT`, validando byte a byte (via `diff` de `head`/`tail` em torno da inserção) que nada além da seção pretendida foi alterado.
4. Teste funcional pendente de confirmação final pelo usuário via WhatsApp real (fora do escopo desta auditoria de documentação).

## 9. Boas práticas definidas para futuras integrações com MCP e GPT Maker

- **API oficial antes de automação de navegador**, sempre que existir — mais rápida, determinística e auditável.
- **Nunca confiar que `structuredContent` chega ao modelo** — replicar em `content`, como texto legível, tudo que o modelo precisa para responder.
- **Todo `PUT` na API do GPT Maker deve enviar o objeto completo**, nunca apenas o campo alterado — a API não faz merge parcial.
- **Backup obrigatório via `GET` antes de qualquer `PUT`**, com timestamp, salvo em arquivo versionável.
- **Validação obrigatória via `GET` depois de qualquer `PUT`**, comparando campo a campo com o backup — nunca confiar apenas na resposta do próprio `PUT`.
- **Contratos de API externa devem ser validados contra uma chamada real**, não apenas contra a documentação ou a memória — o caso do `erro: "true"` (string) do ViaCEP só foi pego em produção porque o teste automatizado usava um mock com o tipo errado (booleano).

## 10. Checklist para futuras alterações envolvendo MCP + GPT Maker

- [ ] Confirmar se existe API/MCP oficial antes de recorrer a automação de navegador
- [ ] Para qualquer ferramenta MCP nova, listar antes de codar tudo que o modelo consumidor precisa ver
- [ ] Colocar esses dados como texto legível em `content`, nunca só em `structuredContent`
- [ ] Antes de alterar um agente GPT Maker: `GET` + backup com timestamp
- [ ] `PUT` sempre com o objeto completo (todos os campos, não só o alterado)
- [ ] Depois do `PUT`: novo `GET`, comparação campo a campo com o backup
- [ ] Validar contratos de API externa com uma chamada real antes de codar o tratamento de erro
- [ ] Testes automatizados devem usar o tipo de dado exato que a API externa realmente retorna (não a suposição mais "óbvia")

## 11. Melhorias arquiteturais identificadas para uma fase futura (fora desta correção)

- Existe um pequeno defeito cosmético no texto de `content` de `consultar_cep`: ponto duplo (`"encontrado.."`) quando a primeira parte da frase já termina em `.` e o `join('. ')` adiciona outro. Não afeta funcionalidade nem os critérios de aceite validados, mas vale um ajuste de polimento futuro.
- O endpoint `POST /v2/agent/{agentId}/conversation` (canal de teste da API oficial) não pareceu acionar ferramentas MCP durante o teste desta investigação (respondeu com saudação genérica em vez de processar a pergunta de CEP), enquanto o canal WhatsApp de produção funciona. Vale investigar formalmente se esse canal de teste tem as ferramentas MCP habilitadas, e documentar a limitação real (hoje é apenas uma observação registrada, não uma causa raiz confirmada).
- ~~`docs/architecture/MCP-GUIDELINES.md` foi criado como pasta nova (`docs/architecture/`), enquanto o padrão atual do projeto usa um arquivo único `docs/ARCHITECTURE.md` para descrever o estado atual do sistema.~~ **Resolvido na mesma sessão:** o documento foi movido para `docs/integrations/MCP-GUIDELINES.md`, alinhado à definição já existente em `docs/knowledge/README.md` ("como uma integração funciona"), e a pasta `docs/architecture/` foi removida por ter ficado vazia.

## 12. O que aprendemos sobre o protocolo MCP neste projeto

O ponto central: um `CallToolResult` do MCP tem **dois canais de saída com visibilidade diferente**. `content` (blocos de texto/imagem) é o que o modelo LLM efetivamente lê. `structuredContent` (JSON) é, na prática de múltiplas implementações de cliente hoje (incluindo o GPT Maker), reservado para consumo programático — não garantidamente visível ao modelo. A própria especificação recomenda duplicar dados estruturados relevantes como texto em `content`, exatamente por essa razão. Isso muda a forma correta de projetar qualquer ferramenta MCP cujo consumidor final é um agente de IA: o `content` precisa ser autossuficiente, e `structuredContent` deve ser tratado como um bônus, nunca como a fonte primária de informação para a resposta do modelo.

---

## Resumo Executivo

A Gabriela respondia incompleto ("só cidade/estado") a perguntas de CEP mesmo com o `behavior` corretamente atualizado. A causa raiz não estava na instrução, mas no dado disponível: o MCP `consultar_cep` retornava o endereço completo apenas em `structuredContent`, campo que — conforme confirmado pela especificação do MCP e pela prática de múltiplos clientes, incluindo o GPT Maker — não chega ao contexto do modelo LLM; só `content` chega. A correção (commit `58ce72d`) reconstruiu o `content` para incluir todos os campos úteis do endereço (CEP, logradouro, bairro, cidade, estado, complemento), omitindo vazios e nunca expondo o código IBGE, mantendo `structuredContent` intacto. No caminho, um bug secundário foi corrigido (`cdc7242`): o ViaCEP retorna `erro: "true"` como string, não booleano, então CEPs inexistentes eram tratados incorretamente como "encontrados" com campos vazios. Também foi confirmado, e corrigido dentro da mesma sessão, que o `PUT` da API do GPT Maker substitui o objeto de agente inteiro (não faz merge parcial) — um primeiro `PUT` parcial no `behavior` apagou outros campos do agente por engano, mas foi restaurado imediatamente a partir de um backup feito previamente via `GET`, sem perda permanente. Testes permanentes cobrem ambos os bugs; suíte completa: 78 PASS, 0 FAIL. Documentação consolidada em `docs/integrations/GPTMAKER-API.md` (uso da API oficial do GPT Maker) e `docs/integrations/MCP-GUIDELINES.md` (padrão de `content`/`structuredContent` para novas ferramentas MCP).
