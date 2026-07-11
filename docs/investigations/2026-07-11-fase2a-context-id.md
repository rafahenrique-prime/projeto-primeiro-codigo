# Fase 2A — Captura automática de identidade via `context_id`

**Data da investigação:** 2026-07-11
**Sistema:** IGNITE PRIME CRM — webhook `api/webhook.js` (projeto Vercel `ignite-webhook`)
**Autores:** Rafael Henrique (decisões e testes reais) + Claude (auditoria, implementação, testes de API)
**Status ao final deste documento:** solução funcionando em produção, comprovada por evidência real. Instrumentação de diagnóstico (`[IDENTITY_DEBUG]`) ainda ativa, pendente de remoção em commit separado.

---

## 1. Objetivo da Fase 2A

Fazer `api/webhook.js` (o webhook que a Gabriela usa em toda mensagem real de cliente, via GPT Maker) **capturar e persistir automaticamente a identidade do cliente em `customer_profiles`**, sem depender de o Rafael abrir o painel interno (`ChatArea.jsx`/`DealOncaPage.jsx`), que era o único caminho de escrita existente até então.

Objetivo explícito: **só identidade** (existência do cliente, telefone, canal). Não incluía, nesta fase: enviar memória pro prompt da Gabriela, `buildProfileBlock` no webhook, ou qualquer mudança de estratégia de venda — isso fica para a Fase 2B em diante.

---

## 2. Arquitetura original antes das alterações

Antes da Fase 2A, `customer_profiles` tinha **dois caminhos, ambos manuais/dependentes de o Rafael estar com o app aberto**:

1. **`ChatArea.jsx`** — `upsertProfile(conv, msgList)` rodava a cada 5s, só enquanto aquela conversa específica estivesse aberta na tela.
2. **`DealOncaPage.jsx`** — sincronizava até 20 perfis automaticamente ao carregar o painel CODEX, também client-side, também dependente do navegador do Rafael estar aberto.

Um terceiro caminho, **`api/cron-diagnosis.js`** (cron automático, 2x/dia), já rodava sozinho — mas só **refinava** o `buy_score` de perfis que já existiam (via `patchCustomerScore`), nunca criava linha nova.

**`api/webhook.js`** — o caminho que roda a cada mensagem real de cliente, no servidor, sem depender de ninguém com o app aberto — **nunca tocava em `customer_profiles`**. Zero leitura, zero escrita.

Chave usada: `conv_id`, sempre igual ao `chatId` real do GPT Maker (obtido via `listChats()` / `GET /v2/workspace/{WS}/chats`).

---

## 3. Problema inicial encontrado

Auditoria solicitada pelo Rafael revelou: **se um cliente novo conversasse só com a Gabriela e nunca aparecesse no painel, ele nunca teria linha em `customer_profiles`** — mesmo trocando dezenas de mensagens. A "memória do cliente" e "memória comercial" do sistema CODEX tinham maturidade baixa (25% e 20%, respectivamente) porque o canal de maior volume (a conversa real via WhatsApp/Instagram) era cego a essa tabela.

---

## 4. Linha do tempo completa da investigação

| # | Evento |
|---|---|
| 1 | Auditoria geral de memória do CODEX (customer_profiles, agent_learnings, weekly_insights) — mapeamento do estado atual |
| 2 | Design da Fase 1.5 (fazer a Gabriela usar `customer_profiles` nas respostas) — descoberto que `customer_profiles` é "pouco utilizado" de fato |
| 3 | Auditoria "quem realmente popula `customer_profiles`" — achado: só o painel escreve, `api/webhook.js` nunca toca a tabela |
| 4 | Design da Fase 1A (fazer `api/webhook.js` escrever sozinho) |
| 5 | Auditoria do fluxo GPT Maker → webhook — descoberta do `${contextId}` como único identificador automático disponível |
| 6 | Auditoria de estabilidade do `contextId` — teste real (Teste A/B) confirma: estável dentro da mesma conversa e entre conversas diferentes do mesmo cliente (WhatsApp) |
| 7 | Auditoria complementar Instagram (Fase 1.6C) — `telefone` vem vazio, formato de `context_id` diferente do WhatsApp |
| 8 | Migration 011 (`context_id`) criada e aplicada — preparação de schema, Fase 1A |
| 9 | Implementação inicial de `api/_profileIdentity.js` + hook em `api/webhook.js` — commit `7d54d6f`, deploy |
| 10 | **Bug 1 encontrado:** teste real mostrou `context_id`/`telefone` continuando `NULL` |
| 11 | Auditoria de causa raiz — reprodução direta via `curl` contra Supabase revela: `conv_id` é `NOT NULL`, sem default, e o `INSERT` da Fase 2A nunca o preenchia |
| 12 | Migration 012 (`telefone`) criada e aplicada |
| 13 | Plano de correção aprovado: reconciliar por `conv_id` antes de criar linha nova |
| 14 | Verificação de schema real via `curl` direto: `conv_id` é `NOT NULL` + `UNIQUE`; `context_id` não tem `UNIQUE`; nenhuma outra coluna é `NOT NULL` |
| 15 | Implementação da correção em `api/_profileIdentity.js` — commit `b4d45f0`, deploy |
| 16 | **Bug 2 encontrado:** teste real ainda mostrou `NULL` — mas investigação revelou a causa: valores chegavam com **`$` residual** (`"$3F306A8A...`", "`$553497257499`") — a correção de reconciliação estava certa, só que a chave gerada (`"$3F306A8A...-...`") nunca batia com a chave limpa que alguém checaria |
| 17 | Auditoria da sintaxe de variável do GPT Maker — descoberta, com fonte oficial, que a sintaxe correta é `@variavel`, não `${variavel}` |
| 18 | Rafael trocou o Body da Ação "Buscar Produtos" pra `@pergunta`/`@contextId`/`@whatsappPhone` |
| 19 | **Bug 3 encontrado:** busca de produtos parou de funcionar — Gabriela passou a responder só via GPT Maker, sem dados da base |
| 20 | Rafael restaurou o Body pra `${pergunta}`/`${contextId}`/`${whatsappPhone}` — busca de produtos voltou a funcionar |
| 21 | Implementação da correção defensiva mínima: `removerDollarInicial()` em `api/webhook.js` — commit `5e2551e`, deploy |
| 22 | **Bug 4 (falso positivo) encontrado:** teste real ainda mostrou `NULL`, sem linha `$`-contaminada nova — investigação revelou que a linha mais recente tocada era de **antes** da restauração do Body (timestamp anterior ao `updatedAt` da intenção), contendo valores **literais não substituídos** (`"@contextId"`, `"@whatsappPhone"`) — prova de que a sintaxe `@variavel` não resolve esses dois nomes de variável nessa Ação específica |
| 23 | Aprovação da instrumentação temporária `[IDENTITY_DEBUG]` — commit `cc6f474`, deploy |
| 24 | Teste oficial cronometrado ("mandei agora") — **sucesso confirmado**: `context_id` e `telefone` gravados limpos, sem `$`, na linha correta, via reconciliação por `conv_id` |

---

## 5. Todas as hipóteses levantadas

1. `context_id` poderia ser instável (mudar por conversa/sessão) — testável e descartável com teste real.
2. `context_id` poderia ser idêntico entre WhatsApp e Instagram, permitindo reconciliação universal.
3. `conv_id` e `context_id` poderiam nunca se relacionar (populações de perfil permanentemente separadas).
4. A causa de `NULL` poderia ser: código não deployado.
5. A causa de `NULL` poderia ser: RLS bloqueando a escrita.
6. A causa de `NULL` poderia ser: chave/URL do Supabase erradas.
7. A causa de `NULL` poderia ser: `conv_id` `NOT NULL` sem ser preenchido no `INSERT`.
8. A causa de `NULL` poderia ser: `$` residual quebrando a comparação de chave.
9. A sintaxe `${variavel}` poderia estar simplesmente errada, e `@variavel` ser a forma correta e completa.
10. A causa do "sumiço" da busca de produtos após trocar pra `@variavel` poderia ser desativação da intenção.
11. A causa de `NULL` no teste pós-instrumentação poderia ser: `cliente_id` chegando vazio/`undefined`, fazendo `upsertIdentity()` abortar por cair no fallback `'desconhecido'`.

---

## 6. Cada hipótese descartada e a evidência que levou ao descarte

| Hipótese | Descartada por | Evidência |
|---|---|---|
| `context_id` instável por conversa | Sim, descartada | Teste A (3 mensagens, mesma conversa) e Teste B (nova conversa, mesmo número, após encerrar) → mesmo valor 4x seguidas |
| `context_id` idêntico entre WhatsApp e Instagram | Parcialmente descartada, depois corrigida | Auditoria inicial (Fase 1.6C) mostrou formatos diferentes entre os dois testes de Instagram feitos; **correção posterior do Rafael**: nos dados reais já observados, o Instagram testado *também* tinha `conv_id` idêntico ao `context_id` capturado (`3F32CBBAD3BD8028A2F132532B60D052-26970748635900319`) — ou seja, a hipótese de reconciliação universal (não só WhatsApp) foi **confirmada**, não descartada, após a correção factual do Rafael |
| Código não deployado (causa do Bug 1) | Confirmada como causa real | `git status` mostrava `api/webhook.js` modificado e `api/_profileIdentity.js` não commitado; deployment mais recente na Vercel tinha 7h, anterior às edições |
| RLS bloqueando escrita | Descartada | Reprodução direta via `curl` retornou erro `23502` (`not_null_violation`), não `42501`/401/403 (que indicariam RLS) — RLS nem chegou a ser avaliado como bloqueio |
| URL/chave erradas | Descartada | `SELECT` funcionou normalmente (200), prova de autenticação/URL corretos; só o `INSERT` falhava |
| `conv_id` `NOT NULL` sem ser preenchido | **Confirmada como causa raiz do Bug 1** | Reprodução direta via `curl`: `{"code":"23502","message":"null value in column \"conv_id\" ... violates not-null constraint"}` |
| `$` residual quebrando a chave | **Confirmada como causa raiz do Bug 2** | Consulta a `customer_profiles` mostrou linha real com `conv_id`/`context_id`/`telefone` todos prefixados com `$`, valor genuíno por trás |
| `${variavel}` simplesmente errado, `@variavel` correto e completo | Descartada — parcialmente certa, parcialmente errada | Doc oficial do GPT Maker confirma `@` como sintaxe correta em geral, e `@pergunta`/`@chatId`/`@message`/`@mensagem` funcionam nas outras Ações — mas `@contextId`/`@whatsappPhone` especificamente **não foram resolvidos** nessa Ação, chegando como texto literal (`"@contextId"`) — prova de que a sintaxe correta *depende de o nome estar registrado como campo/variável reconhecida* naquele contexto específico, não é uma regra universal simples |
| Intenção desativada (causa do sumiço da busca) | Não totalmente investigada, tornou-se irrelevante | O Rafael restaurou o Body antes de aprofundar essa hipótese especificamente; API confirmou depois que a intenção seguia `active: true` durante todo o processo |
| `cliente_id` vazio causando abort silencioso (Bug 4) | Levantada, nunca confirmada nem descartada com certeza | O teste seguinte (oficial, cronometrado) mostrou resultado positivo (gravação correta), tornando a pergunta específica desse teste anterior sem resposta definitiva — provavelmente foi um teste que não chegou a acionar a Ação "Buscar Produtos" (comportamento já visto antes com mensagens sem produto, ex: "Oi, voltei") |

---

## 7. Todos os testes realizados

### WhatsApp
- Teste A: 3 mensagens seguidas na mesma conversa (`"e camiseta?"`, `"e bermuda, tem?"`, `"camiseta regata"`) → `cliente_id` idêntico nas 3
- Teste B: encerrar conversa + nova mensagem (`"quero ver tênis"`) → `cliente_id` idêntico ao anterior, confirmando estabilidade entre conversas
- Testes de causa raiz: chamada direta via `curl` ao endpoint de produção com `cliente_id`/`telefone` sintéticos, validando o fluxo de ponta a ponta
- Teste oficial final (`"quero ver tênis masculino"`): confirmação de gravação limpa em produção

### Instagram
- `@primestore.udi`: `"quero ver tênis"` → capturado `telefone` vazio, `context_id` com formato próprio
- `@primestorecenter`: mensagem enviada, mas **não capturada em log** (limitação de streaming, não ausência de chamada)
- Segunda mensagem no `@primestore.udi` (`"chinelo boss e top?"`) confirmada por print de tela (resposta real com produto/preço/link), mas **não capturada em log** — mesma limitação

### Vercel (infraestrutura)
- `vercel logs --follow` testado repetidamente ao longo de toda a investigação — comportamento **inconsistente**: às vezes captura, às vezes fica "waiting for new logs..." sem nada, às vezes atinge `"Exceeded query duration limit of 5 minutes"` e encerra sozinho
- `vercel alias ls` usado repetidamente pra confirmar qual deployment está de fato servindo produção
- `vercel --prod --yes` usado em cada ciclo de deploy
- Deployments verificados: `dpl_9cmF2jy6...` → `dpl_6rHGXkSkCr...` → `dpl_EdbXoVAV9...` → `dpl_AqguEpniG4...` → `dpl_2Lih1qr49A...`

### Supabase
- Testes diretos via `curl` contra a REST API (`/rest/v1/customer_profiles`) pra: confirmar existência de colunas, reproduzir erros de `INSERT`, descobrir constraints (`NOT NULL`, `UNIQUE`), consultar linhas por `conv_id`/`context_id`, limpar linhas de teste criadas durante o diagnóstico
- Query final por `last_seen` para correlacionar timestamp exato do teste oficial com a linha afetada

---

## 8. Logs importantes encontrados

**Log que revelou o `$` residual pela primeira vez** (antes de entender o que era):
```
[Webhook] 📨 Requisição recebida: {
  pergunta: '$camiseta',
  cliente_id: '$3F306A8AE23B00F062505E58F272F8DC-553497257499',
  telefone: '$553497257499'
}
```

**Erro exato do Postgres que revelou a causa raiz do Bug 1:**
```json
{
  "code": "23502",
  "message": "null value in column \"conv_id\" of relation \"customer_profiles\" violates not-null constraint"
}
```

**Erro que confirmou a unique constraint de `conv_id`:**
```json
{
  "code": "23505",
  "message": "duplicate key value violates unique constraint \"customer_profiles_conv_id_key\""
}
```

**Linha que revelou o Bug 3/4 (variável não resolvida pela sintaxe `@`):**
```json
{
  "conv_id": "@contextId",
  "context_id": "@contextId",
  "telefone": "@whatsappPhone"
}
```

**Log final confirmando sucesso (teste oficial):**
```
[Webhook] 📨 Requisição recebida: {
  pergunta: '$tenis masculino',
  cliente_id: '$3F306A8AE23B00F062505E58F272F8DC-553497257499',
  telefone: '$553497257499'
}
```
seguido da linha em `customer_profiles` gravada **sem** `$`:
```json
{
  "conv_id": "3F306A8AE23B00F062505E58F272F8DC-553497257499",
  "context_id": "3F306A8AE23B00F062505E58F272F8DC-553497257499",
  "telefone": "553497257499",
  "last_seen": "2026-07-11T06:45:53.087+00:00"
}
```

---

## 9. Problemas descobertos durante a investigação

### `conv_id` `NOT NULL`
Não documentado previamente em `docs/SUPABASE.md` (a tabela inteira estava na categoria "sem migration versionada"). Só descoberto por reprodução direta do erro. **Nenhuma outra coluna de `customer_profiles` é `NOT NULL`** — confirmado testando `INSERT` só com `conv_id` (sucedeu, 201).

### `context_id` sem `UNIQUE`
Confirmado por teste direto: dois `INSERT`s com o mesmo `context_id` (e `conv_id` diferentes) foram aceitos sem erro. Isso é um risco latente de duplicidade em cenário de corrida, mitigado (não eliminado) pelo fato de `conv_id` ter `UNIQUE`.

### Reconciliação `conv_id` ↔ `context_id`
Descoberta chave da investigação: nos dados reais, `conv_id` (chave usada pelo painel, vinda de `listChats()`) e `context_id` (chave usada pelo webhook, vinda do template `${contextId}` do GPT Maker) **coincidem no mesmo valor**, tanto em WhatsApp quanto em Instagram (correção factual do Rafael sobre a observação inicial). Isso permitiu desenhar um fluxo de reconciliação (buscar por `context_id` → fallback por `conv_id`) que unifica as duas populações de perfil sem precisar de tabela de mapeamento nem migração de dados.

### `$` residual vindo do GPT Maker
O template `${variavel}` do GPT Maker, ao substituir a variável, deixava um `$` sobrando no início do valor (ex: `${contextId}` → `$3F306A8A...`, não `3F306A8A...`). Corrigido no lado do nosso código (`removerDollarInicial()`), não no GPT Maker, porque a fonte oficial do problema (motor de template do GPT Maker) está fora do nosso controle.

### Diferença WhatsApp vs. Instagram
- WhatsApp: `telefone` sempre presente; formato de `context_id`/`conv_id` = `{hex-fixo-do-agente}-{telefone}`
- Instagram: `telefone` sempre vazio (`${whatsappPhone}` não se aplica a esse canal); formato de `context_id`/`conv_id` = `{hex-diferente}-{ID interno do Instagram, numérico longo}`
- Confirmado, após correção do Rafael: mesmo com formatos diferentes entre si, `conv_id` e `context_id` **dentro do mesmo canal** continuam coincidindo — a reconciliação funciona nos dois canais, só com "sabores" de identificador diferentes entre eles.

### Limitações encontradas nos logs da Vercel
- `vercel logs --follow` tem um limite de sessão de ~5 minutos (`"Exceeded query duration limit of 5 minutes"`), exigindo reinício manual repetido durante toda a investigação
- Captura de log **inconsistente mesmo dentro da janela de 5 minutos** — várias vezes uma chamada real e confirmada (por resposta real da Gabriela com produto) não apareceu no stream, sem explicação encontrada
- Não há acesso confiável a um histórico retroativo de logs via CLI nesta configuração de projeto — toda captura precisou ser feita ao vivo, no exato momento do teste

---

## 10. Todas as decisões arquiteturais tomadas e o motivo de cada uma

| Decisão | Motivo |
|---|---|
| Usar `context_id` (não `conv_id`) como chave do caminho automático | É o único identificador que o webhook recebe sem depender de mudança de configuração maior no GPT Maker |
| Não migrar `conv_id` pra `context_id` no painel | Evitar quebrar o que já funciona (`ChatArea.jsx`, `DealOncaPage.jsx`, `customerProfileService.js`) |
| Reconciliar por `conv_id` como fallback, em vez de manter populações separadas | Dados reais provaram que os dois valores coincidem — reconciliar é estritamente melhor que duplicar, sem custo de migração |
| Não gerar `conv_id` sintético | O próprio `contextId` já serve como valor real e válido pra essa coluna quando se cria uma linha nova — gerar outro valor arbitrário só adicionaria complexidade sem benefício |
| Não alterar a constraint `NOT NULL` de `conv_id` | A constraint em si está correta e é útil (evita perfis "fantasma" sem nenhum identificador) — o problema era o código não fornecer o valor, não a constraint estar errada |
| Corrigir o `$` residual no nosso código, não pedir mudança no motor do GPT Maker | O comportamento do motor de template do GPT Maker está fora do nosso controle; uma função pequena e local (`removerDollarInicial`) resolve com escopo mínimo |
| Fire-and-forget + fallback silencioso em toda a Fase 2A | Erro de gravação de identidade nunca pode atrasar ou quebrar a resposta real da Gabriela pro cliente — prioridade absoluta é não regredir o que já funciona |
| Instrumentação temporária (`[IDENTITY_DEBUG]`) isolada em commit próprio | Permite remoção limpa depois, sem misturar diagnóstico com lógica de produção no histórico do Git |

---

## 11. Arquivos alterados durante a investigação

| Arquivo | Commit(s) | Natureza |
|---|---|---|
| `supabase/migrations/011_customer_profiles_context_id.sql` | (Fase 1A) | Nova migration — coluna `context_id` |
| `supabase/migrations/012_customer_profiles_telefone.sql` | (Fase 2A) | Nova migration — coluna `telefone` |
| `api/_profileIdentity.js` | `7d54d6f` (criação), `b4d45f0` (correção de reconciliação) | Novo módulo — captura/reconciliação de identidade |
| `api/webhook.js` | `7d54d6f` (hook inicial), `5e2551e` (`removerDollarInicial`), `cc6f474` (instrumentação `[IDENTITY_DEBUG]`, pendente de remoção) | Handler principal do webhook |
| `docs/SUPABASE.md` | `7d54d6f` | Documentação das novas colunas/fluxo |

**Não alterados, por decisão explícita:** `customerProfileService.js`, `ChatArea.jsx`, `DealOncaPage.jsx`, `formatarRespostaGPT()`, `searchKnowledge()`, payload de resposta ao GPT Maker, RLS/policies.

---

## 12. Fluxo final funcionando (diagrama ASCII)

```
Cliente manda mensagem (WhatsApp ou Instagram)
    │
    ▼
GPT Maker roteia pra Gabriela → Ação "Buscar Produtos"
    │
    ▼
POST /api/webhook
{ pergunta: "${pergunta}", cliente_id: "${contextId}", telefone: "${whatsappPhone}" }
    │   (chega com "$" residual — artefato conhecido do GPT Maker)
    ▼
api/webhook.js
    │
    ├─→ removerDollarInicial(cliente_id) ──→ valor limpo
    ├─→ removerDollarInicial(telefone)   ──→ valor limpo
    │
    ├─→ searchKnowledge(pergunta) ──→ products + knowledge ──→ resposta pro GPT Maker
    │                                                          (fluxo de busca, intocado)
    │
    └─→ upsertIdentity({ contextId, telefone, canal })   [fire-and-forget]
            │
            ▼
        api/_profileIdentity.js
            │
            ├─ 1. Busca por context_id
            │      │
            │      ├─ Encontrou → PATCH (preenche telefone/channel só se vier valor válido)
            │      │
            │      └─ Não encontrou
            │             │
            │             ▼
            ├─ 2. Busca por conv_id = contextId (reconciliação com o painel)
            │      │
            │      ├─ Encontrou → PATCH: preenche context_id + telefone/channel
            │      │              (nunca sobrescreve com null/vazio)
            │      │
            │      └─ Não encontrou
            │             │
            │             ▼
            └─ 3. INSERT { conv_id: contextId, context_id: contextId,
                            telefone: telefone||null, channel: canal||null }

Resposta volta pro GPT Maker → Gabriela responde o cliente
(a captura de identidade nunca atrasa nem quebra essa resposta)
```

---

## 13. Evidências finais que comprovam que a solução funciona em produção

Teste oficial cronometrado, mensagem real "quero ver tênis masculino", horário confirmado por correlação de timestamp entre o log de entrada e o `last_seen` gravado:

**Requisição recebida** (log real, produção):
```
[Webhook] 📨 Requisição recebida: {
  pergunta: '$tenis masculino',
  cliente_id: '$3F306A8AE23B00F062505E58F272F8DC-553497257499',
  telefone: '$553497257499'
}
```

**Linha em `customer_profiles` logo após, consultada diretamente:**
```json
{
  "conv_id": "3F306A8AE23B00F062505E58F272F8DC-553497257499",
  "context_id": "3F306A8AE23B00F062505E58F272F8DC-553497257499",
  "telefone": "553497257499",
  "created_at": "2026-06-21T01:01:32.498061+00:00",
  "last_seen": "2026-07-11T06:45:53.087+00:00"
}
```

- `$` removido corretamente dos 3 campos
- `context_id` e `telefone` preenchidos, antes `NULL`
- `created_at` preservado (linha antiga do painel, de 21/06 — prova de que foi reconciliação via `PATCH`, não criação de linha nova)
- Gabriela respondeu normalmente com produto real da base, confirmando que o fluxo de busca não foi afetado

---

## 14. Lições aprendidas

1. **Nem toda "causa óbvia" é a causa raiz.** O `$` residual parecia ser o problema principal, mas havia um problema estrutural mais profundo por baixo (`conv_id NOT NULL`) que só apareceu ao reproduzir o erro diretamente contra o banco.
2. **Reproduzir a chamada real (via `curl`) vale mais que adivinhar.** Várias causas raiz nesta investigação só ficaram claras quando testadas com uma chamada sintética idêntica à real, contra o ambiente de produção de verdade.
3. **Configuração externa (GPT Maker) pode mudar o comportamento tanto quanto o código.** O bug do `@variavel`/`${variavel}` mostrou que parte do sistema vive fora do repositório, e mudanças lá têm efeito colateral tão real quanto uma mudança de código.
4. **Streaming de log não é uma fonte confiável isolada.** Quase toda conclusão importante desta investigação precisou de uma segunda fonte de evidência (consulta direta ao Supabase, reprodução via `curl`) porque o log ao vivo falhou em capturar eventos reais e confirmados repetidamente.
5. **Timestamps são evidência, não só metadado.** Cruzar `last_seen`/`created_at`/`updatedAt` foi o que revelou que uma "prova de bug" (a linha `"@contextId"` literal) na verdade era de um momento anterior à correção, evitando uma conclusão errada.
6. **Correções pequenas, isoladas, com escopo explícito, aceleram o diagnóstico.** Cada correção (migration, reconciliação, `removerDollarInicial`, instrumentação) foi feita em commit próprio, isolado, o que permitiu isolar o efeito de cada mudança claramente.

---

## 15. Cuidados para futuras alterações nessa área

- **Nunca assumir que `conv_id` e `context_id` são intercambiáveis sem checar reconciliação primeiro** — eles coincidem hoje por comportamento observado, não por garantia de contrato/API documentada. Se o GPT Maker mudar a forma como gera `contextId` no futuro, essa suposição pode quebrar silenciosamente.
- **Qualquer mudança no template `requestBody` de uma Ação do GPT Maker precisa ser testada em produção antes de considerar "correta"**, mesmo que a sintaxe pareça certa pela documentação — o caso `@contextId`/`@whatsappPhone` mostrou que nomes de variável podem não ser resolvidos mesmo com a sintaxe tecnicamente correta.
- **Nunca remover o `removerDollarInicial()` sem antes confirmar que o Body do GPT Maker não usa mais `${...}`** — remover essa função enquanto o Body ainda manda `$` faria `context_id`/`telefone` voltarem a gravar sujo.
- **`context_id` não tem `UNIQUE`** — qualquer nova lógica de escrita precisa continuar assumindo que pode haver mais de uma linha com o mesmo `context_id` e tratar isso explicitamente (como o `ORDER BY last_seen DESC LIMIT 1` já faz).
- **Testar sempre nos dois canais (WhatsApp e Instagram) antes de fechar qualquer mudança nessa área** — o comportamento diverge o suficiente (telefone vazio, formato de ID diferente) pra um teste só em WhatsApp dar falsa confiança.
- **Ao investigar bugs aqui, priorizar consulta direta ao Supabase/reprodução via `curl` sobre log ao vivo da Vercel** — o log já provou ser a fonte menos confiável desta investigação inteira.

---

## 16. Próximos passos recomendados para a Fase 2B

1. Remover a instrumentação `[IDENTITY_DEBUG]` de `api/webhook.js` (commit isolado, próximo passo imediato após aprovação deste documento).
2. Implementar de fato a leitura de `customer_profiles` dentro do fluxo de resposta da Gabriela (a Fase 1.5 original, ainda não implementada) — hoje a identidade é capturada, mas nada a lê de volta pro prompt.
3. Decidir e implementar `buildProfileBlock` adaptado pro contexto do webhook (reaproveitando a lógica já existente em `src/services/ia/groq.js`), respeitando os limites de dado sensível já mapeados (nunca vazar `notes` pro próprio cliente).
4. Avaliar se vale a pena, no futuro, também mandar `chatId` real no `requestBody` da Ação "Buscar Produtos" (mesmo padrão já usado com sucesso em `auto-photo`), o que eliminaria a dependência de `contextId` coincidir com `conv_id` por comportamento observado, substituindo por uma garantia mais explícita.
5. Monitorar por um período se `context_id` duplicado (sem `UNIQUE`) chega a acontecer na prática — se sim, considerar adicionar a constraint depois de confirmar que não há caso legítimo de duplicidade intencional.

---

## Erros que não devemos repetir

1. **Não assumir que uma migration "deveria" funcionar sem checar a constraint real da tabela primeiro.** O tempo perdido no Bug 1 (`conv_id NOT NULL`) veio de desenhar o `INSERT` sem antes confirmar experimentalmente o schema completo — a "lacuna documentada" em `docs/SUPABASE.md` devia ter sido um sinal de alerta mais forte antes de implementar.
2. **Não confiar no log ao vivo da Vercel como única fonte de verdade.** Múltiplas vezes nesta investigação uma chamada real e confirmada (resposta real da Gabriela) não apareceu no log, e isso quase levou a conclusões erradas (ex: achar que o webhook não tinha sido chamado, quando na verdade só o log falhou em capturar).
3. **Não deixar um monitor de log em segundo plano sem saber que ele expira sozinho em ~5 minutos.** Perdemos capturas várias vezes por assumir que o monitor continuava vivo sem reconfirmar.
4. **Não confundir "sintaxe documentada como correta" com "funciona neste caso específico".** `@variavel` é a sintaxe oficialmente recomendada pelo GPT Maker, mas não funcionou pra `contextId`/`whatsappPhone` nesta Ação — sempre validar em produção antes de considerar uma mudança de configuração "resolvida".
5. **Não interpretar a linha mais recente da tabela como prova do teste mais recente sem checar o timestamp contra outras fontes.** O `"@contextId"` literal quase foi mal interpretado como resultado do teste pós-correção, quando na verdade era de antes — só o cruzamento de horários evitou o erro.
6. **Não implementar a correção "óbvia" (remover o `$`) sem primeiro confirmar que ela é suficiente sozinha.** Ela era necessária, mas não suficiente — o problema do `conv_id NOT NULL` só foi resolvido numa correção anterior e separada; tratar os dois como o mesmo bug teria atrasado o diagnóstico.
