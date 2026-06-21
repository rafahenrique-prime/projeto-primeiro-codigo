# 🔴 CRITICAL BUG FIX: _loadedOk Filter Check

## O Problema Real

O filtro anterior tinha um **lógico indetectável**:

```javascript
// ERRO: Deixa passar conversas undefined!
const validCtx = (richConversations.length > 0 ? richConversations : conversations)
  .filter(c => c._loadedOk !== false && (c.fullMessages?.length > 0 || c.lastMsg))
```

### Por que falha:

1. **`conversations` prop nunca tem `_loadedOk`**
   - Vem do parent (App.jsx) sem esse field
   - Tem `lastMsg` mas NOT `fullMessages`

2. **Condição `c._loadedOk !== false` é ENGANOSA**
   ```javascript
   undefined !== false  // TRUE ✗ Deixa passar!
   false !== false      // FALSE ✓ Bloqueia
   true !== false       // TRUE ✓ Deixa passar
   ```

3. **Resultado:**
   - Conversas com `_loadedOk: undefined` passam pelo filtro
   - Essas conversas têm `fullMessages: undefined`
   - CODEX recebe histórico vazio e alucina

---

## A Solução

```javascript
// CORRETO: Apenas conversas com _loadedOk === true
const validCtx = richConversations.length > 0
  ? richConversations.filter(c => c._loadedOk === true && c.fullMessages?.length > 0)
  : []
```

### Por que funciona:

1. **Checa explicitamente `=== true`**
   - `true === true` → TRUE ✓
   - `false === true` → FALSE ✓
   - `undefined === true` → FALSE ✓ (BLOQUEIA!)

2. **Usa `richConversations` (já validadas)**
   - Essas foram carregadas no useEffect
   - Têm `_loadedOk` setado explicitamente

3. **Fallback para `[]` se vazio**
   - Sem conversas = sem contexto para LLM
   - Melhor que passar lixo

---

## Sequência do Bug

```
App.jsx passa conversations (sem _loadedOk)
    ↓
DealOncaPage recebe (conversas.com lastMsg, sem fullMessages)
    ↓
Usuário envia pergunta a CODEX
    ↓
Filter: c._loadedOk !== false (undefined !== false = TRUE)
    ↓
validCtx = conversas com SÓ lastMsg, sem fullMessages
    ↓
askCODEX recebe conversas vazias
    ↓
LLM: "Não tenho dados reais... vou inventar então"
    ↓
CODEX alucina: "João está quente, Maria pediu desconto..." (TUDO FAKE)
```

---

## Commits

- **b4ebeff:** Primeira tentativa (ainda tinha o bug)
- **b5860f7:** Fix crítico (elimina o bug)

---

## Verificação

Abra DevTools (F12) → Console e faça uma pergunta a CODEX:

```javascript
// Deveria ver logs como:
// [buildContext] Ignorando conversa vazia...
// [askCODEX] Nenhuma conversa válida

// SE AINDA VENDO ALUCINAÇÕES:
// Significa que validCtx ainda tem conversas sem fullMessages
// Verificar: richConversations.length e quais têm _loadedOk
```

---

## Status

✅ **CORRIGIDO em commit b5860f7**

Agora CODEX:
- ✅ Não recebe conversas vazias
- ✅ Só usa conversas com histórico completo
- ✅ Se sem dados, avisa o LLM (não alucina)
