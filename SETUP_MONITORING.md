# 🚀 Setup: Monitoramento de Tokens + Créditos GPTMaker

**Status:** ✅ LIVE em Produção | Último deploy: 2026-06-28

---

## 🔥 QUICK START - Rodar Localmente

```bash
# Terminal 1 - Backend Proxy
node server.js

# Terminal 2 - Frontend
npm run dev

# Acesse: http://localhost:5176
```

---

## 🎯 O Que Foi Implementado

### 1. **Backend Proxy** (Resolve CORS)
- `server.js` → Express em localhost:5178
- Faz proxy seguro para GPTMaker API
- Token protegido no servidor

### 2. **Card de Créditos** 💰
- `src/components/GPTMakerCreditsCard.jsx`
- Mostra créditos em tempo real
- Polling automático a cada 10 min
- Alerta se < 300 créditos

### 3. **Card de Tokens** 🧠
- `src/components/TokenUsageCard.jsx`
- Monitoramento DeepSeek Lite
- 0K / 1000K tokens
- Alerta se > 90% uso

### 4. **Layout Otimizado**
- Header colado ao topo (margin: 0)
- Cards compactos (padding: 8px 10px)
- Gap reduzido entre cards (10px)

---

## ⚙️ Configuração Vercel (Prod)

Variáveis já configuradas ✅:
```
VITE_GPTMAKER_USER_TOKEN      ← Expira a cada ~7 dias!
VITE_GPTMAKER_TOKEN
VITE_GPTMAKER_WORKSPACE
VITE_SUPABASE_URL
VITE_SUPABASE_KEY
VITE_GROQ_API_KEY
```

**URL Produção:** https://ignite-webhook.vercel.app

---

## 🔄 Renovar Token (A cada ~7 dias)

Token `VITE_GPTMAKER_USER_TOKEN` expira! Quando ver card travado:

1. **Ir em:** https://app.gptmaker.ai/browse/developers (logado)
2. **DevTools → Console:**
   ```javascript
   copy(window.__NEXT_DATA__.props.token)
   ```
3. **Adicionar no Vercel:**
   ```bash
   echo "seu-token-novo" | vercel env add VITE_GPTMAKER_USER_TOKEN production preview development
   ```
4. **Deploy automático** em 2-3 min

---

## 📋 Arquivos Principais

| Arquivo | O quê |
|---------|-------|
| `server.js` | Backend Proxy (local) |
| `api/gptmaker-credits.js` | Vercel Function (prod) |
| `src/components/GPTMakerCreditsCard.jsx` | Card créditos |
| `src/components/TokenUsageCard.jsx` | Card tokens |
| `src/services/gptmakerCreditsService.js` | Cliente HTTP créditos |
| `src/services/deepseek.js` | Cliente DeepSeek |
| `.env.local` | Variáveis locais (nunca commit!) |

---

## 🐛 Se Não Funcionar

**Card de créditos mostra "Carregando..."**
- [ ] `node server.js` está rodando? (porta 5178)
- [ ] Token foi renovado? (https://app.gptmaker.ai/browse/developers)
- [ ] `.env.local` tem variáveis corretas?

**Em Produção**
- [ ] Último deploy incluiu `/api/gptmaker-credits.js`?
- [ ] Env vars sincronizadas no Vercel?
- [ ] Ver logs: https://vercel.com/rafahenrique-primes-projects/ignite-webhook → Functions

---

## 📊 Como Funciona

### Local
```
http://localhost:5176 (React)
    ↓
Chama http://localhost:5178/api/gptmaker-credits
    ↓
server.js pega token de .env.local
    ↓
Requisição para api.gptmaker.ai
    ↓
Card renderiza créditos
```

### Produção
```
https://ignite-webhook.vercel.app (React)
    ↓
Chama /api/gptmaker-credits (Vercel Function)
    ↓
Usa env vars do Vercel
    ↓
Requisição para api.gptmaker.ai
    ↓
Card renderiza créditos
```

---

## 🔐 Segurança

✅ Token `VITE_GPTMAKER_USER_TOKEN` **nunca** aparece no frontend
✅ Criptografado no Vercel
✅ Backend proxy valida e faz requisição segura
❌ `.env.local` nunca para GitHub (no .gitignore)

---

## 📞 Referência Completa

**Ver tudo:** `/Users/macbook/.claude/projects/.../memory/setup_gptmaker_monitoring.md`

Lá tem troubleshooting detalhado, arquitetura completa, checklist de manutenção, etc.

---

**Dúvida rápida?** Procure nesse arquivo primeiro! 🚀
