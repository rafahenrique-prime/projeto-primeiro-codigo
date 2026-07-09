# Relacionamento: IGNITE PRIME (app React) vs Catálogo Público (HTML estático)

> **Snapshot:** 2026-07-08 · branch `main`
> **Fonte:** `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, `CLAUDE.md`

---

## 1. Visão geral

O repositório contém **dois produtos web independentes** que compartilham a mesma fonte de dados (Google Drive), mas com propósitos e públicos completamente diferentes:

| Aspecto | IGNITE PRIME (app React) | Catálogo Público (HTML estático) |
|---|---|---|
| **Caminho** | Raiz do repo | `catalogo-publico/` |
| **Tecnologia** | React + Vite + Supabase | HTML + CSS + JS inline |
| **Deploy** | Push em `main` → Vercel auto-deploy | Manual: `vercel --prod --yes` |
| **Projeto Vercel** | `ignite-webhook` | `catalogo-publico` |
| **URL** | `ignite-webhook.vercel.app` | `catalogo-publico.vercel.app` |
| **Acesso** | Logado (painel interno) | Público (qualquer pessoa com o link) |
| **Config** | `.env` / `.env.local` / Vercel env | Hardcoded no `<script>` |

---

## 2. Fonte de dados compartilhada: Google Drive

Ambos leem fotos do **mesmo Google Drive**, mas com abordagens diferentes:

### App React (Catálogo Rascunho)
- Service: `src/services/googleDriveCatalog.js`
- Credenciais: `VITE_GOOGLE_DRIVE_API_KEY` + `VITE_GOOGLE_DRIVE_FOLDER_ID` (do `.env.local`)
- Cache: `localStorage` — só recarrega ao clicar "Atualizar" (não gasta cota à toa)
- Acesso: apenas usuários logados no painel
- Propósito: **pré-visualização** antes de formalizar no catálogo oficial (Supabase)

### Catálogo Público
- Fonte: `catalogo-publico/index.html` — Google Drive API diretamente no browser
- Credenciais: `API_KEY` e `ROOT_FOLDER` **hardcoded** no `<script>` do HTML
- Filtro: `VISIBLE_FOLDERS` — lista de pastas visíveis (`[]` = todas)
- Acesso: qualquer pessoa (sem login)
- Propósito: **link público** para clientes navegarem o catálogo

---

## 3. Divergência de credenciais

| Recurso | App React | Catálogo Público |
|---|---|---|
| API Key do Drive | `.env.local` → `VITE_GOOGLE_DRIVE_API_KEY` | Hardcoded no `<script>` como `API_KEY` |
| Folder ID | `.env.local` → `VITE_GOOGLE_DRIVE_FOLDER_ID` | Hardcoded no `<script>` como `ROOT_FOLDER` |
| Atualização | Via `.env.local` (rebuild automático) | Editar HTML → `vercel --prod --yes` |

**Risco:** Se a API Key do Drive for rotacionada, precisa atualizar em **dois lugares** (`.env.local` + hardcoded no HTML).

---

## 4. Permissões de fotos (ponto crítico compartilhado)

**Ambos os sistemas dependem da mesma permissão:** "Qualquer pessoa com o link".

- Sem essa permissão: fotos dão `ERR_BLOCKED_BY_ORB` e **não aparecem em nenhum dos dois**.
- Correção em massa: `node scripts/fix-drive-permissions.mjs`
- Credenciais OAuth: `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` (`.env.local`, sem prefixo `VITE_`)
- Histórico: já corrigido uma vez em massa (538 arquivos + 73 pastas, 2026-07-05)

---

## 5. Pipeline de publicação

```
Google Drive (fotos brutas)
    │
    ├──[1]── DraftCatalogPage (app React, logged-in preview)
    │         └─ usa VITE_GOOGLE_DRIVE_* do .env.local
    │
    ├──[2]── Catálogo Público (HTML estático, público)
    │         └─ usa API_KEY/ROOT_FOLDER hardcoded no HTML
    │
    └──[3]── Supabase `products` (catálogo oficial, sync manual)
              └─ src/services/catalog.js → UPSERT + Storage bucket "produtos"
```

- **Passo [1] → [3]:** O usuário (Rafael) confere no Draft, decide o que formalizar, clica "Sincronizar".
- **Passo [2]:** Independente — o catálogo público reflete o Drive diretamente, sem passar pelo Supabase.
- Isso significa que o catálogo público pode mostrar produtos que **ainda não estão no Supabase**.

---

## 6. Deploy independente

| Ação | Impacto no outro |
|---|---|
| Push `main` (app React) | Nenhum no catálogo público |
| `vercel --prod` no `catalogo-publico/` | Nenhum no app React |
| Atualizar foto no Drive | Ambos veem (mas app React precisa de "Atualizar") |
| Rotacionar API Key do Drive | Precisa atualizar em **ambos** |

---

## 7. Riscos

| Risco | Sintoma | Mitigação |
|---|---|---|
| API Key do Drive diverge entre os dois | Um funciona, o outro não | Documentar no runbook de renovação |
| Foto sem permissão pública | `ERR_BLOCKED_BY_ORB` nos dois | `fix-drive-permissions.mjs` |
| Catálogo público mostra produto não formalizado | Cliente vê item que não está no Supabase | Ajustar `VISIBLE_FOLDERS` para filtrar |

---

**Gerado em:** 2026-07-08 · Fase 2 da reorganização.
