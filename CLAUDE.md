# CLAUDE.md — PROJETO DO CLAUDECODE

**Última atualização:** 2026-07-01  
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

**Como atualizar:**
1. Abrir `app.gptmaker.ai` logado
2. DevTools (F12) → Network → copiar header `Authorization` (sem "Bearer")
3. Atualizar `.env.local`:
   ```bash
   VITE_GPTMAKER_USER_TOKEN=seu_token_aqui
   ```
4. Vite reinicia automaticamente

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

---

## 🏗️ ARQUITETURA DO SISTEMA

### Stack Principal
- **Frontend:** React + Vite (http://localhost:5173)
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
├── services/
│   ├── gptmaker.js            (API GPT Maker — listAgents, createTraining, etc)
│   ├── groq.js                (Groq LLM — fallback llama-3.3 → llama-3.1 → llama3)
│   └── catalog.js             (Supabase + scraper de produtos)
└── theme.jsx                  (PRIME LIGHT V1: #E8192C primary)
```

### Fluxo de Dados (Visão Geral)
```
Cliente WhatsApp/Instagram
    ↓
GPT Maker (recebe mensagem)
    ↓
[Webhook] → /api/knowledge (consulta base)
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
**Arquivo:** `src/api/auto-photo.js` (webhook no Vercel)

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
**Arquivo:** `src/api/knowledge.js`

**Sequência:**
1. Retorna: `output` (texto), `context`, `knowledge_count`, `products_count`
2. **[CRÍTICO]** NÃO retorna: `imageUrl`, `productName`, `productPrice` (causam "Imagem: null")
3. GPT Maker incorpora na resposta (sem imagens, apenas texto)

### Fluxo 3: Sincronizar Produtos (Supabase → Web)
**Gatilho:** Você clica "Sincronizar" na UI do catálogo  
**Arquivo:** `src/services/catalog.js`

**Sequência:**
1. Validação local: 538 produtos, imagens OK
2. UPSERT por produto (não batch) em `products` table
3. Imagens → `productos` bucket (PUBLIC)
4. `catalog_history` registra: add/edit/delete com timestamp
5. **[CRÍTICO]** Só depois disso você autoriza `git push origin main`

---

## ✅ CHECKLIST PRÉ-COMMIT

**Eu devo validar TODOS esses pontos ANTES de sugerir commit:**

### Integridade Crítica
- [ ] Token GPTMaker em `.env.local` (verificar expiração)
- [ ] IDs GPTMaker válidos e imutáveis (`3F300E7C6105...`)
- [ ] Supabase conectado (consegue query `products`?)
- [ ] Storage bucket `productos` acessível

### Código
- [ ] Nenhum `.catch(() => {})` silencioso (erros devem ser logados)
- [ ] Rate-limit de imagens é 1000ms (não 500ms)
- [ ] Normalização de acentos em `extractProductName()`
- [ ] Filtro de categoria em `findProductInText()` (evita boné → cueca)

### Testes
- [ ] Testado localmente em http://localhost:5173
- [ ] Webhook `/api/auto-photo` retorna imagem + preço correto
- [ ] Webhook `/api/knowledge` retorna APENAS texto (sem `imageUrl`)
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

**Implementação:** `src/services/groq.js`
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
VITE_SUPABASE_ANON_KEY=seu_anon_key_aqui

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

**Última alteração:** 2026-06-28 por Claude Haiku 4.5  
**Próxima revisão:** Após novo fluxo / novo erro crítico / novo projeto
