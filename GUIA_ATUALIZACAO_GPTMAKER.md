# 📋 GUIA: Atualizar Resposta Desatualizada no GPT Maker

**Data:** 2026-06-24  
**Problema:** Agente IA está respondendo com lista desatualizada de cores do New Balance 9060  
**Status:** ⚠️ CRÍTICO - Precisa de ação

---

## 🎯 O PROBLEMA

Quando cliente pergunta "Tem New Balance 9060 Azul Bebe?", o agente responde:

```
❌ RESPOSTA ERRADA (DESATUALIZADA):
"Infelizmente não temos o NB 9060 azul bebê 😔 
As cores disponíveis são: Bege, Cinza, Preto, Rosa, Vinho/Bordo, Caramelo, Off White"
```

**MAS O PRODUTO EXISTE NO BANCO!** ✅

---

## 🔍 CAUSA RAIZ

A resposta está **HARDCODED NO GPT MAKER**, não sincronizada com o Supabase.

Localização:
- ❌ NÃO está no Supabase (verificado)
- ✅ ESTÁ na configuração do agente GPT Maker
- ✅ ESTÁ em uma resposta padrão ou rule do agente

---

## ✅ SOLUÇÃO - DUAS OPÇÕES

### **OPÇÃO 1: Atualizar a Resposta (RÁPIDO)**

**Passo 1:** Acessar GPT Maker
- Link: https://gptmaker.ai (ou seu workspace)
- Credenciais: 
  - Email: `primestoremen@hotmail.com`
  - Senha: (verifique em .env)

**Passo 2:** Encontrar o Agente "Gabriela"
- Na dashboard do GPT Maker
- Procure por "PRIME STORE" ou "Gabriela"
- Clique em editar

**Passo 3:** Procurar por "New Balance 9060"
- Use Ctrl+F ou Cmd+F
- Procure por: "New Balance 9060"
- Procure por: "Bege, Cinza, Preto"
- Procure por: "cores disponíveis"

**Passo 4:** Encontrar a entrada que contém esta lista:
```
ANTES (DESATUALIZADO):
Bege, Cinza, Preto, Rosa, Vinho/Bordo, Caramelo, Off White

DEPOIS (ATUALIZADO):
Bege
Cinza
Preto
Rosa
Marrom
Marrom C/ Preto
Caramelo
Off White C/ Verde Claro
Verde Menta ← NOVO!
Azul Bebe ← NOVO!
Branco
Branco Solado Rosa
Cor Gelo
Algodão Doce
Salmão Laranja
```

**Passo 5:** Deletar ou Atualizar
- Se for uma entrada de conhecimento: **DELETE-A**
- Se for uma resposta padrão: **ATUALIZE a lista**

**Passo 6:** SALVAR
- Clique em "Salvar" ou "Save"
- Aguarde sincronização

---

### **OPÇÃO 2: Usar Webhook Dinâmico (RECOMENDADO)** ⭐

**Por que é melhor:**
- ✅ Produtos sempre atualizados
- ✅ Sem necessidade de editar manualmente
- ✅ Nova cor adicionada = Agente encontra automaticamente
- ✅ Webhook já está configurado e funcionando

**Como fazer:**

**Passo 1:** No GPT Maker, procure por:
- "New Balance 9060" (encontre TODAS as menções)
- "cores disponíveis"
- "Bege, Cinza, Preto" (a lista hardcoded)

**Passo 2:** Remova ou DELETE essas respostas padrão

**Passo 3:** Configure o agente para usar o webhook:

Adicione esta instrução na descrição/prompt do agente:

```
🔄 INSTRUÇÃO DE BUSCA DE PRODUTOS:

Sempre que cliente perguntar sobre disponibilidade de cores ou produtos:

1. Chame o webhook: POST /api/knowledge
   - Body: { "message": "[mensagem do cliente]" }
   - URL: https://ignite-webhook.vercel.app/api/knowledge

2. Use a resposta do webhook para informar produtos e cores disponíveis

3. Se webhook não retornar nada, use:
   "Deixe me verificar nossa disponibilidade..."

EXEMPLO:
Cliente: "Tem New Balance 9060 Azul Bebe?"
→ Webhook retorna: [produto com azul bebe]
→ Agente responde com o produto encontrado ✅
```

**Passo 4:** SALVAR

---

## 📊 COMPARAÇÃO DAS SOLUÇÕES

| Aspecto | Opção 1 (Atualizar) | Opção 2 (Webhook) |
|---------|------------------|------------------|
| **Tempo** | 5-10 min | 10-15 min |
| **Facilidade** | ⭐⭐⭐ Fácil | ⭐⭐⭐⭐ Mais fácil depois |
| **Durabilidade** | ⚠️ Precisa atualizar sempre | ✅ Automático sempre |
| **Manutenção** | ❌ Manual | ✅ Zero |
| **Recomendação** | Solução rápida | **Solução definitiva** |

---

## 🧪 COMO TESTAR DEPOIS

**Teste 1: Mensagem direta**
```
Cliente: "Tenis New Balance 9060 azul bebe?"
Esperado: Agente encontra e envia com foto ✅
```

**Teste 2: Variação de pergunta**
```
Cliente: "Voce tem o azul bebe?"
Esperado: Agente encontra e envia com foto ✅
```

**Teste 3: Novo produto**
```
Cliente: "Tem verde menta?"
Esperado: Agente encontra e envia com foto ✅
```

---

## 🛠️ CREDENCIAIS E LINKS

**GPT Maker:**
- URL: https://gptmaker.ai
- Email: `primestoremen@hotmail.com`
- Senha: `C@s@5225` (confira em `/Users/macbook/Downloads/PROJETO DO CLAUDECODE/.env`)

**Webhook (se usar Opção 2):**
- Produção: https://ignite-webhook.vercel.app/api/knowledge
- Método: POST
- Body: `{ "message": "texto do cliente" }`

**Supabase (banco de produtos):**
- URL: https://mbbgqasvssueirynnoyk.supabase.co
- Tabela: `products`
- Filtro: `status = 'active'`

---

## ⚠️ CHECKLIST ANTES DE SALVAR

- [ ] Encontrei a entrada desatualizada no GPT Maker
- [ ] Atualizei a lista de cores OU removi a resposta hardcoded
- [ ] Se removi, configurei o webhook dinâmico
- [ ] Cliquei em SALVAR
- [ ] Aguardei 2-3 minutos para sincronização
- [ ] Testei no WhatsApp com cliente real ou número de teste
- [ ] Agente retorna produtos atualizados ✅

---

## 🆘 SE TIVER DÚVIDA

1. **Não encontro a entrada?**
   - Procure por: "disponível", "cores", "9060"
   - Verifique em RULES, PROMPTS, e KNOWLEDGE BASE

2. **Não achei o GPT Maker?**
   - Entre em: https://gptmaker.ai
   - Procure pelo workspace: `3F300E7C5D0E4105BE046E0E9A5EC274`
   - Procure pelo agente: "Gabriela" ou "PRIME STORE"

3. **Agente continua respondendo errado?**
   - Limpe o cache do navegador
   - Aguarde 5 minutos
   - Tente em nova conversa com número diferente

---

## 📞 PRÓXIMAS AÇÕES

- ✅ Ler este guia
- ⏳ Acessar GPT Maker
- ⏳ Aplicar Opção 1 ou Opção 2
- ⏳ Testar
- ⏳ Confirmar funcionamento

**Tempo estimado:** 10-15 minutos

---

**Criado em:** 2026-06-24  
**Status:** 🟡 Aguardando ação do usuário  
**Prioridade:** 🔴 ALTA (Agente falhando em encontrar produtos novos)
