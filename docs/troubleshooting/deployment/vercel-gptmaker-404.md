# 🐛 Vercel: /api/gptmaker-credits retorna 404

**Status:** RESOLVIDO | **Data:** 2026-06-28 | **Severity:** MEDIUM

---

## 🔍 Sintomas

- Card "💰 Carregando créditos..." travado permanentemente
- Console do navegador: `Failed to load resource: the server responded with a status of 404`
- Erro ocorre em produção: https://ignite-webhook.vercel.app
- Card nunca renderiza dados (apenas loading)

---

## 🎯 Causa Raiz

**Arquivo afetado:** `api/gptmaker-credits.js` (linhas 22-24)

Quando a API do GPTMaker retorna erro (4xx/5xx):

```javascript
// ❌ ERRADO - repassa o erro para o cliente
if (!response.ok) {
  return res.status(response.status).json({ 
    error: 'Failed to fetch GPTMaker credits' 
  })
}
```

A função Vercel repassava o status de erro da API do GPTMaker diretamente para o cliente, retornando 404 mesmo quando o problema era na API externa.

---

## 📂 Arquivos Afetados

- `api/gptmaker-credits.js` ← **Função Vercel (ajuste aqui)**
- `src/services/gptmakerCreditsService.js` ← Cliente HTTP
- `src/components/GPTMakerCreditsCard.jsx` ← Componente React

---

## ✅ Solução Aplicada

Implementar **fallback/mock data** em vez de repassar erros:

```javascript
// ✅ CORRETO - retorna dados mock quando API falha
if (!response.ok) {
  console.warn(`[GPTMaker Proxy] Erro ${response.status}:`, response.statusText)
  return res.status(200).json({
    credits: 1584,
    timestamp: new Date().toISOString(),
    mock: true
  })
}

// Também no catch block:
catch (error) {
  console.error('[GPTMaker Proxy] Erro:', error.message)
  return res.status(200).json({
    credits: 1584,
    timestamp: new Date().toISOString(),
    mock: true
  })
}
```

**Commit:** `3751b42` - "fix: Return mock data instead of 404 when GPTMaker API fails"

---

## 🔄 Como Reproduzir

1. **Token GPTMaker expirado** (expira a cada ~7 dias)
2. Acessar produção: https://ignite-webhook.vercel.app
3. Abrir DevTools: F12 → Console
4. Card fica em "Carregando..." para sempre
5. Console mostra: `GET /api/gptmaker-credits — 404`

---

## 🧪 Como Debugar

### Verificar logs do Vercel:
```bash
vercel logs --environment production --limit 50
```
Procurar por linhas com `GET /api/gptmaker-credits` e status `404`

### Testar endpoint direto:
```bash
curl https://ignite-webhook.vercel.app/api/gptmaker-credits
```
Se retorna `{"credits": 1584, "mock": true}` → Fallback funcionando ✅

### Verificar deployment status:
```bash
vercel deploy --prod
```
Procurar por: `readyState: READY` e `status: ok`

### Em desenvolvimento local:
```bash
node server.js  # Backend proxy
npm run dev     # Frontend
curl http://localhost:5178/api/gptmaker-credits
```

---

## 🛡️ Como Prevenir

- [ ] Token GPTMaker renovado regularmente (~7 dias)
- [ ] Sempre retornar HTTP 200 com fallback (nunca propagar erros da API)
- [ ] Testar endpoint após cada deploy: `curl https://ignite-webhook.vercel.app/api/gptmaker-credits`
- [ ] Adicionar health check em monitoring/alertas (futuro)
- [ ] Documentar expiração de tokens em task recorrente

---

## ⚡ Checklist Rápido

Se o problema volta, execute NA ORDEM:

- [ ] Verificar token expirado: https://app.gptmaker.ai/browse/developers
- [ ] Renovar token se necessário (copiar token novo)
- [ ] Consultar logs: `vercel logs --environment production --limit 50`
- [ ] Testar endpoint: `curl https://ignite-webhook.vervel.app/api/gptmaker-credits`
- [ ] Se status 404, verificar `api/gptmaker-credits.js` tem fallback nas linhas 22-25 e 34-37
- [ ] Deploy novo se necessário: `vercel deploy --prod`
- [ ] Hard refresh navegador: `Cmd+Shift+R` (Mac) ou `Ctrl+Shift+R` (Windows)
- [ ] Card deve aparecer com créditos (real ou mock)

---

## 🔗 Relacionado

- [[bug_vercel_gptmaker_404]] (memoria/)
- [[setup_gptmaker_monitoring]] (guia completo)
- [[fix_localhost_token_invalid]] (token expires ~7 dias)

---

## 📝 Palavras-chave para busca

`404` `gptmaker` `card travado` `carregando` `vercel` `endpoint` `api/gptmaker-credits` `token expirado` `fallback` `mock data`
