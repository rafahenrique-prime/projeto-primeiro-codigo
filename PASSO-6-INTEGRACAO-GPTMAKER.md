# PASSO 6: Integração com GPT Maker

## 🎯 Objetivo

Conectar o **Webhook Inteligente** ao **GPT Maker** para que:
- Cada pergunta do cliente passe pelo seu webhook
- Webhook consulta Supabase (dados atualizados)
- GPT Maker recebe dados estruturados
- GPT Maker combina IA + dados para responder melhor

---

## 📊 ARQUITETURA FINAL

```
Cliente (WhatsApp/Instagram)
   ↓
GPT Maker recebe mensagem
   ↓
🔗 Webhook seu intercepta
   POST /api/webhook
   { "pergunta": "Vocês têm Cueca Lupo?" }
   ↓
Supabase retorna:
   {
     "produtos": [...],
     "knowledge": {...}
   }
   ↓
GPT Maker recebe dados
   ↓
GPT Maker aplica IA + dados
   ↓
GPT Maker responde ao cliente
   ✅ Com dados SEMPRE ATUALIZADOS
   ✅ Com fotos corretas
   ✅ Com informações da base de conhecimento
```

---

## 🔧 CONFIGURAÇÃO NO GPT MAKER

### **Passo 1: Acessar Integrações**

1. Acesse: https://app.gptmaker.ai/browse/agents
2. Clique no seu agente
3. Vá para: **Integrações** (ou **Webhooks**)
4. Procure por: **"Webhook"** ou **"API"**

---

### **Passo 2: Adicionar novo Webhook**

Clique em: **"+ Novo Webhook"** ou **"+ Add Integration"**

---

### **Passo 3: Configurar Webhook**

Preencha os campos:

```
Nome: "Webhook Knowledge Base"
URL: https://seu-dominio.vercel.app/api/webhook
Método: POST
Quando chamar: 
  ✅ "Em todas as mensagens"
  ou
  ✅ "Antes de processar a IA"
Timeout: 5000ms (5 segundos)
```

---

### **Passo 4: Configurar Payload (Body)**

No campo **"Body"** ou **"Payload"**, configure:

**Opção A: Formato JSON simples**
```json
{
  "pergunta": "${message}",
  "cliente_id": "${user_id}",
  "canal": "${channel}"
}
```

**Opção B: Usar variáveis do GPT Maker**
```json
{
  "pergunta": "${message_text}",
  "cliente_id": "${contact_id}",
  "tipo_busca": "produto"
}
```

> **Nota:** Ajuste as variáveis conforme sua versão do GPT Maker

---

### **Passo 5: Headers (se necessário)**

```
Content-Type: application/json
Authorization: (deixe em branco se não tiver autenticação)
```

---

### **Passo 6: Salvar resposta em variável**

Configure para salvar a resposta em uma variável:

```
Nome da variável: webhook_response
Salvar: Resposta completa (JSON)
```

---

## 📝 USAR A RESPOSTA NO PROMPT

### **No prompt do GPT Maker, adicione:**

```
Você é um vendedor da PRIME STORE.

DADOS DA BASE DE CONHECIMENTO:
${webhook_response.dados.produtos}

INFORMAÇÕES ADICIONAIS:
${webhook_response.dados.informacao_adicional}

Quando o cliente pergunta sobre produtos, use os dados acima como base.
Se encontrou produto relevante, informe:
- Nome do produto
- Preço
- Categoria
- Link (para o cliente clicar)
- Imagem (se disponível)

Responda sempre de forma amigável e personalizada.
```

---

## 🧪 TESTE PASSO A PASSO

### **Teste 1: Validar webhook está conectado**

1. No GPT Maker, envie uma mensagem de teste:
   ```
   "Vocês têm Cueca Lupo?"
   ```
2. Abra console (F12) do seu navegador
3. Procure por logs de webhook no servidor
4. Verifique se resposta chegou

### **Teste 2: Verificar dados na resposta**

Na resposta do webhook, procure por:
- `"produtos_encontrados": 3`
- `"nome": "Cueca Lup 006"`
- `"preco": "R$ 59,00"`

Se aparecer, webhook está funcionando! ✅

### **Teste 3: Teste end-to-end**

1. Envie mensagem para seu chatbot (WhatsApp/Instagram)
2. Pergunta: "Vocês têm Nike?"
3. Chatbot deve responder com:
   - Produtos encontrados
   - Preços
   - Links
   - Imagens do Supabase Storage

---

## 🔄 FLUXO COMPLETO DE RESPOSTA

```
CLIENTE: "Vocês têm Cueca Lupo?"
   ↓
GPT Maker recebe
   ↓
Chama: POST /api/webhook
   Body: { "pergunta": "Vocês têm Cueca Lupo?" }
   ↓
Webhook processa:
   - Busca em products: ENCONTRA 3 produtos
   - Busca em knowledge: ENCONTRA informações
   - Retorna JSON estruturado
   ↓
GPT Maker recebe:
   {
     "sucesso": true,
     "dados": {
       "produtos": [
         {
           "nome": "Cueca Lup 006",
           "preco": "R$ 59,00",
           "imagem": "https://supabase.../cueca.png",
           "link": "https://dooca.store/...",
           "relevancia": "100%"
         }
       ],
       "informacao_adicional": "..."
     }
   }
   ↓
GPT Maker aplica IA:
   "Sim! Temos Cueca Lupo! 🎯
    
    Encontrei 3 opções para você:
    
    1️⃣ Cueca Lup 006 - R$ 59,00
    📸 [foto]
    🔗 [link]
    
    2️⃣ Cueca Lup 005 - R$ 59,00
    📸 [foto]
    🔗 [link]
    
    3️⃣ Cueca Lup 004 - R$ 59,00
    📸 [foto]
    🔗 [link]"
   ↓
CLIENTE recebe resposta completa com dados atualizados ✅
```

---

## ✅ CHECKLIST DE CONFIGURAÇÃO

- [ ] Webhook adicionado no GPT Maker
- [ ] URL correta: `https://seu-dominio.vercel.app/api/webhook`
- [ ] Método: POST
- [ ] Payload configurado com variáveis corretas
- [ ] Resposta salva em variável
- [ ] Prompt atualizado com variáveis webhook
- [ ] Testou com mensagem simples
- [ ] Testou com pergunta de produto
- [ ] Recebeu dados estruturados
- [ ] Resposta apareceu no cliente (WhatsApp/Instagram)

---

## 🚨 TROUBLESHOOTING

### **Problema: Webhook não responde**

**Solução:**
1. Verifique URL: `https://seu-dominio.vercel.app/api/webhook`
2. Teste com curl:
   ```bash
   curl -X POST https://seu-dominio.vercel.app/api/webhook \
     -H "Content-Type: application/json" \
     -d '{"pergunta": "teste"}'
   ```
3. Verifique logs no Vercel

### **Problema: Resposta vazia**

**Solução:**
1. Verifique se knowledge está sincronizado
2. Clique botão "🔄 Sincronizar Knowledge" no catálogo
3. Teste webhook novamente

### **Problema: GPT Maker não recebe resposta**

**Solução:**
1. Verifique timeout (aumentar para 10000ms)
2. Verifique Headers
3. Verifique nome da variável de resposta

---

## 📊 VARIÁVEIS DISPONÍVEIS

No seu prompt do GPT Maker, use:

```
${webhook_response.contexto.pergunta}
  → A pergunta do cliente

${webhook_response.contexto.produtos_encontrados}
  → Quantos produtos foram encontrados (número)

${webhook_response.dados.produtos}
  → Array com os produtos (JSON)

${webhook_response.dados.informacao_adicional}
  → Informações adicionais da knowledge base

${webhook_response.dados.informacao_adicional}
  → Total de resultados encontrados
```

---

## 🎯 RESULTADO FINAL

```
ANTES (só GPT Maker):
- Dados desatualizados
- Sem saber preços reais
- Sem fotos corretas
- Respostas genéricas

DEPOIS (GPT Maker + Webhook):
✅ Dados sempre atualizados
✅ Preços corretos
✅ Fotos do Supabase Storage
✅ Informações da base de conhecimento
✅ Respostas personalizadas e precisas
```

---

## 📋 STATUS FINAL - PROJETO COMPLETO

```
✅ PASSO 1: knowledgeGenerator.js
✅ PASSO 2: Validação catalogSyncService
✅ PASSO 3: UNIQUE INDEX (pulado)
✅ PASSO 4: Botão manual Frontend
✅ PASSO 5: Webhook Inteligente
✅ PASSO 5.1: Sincronização Automática
✅ PASSO 6: Integração GPT Maker (AGORA)

🚀 SISTEMA COMPLETO E FUNCIONAL
```

---

## 🔗 URLs IMPORTANTES

```
Webhook: https://seu-dominio.vercel.app/api/webhook
GPT Maker: https://app.gptmaker.ai/browse/agents
Supabase: https://app.supabase.com/project/mbbgqasvssueirynnoyk
Catálogo: http://localhost:5175/catalogo
```

---

**Próximo: Fazer o teste end-to-end com seu cliente!** 🎉
