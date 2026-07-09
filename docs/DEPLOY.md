# docs/DEPLOY.md — Deploy e Ambiente

> **Snapshot:** 2026-07-08 · branch `main`
> **Fonte:** `vercel.json`, `vite.config.js`, `package.json`, `.github/workflows/`, `CLAUDE.md`, estado de `.env`/`.env.local`.

---

## 1. Projetos de deploy

O repositório alimenta **dois projetos Vercel independentes** (mais um GitHub Action):

| Projeto Vercel | Caminho | O que deploya | Origem do deploy |
|---|---|---|---|
| **`ignite-webhook`** | raiz do repo | App React + funções `api/` | push em `main` |
| **`catalogo-publico`** | `catalogo-publico/` | Site HTML estático (catálogo público via Google Drive) | deploy manual (`vercel --prod`) |

URLs públicas conhecidas (do `CLAUDE.md` e do workflow):
- App + webhooks: `https://ignite-webhook.vercel.app`
- Catálogo público: `https://catalogo-publico.vercel.app`

> **Não há submodule.** O `catalogo-publico/` é uma subpasta no mesmo repo, com `.vercel/project.json` próprio (`projectId: prj_ytwtw...`, `projectName: catalogo-publico`). Tem seu próprio `.gitignore` e `.vercel/` aninhados.

---

## 2. Configuração do build (app principal)

### `vercel.json`
```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "crons": [
    { "path": "/api/cron-diagnosis", "schedule": "0 12 * * *" },
    { "path": "/api/cron-diagnosis", "schedule": "0 18 * * *" }
  ]
}
```
- **Rewrite:** SPA fallback — tudo que não é `/api/*` cai em `index.html` (roteamento client-side).
- **Crons:** `cron-diagnosis` roda 2x/dia (12:00 e 18:00 UTC). **`cron-stuck-check` não está aqui** — roda via GitHub Action.

### `vite.config.js`
```js
plugins: [react()]
server: { port: 5176 }
define: {
  __BUILD_TIME__:    <ISO timestamp>,
  __COMMIT_SHA__:    <git short SHA ou 'local'>,
  __IS_VERCEL__:     <bool>,
}
```
- Porta de dev: **5176** (não 5173/5175 mencionados em alguns lugares do `CLAUDE.md`).
- Injeta metadados de build expostos ao runtime via globais `__BUILD_TIME__`, `__COMMIT_SHA__`, `__IS_VERCEL__`.

### `package.json` scripts
```
dev     → vite            (porta 5176)
build   → vite build
preview → vite preview
test   → vitest
```
- `"type": "module"` — ESM em todo `.js`.

---

## 3. Variáveis de ambiente

### 3.1 Fonte da verdade (fragmentada)

Existem **dois arquivos locais** com conjuntos **divergentes** e **nenhum `.env.example`**:

| Variável | `.env` | `.env.local` | Vercel (obrigatório p/ prod) |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | ✅ | ✅ |
| `VITE_SUPABASE_KEY` | ✅ | ✅ | ✅ |
| `VITE_GPTMAKER_TOKEN` | ✅ | ✅ | ✅ |
| `VITE_GPTMAKER_USER_TOKEN` | ✅ | ✅ | ✅ (expira ~24h) |
| `VITE_GPTMAKER_EMAIL` | ✅ | ✅ | ✅ |
| `VITE_GPTMAKER_PASSWORD` | ✅ | ✅ | ✅ |
| `VITE_GPTMAKER_WORKSPACE` | ✅ | ✅ | ✅ |
| `VITE_GPTMAKER_URL` | — | ✅ | (não listado) |
| `VITE_AWS_ACCESS_KEY` | ✅ | — | — |
| `VITE_AWS_SECRET_KEY` | ✅ | — | — |
| `VITE_AWS_REGION` | ✅ | — | — |
| `VITE_OPENROUTER_KEY` | ✅ | — | — |
| `VITE_GROQ_API_KEY` | — | ✅ | ✅ |
| `VITE_DEEPSEEK_API_KEY` | — | ✅ | ✅ |
| `VITE_GOOGLE_DRIVE_API_KEY` | — | ✅ | ✅ |
| `VITE_GOOGLE_DRIVE_FOLDER_ID` | — | ✅ | ✅ |
| `COHERE_API_KEY` | — | ✅ | ✅ |
| `GOOGLE_OAUTH_CLIENT_ID` | — | ✅ | — (só scripts locais) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | — | ✅ | — (só scripts locais) |
| `VITE_BASE44_APP_ID` | — | — | ✅ (mencionado no CLAUDE.md) |
| `VITE_BASE44_API_KEY` | — | — | ✅ (mencionado no CLAUDE.md) |

### 3.2 Regras críticas (do `CLAUDE.md`)

1. **Token GPTMaker vive em `.env.local`, nunca em `.env`** — `.env.local` tem prioridade no Vite e expira ~24h.
2. **Workspace ID é imutável:** `3F300E7C6105E0123A946E0E9A5EC274`.
3. **Antes de `git push origin main`**: sincronizar `.env` com variáveis de produção da Vercel — local funcionando não garante produção funcionando (erros silenciosos).
4. **Worktree nova precisa de `.env.local` copiado à mão** — está no `.gitignore`, não vem com o clone. Sintoma de falta: app carrega com "0 conversas" e nenhum erro no console.

### 3.3 Como atualizar token GPTMaker (expira ~24h)
- **Jeito fácil:** logado em `app.gptmaker.ai` → abrir `view-source:https://app.gptmaker.ai/browse` → `Ctrl+F` por `"token":` → copiar valor → colar em `.env.local`.
- **Jeito antigo:** DevTools → Network → header `Authorization` (sem "Bearer") → `.env.local`.
- **Em produção (card de créditos):**
  ```
  vercel env rm VITE_GPTMAKER_USER_TOKEN production --yes
  echo "..." | vercel env add VITE_GPTMAKER_USER_TOKEN production
  vercel --prod --yes
  ```

### 3.4 Comandos Vercel úteis
```
vercel env ls                      # lista variáveis em produção
vercel env add NOME production     # adiciona
vercel env rm NOME production --yes
```

---

## 4. CI/CD

### GitHub Actions
Apenas um workflow: `.github/workflows/stuck-check.yml`

```yaml
name: Verificar clientes sem resposta
on:
  schedule:
    - cron: "*/5 * * * *"     # a cada 5 minutos
  workflow_dispatch: {}
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: curl -s -f "https://ignite-webhook.vercel.app/api/cron-stuck-check"
```

- **Por que GitHub e não Vercel cron:** `cron-stuck-check` não está no `vercel.json`; o GitHub Action faz o ping a cada 5 min.
- **Sem build/test/deploy automatizado no GitHub** — o deploy do app é por push na Vercel.

---

## 5. Deploy por componente

### App principal (`ignite-webhook`)
- **Trigger:** `git push origin main` → Vercel detecta → builda (`npm run build`) → publica.
- **Pré-requisito absoluto (do `CLAUDE.md`):** `.env` sincronizado com Vercel Production.
- **Validação pós-deploy:** abrir Vercel preview, conferir card de créditos do GPT Maker, abrir Inbox.

### Catálogo público (`catalogo-publico`)
- **Trigger:** **manual** — não há CI.
  ```
  cd "/Users/macbook/Downloads/PROJETO DO CLAUDECODE/catalogo-publico"
  vercel --prod --yes
  ```
- **Sem build, sem Node:** é um único `index.html` (HTML+CSS+JS inline).
- **Config:** `API_KEY` e `ROOT_FOLDER` hardcoded no `<script>` do próprio arquivo (não há `.env` — site estático).
- **`VISIBLE_FOLDERS`:** lista dentro do script que filtra pastas visíveis publicamente (`[]` = todas).
- **WhatsApp float:** aponta para `5534997257499` — mudar no `href` do `.whatsapp-float`.

---

## 6. Operações rotineiras (runbooks)

### Renovar token GPTMaker (diário)
1. Logar em `app.gptmaker.ai`
2. Extrair token (`view-source:.../browse` → `"token":`)
3. Atualizar `.env.local`
4. Se card de créditos quebrar em produção → atualizar também via `vercel env` (seção 3.3)
- **Atalho:** `scripts/token-receiver.js` (servidor Express na porta 5180) recebe token de um bookmarklet e propaga para todas as git worktrees. Acompanhado de `scripts/renovar-token.sh`.

### Corrigir permissão de fotos no Google Drive
Fotos novas precisam de permissão "Qualquer pessoa com o link" — senão dão `ERR_BLOCKED_BY_ORB` e não aparecem no catálogo.
```
node scripts/fix-drive-permissions.mjs
```
- Pede login OAuth (abre navegador, autoriza uma vez), corrige recursivamente a pasta raiz.
- Credenciais OAuth: `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` em `.env.local` (sem prefixo `VITE_` de propósito — não podem vazar pro browser).

### Sincronizar catálogo (antes de push)
1. Validação local: ~538 produtos, imagens OK
2. UPSERT por produto em `products`
3. Imagens → bucket Storage
4. `catalog_history` registra ação
5. Só então autorizar `git push origin main`

### Limpar git worktrees (a cada sessão)
- `git worktree list` — se >2 (main + atual), avisar antes de limpar.
- Worktree órfã com `git rev-list --count <atual>..<órfã> == 0` → `git worktree remove --force`.
- Se `>0` → revisar commits exclusivos antes.

---

## 7. Riscos e armadilhas de deploy

| Risco | Sintoma | Causa |
|---|---|---|
| **Variável faltante em produção** | Funciona local, quebra em prod (silencioso) | `.env` não sincronizado com Vercel |
| **Token expirado** | "Erro ao mudar modo. Token pode ter expirado" / card créditos quebrado | GPTMaker ~24h |
| **Worktree sem `.env.local`** | App carrega com "0 conversas", sem erro no console | `.gitignore` exclui o arquivo |
| **Rate-limit 429** | Foto enviada mas preço não chega | Delay <1000ms entre imagem e preço |
| **Foto não aparece no catálogo** | `ERR_BLOCKED_BY_ORB` | Sem permissão pública no Drive |
| **`cron-stuck-check` "some"** | Healthcheck para de rodar | Esperar no Vercel — ele roda via GitHub Action |
| **DraftCatalogPage some em prod** | Página some em produção | `VITE_GOOGLE_DRIVE_*` não estava na Vercel (caso 2026-07-07) |

---

## 8. Checklist pré-deploy (consolidado do `CLAUDE.md`)

### Ambiente
- [ ] Token `VITE_GPTMAKER_USER_TOKEN` válido (não expirou)
- [ ] `.env` sincronizado com Vercel Production (`vercel env ls`)
- [ ] Worktree atual tem `.env.local` copiado

### Dados
- [ ] ~538 produtos íntegros no Supabase
- [ ] `catalog_history` consistente (sem gaps)
- [ ] Storage de imagens sincronizado
- [ ] Base de conhecimento intacta

### Comportamento
- [ ] Webhook `/api/webhook` retorna apenas texto (sem `imageUrl`)
- [ ] Webhook `/api/auto-photo` envia imagem + 1000ms + preço + link
- [ ] Rate-limit respeitado (1000ms)
- [ ] Fallback Groq ativo se LLM principal falhar

### Pós-deploy
- [ ] Vercel preview URL funcionando
- [ ] Card de créditos do GPT Maker carrega
- [ ] Inbox abre com conversas

---

**Gerado em:** 2026-07-08 · apenas com dados do repositório.
