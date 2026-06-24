# PASSO 5: Webhook Inteligente — Camada de Conhecimento

## 🎯 Objetivo

Criar intermediário entre **GPT Maker** e **Supabase** para que cliente sempre tenha respostas com dados atualizados.

---

## 📋 ARQUIVOS CRIADOS

### **1. `src/services/searchKnowledge.js`**
- Busca em conhecimento (knowledge)
- Busca em catálogo (products)
- Calcula relevância (score)
- Retorna dados estruturados

**Funções:**
```javascript
searchKnowledge(pergunta)              // Busca principal
buscarProdutoEspecifico(nome)          // Busca produto exato
obterEstatisticasKnowledge()           // Estatísticas
```

### **2. `api/webhook.js`**
- Endpoint HTTP que recebe perguntas
- Processa via searchKnowledge
- Formata resposta para GPT Maker
- Retorna JSON estruturado

---

## 🔌 COMO USAR

### **Endpoint**
```
POST https://seu-dominio.vercel.app/api/webhook
```

### **Request Format**
```json
{
  "pergunta": "Vocês têm Cueca Lupo?",
  "cliente_id": "123",
  "tipo_busca": "produto"
}
```

### **Response Format**
```json
{
  "sucesso": true,
  "timestamp": "2026-06-24T18:17:00.000Z",
  "contexto": {
    "pergunta": "Vocês têm Cueca Lupo?",
    "produtos_encontrados": 3,
    "tem_conhecimento": true
  },
  "dados": {
    "produtos": [
      {
        "nome": "Cueca Lup 006",
        "categoria": "Acessórios",
        "preco": "R$ 59,00",
        "imagem": "https://supabase.../cueca.png",
        "link": "https://dooca.store/...",
        "disponibilidade": "SIM",
        "relevancia": "100%"
      }
    ],
    "informacao_adicional": "Informação da Base de Conhecimento..."
  }
}
```

---

## 🔗 INTEGRAÇÃO COM GPT MAKER

### **Passo 1: Copiar URL do webhook**
```
https://seu-dominio.vercel.app/api/webhook
```

### **Passo 2: No GPT Maker**
1. Ir para: **Integrações** → **Webhooks** (ou similar)
2. Criar novo webhook
3. URL: colar a URL acima
4. Método: `POST`
5. Quando: "Em todas as mensagens" ou "Antes de responder"

### **Passo 3: Configurar payload**
```json
{
  "pergunta": "${mensagem_cliente}",
  "cliente_id": "${cliente_id}",
  "tipo_busca": "produto"
}
```

### **Passo 4: Usar resposta no prompt**
No prompt do GPT Maker, adicionar:
```
${webhook_response.dados.produtos}
${webhook_response.dados.informacao_adicional}
```

Assim GPT Maker terá acesso aos dados do Supabase ao responder!

---

## 🧪 TESTE LOCAL

### **Via Curl:**
```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "pergunta": "Vocês têm Cueca Lupo?",
    "cliente_id": "123"
  }'
```

### **Via JavaScript:**
```javascript
const response = await fetch('/api/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pergunta: 'Vocês têm Cueca Lupo?',
    cliente_id: '123'
  })
})
const dados = await response.json()
console.log(dados)
```

---

## 📊 FLUXO COMPLETO

```
Cliente (WhatsApp/Instagram)
   ↓ "Vocês têm Cueca Lupo?"
   ↓
GPT Maker recebe mensagem
   ↓
GPT Maker chama webhook
   POST /api/webhook
   { pergunta: "Vocês têm Cueca Lupo?" }
   ↓
Webhook processa
   ├─ buscarProdutos("Cueca Lupo") → Supabase
   │  └─ Encontra: 3 produtos relevantes
   └─ buscarKnowledge() → Supabase
      └─ Encontra: informações adicionais
   ↓
Webhook retorna resposta estruturada
   {
     produtos: [...],
     informacao_adicional: "..."
   }
   ↓
GPT Maker recebe dados
   ↓
GPT Maker aplica IA + contexto
   ↓
GPT Maker responde:
   "Sim! 🎯 Temos Cueca Lupo!
    Encontrei 3 opções:
    • Cueca Lup 006 - R$ 59,00 [foto] [link]
    • Cueca Lup 005 - R$ 59,00 [foto] [link]
    • Cueca Lup 004 - R$ 59,00 [foto] [link]"
   ↓
Cliente recebe resposta com dados atualizados do Supabase
```

---

## ⚙️ DETALHES TÉCNICOS

### **Busca por Similaridade**

Busca com scoring de relevância:
- **100%** = Match exato
- **80%** = Contém a palavra
- **70%** = Palavras comuns

Exemplo:
```
Pergunta: "Cueca Lupo"
Produtos encontrados (ordenado por score):
1. "Cueca Lup 006" → 100%
2. "Cueca Lup 005" → 100%
3. "Cueca Lup 004" → 100%
4. "Cueca Lup 003" → 100%
5. "Short Masculino" → 0% (ignorado)
```

### **Normalização de Texto**

Remove acentos e padroniza:
```
"Cueca Lúpo" → "cueca lupo"
"CUECA LUPO" → "cueca lupo"
"Cueca  Lupo" → "cueca lupo"
```

---

## 🔄 MANTER SINCRONIZADO

Para que o webhook sempre retorne dados atualizados:

1. **Manual:** Clique botão "🔄 Sincronizar Knowledge" no Catálogo
2. **Automático:** (Próximo passo - PASSO 5.1)

---

## ✅ CHECKLIST

- [ ] Arquivo `searchKnowledge.js` criado
- [ ] Arquivo `webhook.js` criado
- [ ] Testou webhook localmente
- [ ] Configurou webhook no GPT Maker
- [ ] Testou integração end-to-end
- [ ] Mensagens do cliente chegam com dados atualizados

---

## 📊 STATUS

```
✅ PASSO 1-4: Proteção contra duplicatas
✅ Função regenerateKnowledgeUnico()
✅ PASSO 5: Webhook inteligente (AGORA)
⏳ PASSO 5.1: Sincronização automática
⏳ PASSO 6: Configuração final GPT Maker
```

---

**Próximo: PASSO 5.1 — Sincronização automática ao editar catálogo!** 🚀
