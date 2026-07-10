# CLAUDE.md — PROJETO DO CLAUDECODE

**Última atualização:** 2026-07-10  
**Mantido por:** Rafael Henrique  
**Objetivo:** Garantir segurança, estabilidade e qualidade em todas as alterações

---

## 🔴 REGRAS CRÍTICAS (OBRIGATÓRIAS SEMPRE)

### 1. **NUNCA fazer commit/push sem confirmação explícita**

Eu DEVO parar ANTES de fazer qualquer `git push origin main` e perguntar em **LETRAS MAIÚSCULAS**:

```
⚠️ QUER SINCRONIZAR COM WEB (VERCEL)?
Mudanças prontas para fazer commit e push:
- [lista de arquivos]

Confirma? (Sim/Não)
```

**Por quê:** Você precisa ver exatamente o que vai para produção. Controle total.

### 2. **Token GPTMaker SEMPRE em `.env.local`, NUNCA em `.env`**

- **Arquivo certo:** `.env.local` (prioridade no Vite)
- **Arquivo errado:** `.env`
- **Duração:** ~24h (expira diariamente)
- **Sintoma de expiração:** "Erro ao mudar modo. Token pode ter expirado"

**Como atualizar (jeito mais fácil — descoberto em 2026-07-01):**
1. Estar logado em `app.gptmaker.ai`
2. Abrir `view-source:https://app.gptmaker.ai/browse`
3. `Ctrl+F` (ou Cmd+F) por `"token":` e copiar o valor (sem aspas, sem "Bearer")
4. Atualizar `.env.local`:

**Como atualizar (jeito antigo, alternativa):**
1. Abrir `app.gptmaker.ai` logado
2. DevTools (F12) → Network → copiar header `Authorization` (sem "Bearer")
3. Atualizar `.env.local`:
   ```bash
   VITE_GPTMAKER_USER_TOKEN=seu_token_aqui
   ```
4. Vite reinicia automaticamente

**Desde 2026-07-01:** o card de créditos do Dashboard também depende desse token, mas configurado como variável de ambiente `Production` no projeto Vercel `ignite-webhook` (não no `.env.local`). Se o card mostrar "Token do GPTMaker expirado", precisa atualizar lá também:
```bash
cd ~/ignite-webhook
vercel env rm VITE_GPTMAKER_USER_TOKEN production --yes
echo "seu_token_aqui" | vercel env add VITE_GPTMAKER_USER_TOKEN production
vercel --prod --yes
```

### 3. **IDs GPTMaker são sagrados**

**Localização:** Última linha do código-fonte de `app.gptmaker.ai` (Control+U ou Cmd+Option+U no Mac)

**IDs críticos (NUNCA alterar sem validação):**
```
workspaceId: 3F300E7C6105E0123A946E0E9A5EC274
VITE_GPTMAKER_WORKSPACE: 3F300E7C6105E0123A946E0E9A5EC274
```

**Como extrair programaticamente:**
```javascript
JSON.parse(document.getElementById('__NEXT_DATA__').textContent).props.pageProps.workspaceId
```

### 4. **Sincronização com Supabase requer validação**

Antes de fazer `git push`:
- ✅ Histórico `catalog_history` consistente?
- ✅ 538 produtos ainda íntegros?
- ✅ Storage de imagens sincronizado?
- ✅ RLS policies respeitadas?

### 5. **Rate-limit de imagens: 1000ms mínimo**

Entre enviar imagem e preço/link no WhatsApp/Instagram:
```javascript
// ERRADO (500ms — gera 429 Too Many Requests)
setTimeout(() => sendMessage(...), 500)

// CERTO (1000ms — respeita rate-limit)
await new Promise(r => setTimeout(r, 1000))
sendMessage(...)
```

**Por quê:** GPT Maker throttles depois de 6 mensagens em <500ms. Erros silenciosos ficam escondidos.

### 6. **Higiene de Git Worktrees — checar e limpar sempre**

**No início de QUALQUER sessão nova neste projeto:** rodar `git worktree list` silenciosamente (sem perguntar, sem narrar). Se houver mais de 2 worktrees (a pasta raiz `main` + a worktree atual), avisar o Rafael:

```
⚠️ Encontrei N pastas de trabalho antigas (worktrees) além desta.
Quer que eu confira se têm algo útil antes de limpar?
```

Se ele autorizar, seguir o processo já validado nesta sessão:
1. Para cada worktree órfã, checar `git rev-list --count <branch-atual>..<branch-orfa>` — se der `0`, é 100% duplicada e pode ser removida com segurança (`git worktree remove --force`)
2. Se der `>0`, **não apagar direto** — mostrar o `git log --oneline` dos commits exclusivos e perguntar o que fazer (trazer via cherry-pick / ignorar / manter guardada)
3. Depois de trazer algo via cherry-pick, sempre re-testar visualmente (preview) antes de considerar concluído — cherry-picks em código que evoluiu podem gerar duplicatas silenciosas (ex.: um componente renderizado 2x)

**Depois de QUALQUER push aprovado pro `main`:** perguntar proativamente:
```
✅ Publicado! A pasta desta sessão já foi absorvida pelo main.
Posso remover essa worktree agora?
```

**Por quê:** cada sessão nova só abre pasta de trabalho separada (worktree) em branch própria. Se o trabalho não é publicado, a pasta fica órfã e se acumula — em 2026-07-01 chegou a 12 pastas simultâneas, quase causando confusão sobre qual branch tinha o quê. Publicar com frequência e limpar após cada push elimina o problema pela raiz, sem depender da memória do Rafael.

### 7. **Toda worktree nova precisa do `.env.local` copiado manualmente**

**No início de QUALQUER sessão nova neste projeto, antes de rodar `npm run dev` ou abrir o preview:** checar se existe `.env.local` na raiz da worktree atual. Se não existir, copiar da pasta principal:

```bash
cp "/Users/macbook/Downloads/PROJETO DO CLAUDECODE/.env.local" "<raiz-da-worktree-atual>/.env.local"
```

**Por quê:** `.env.local` guarda tokens secretos (GPT Maker, Supabase, Groq) e é propositalmente ignorado pelo Git (`.gitignore`), então nunca vem junto quando uma worktree nova é criada. Sem ele, o app sobe normalmente mas falha silenciosamente ao autenticar nas APIs — parece "bug" (0 conversas abertas, painel de Análise Rápida sumido, sirene de alertas zerada) mas na verdade é só a pasta estar sem credenciais. Descoberto em 2026-07-01 comparando `localhost:5175` (pasta principal, com `.env.local`) vs `localhost:5199` (worktree nova, sem `.env.local`) — mesmo código, dados diferentes.

**Sintoma para reconhecer isso rápido:** o app carrega, mas fica com "0 conversas", sem erros no console — só dados vazios/zerados.

### 8. **ANTES DE FAZER `git push origin main`: SEMPRE sincronizar `.env` com Vercel**

**VARIÁVEIS CRÍTICAS que DEVEM estar em Vercel Production:**

```bash
# GPT Maker
VITE_GPTMAKER_USER_TOKEN
VITE_GPTMAKER_WORKSPACE
VITE_GPTMAKER_EMAIL
VITE_GPTMAKER_PASSWORD
VITE_GPTMAKER_TOKEN

# Supabase
VITE_SUPABASE_URL
VITE_SUPABASE_KEY

# Groq (fallback LLM)
VITE_GROQ_API_KEY

# Google Drive (Catálogo Rascunho)
VITE_GOOGLE_DRIVE_API_KEY
VITE_GOOGLE_DRIVE_FOLDER_ID

# Base44 (Cobranças)
VITE_BASE44_APP_ID
VITE_BASE44_API_KEY

# Outras
VITE_DEEPSEEK_API_KEY
COHERE_API_KEY
```

**Como verificar o que falta:**
```bash
vercel env ls  # Lista todas as variáveis em Vercel
```

**Como adicionar em produção:**
```bash
vercel env add NOME_DA_VAR production
# Digita o valor e Enter
```

**Por quê é crítico:**
- ❌ Se faltar variável: código local funciona, produção quebra silenciosamente
- ❌ Erros silenciosos são difíceis de debugar (DraftCatalogPage sumiu em 2026-07-07)
- ✅ Sincronizar agora = zero surpresas depois

**Checklist antes de `git push`:**
1. Adicionar nova variável em `.env.local`? → Também adiciona em Vercel com `vercel env add`
2. Mudou valor de variável existente? → Atualiza em Vercel com `vercel env rm ... && vercel env add ...`
3. Dúvida se tudo está lá? → Rode `vercel env ls` e confira

---

### 9. **Catálogo Público (`catalogo-publico/`) é um site separado — HTML puro, sem Node**

**Caminho:** `/Users/macbook/Downloads/PROJETO DO CLAUDECODE/catalogo-publico/index.html`

Isso **não faz parte do app React** — é um arquivo HTML+CSS+JS único, sem build, sem framework, que lê fotos direto do Google Drive (marca/categoria = pasta, modelo = subpasta, fotos dentro). Serve pra mandar um link público pro cliente navegar o catálogo sem expor o painel interno.

**Publicado em:** https://prime-catalogo.vercel.app (projeto Vercel próprio, separado do app principal e do `ignite-webhook`; nome do projeto na Vercel continua `catalogo-publico`, `prime-catalogo.vercel.app` é um alias criado em cima dele — o domínio antigo `catalogo-publico.vercel.app` também continua ativo)

**Pra publicar qualquer mudança nele:**
```bash
cd "/Users/macbook/Downloads/PROJETO DO CLAUDECODE/catalogo-publico"
vercel --prod --yes
```

**Configuração:**
- `API_KEY` e `ROOT_FOLDER` (ID da pasta do Drive) ficam hardcoded no topo do `<script>` do próprio arquivo — não usa `.env` (é site estático, sem variável de ambiente de verdade)
- **Visibilidade das marcas (desde 2026-07-10):** não é mais hardcoded no HTML. É configurada pelo painel interno (Catálogo Drive → botão "⚙️ Configurar catálogo" em `DraftCatalogPage.jsx`) e salva na tabela `catalog_public_config` do Supabase (coluna `hidden_brands`, ver `docs/SUPABASE.md §3.1`). `hidden_brands: []` = nada escondido = mostra todas as marcas, inclusive pastas novas criadas no Drive depois (aparecem automaticamente, sem precisar mexer em nada). Marcar uma marca no painel adiciona ela à lista de escondidas — é uma lista de bloqueio, não de permissão. O `catalogo-publico/index.html` lê essa config direto do Supabase a cada carregamento (`getHiddenFolders()`), com fallback pra "mostrar tudo" se a leitura falhar.
- Botão de WhatsApp flutuante fixo aponta pro número `5534997257499` — mudar direto no `href` do `.whatsapp-float` se o número mudar
- **Botão "Copiar link do cliente"** (no painel interno, ao lado de "Configurar catálogo"): copia `https://prime-catalogo.vercel.app` pra área de transferência.
- **Clicar na logo** do catálogo público força recarregar o catálogo do zero (ignora o cache local de 15min).
- **Performance:** o site busca todas as marcas em paralelo (`Promise.all`, não mais sequencial) e guarda o resultado em `localStorage` por 15 minutos — só refaz a varredura completa do Drive se o cache expirar ou se o cliente clicar na logo.
- **Mobile:** abaixo de 600px a fileira de chips de marca vira um botão único "Filtrar por marca ▾" que abre o mesmo menu lateral (☰) do desktop — evita uma fileira horizontal com 27+ chips.

**Estrutura esperada no Drive:** cada foto solta direto numa pasta = 1 produto individual (nome do arquivo vira nome do produto). Se a pasta tiver subpastas, cada subpasta = 1 produto com todas as fotos dela na galeria (usado pro caso de "várias fotos do mesmo modelo/cor").

### 10. **Toda foto nova no Drive precisa de permissão "Qualquer pessoa com o link"**

Fotos que não tiverem essa permissão **não aparecem** no catálogo (nem no rascunho interno, nem no público) — dão erro silencioso tipo `ERR_BLOCKED_BY_ORB` no navegador. Isso já foi corrigido uma vez em massa (538 arquivos + 73 pastas, em 2026-07-05) rodando o script:

```bash
node scripts/fix-drive-permissions.mjs
```

Esse script pede login OAuth (abre navegador, você autoriza uma vez) e corrige a permissão recursivamente em toda a pasta raiz. As credenciais OAuth ficam em `.env.local` como `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` (sem prefixo `VITE_` de propósito — não pode vazar pro navegador). Rode de novo se adicionar fotos novas e elas não aparecerem no catálogo.

### 11. **Catálogo Rascunho dentro do app** (`src/pages/DraftCatalogPage.jsx`)

Versão do mesmo conceito (fotos do Drive), só que **dentro do painel logado**, no menu "Catálogo Rascunho" — serve pra você (Rafael) conferir antes de decidir o que formalizar no catálogo oficial (Supabase). Usa `src/services/catalogo/googleDriveCatalog.js`, com cache em `localStorage` (só recarrega ao clicar "Atualizar", não gasta cota da API do Drive à toa). As credenciais aqui (`VITE_GOOGLE_DRIVE_API_KEY`, `VITE_GOOGLE_DRIVE_FOLDER_ID`) ficam no `.env.local`, ao contrário do catálogo público que tem elas hardcoded no HTML.

**Nesta página também fica o controle do catálogo público** (seção 9 acima): dropdown de marcas em ordem alfabética, botão "🔗 Copiar link do cliente", botão "⚙️ Configurar catálogo" (abre modal com checkbox por marca — "Selecionar todas"/"Desmarcar todas" — que ao abrir já dispara um refresh do Drive pra pastas novas aparecerem na lista) e barra de progresso real (`X% (feitas/total)`) durante o carregamento, em vez de um "Carregando..." genérico. A leitura/gravação da config usa `src/services/catalogo/catalogPublicConfig.js`.

### 12. **Todo service novo nasce dentro de um domínio — nunca solto na raiz de `src/services/`**

Desde as Fases 3A/3B/3C (2026-07-10), `src/services/` está organizado em 8 domínios (`auditoria/`, `catalogo/`, `chat/`, `conhecimento/`, `crm/`, `foto/`, `ia/`, `plataforma/`), mais `_archive/` (código sem consumidores) e `__tests__/` (testes — não é service de negócio, exceção reconhecida, não conta como "solto na raiz").

Esta regra existe para evitar regressão da organização conquistada nas Fases 3A/3B/3C.

Esta regra não substitui a Regra 1. Quando a regra falar em "atualizar documentação no mesmo commit", isso descreve apenas o conteúdo do commit após aprovação. Continua proibido criar commits ou fazer push sem sua autorização explícita.

**Ao criar um arquivo novo em `src/services/`:**
1. Escolher o domínio correto (nunca criar na raiz).
2. Em caso de dúvida entre dois domínios possíveis (ex.: saldo/créditos de provedor poderia ser `ia/` ou `plataforma/`), perguntar antes de criar ou mover.
3. Atualizar a contagem e a documentação relevante em `docs/ARCHITECTURE.md` no mesmo commit.
4. Se o arquivo não pertencer claramente a nenhum domínio de negócio (ex.: cliente Supabase compartilhado, cache compartilhado, infraestrutura técnica, helpers globais, etc.), não decidir sozinho. Perguntar antes de criar nova pasta ou escolher um domínio existente.

**Ao criar uma tabela nova no Supabase:**
1. Adicionar em `docs/SUPABASE.md §3.1` (linha na tabela + seção de detalhe) no mesmo commit.
2. Se a migration alterar a semântica de uma tabela existente (ex.: renomear coluna, mudar significado de campo, alterar comportamento), documentar o antes/depois na mesma seção.

**Objetivo da regra:** evitar que a arquitetura volte a ficar desorganizada e garantir que código, banco de dados e documentação permaneçam sincronizados.

**Por quê:** esta auditoria (2026-07-10) encontrou a tabela `catalog_public_config` e o arquivo `catalogPublicConfig.js` criados sem atualizar `docs/SUPABASE.md`/`docs/ARCHITECTURE.md` — o gap só foi pego numa auditoria manual posterior. Regra formal evita depender de lembrar disso.

### 13. **Análise prévia obrigatória antes de implementar mudança estrutural**

Antes de implementar qualquer funcionalidade nova ou alteração com impacto estrutural, incluindo refatoração, novos arquivos, novos services, novas tabelas Supabase, novos endpoints ou mudança de fluxo entre módulos, fazer obrigatoriamente uma análise prévia respondendo:

1. Onde essa mudança deve ficar dentro da arquitetura atual?
2. Quais arquivos existentes serão afetados?
3. Quais novos arquivos serão criados e em qual domínio?
4. Quais documentos precisam ser atualizados (`CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/SUPABASE.md`, etc.)?
5. Existe risco de duplicar uma funcionalidade já existente?
6. Existe alguma fonte de verdade que precisa ser preservada?

Só começar a implementação depois dessa análise **e** da aprovação explícita do Rafael.

**Por quê:** complementa a Regra 12 — evita que o projeto volte a crescer de forma desorganizada, tomando a decisão de onde/como encaixar algo novo só depois de já ter sido escrito.

---

## 🏗️ ARQUITETURA DO SISTEMA

### Stack Principal
- **Frontend:** React + Vite (http://localhost:5176 — porta fixa em `vite.config.js`)
- **Backend:** Supabase (PostgreSQL + Storage)
- **CRM:** IGNITE PRIME (Groq LLM + GPT Maker)
- **Automação:** Vercel serverless (webhooks)
- **Integrações:** WhatsApp, Instagram, GPT Maker

### Tabelas Supabase Críticas
| Tabela | Função | Registros |
|--------|--------|-----------|
| `products` | Catálogo completo | 538 itens |
| `catalog_history` | Auditoria de alterações | Timeline colorida (add/edit/delete) |
| `knowledge` | Base de conhecimento CODEX | ~50+ entradas |
| `training_data` | Treinamentos de agentes | Associado a cada agente |

### Buckets Storage
| Bucket | Acesso | Uso |
|--------|--------|-----|
| `produtos` | PUBLIC | Imagens de catálogo (og:image scrapeadas) |

### Componentes-Chave
```
src/
├── pages/
│   ├── DealOncaPage.jsx       (CODEX — substitui Deal Claude)
│   ├── AgentLabPage.jsx       (Lab IA — stress test de agentes)
│   ├── KnowledgePage.jsx      (Base de conhecimento)
│   └── InboxList.jsx          (Filtros: Todos/Meus/Auto-IA/Não lidas)
├── services/                  (48 arquivos em 8 domínios — ver docs/ARCHITECTURE.md §7)
│   ├── chat/gptmaker.js       (API GPT Maker — listAgents, createTraining, etc)
│   ├── ia/groq.js             (Groq LLM — fallback llama-3.3 → llama-3.1 → llama3)
│   └── catalogo/catalog.js    (Supabase + scraper de produtos)
└── theme.jsx                  (PRIME LIGHT V1: #E8192C primary)
```

### Fluxo de Dados (Visão Geral)
```
Cliente WhatsApp/Instagram
    ↓
GPT Maker (recebe mensagem)
    ↓
[Webhook] → /api/webhook (busca produtos + knowledge, ver Fluxo 2)
    ↓
GPT Maker responde (com contexto)
    ↓
Se pedir foto → /api/auto-photo
    ↓
[Auto-Photo] busca produto em Supabase
    ↓
Envia: Imagem → [1000ms] → Preço + Link
    ↓
Cliente vê tudo no WhatsApp/Instagram
```

---

## ⚡ FLUXOS DE INTEGRAÇÃO CRÍTICOS

### Fluxo 1: Enviar Foto de Produto (Auto-Photo)
**Gatilho:** Cliente pede "manda foto" / "me manda imagem"  
**Arquivo:** `api/auto-photo.js` (webhook no Vercel — raiz do repo, não dentro de `src/`)

**Sequência:**
1. GPT Maker dispara webhook `/api/auto-photo` com `chat_id`
2. Sistema busca última mensagem do cliente (detecta "foto", "imagem", etc)
3. `extractProductName()` extrai nome (normaliza acentos: "tenis" = "tênis")
4. Busca em `products` table (include direto → fallback keyword scoring)
5. **[CRÍTICO]** Envia imagem + `await new Promise(r => setTimeout(r, 1000))` + preço/link
6. Logs registram: sucesso/erro, status HTTP (detecta 429)

**Possíveis problemas:**
- ❌ Delay <1000ms → 429 Rate-limit
- ❌ Acentos ("Tênis" vs "tenis") → produto não encontrado
- ❌ Categoria errada ("boné diesel" → "Cueca diesel") → produto errado
- ❌ `.catch(() => {})` silencioso → erro desaparece

### Fluxo 2: Consultar Base de Conhecimento
**Gatilho:** Toda mensagem do cliente (Step 2 automático no GPT Maker)  
**Arquivo:** `api/webhook.js` (função `formatarRespostaGPT`, linha 245)

**Sequência:**
1. Retorna `{ sucesso, timestamp, contexto: {...}, dados: { produtos, informacao_adicional, totalVariacoes, variacoesRestantes } }`
2. **[CRÍTICO]** O treinamento da Gabriela no GPT Maker lê literalmente `${webhook_response.dados.produtos}` e `${webhook_response.dados.informacao_adicional}` (confirmado em `docs/backup-gptmaker-2026-07-04/trainings.json`) — mudar esses nomes de campo sem atualizar o treinamento quebra a resposta da Gabriela silenciosamente
3. GPT Maker incorpora `dados.produtos`/`dados.informacao_adicional` na resposta

### Fluxo 3: Sincronizar Produtos (Supabase → Web)
**Gatilho:** Você clica "Sincronizar" na UI do catálogo  
**Arquivo:** `src/services/catalogo/catalog.js`

**Sequência:**
1. Validação local: 538 produtos, imagens OK
2. UPSERT por produto (não batch) em `products` table
3. Imagens → `produtos` bucket (PUBLIC)
4. `catalog_history` registra: add/edit/delete com timestamp
5. **[CRÍTICO]** Só depois disso você autoriza `git push origin main`

---

## ✅ CHECKLIST PRÉ-COMMIT

**Eu devo validar TODOS esses pontos ANTES de sugerir commit:**

### Integridade Crítica
- [ ] Token GPTMaker em `.env.local` (verificar expiração)
- [ ] IDs GPTMaker válidos e imutáveis (`3F300E7C6105...`)
- [ ] Supabase conectado (consegue query `products`?)
- [ ] Storage bucket `produtos` acessível

### Código
- [ ] Nenhum `.catch(() => {})` silencioso (erros devem ser logados)
- [ ] Rate-limit de imagens é 1000ms (não 500ms)
- [ ] Normalização de acentos em `extractProductName()`
- [ ] Filtro de categoria em `findProductInText()` (evita boné → cueca)

### Testes
- [ ] Testado localmente em http://localhost:5176
- [ ] Webhook `/api/auto-photo` retorna imagem + preço correto
- [ ] Webhook `/api/webhook` retorna `dados.produtos`/`dados.informacao_adicional` corretos (contrato lido pelo treinamento da Gabriela — ver Fluxo 2)
- [ ] Sincronização com Supabase não perdeu nenhum produto

### Logs & Observabilidade
- [ ] Console.error captura status HTTP (429, 403, 500, etc)
- [ ] `catalog_history` registrou a ação
- [ ] Não há advertências de tipo (TypeScript/JSDoc)

---

## 🚀 CHECKLIST PRÉ-DEPLOY

**Eu devo validar TODOS esses pontos ANTES de fazer `git push origin main`:**

### Validação de Produção
- [ ] Vercel preview URL funcionando
- [ ] Token `VITE_GPTMAKER_USER_TOKEN` válido e não expirado
- [ ] Supabase produção conectado (RLS policies OK)
- [ ] WhatsApp/Instagram sincronizados
- [ ] Groq API respondendo (ou fallback ativo?)

### Integridade de Dados
- [ ] 538 produtos ainda presentes em Supabase
- [ ] `catalog_history` consistente (não há gaps)
- [ ] Imagens em Storage sem corrupção
- [ ] Knowledge Base intacta (~50+ entradas)

### Performance & Segurança
- [ ] Rate-limit respeitado (1000ms entre mensagens)
- [ ] Fallback Groq automático se principal falhar
- [ ] RLS policies restringem acesso (não "allow all")
- [ ] Logs de erro são privados (não expõem IDs sensíveis)

### Comportamento End-to-End
- [ ] Cliente solicita "manda foto do boné diesel"
- [ ] Sistema encontra produto correto (não duplicata)
- [ ] Envia imagem + [1000ms] + preço + link
- [ ] Tudo chega no WhatsApp sem erro 429

---

## 📚 HISTÓRICO DE DECISÕES CRÍTICAS

### Por que 1000ms de delay entre imagem e preço?
**Commit:** `fa22555` (2026-06-21)

**Problema:** Cliente Rafael pediu 3 fotos, só 1 chegou (as demais falharam silenciosamente)

**Causa raiz:** Rate-limit do GPT Maker (429 Too Many Requests) quando 6 mensagens em <500ms:
1. Imagem 1 ✅
2. Preço 1 ✅
3. Imagem 2 ❌ (throttle acionado)
4. Demais ❌ (erros silenciosos)

**Solução:** Aumentar para 1000ms + remover `.catch(() => {})` silencioso

**Próxima:** Se 1000ms não for suficiente, implementar retry com exponential backoff

---

### Por que fallback Groq é automático?
**Contexto:** IGNITE PRIME CRM usa Groq como modelo padrão (llama-3.3-70b)

**Razão:** Claude Sonnet 4.6 foi explicitamente adiado (testar tudo antes de trocar)

**Implementação:** `src/services/ia/groq.js`
```javascript
groqRequest(prompt) {
  // Tenta llama-3.3-70b
  // Fallback 1: llama-3.1-8b
  // Fallback 2: llama3-8b
}
```

**Quando revisar:** Quando você autorizar mudança de LLM

---

### Por que confirmação explícita antes de sync?
**Contexto:** Você trabalha com 538 produtos, histórico crítico, e integrações que cascatam

**Razão:** Um erro em produção pode quebrar:
- Sincronização de produtos
- Histórico da base de conhecimento
- Fluxo automático de WhatsApp/Instagram

**Proteção:** Parar ANTES de `git push` e pedir confirmação em MAIÚSCULAS

**Benefício:** Você revisa mudanças + tempo para reverter se necessário

---

### Por que não há dark theme ainda?
**Status:** Light theme (PRIME LIGHT V1) em produção

**Pendência:** `logo-prime-dark.png` não criado

**Bloqueador:** Você quer validar tema completo antes de colocar em produção

**Próximo passo:** Quando você confirmar, criar logo escuro + atualizar `LeftNav.jsx`

---

## 🔐 VARIÁVEIS DE AMBIENTE CRÍTICAS

### Arquivo: `.env.local` (prioridade no Vite)

```bash
# GPT Maker — Token de Sessão (expira ~24h)
VITE_GPTMAKER_USER_TOKEN=seu_token_aqui

# GPT Maker — Credenciais (auto-refresh)
VITE_GPTMAKER_EMAIL=seu_email@example.com
VITE_GPTMAKER_PASSWORD=sua_senha

# GPT Maker — Workspace ID (NUNCA alterar)
VITE_GPTMAKER_WORKSPACE=3F300E7C6105E0123A946E0E9A5EC274

# Supabase
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_KEY=seu_anon_key_aqui

# Groq (fallback LLM)
VITE_GROQ_API_KEY=seu_groq_key_aqui

# Vercel (production webhooks)
NEXT_PUBLIC_VERCEL_URL=https://ignite-webhook.vercel.app
```

### ⚠️ REGRA: Nunca committar `.env.local`

Arquivo `.gitignore` DEVE conter:
```
.env.local
.env.*.local
```

---

## 💻 PADRÕES DE CÓDIGO

### Logging (use sempre)
```javascript
// ✅ BOM — contexto claro
console.error('[sendMessage] ❌ Erro ao enviar', {
  chatId,
  hasImage: !!imageUrl,
  status: err.response?.status,  // Detecta 429
  message: err.message,
})

// ❌ RUIM — silencioso
sendMessage(...).catch(() => {})
```

### Rate-limit (1000ms mínimo)
```javascript
// ✅ BOM
await new Promise(r => setTimeout(r, 1000))
sendMessage(...)

// ❌ RUIM
setTimeout(() => sendMessage(...), 500)
```

### Tratamento de Erro (sempre com catch)
```javascript
// ✅ BOM
try {
  const produto = await buscarProduto(nome)
} catch (err) {
  console.error('[buscarProduto] Erro:', err.message)
  return null  // fallback controlado
}

// ❌ RUIM
const produto = await buscarProduto(nome)  // sem try/catch
```

### Normalização de Acentos
```javascript
// ✅ BOM — "tênis" e "tenis" acham o mesmo produto
const nome = 'Tênis Adidas'
const normalizado = nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
// "Tenis Adidas"

// ❌ RUIM — case-sensitive quebra buscas
const nome = 'Tênis Adidas'
if (nome === 'tenis adidas') { ... }  // nunca acha
```

---

## 👥 CONTATOS E SUPORTE

### Seu Email
- **Contato:** rafa_henrique@icloud.com
- **Para:** Relatar bugs, pedir validações, confirmar deploys

### Plataformas Integradas
- **GPT Maker:** app.gptmaker.ai (workspace `3F300E7C6105...`)
- **Supabase:** [seu-projeto].supabase.co
- **Vercel:** ignite-webhook.vercel.app (webhooks)
- **Groq API:** groq.com/console

---

## 📋 RESUMO EXECUTIVO

**Seu projeto é crítico porque:**
1. 538 produtos + histórico = perda de dados é desastre
2. Integrações WhatsApp/Instagram em cascata = um erro quebra tudo
3. 2 APIs diferentes (GPT Maker + Groq) = complexidade
4. Tokens expirando = downtime se não atualizar

**Como eu ajudo:**
- ✅ Valido TUDO contra este documento
- ✅ Parei ANTES de fazer deploy (você confirma)
- ✅ Testo localmente ANTES de sugerir mudança
- ✅ Documento cada decisão no histórico

**Seu trabalho:**
1. Ler CLAUDE.md quando receber mudanças
2. Confirmar antes de sincronizar (MAIÚSCULAS)
3. Atualizar tokens `.env.local` quando expirar
4. Avisar se contexto mudar (novo fluxo, nova regra, etc)

---

**Última alteração:** 2026-07-10 por Claude Sonnet 5  
**O que mudou nessa sessão:**
- Catálogo Público: config de visibilidade de marcas migrou de `VISIBLE_FOLDERS` hardcoded pra tabela `catalog_public_config`/`hidden_brands` no Supabase, configurável pelo painel interno (seção 9)
- Novo domínio de alias: `prime-catalogo.vercel.app` (o antigo `catalogo-publico.vercel.app` continua ativo)
- Catálogo Drive (painel interno): ordenação alfabética de marcas, botão "Configurar catálogo", botão "Copiar link do cliente", barra de progresso real, refresh automático ao abrir a config (seção 11)
- Catálogo Público: performance (busca em paralelo + cache local 15min), clique na logo recarrega, layout mobile com botão único de filtro
- Nova Regra 12: todo service novo nasce dentro de um domínio (`src/services/`), toda tabela nova do Supabase exige atualização de `docs/SUPABASE.md`/`docs/ARCHITECTURE.md` no mesmo commit
- Auditoria de conformidade arquitetural pós-Fases 3A/3B/3C: corrigidos paths desatualizados (`src/api/` → `api/`, `src/services/*.js` sem subpasta de domínio), porta do Vite (5173 → 5176), contrato de resposta do Fluxo 2 (`/api/knowledge` inexistente → `api/webhook.js`)

**Última alteração:** 2026-07-05 por Claude Sonnet 5  
**O que mudou nessa sessão:**
- Menu lateral: submenu "Ferramentas" + "Análises de IA", tooltips no hover, sidebar mais estreita (210px) com dropdown no avatar, cores unificadas dos botões do topo
- Correção de datas "Invalid Date" no Histórico de Uploads, Histórico de Fotos e aba GPT Maker (`created_at` vs `createdAt`/`timestamp`)
- Correção de CORS + token expirado no endpoint `/api/gptmaker-credits` do `ignite-webhook`
- Novo: Catálogo Rascunho (interno) + Catálogo Público (`catalogo-publico/`, site separado) — ver seções 9, 10, 11 acima
- Script `scripts/fix-drive-permissions.mjs` — corrige permissão pública de fotos do Google Drive em massa
- `token-receiver.js` — servidor local que distribui token GPT Maker novo pra todas as worktrees de uma vez

**Próxima revisão:** Após novo fluxo / novo erro crítico / novo projeto
