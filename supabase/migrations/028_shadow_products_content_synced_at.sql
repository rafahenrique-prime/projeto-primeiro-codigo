-- 028_shadow_products_content_synced_at.sql
--
-- Separa "presença confirmada" (last_seen_at, migration 027) de "conteúdo
-- completo sincronizado com sucesso" (content_synced_at, novo) — ver
-- docs/integrations/SHADOW-V2-CATALOGO.md.
--
-- Registro versionado de uma migration já aplicada em produção via MCP
-- Supabase (apply_migration, nome "shadow_products_content_synced_at",
-- 2026-08-20) — este arquivo só documenta o estado real já existente no
-- banco, não deve ser reexecutado como uma alteração nova.
--
-- Aditivo, sem default, sem backfill: NULL significa "sem data confiável de
-- última sincronização completa do conteúdo" — nunca significa "produto
-- errado". Todos os produtos já existentes ficam NULL até passarem por um
-- syncShadowProduct bem-sucedido (produto novo via reconcile, ou refresh
-- targeted/full batch).

ALTER TABLE shadow_products
  ADD COLUMN IF NOT EXISTS content_synced_at timestamptz NULL;
