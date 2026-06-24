# 🧪 Teste CODEX - 7 MEDIOs em Produção

**Data Planejada**: A definir  
**Duração Estimada**: 15-20 minutos  
**Ambiente**: Produção (ignite-webhook.vercel.app)

---

## 📱 Preparação Inicial (1 min)

```bash
# 1. Abrir Chrome/Browser
# 2. Abrir DevTools (F12)
# 3. Ir para aba Console
# 4. Filtrar por: "[Parser]", "[AutoFoto]", "Error"
# 5. Acessar app: https://ignite-webhook.vercel.app
```

---

## 🧪 TESTE #1: searchEntries() - Proximity Scoring (MÉDIO #1)

**Objetivo**: Verificar se busca retorna produtos mais relevantes primeiro

**Passos:**

1. Dashboard → Menu "Conhecimento"
2. Buscar por: `"tênis"`
3. Observar:
   - ✅ Produtos com "tênis" no TÍTULO aparecem ANTES
   - ✅ Produtos com "tênis" no CONTEÚDO aparecem DEPOIS
   - ✅ Sem erros no console

**Esperado:**
```
Ordem correta:
1. Tênis Nike Preto (título) → score=15
2. Tênis Adidas (título) → score=15
3. Acessórios com tênis (conteúdo) → score=5
```

**Resultado**: ✅ / ❌

---

## 🧪 TESTE #2: searchInMessages() + detectFunnelStage() (MÉDIO #2 #3)

**Objetivo**: Verificar se múltiplos keywords são detectados corretamente

**Passos:**

1. Abrir uma conversa com histórico
2. Client digita: `"qual o preço do tênis nike preto?"`
3. Observar console (F12):
   - ✅ Detecta keywords: `tênis`, `nike`, `preto`
   - ✅ Funnel stage detectado: `CURIOSIDADE` (está perguntando preço)
   - ✅ Sem console.error

**Cenários Adicionais:**

| Msg do Cliente | Esperado | Console OK? |
|---|---|---|
| "manda foto do tênis" | QUENTE_FECHAR | ✅/❌ |
| "qual o preço?" | CURIOSIDADE | ✅/❌ |
| "aceita pix?" | DECISAO_OBJECAO | ✅/❌ |
| "tem em estoque?" | CONSIDERACAO | ✅/❌ |

**Resultado**: ✅ / ❌

---

## 🧪 TESTE #3: calcBuyScore() (MÉDIO #4)

**Objetivo**: Verificar se score de compra está balanceado (0-100)

**Passos:**

1. Abrir menu "Contatos" ou "Perfil do Cliente"
2. Procurar cliente com histórico de compra
3. Verificar "Buy Score":
   - ✅ Score é número entre 0-100
   - ✅ Cliente com "vou levar" tem score alto (60+)
   - ✅ Cliente indeciso tem score médio (30-50)
   - ✅ Cliente com objeção tem score reduzido

**Esperado:**
```
Cliente: "vou levar esse tênis"
- Intenção: 100
- Engajamento: 30 (15 msgs)
- Objeção: 0
- Score Final: (100×0.6) + (30×0.2) - (0×0.3) = 66
```

**Resultado**: ✅ / ❌

---

## 🧪 TESTE #4: extractAndSaveKnowledge() (MÉDIO #5)

**Objetivo**: Verificar se extração NOT cria duplicatas

**Passos:**

1. Menu → "Extrator" (ou Import)
2. Tentar extrair produtos de site JÁ IMPORTADO
3. Observar resposta:
   - ✅ Mensagem: "Base já está atualizada"
   - ✅ NÃO retorna 500+ produtos
   - ✅ Sem console.error

**Cenários:**

| Ação | Esperado | OK? |
|---|---|---|
| Importar site novo | Extrai novos produtos | ✅/❌ |
| Re-importar site | Mensagem "base atualizada" | ✅/❌ |
| Importar site parcial | Extrai APENAS novos | ✅/❌ |

**Resultado**: ✅ / ❌

---

## 🧪 TESTE #5: ChatArea Photo Detection (MÉDIO #6)

**Objetivo**: Verificar se extrai nome EXPLÍCITO (não contexto antigo)

**Passos:**

1. Conversa anterior: Client pede "foto do boné"
2. Agent envia foto do boné
3. Mesma conversa: Client diz "manda foto da CUECA"
4. Observar console (F12):
   - ✅ Log aparece: `[AutoFoto] Nome extraído: "cueca"`
   - ✅ Envia foto da CUECA (não boné antigo!)
   - ✅ Sem console.error

**Cenários:**

| Histórico | Msg Nova | Foto Esperada | OK? |
|---|---|---|---|
| "boné" | "foto da cueca" | CUECA | ✅/❌ |
| "tênis" | "manda foto do moletom" | MOLETOM | ✅/❌ |
| "nike" | "foto da adidas" | ADIDAS | ✅/❌ |

**Resultado**: ✅ / ❌

---

## 🧪 TESTE #6: parseToBlocks() - Logs (MÉDIO #7)

**Objetivo**: Verificar se logs aparecem quando parsing falha

**Passos:**

1. Menu → "Conhecimento" → "Importar"
2. Tentar importar:
   - ✅ Texto muito curto (< 30 chars)
   - ✅ Texto inválido/JSON quebrado
   - ✅ Resposta vazia do Groq

3. Abrir Console (F12) e procurar por `[Parser]`:
   - ✅ Aparece: `[Parser] Texto muito curto (<30 chars)`
   - ✅ Aparece: `[Parser] Nenhum bloco encontrado`
   - ✅ Aparece: `[Parser] ❌ ERRO ao fazer parse`

**Esperado:**
```javascript
console.log("[Parser] Texto muito curto (<30 chars)")
console.warn("[Parser] Nenhum bloco encontrado na resposta do Groq")
console.error("[Parser] ❌ ERRO ao fazer parse: JSON não encontrado")
```

**Resultado**: ✅ / ❌

---

## 📊 CHECKLIST FINAL

### Console Limpo?
```
✅ Nenhum console.error() nosso
✅ Nenhum erro de undefined/null
✅ Nenhum erro de tipo mismatch
❌ CORS/409 do Supabase (aceitável - não é nosso)
```

### Todos os MEDIOs Passaram?
```
✅ MÉDIO #1: searchEntries() - Proximity
✅ MÉDIO #2: searchInMessages() - Filter
✅ MÉDIO #3: detectFunnelStage() - Scoring
✅ MÉDIO #4: calcBuyScore() - Weighted
✅ MÉDIO #5: extractAndSaveKnowledge() - No Fallback
✅ MÉDIO #6: ChatArea Photo - Nome Explícito
✅ MÉDIO #7: parseToBlocks() - Logs
```

### Score Final
```
Testes Passando: __ / 7
Bugs Encontrados: __
Prontos para Produção: ✅ / ❌
```

---

## 🚨 Se Algo Falhar

1. **Anote qual MÉDIO falhou**
2. **Copie o console.error()**
3. **Tire screenshot**
4. **Abra issue ou mande print**
5. **Não faça merge até resolver**

---

## ⏱️ Timing de Teste

```
MÉDIO #1: 2 min
MÉDIO #2: 3 min
MÉDIO #3: 2 min
MÉDIO #4: 2 min
MÉDIO #5: 3 min
MÉDIO #6: 3 min
MÉDIO #7: 2 min
Console Check: 1 min
─────────────────
TOTAL: ~18 min
```

---

## 📝 Notas

- Testar em navegador REAL (Chrome/Safari)
- Abrir DevTools ANTES de começar
- Testar cenários DIFERENTES do esperado
- Se achar bug, fazer rollback IMEDIATO
- Documentar cada resultado

**Data do Teste**: ___________  
**Testador**: ___________  
**Resultado**: ✅ PASSOU / ❌ FALHOU

---

**Criado em**: 2026-06-22  
**Versão**: 7-MEDIOs-Production-v1
