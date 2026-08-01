-- Fase 2B.2 — log operacional persistente para a PRIME Bridge
-- (poc/zap-gptmaker-bridge/server.mjs). Vocabulário fechado (level, source,
-- event) — sem coluna jsonb de metadata livre, para eliminar pela raiz o
-- risco desta tabela virar um depósito de payload/dado sensível.
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations
-- automatizadas).

-- CREATE TABLE estrito (sem IF NOT EXISTS) — se o objeto já existir, a
-- migration deve falhar e forçar investigação, não seguir em silêncio (mesmo
-- padrão de 013/015).

create table public.bridge_operation_logs (
  id            uuid primary key default gen_random_uuid(),
  level         text not null,
  event         text not null,
  error_code    text,
  source        text,
  http_status   integer,
  duration_ms   integer,
  message_id    text,
  created_at    timestamptz not null default now(),

  constraint chk_bridge_log_level
    check (level in ('info', 'warning', 'error')),

  constraint chk_bridge_log_source
    check (source is null or source in ('gptmaker', 'zap_api', 'bridge')),

  -- Vocabulário fechado de eventos — nenhum ponto de log novo pode ser
  -- adicionado ao código sem antes estender esta constraint numa nova
  -- migration. message_id é o identificador opaco do provedor (não é PII);
  -- nenhuma outra coluna aqui pode carregar telefone, texto de conversa,
  -- resposta da IA, token, header ou payload bruto.
  constraint chk_bridge_log_event
    check (event in (
      'received', 'filtered_wrong_event', 'filtered_from_me', 'filtered_not_text',
      'filtered_no_phone', 'filtered_invalid_phone', 'filtered_duplicate',
      'processing_started', 'gptmaker_called', 'gptmaker_error',
      'provider_accepted', 'provider_accept_error',
      'completed', 'processing_failed', 'unhandled_error'
    ))
);

create index idx_bridge_operation_logs_created_at
  on public.bridge_operation_logs (created_at desc);

create index idx_bridge_operation_logs_level_created_at
  on public.bridge_operation_logs (level, created_at desc);

alter table public.bridge_operation_logs enable row level security;
-- RLS habilitada, ZERO policy criada de propósito (mesmo padrão de
-- qwen_health_state, 015, e profile_learning_audit, 013): anon/authenticated
-- não conseguem ler nem escrever aqui via REST direto. service_role ignora
-- RLS por natureza própria da role.
revoke all on table public.bridge_operation_logs from public, anon, authenticated;
-- Camada extra além de RLS: mesmo que uma policy fosse adicionada por engano
-- no futuro, o REVOKE em nível de tabela ainda bloqueia anon/authenticated
-- antes de qualquer avaliação de RLS.
