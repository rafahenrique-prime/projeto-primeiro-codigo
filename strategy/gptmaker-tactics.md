# strategy/gptmaker-tactics.md — Como Operar o GPT Maker com Eficiência

**Audiência:** Operadores PRIME STORE  
**Última revisão:** 2026-06-28

---

## 🎯 Filosofia do Sistema

> O GPT Maker cuida do volume. O humano cuida da conversão.  
> Deixe a IA fazer o atendimento inicial — intervenha só quando necessário.

---

## 🔄 Modos de Operação

| Modo | Quando Usar |
|------|-------------|
| **Auto (IA)** | Atendimento inicial, perguntas de catálogo, horário fora do expediente |
| **Manual (Humano)** | Negociação, reclamação, cliente VIP, pedidos grandes |

### Como alternar modos:
- Na página "Canais" do CRM → selecionar conversa → botão de modo
- Ou dentro da conversa → ícone de modo (IA ↔ Humano)

---

## 📊 Quando a IA Funciona Bem

✅ Responder "tem X produto?"  
✅ Enviar foto de produto  
✅ Informar preço  
✅ Informar prazo de entrega  
✅ Responder fora do horário  
✅ Qualificar interesse inicial  

---

## 🚨 Quando o Humano Deve Assumir

❌ Cliente irritado ou reclamando  
❌ Negociação de preço ou desconto especial  
❌ Pedido acima de R$ 800  
❌ Dúvida técnica muito específica  
❌ Cliente pede para falar com pessoa  
❌ Situação não prevista no treinamento  

### Como identificar:
- IA começa a dar resposta estranha / fora do contexto
- Cliente manda várias mensagens sem resposta satisfatória
- Palavra-chave: "humano", "atendente", "pessoa real", "quero falar com alguém"

---

## 💡 Treinamento do Agente

### Onde fica:
- `app.gptmaker.ai` → Agentes → selecionar agente → Treinamentos
- No CRM: página DealOnca → base de conhecimento

### Tipos de treinamento:
| Tipo | Quando Usar |
|------|-------------|
| **Texto** | Políticas, informações gerais |
| **Q&A** | Perguntas frequentes com resposta padrão |
| **Arquivo** | PDFs, tabelas de produto |

### Frequência de atualização:
- Produto novo → adicionar no treinamento
- Promoção nova → adicionar no treinamento
- Política mudou → atualizar no treinamento + `knowledge/policy.md`

---

## 📈 Métricas para Monitorar

| Métrica | Frequência |
|---------|-----------|
| Conversas não respondidas | Diário |
| Taxa de transferência IA→Humano | Semanal |
| Tempo médio de resposta | Semanal |
| Créditos GPT Maker | Semanal (Dashboard) |

---

## 🔧 Problemas Comuns e Soluções Rápidas

### IA parou de responder:
1. Verificar modo (está em "Auto"?)
2. Verificar créditos no dashboard (card 💰)
3. Token expirado? Renovar em `GUIA_ATUALIZACAO_GPTMAKER.md`

### IA respondendo errado / fora de contexto:
1. Checar se Step 2 (webhook `/api/knowledge`) está configurado
2. Testar: `curl https://ignite-webhook.vercel.app/api/knowledge`
3. Se webhook retornando erro → checar `api/knowledge.js`

### Card de créditos travado em "Carregando...":
1. Problema conhecido → token expirado ou API GPTMaker instável
2. Ver: `docs/troubleshooting/deployment/vercel-gptmaker-404.md`
3. Fix rápido: hard refresh `Cmd+Shift+R`

---

## 🔗 Links Operacionais

| Link | Para que |
|------|---------|
| `https://app.gptmaker.ai` | Painel principal GPT Maker |
| `https://app.gptmaker.ai/browse/developers` | Renovar token |
| `http://localhost:5173/canais` | Canais no CRM (dev) |
| `https://ignite-webhook.vercel.app/api/knowledge` | Testar webhook (curl) |
