BEGIN;

-- ============================================================
-- Migration: bagy_sync_operational_tables
-- 100% aditiva. Não toca em products/product_variations nem em
-- nenhuma tabela já existente. Cria só a camada operacional
-- (logs persistentes + fila de exceções) do sincronizador Bagy,
-- para uso manual nesta fase (sem cron).
-- ============================================================

-- 1) bagy_sync_runs — histórico persistente de cada execução do
--    sincronizador (dry_run ou write), disparada manualmente.
CREATE TABLE public.bagy_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('dry_run', 'write')),
  trigger text NOT NULL DEFAULT 'manual',
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  duration_ms integer,
  total_analisado integer,
  sincronizados integer,
  sem_mudanca integer,
  total_404 integer,
  pagina_invalida integer,
  duplicate_conflict integer,
  erro_rede integer,
  retries_executados integer,
  variacoes_inseridas integer,
  variacoes_atualizadas integer,
  status_final text,
  erro_fatal text,
  detalhes jsonb,
  CONSTRAINT bagy_sync_runs_run_id_key UNIQUE (run_id)
);

COMMENT ON TABLE public.bagy_sync_runs IS 'Histórico persistente de execuções do sincronizador Bagy → Supabase (dry_run/write). Gravado ao final de cada syncBatch, via service_role.';
COMMENT ON COLUMN public.bagy_sync_runs.trigger IS 'Origem da execução: manual (fase atual) | cron (futuro, ainda não implementado) | webhook (futuro).';
COMMENT ON COLUMN public.bagy_sync_runs.detalhes IS 'Array completo de resultados por produto (mesmo formato já usado nos relatórios manuais desta sessão) — permite investigar um run sem precisar re-executar.';

-- 2) bagy_sync_exceptions — fila de casos que o sincronizador
--    detecta mas nunca corrige sozinho (404, página sem marcador
--    válido, DUPLICATE_CONFLICT). Upsert por link+tipo a cada run.
CREATE TABLE public.bagy_sync_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('404', 'pagina_invalida', 'duplicate_conflict')),
  detalhe jsonb,
  primeira_deteccao timestamptz NOT NULL DEFAULT now(),
  ultima_deteccao timestamptz NOT NULL DEFAULT now(),
  run_id_ultima_deteccao text,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'ignorado', 'resolvido')),
  resolvido_em timestamptz,
  CONSTRAINT bagy_sync_exceptions_link_tipo_key UNIQUE (link, tipo)
);

COMMENT ON TABLE public.bagy_sync_exceptions IS 'Fila de exceções conhecidas do sincronizador Bagy (404 / página sem window.dooca.product / DUPLICATE_CONFLICT). Nunca corrigida automaticamente. status compatível com a taxonomia já usada pela Auditoria Bagy (bagy_audit_log): aberto/ignorado/resolvido.';
COMMENT ON COLUMN public.bagy_sync_exceptions.status IS 'aberto = ainda não revisado; ignorado = revisado e aceito como está; resolvido = corrigido/deixou de ocorrer. Transição sempre manual — o sincronizador nunca muda um status já definido, só atualiza ultima_deteccao quando o caso persiste em um novo run.';

-- 3) RLS — mesmo padrão já adotado em product_variations (migration 020):
--    SELECT liberado pra anon/authenticated, escrita só via service_role
--    (que ignora RLS por definição, sem precisar de nenhuma policy própria).
ALTER TABLE public.bagy_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow read for anon and authenticated" ON public.bagy_sync_runs
  FOR SELECT
  TO anon, authenticated
  USING (true);
GRANT SELECT ON public.bagy_sync_runs TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bagy_sync_runs FROM anon, authenticated;

ALTER TABLE public.bagy_sync_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow read for anon and authenticated" ON public.bagy_sync_exceptions
  FOR SELECT
  TO anon, authenticated
  USING (true);
GRANT SELECT ON public.bagy_sync_exceptions TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bagy_sync_exceptions FROM anon, authenticated;

-- 4) Índices de consulta esperada
CREATE INDEX bagy_sync_runs_started_at_idx ON public.bagy_sync_runs (started_at DESC);
CREATE INDEX bagy_sync_exceptions_status_idx ON public.bagy_sync_exceptions (status);

COMMIT;
