-- 029_catalog_quality_audit_history.sql
--
-- Histórico persistente da Auditoria de Qualidade do Catálogo V2 (Fase 2B)
-- — ver docs/integrations/SHADOW-V2-CATALOGO.md. Consome o motor puro já
-- homologado/congelado (src/services/auditoria/qualidadeCatalogoRules.js) —
-- nunca o altera. 100% aditivo.
--
-- Registro versionado de uma migration já aplicada em produção via MCP
-- Supabase (apply_migration, nome "catalog_quality_audit_history",
-- 2026-08-20) — este arquivo só documenta o estado real já existente no
-- banco, não deve ser reexecutado como uma alteração nova.

CREATE TABLE IF NOT EXISTS catalog_quality_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL, -- 'completa' | 'falha'
  total_active_products integer,
  products_without_findings integer,
  products_with_findings integer,
  total_findings integer,
  fato_count integer NOT NULL DEFAULT 0,
  alerta_count integer NOT NULL DEFAULT 0,
  sugestao_count integer NOT NULL DEFAULT 0,
  critico_count integer NOT NULL DEFAULT 0,
  importante_count integer NOT NULL DEFAULT 0,
  revisar_count integer NOT NULL DEFAULT 0,
  novos_findings integer NOT NULL DEFAULT 0,
  resolvidos_automaticamente integer NOT NULL DEFAULT 0,
  reabertos integer NOT NULL DEFAULT 0,
  erro text,
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS catalog_quality_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shadow_product_id uuid NOT NULL REFERENCES shadow_products(id) ON DELETE CASCADE,
  bagy_product_id bigint,
  -- Identidade determinística: (shadow_product_id, tipo, chave_extra).
  -- chave_extra é '' para achados de produto único e carrega o
  -- bagy_product_id do contraparte para achados de PAR (quase_duplicado) —
  -- nunca usa a mensagem textual como identidade.
  chave_extra text NOT NULL DEFAULT '',
  tipo text NOT NULL,
  classe text NOT NULL, -- 'FATO' | 'ALERTA' | 'SUGESTAO'
  severidade text NOT NULL,
  mensagem text NOT NULL,
  encontrado text,
  esperado_sugerido text,
  por_que text,
  o_que_conferir text,
  content_synced_at timestamptz,
  status text NOT NULL DEFAULT 'aberto', -- 'aberto' | 'ignorado' | 'resolvido'
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  first_run_id uuid REFERENCES catalog_quality_audit_runs(id),
  last_run_id uuid REFERENCES catalog_quality_audit_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shadow_product_id, tipo, chave_extra)
);

CREATE INDEX IF NOT EXISTS catalog_quality_findings_status_idx ON catalog_quality_findings (status);
CREATE INDEX IF NOT EXISTS catalog_quality_findings_shadow_product_idx ON catalog_quality_findings (shadow_product_id);

ALTER TABLE catalog_quality_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_quality_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_quality_audit_runs_select_all" ON catalog_quality_audit_runs;
CREATE POLICY "catalog_quality_audit_runs_select_all"
  ON catalog_quality_audit_runs FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "catalog_quality_findings_select_all" ON catalog_quality_findings;
CREATE POLICY "catalog_quality_findings_select_all"
  ON catalog_quality_findings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Escrita só via service_role (mesmo padrão de shadow_reconciliation_runs) —
-- nenhuma policy de INSERT/UPDATE/DELETE para anon/authenticated.
