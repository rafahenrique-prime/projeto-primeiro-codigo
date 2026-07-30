# docs/integrations/GPTMAKER-API.md — API Oficial do GPT Maker

> **Fonte:** confirmado em produção durante a implementação do MCP `consultar_cep` e a atualização do behavior da Gabriela (2026-07-30).
> **Propósito:** documentar como ler e escrever a configuração de um agente GPT Maker (nome, comportamento, tipo, etc.) via API oficial, sem depender de automação de navegador.

---

## 1. Visão geral

O GPT Maker expõe uma API REST oficial e documentada em `https://developer.gptmaker.ai`, com base de execução em `https://api.gptmaker.ai`. Ela permite listar agentes, ler e atualizar sua configuração (incluindo o campo `behavior`, que é o texto de "Comportamento" editado normalmente pela UI), e conversar com um agente via API (canal de teste, sem WhatsApp).

**Não existe MCP oficial do GPT Maker** para administração de agentes (confirmado por pesquisa em 2026-07-30 — os resultados relacionados a "GPT Maker MCP" eram tutoriais genéricos de terceiros sobre o protocolo MCP, não algo publicado pelo GPT Maker).

**Ordem de preferência confirmada nesta investigação:** API oficial > automação de navegador. A API oficial é determinística, auditável (comandos e respostas ficam no log) e não depende de sessão de login nem de cliques em elementos de UI que podem mudar.

## 2. Autenticação

Toda chamada usa `Authorization: Bearer <token>`.

## 3. Diferença entre `VITE_GPTMAKER_TOKEN` e `VITE_GPTMAKER_USER_TOKEN`

O projeto tem **dois tokens GPT Maker diferentes** em `.env.local`, com propósitos distintos — confundi-los quebra a chamada:

| Variável | Origem | Funciona com a API oficial (`api.gptmaker.ai`)? |
|---|---|---|
| `VITE_GPTMAKER_TOKEN` | Chave de API dedicada (obtida em `app.gptmaker.ai/browse/developers`) | ✅ **Sim** — confirmado funcionando em `GET /v2/workspace/{workspaceId}/agents`, `GET /v2/agent/{agentId}`, `PUT /v2/agent/{agentId}` e `POST /v2/agent/{agentId}/conversation` |
| `VITE_GPTMAKER_USER_TOKEN` | Token de sessão do navegador (extraído via `view-source:` ou DevTools, expira ~24h) | ❌ **Não** — testado em 2026-07-30 contra `GET /v2/workspace/{workspaceId}/agents`, retornou `{"error": "Invalid or missing token!"}` |

**Regra prática:** para chamadas à API oficial (`api.gptmaker.ai`), sempre usar `VITE_GPTMAKER_TOKEN`. `VITE_GPTMAKER_USER_TOKEN` continua servindo para os outros usos já documentados no `CLAUDE.md` do projeto (card de créditos, etc.), que não passam pela API REST oficial.

## 4. Descoberta do `agentId`

Não existe endpoint de "buscar agente por nome" — é preciso listar todos os agentes do workspace e filtrar pelo campo `name`:

```bash
GET https://api.gptmaker.ai/v2/workspace/{workspaceId}/agents
Authorization: Bearer <VITE_GPTMAKER_TOKEN>
```

Resposta: `{ "data": [ {id, avatar, name, status, communicationType, type, jobName, jobDescription, jobSite, behavior}, ... ], "count": N }`.

`workspaceId` já está documentado no `CLAUDE.md` do projeto (`VITE_GPTMAKER_WORKSPACE` = `3F300E7C6105E0123A946E0E9A5EC274`).

Agentes confirmados neste workspace em 2026-07-30 (todos "PRIME STORE"):

| Nome | agentId | Status |
|---|---|---|
| Gabi teste | `3F3023FFB211E091C3F0A64CAD83B7C7` | ACTIVE |
| **Gabriela** (produção) | `3F4713FF6FA970BC0ED406900922C6C1` | ACTIVE |
| Gaby 02 | `3F4CAF25ED2E60A5E68946D5683B91AB` | DISABLED |
| Group Prime Store | `3F55D181884A9024315FDE704A65A053` | DISABLED |

## 5. Endpoints utilizados

### GET — ler configuração completa de um agente

```bash
GET https://api.gptmaker.ai/v2/agent/{agentId}
Authorization: Bearer <token>
```

Retorna o objeto completo: `id`, `avatar`, `name`, `status`, `communicationType`, `type`, `jobName`, `jobDescription`, `jobSite`, `behavior`.

### PUT — atualizar configuração de um agente

```bash
PUT https://api.gptmaker.ai/v2/agent/{agentId}
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "...", "avatar": "...", "behavior": "...", "communicationType": "...", "type": "...", "jobName": "...", "jobSite": "...", "jobDescription": "..." }
```

### Conversar com o agente (canal de teste, sem WhatsApp)

```bash
POST https://api.gptmaker.ai/v2/agent/{agentId}/conversation
Authorization: Bearer <token>
Content-Type: application/json

{ "text": "mensagem de teste", "chatId": "identificador-opcional-da-conversa" }
```

**Limitação observada (não investigada a fundo, fora do escopo da sessão que a encontrou):** em teste real (2026-07-30), duas chamadas consecutivas para `consultar_cep` via este endpoint retornaram mensagens genéricas de saudação/acolhimento, sem acionar a ferramenta MCP — mesmo com o MCP já sincronizado e funcionando corretamente via WhatsApp de produção. Hipótese não confirmada: o canal de teste da API pode não ter as mesmas ferramentas MCP habilitadas que o canal WhatsApp de produção. Se for necessário validar uma ferramenta MCP end-to-end, o teste real por WhatsApp continua sendo a fonte de verdade — este endpoint de conversa não deve ser considerado equivalente até essa limitação ser esclarecida.

## 6. Backup (obrigatório antes de qualquer PUT)

Antes de qualquer alteração, salvar o `GET` completo em um arquivo local com timestamp:

```bash
curl -s "https://api.gptmaker.ai/v2/agent/${AGENT_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -o "docs/backups/gabriela-behavior-backup-$(date +%Y-%m-%d_%H%M%S).json"
```

Exemplo real usado nesta sessão: `docs/backups/gabriela-behavior-backup-2026-07-30_152958.json`.

## 7. Limitação crítica do PUT: não faz merge parcial

**Confirmado em produção em 2026-07-30, por acidente real (não hipótese):** enviar um `PUT` com apenas `{"behavior": "..."}` **sobrescreveu e apagou** todos os outros campos do agente. O `GET` de confirmação pós-`PUT` mostrou:

| Campo | Antes | Depois do PUT parcial |
|---|---|---|
| `name` | `"Gabriela"` | `""` (vazio) |
| `communicationType` | `"RELAXED"` | `"NORMAL"` (default da API) |
| `type` | `"SALE"` | `null` |
| `jobName` | `"PRIME STORE"` | `null` |
| `jobDescription` | texto completo | `null` |
| `jobSite` | `"www.primestoremen.com.br"` | `null` |
| `avatar` | URL original | trocado para um avatar gerado automaticamente |

**Regra obrigatória:** todo `PUT` deve enviar o **objeto completo** (todos os campos, mesmo os que não mudaram), nunca só o campo alterado. O incidente foi corrigido na mesma sessão reenviando um segundo `PUT` com todos os campos do backup + o campo modificado, e confirmado via novo `GET`.

## 8. Restauração (em caso de erro)

Se um `PUT` parcial já foi enviado por engano:

1. Recuperar o backup salvo antes da mudança (passo 6).
2. Montar o payload completo: todos os campos do backup + apenas o campo que deveria ter sido alterado.
3. Reenviar via `PUT` o objeto completo.
4. Confirmar via `GET` que todos os campos batem com o backup, exceto o campo intencionalmente alterado.

## 9. Validação

Depois de qualquer `PUT`, sempre fazer um novo `GET` e comparar campo a campo com o estado esperado — nunca confiar apenas no corpo de resposta do próprio `PUT` (que pode ou não ecoar o objeto salvo).

Para alterações de texto longo (como `behavior`), validar também que o conteúdo **antes** e **depois** do trecho alterado é byte-idêntico ao original (ex.: `diff` do `head`/`tail` em torno do ponto de inserção) — garante que nada foi truncado ou reordenado além da mudança pretendida.

## 10. Fluxo recomendado para alterar um agente

1. `GET` do agente e salvar backup com timestamp.
2. Construir o novo valor do campo desejado (ex.: novo `behavior`) a partir do valor lido, nunca de memória/suposição.
3. Montar o payload do `PUT` com **todos os campos do backup**, substituindo apenas o campo alterado.
4. Enviar o `PUT`.
5. `GET` de confirmação — comparar campo a campo com o backup.
6. Se algo além do campo pretendido mudou, restaurar imediatamente (seção 8) antes de prosseguir.
7. Validar o comportamento na prática (teste controlado) antes de considerar a mudança concluída.

## 11. Checklist antes de alterar um agente

- [ ] Confirmei o `agentId` correto (nunca assumir — sempre confirmar por `name` na listagem)
- [ ] Fiz `GET` e salvei backup com timestamp em `docs/backups/`
- [ ] O novo valor do campo foi construído a partir do texto lido (não reescrito de memória)
- [ ] O payload do `PUT` contém **todos** os campos do agente, não só o alterado
- [ ] Mostrei o trecho exato que será alterado e recebi aprovação antes de enviar o `PUT`
- [ ] Após o `PUT`, fiz novo `GET` e confirmei campo a campo contra o backup
- [ ] Testei o comportamento na prática (canal de teste ou WhatsApp) antes de considerar concluído
- [ ] Não expus o token em nenhum log, comando impresso ou resposta
