# Relacionamento: Supabase vs Catálogo (3 fontes de verdade)

> **Snapshot:** 2026-07-08 · branch `main`
> **Fonte:** `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, `CLAUDE.md`, grep results

---

## 1. O problema: 3 fontes de verdade para o catálogo

O sistema de catálogo tem **três fontes independentes** que podem divergir:

| # | Fonte | Tipo | Usado por |
|---|---|---|---|
| 1 | **Supabase `products`** | Banco de dados (538 itens) | App React (CatalogPage), api/webhook, api/auto-photo |
| 2 | **`src/data/catalog.json`** | JSON bundled no build | nenhum (órfão confirmado — ver §3) |
| 3 | **`CATALOG_FALLBACK`** | Array hardcoded em api/auto-photo.js | api/auto-photo.js (quando Supabase cai) |

Além disso, existe um **catálogo visual** separado:
| 4 | **Google Drive** | Fotos em pastas | DraftCatalogPage + Catálogo Público |

---

## 2. Fonte #1: Supabase `products` (fonte principal)

- **538 produtos** registrados
- Acesso: `VITE_SUPABASE_URL` + `VITE_SUPABASE_KEY`
- Consumido por:
  - `src/services/catalogo/catalog.js` — CRUD do catálogo no painel
  - `api/webhook.js` — busca de produtos para contexto da Gabriela
  - `api/auto-photo.js` — busca de produto para enviar foto ao cliente
- Imagens: bucket Storage `produtos` (PUBLIC) — og:image scrapeadas
- Histórico: `catalog_history` registra add/edit/delete com timestamp

**Sync:** O usuário clica "Sincronizar" na UI → UPSERT por produto (não batch) → Storage → `catalog_history`.

---

## 3. Fonte #2: `src/data/catalog.json` (fallback bundled)

- Arquivo JSON estático dentro do repo, **bundled no build** pelo Vite
- Consumido por: nenhum arquivo ativo hoje
- **Não é atualizado automaticamente** — precisa de atualização manual no arquivo
- **Risco:** Pode estar desatualizado em relação ao Supabase

**Status atual:** Confirmado órfão em 2026-07-10 — nenhum código ativo consome `catalog.json`, e nenhum consumidor real foi identificado desde a criação do arquivo. `photoRecognitionService.js` era apontado nesta documentação como seu consumidor, mas verificação direta do código-fonte (auditoria de 2026-07-10, ver `docs/AUDITORIA-ORFAOS-SERVICES.md`) confirmou que ele **nunca importou ou leu `catalog.json` em nenhum momento** — a associação era uma hipótese registrada em documentação desatualizada, não um fluxo que existiu de fato. `photoRecognitionService.js` está arquivado em `src/services/_archive/` por outros motivos (arquitetura multi-provider nunca implementada), sem relação real com este arquivo.

---

## 4. Fonte #3: `CATALOG_FALLBACK` (server-side hardcoded)

- Array de produtos **hardcoded** dentro de `api/auto-photo.js`
- Usado quando Supabase está indisponível (fallback de emergência)
- **Não é atualizado automaticamente** — precisa de edição manual no código
- Emite alerta CODEX crítico quando acionado

**Risco:** Produtos podem estar completamente desatualizados se o Supabase cair por um longo período e o fallback não for mantido.

---

## 5. Fonte #4: Google Drive (catálogo visual)

- Não é um "catálogo de dados" — é um **catálogo de fotos**
- Usado por:
  - `DraftCatalogPage` → `googleDriveCatalog.js` → `.env.local`
  - `catalogo-publico/index.html` → hardcoded no HTML
- Estrutura: cada pasta = categoria, cada subpasta = produto com galeria
- Permissão: "Qualquer pessoa com o link" obrigatória

**Relação com Supabase:** O DraftCatalogPage serve para **pré-visualizar** fotos do Drive antes de formalizar no Supabase. Não é sync automático.

---

## 6. Matriz de risco por fonte

| Fonte | Atualização | Risco se desatualizada | Impacto |
|---|---|---|---|
| Supabase | Manual (sincronizar UI) | Baixo (é a fonte de verdade) | Principal — tudo depende disso |
| catalog.json | Manual (editar arquivo) | Baixo (sem consumidor ativo hoje) | Nenhum — arquivo bundled no build mas não lido por nenhum código em produção |
| CATALOG_FALLBACK | Manual (editar código) | Alto (só é usado em emergência) | Auto-photo envia produto errado se Supabase cair |
| Google Drive | Manual (upload + permissões) | Médio (foto sem permissão = invisível) | Catálogo público e rascunho incompletos |

---

## 7. Pipeline de sync

```
[1] Google Drive (fotos brutas)
         │
         ▼
[2] DraftCatalogPage (preview, logged-in)
         │
         ▼ "Sincronizar" (ação manual do Rafael)
         │
[3] Supabase products + Storage bucket "produtos"
         │
         ├──[3a]── api/webhook.js (contexto Gabriela)
         ├──[3b]── api/auto-photo.js (envio de fotos)
         └──[3c]── src/services/catalogo/catalog.js (painel de gestão)

[4] catalog.json (bundled) ← atualização SEPARADA, não automática
[5] CATALOG_FALLBACK (hardcoded) ← atualização SEPARADA, não automática
```

---

## 8. Divergência documentada (ARCHITECTURE.md §5)

Da análise de arquitetura (Fase 1):

| Regra | `src/services/` | `api/` | Risco |
|---|---|---|---|
| **Busca de conhecimento** | ~~`searchKnowledge.js`~~ (removido em 2026-07-10) | `webhook.js::searchKnowledge()` — **implementação canônica** | Resolvido: duplicação eliminada, não mitigada |
| **Catálogo fallback** | `catalog.json` (sem consumidor ativo) | `CATALOG_FALLBACK` | **2 fontes de verdade ativas** (`catalog.json` existe no bundle mas não é lido por nada hoje) |

**Recomendação registrada (não executada):** Unificar as fontes de fallback ou ao menos documentar o processo de atualização de cada uma.

---

## 9. Riscos consolidados

| Risco | Sintoma | Mitigação |
|---|---|---|
| 3 fontes de verdade divergentes | Produto aparece no auto-photo mas não no painel | Sync manual + documentação |
| catalog.json sem consumidor | Nenhum sintoma hoje — arquivo bundled mas não lido | Avaliar remoção do arquivo se confirmado que não será reativado |
| CATALOG_FALLBACK desatualizado | Auto-photo envia produto errado em emergência | Alerta CODEX já existe |
| Fotos sem permissão no Drive | ERR_BLOCKED_BY_ORB | `fix-drive-permissions.mjs` |
| Storage bucket cheio | Upload de imagens falha | Monitorar uso no Supabase |

---

**Gerado em:** 2026-07-08 · Fase 2 da reorganização.
**Atualizado em:** 2026-07-10 · pós descomissionamento de órfãos: `searchKnowledge.js` removido, `photoRecognitionService.js` arquivado (sem consumidor confirmado). Caminhos de `catalog.js` corrigidos para refletir a estrutura pós-Fase-3C (`src/services/catalogo/`). Ver `docs/AUDITORIA-ORFAOS-SERVICES.md`.
