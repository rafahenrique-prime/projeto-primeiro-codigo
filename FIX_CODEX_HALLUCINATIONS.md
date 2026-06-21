# 🔧 FIX: CODEX Alucinações — Análise e Correção

## 📋 DIAGNÓSTICO DO PROBLEMA

**Sintoma:** CODEX inventava dados de clientes, conversas e números que não existiam.

**Causa Raiz:** O LLM recebia um sistema prompt que **prometia dados** (conversas, clientes, números) mas **na prática os dados estavam vazios ou incompletos**. Quando o LLM não tinha dados reais, tentava ser útil **inventando dados** para parecer útil.

---

## 🔍 PROBLEMAS IDENTIFICADOS

### 1️⃣ **Conversas com dados incompletos sendo carregadas**
**Arquivo:** `src/pages/DealOncaPage.jsx` (linhas 300-306)

**Problema:**
```javascript
const msgs = await getChatMessages(conv.id)
results.push({ ...conv, fullMessages: Array.isArray(msgs) ? msgs : [] })
// Se getChatMessages falha ou retorna [], a conversa é salva vazia
// Mas o sistema prompt ainda trata como se tivesse dados!
```

**Impacto:** Conversas vazias aparecem no contexto do LLM sem marcação de "sem dados"

---

### 2️⃣ **Contexto vazio passado ao askCODEX sem validação**
**Arquivo:** `src/pages/DealOncaPage.jsx` (linhas 438, 593)

**Problema:**
```javascript
const ctx = richConversations.length > 0 ? richConversations : conversations
// Se richConversations está carregando ainda ([]tempo de espera)
// passa `conversations` que vem do GPT Maker sem fullMessages validadas
reply = await askCODEX(t, history, ctx, trainings, { provider, modelId })
// LLM recebe contexto com conversas que podem ter fullMessages: []
```

**Impacto:** LLM recebe promessa de dados mas sem dados reais

---

### 3️⃣ **buildContext não filtra conversas vazias**
**Arquivo:** `src/services/groq.js` (linhas 67-89)

**Problema:**
```javascript
return conversations.map(c => {
  const msgs = c.fullMessages || []
  // Mesmo que msgs esteja vazio [], ainda cria um objeto de contexto
  // LLM vê: "cliente X, última msg: [vazio], histórico: []"
  // Mas o prompt diz "aqui estão as conversas prioritárias"
  // LLM alucinógeno: "vou inventar uma última msg então"
})
```

**Impacto:** Conversas sem dados são processadas como se tivessem dados

---

### 4️⃣ **buildSmartContext não trata dados vazios**
**Arquivo:** `src/services/groq.js` (linhas 521-585)

**Problema:**
```javascript
function buildSmartContext(userMessage, conversations) {
  // Se user pergunta "Quem está mais tempo sem responder?"
  // Mas conversations = [] (sem dados carregados)
  // Retorna um bloco vazio
  // LLM: "Então vou inventar uma lista de inativos"
}
```

**Impacto:** Queries específicas (tipo "Quem está inativo?") alucinam respostas

---

### 5️⃣ **Sem guardrail quando não há conversas**
**Arquivo:** `src/services/groq.js` (linhas 605-613)

**Problema:**
```javascript
const systemPrompt = `${CODEX_SOUL}
Total: ${ctx.length} | ...
CONVERSAS PRIORITÁRIAS:
${JSON.stringify(limitedPriority)}  // Pode ser []
// Sem avisar ao LLM: "hey, array vazio!"
// LLM alucinógeno: "array vazio = sem pergunta específica, vou responder genérico"
```

**Impacto:** Sem informação explícita de "sem dados", LLM não sabe se deve alucinar

---

## ✅ CORREÇÕES APLICADAS

### 1️⃣ **Validação ao carregar conversas**
**Arquivo:** `src/pages/DealOncaPage.jsx` (linhas 300-311)

```javascript
// ANTES:
const msgs = await getChatMessages(conv.id)
results.push({ ...conv, fullMessages: Array.isArray(msgs) ? msgs : [] })

// DEPOIS:
const msgs = await getChatMessages(conv.id)
const validMsgs = Array.isArray(msgs) && msgs.length > 0
  ? msgs.filter(m => (m.text || m.content || '').trim().length > 0)
  : []
results.push({
  ...conv,
  fullMessages: validMsgs,
  _loadedOk: validMsgs.length > 0,  // MARCADOR: conversa tem dados?
  _loadError: e.message  // LOG: por que falhou?
})
```

**Resultado:** Cada conversa agora tem um flag `_loadedOk` indicando se tem dados reais

---

### 2️⃣ **Filtro antes de passar contexto ao LLM**
**Arquivo:** `src/pages/DealOncaPage.jsx` (linhas 438, 593)

```javascript
// ANTES:
const ctx = richConversations.length > 0 ? richConversations : conversations

// DEPOIS:
const validCtx = (richConversations.length > 0 ? richConversations : conversations)
  .filter(c => c._loadedOk !== false && (c.fullMessages?.length > 0 || c.lastMsg))
reply = await askCODEX(t, history, validCtx, trainings, { provider, modelId })
```

**Resultado:** Apenas conversas com dados reais são passadas ao LLM

---

### 3️⃣ **buildContext filtra e valida**
**Arquivo:** `src/services/groq.js` (linhas 67-97)

```javascript
// ANTES:
function buildContext(conversations = []) {
  return conversations.map(c => { ... })

// DEPOIS:
function buildContext(conversations = []) {
  return conversations
    .filter(c => {
      const msgs = c.fullMessages || []
      const hasContent = msgs.length > 0 || (c.lastMsg && c.lastMsg.trim().length > 0)
      if (!hasContent) {
        console.warn(`[buildContext] Ignorando conversa vazia: ${c.id}`)
      }
      return hasContent
    })
    .map(c => { ... })
}
```

**Resultado:** Conversas vazias são ignoradas + logging para debug

---

### 4️⃣ **buildSmartContext com validação**
**Arquivo:** `src/services/groq.js` (linhas 521-589)

```javascript
// ANTES:
function buildSmartContext(userMessage, conversations) {
  const blocks = []
  if (/inativ/.test(q)) {
    const ranked = conversations.map(...).filter(...).sort(...).slice(0,10)
    blocks.push(...)  // Mesmo que ranked = []
  }

// DEPOIS:
function buildSmartContext(userMessage, conversations) {
  // 1. Filtrar conversas vazias PRIMEIRO
  const validConvs = conversations.filter(c => {
    const msgs = c.fullMessages || []
    return msgs.length > 0 || (c.lastMsg && c.lastMsg.trim().length > 0)
  })
  
  if (validConvs.length === 0) {
    return ''  // Sem dados = sem análise, não inventar
  }

  const blocks = []
  if (/inativ/.test(q)) {
    const ranked = validConvs.map(...).filter(...).sort(...).slice(0,10)
    if (ranked.length > 0) {  // Só adicionar se achou algo
      blocks.push(...)
    }
  }
```

**Resultado:** Sem dados = sem resposta (não alucina)

---

### 5️⃣ **Guardrail explícito em askCODEX**
**Arquivo:** `src/services/groq.js` (linhas 588-620)

```javascript
// NOVO:
const validConvs = conversations.filter(c => {
  const msgs = c.fullMessages || []
  return msgs.length > 0 || (c.lastMsg && c.lastMsg.trim().length > 0)
})

if (validConvs.length === 0) {
  console.warn('[askCODEX] Sem contexto de conversas...')
}

// ... no systemPrompt:
const dataAviso = ctx.length === 0
  ? '\n⚠️ AVISO CRÍTICO: Nenhuma conversa com dados reais. NÃO INVENTE dados de clientes.'
  : ''

const systemPrompt = `${CODEX_SOUL}
${dataAviso}  // Explícito: LLM sabe que não tem dados!
`
```

**Resultado:** Quando falta dados, o LLM sabe explicitamente e não alucina

---

## 🧪 COMO VERIFICAR

### Teste 1: Sem conversas carregadas
1. Abra CODEX
2. Pergunta: "Quem está mais perto de comprar agora?"
3. **Esperado:** "Não tenho conversas com dados reais carregadas agora..."
4. **Antes (alucinação):** "João está quente, Maria pediu desconto, Pedro..." (tudo inventado)

### Teste 2: Com conversas carregadas
1. Espere 5-10 segundos para carregar
2. Pergunta: "Quem está inativo?"
3. **Esperado:** "Ranking de inatividade..." (com nomes reais da lista)
4. **Antes (alucinação):** Nomes que não existem, tempos errados, etc.

### Teste 3: Ver logs
Abra DevTools → Console
```
[buildContext] Ignorando conversa vazia: conv_123
[askCODEX] Nenhuma conversa válida fornecida...
```

---

## 📊 RESUMO DAS MUDANÇAS

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Validação ao carregar** | ❌ Nenhuma | ✅ Filtra msgs vazias, marca com `_loadedOk` |
| **Antes de chamar askCODEX** | ❌ Passa tudo | ✅ Filtra apenas conversas com dados |
| **buildContext** | ❌ Processa vazias | ✅ Filtra + valida |
| **buildSmartContext** | ❌ Processa vazias | ✅ Retorna '' se sem dados |
| **askCODEX guardrail** | ❌ Sem avisar | ✅ Aviso explícito quando vazio |
| **Logging** | ❌ Nenhum | ✅ Warnings quando ignora conversas |

---

## 🚀 RESULTADO ESPERADO

- **Sem conversas carregadas:** CODEX responde genéricamente baseado em trainings + pergunta (não alucina)
- **Com conversas:** CODEX responde com dados reais (não inventa)
- **Conversas com erro:** Ignoradas silenciosamente + log
- **Performance:** Sem degradação (mesmo filtro rápido)

---

## 📝 MONITORAMENTO

Abra console do navegador (F12 → Console) e procure por:
- `[buildContext] Ignorando conversa vazia` — conversas que foram filtradas
- `[askCODEX] Nenhuma conversa válida` — execução sem dados
- `⚠️ AVISO CRÍTICO` — LLM recebeu aviso anti-alucinação

Se ver esses logs, a correção está funcionando! 🎯
