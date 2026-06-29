# knowledge/gptmaker.md — Integração GPT Maker

**Plataforma:** https://app.gptmaker.ai  
**Workspace:** 3F300E7C6105E0123A946E0E9A5EC274  
**Última revisão:** 2026-06-28

---

## 🔑 Credenciais e IDs

| Item | Valor | Onde fica |
|------|-------|-----------|
| `workspaceId` | `3F300E7C6105E0123A946E0E9A5EC274` | Última linha do código-fonte |
| `VITE_GPTMAKER_WORKSPACE` | `3F300E7C6105E0123A946E0E9A5EC274` | `.env.local` |
| `VITE_GPTMAKER_USER_TOKEN` | Token JWT (~24h) | `.env.local` |
| `VITE_GPTMAKER_URL` | `https://api.gptmaker.ai` | `.env.local` |

**⚠️ CRÍTICO:** O token expira a cada ~24h. Sintoma: "Erro ao mudar modo. Token pode ter expirado"

---

## 🔄 Como Renovar Token

1. Abra `app.gptmaker.ai` logado
2. DevTools (F12) → Network → qualquer request → copiar header `Authorization` (sem "Bearer")
3. Atualizar `.env.local`:
   ```bash
   VITE_GPTMAKER_USER_TOKEN=novo_token_aqui
   ```
4. Vite reinicia automaticamente
5. Se em produção: renovar também no Vercel via `vercel env add`

---

## 📡 Fluxo de Integração

```
Cliente (WhatsApp/Instagram)
    ↓
GPT Maker (recebe + roteia)
    ↓ Step 1: responde com base no treinamento
    ↓ Step 2: chama webhook /api/knowledge (contexto de produtos)
    ↓ Step 3: [se pedir foto] chama webhook /api/auto-photo
    ↓
Resposta volta pro cliente
```

---

## 🤖 Agentes GPT Maker

Os agentes ficam na aba "Canais" do sistema. Cada agente tem:
- **ID** — identificador único no GPTMaker
- **Nome** — nome visível
- **Modo** — `auto` (IA responde) ou `manual` (operador responde)
- **Treinamentos** — base de conhecimento do agente

### Modos de Atendimento
| Modo | Quem responde |
|------|---------------|
| `auto` | IA (GPT Maker com contexto) |
| `manual` | Humano (operador via painel) |

---

## 🔗 Webhooks Ativos

| Webhook | URL | Quando é chamado |
|---------|-----|-----------------|
| `/api/knowledge` | Vercel (produção) | Toda mensagem recebida |
| `/api/auto-photo` | Vercel (produção) | Cliente pede "foto", "imagem" |
| `/api/gptmaker-credits` | Vercel (produção) | Dashboard carrega |

---

## ⚠️ Rate-limit de Mensagens

- **Entre imagem e preço:** mínimo 1000ms de delay
- Abaixo de 1000ms → erro 429 (Too Many Requests) silencioso
- Regra no código: `await new Promise(r => setTimeout(r, 1000))`

---

## 🐛 Bugs Conhecidos e Soluções

### Card de Créditos Travado
- **Causa:** API `/account/info` retornando 404
- **Fix:** Retornar mock `{"credits": 1584, "mock": true}` em vez de propagar erro
- **Doc:** `docs/troubleshooting/deployment/vercel-gptmaker-404.md`

### Webhook retorna "Imagem: null"
- **Causa:** `/api/knowledge` retornava `imageUrl` no response
- **Fix:** Remover `imageUrl`, `productName`, `productPrice` do response
- **Retornar apenas:** `output` (texto), `context`, `knowledge_count`, `products_count`

---

## 📚 Documentação Completa

- **Setup:** `SETUP_MONITORING.md` (guia de setup completo)
- **Renovar token:** `GUIA_ATUALIZACAO_GPTMAKER.md`
- **Troubleshooting:** `docs/troubleshooting/`
