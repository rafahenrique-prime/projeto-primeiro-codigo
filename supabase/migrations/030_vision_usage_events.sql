-- Fase Painel Visão IA (Passo 1) — telemetria técnica da camada de visão
-- compartilhada (api/_visaoProduto.js: OCR/foto de produto e Story do
-- Instagram, imagem ou vídeo→FFmpeg, via api/system-tools.js?tool=ocr-openrouter).
-- Vocabulário fechado (mesmo padrão de bridge_operation_logs, 018) — sem
-- coluna jsonb de metadata livre, pra eliminar pela raiz o risco desta
-- tabela virar um depósito de payload/dado sensível. NUNCA armazena
-- chat_id, telefone, nome, pergunta/resposta do cliente, storyMediaUrl,
-- imagem/base64, descrição visual ou produto identificado — só metadados
-- operacionais.
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations
-- automatizadas) — aplicada em produção via MCP Supabase (apply_migration).

-- CREATE TABLE estrito (sem IF NOT EXISTS) — se o objeto já existir, a
-- migration deve falhar e forçar investigação, não seguir em silêncio (mesmo
-- padrão de 013/015/018).

create table public.vision_usage_events (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  source         text not null,
  media_type     text not null,
  ffmpeg_used    boolean not null default false,
  ffmpeg_ms      integer,

  model          text not null,
  provider       text not null default 'openrouter',

  success        boolean not null,
  latency_ms     integer not null,

  input_tokens   integer,
  output_tokens  integer,
  total_tokens   integer,

  cost_usd       numeric(12, 8),
  cost_source    text not null default 'unavailable',

  error_code     text,

  -- Vocabulário fechado — nenhum valor novo pode ser usado no código sem
  -- antes estender esta constraint numa nova migration.
  constraint chk_vision_usage_source
    check (source in ('story', 'ocr', 'product_photo')),

  constraint chk_vision_usage_media_type
    check (media_type in ('image', 'video')),

  constraint chk_vision_usage_provider
    check (provider in ('openrouter')),

  constraint chk_vision_usage_cost_source
    check (cost_source in ('real', 'estimated', 'unavailable')),

  constraint chk_vision_usage_latency_ms
    check (latency_ms >= 0),

  constraint chk_vision_usage_ffmpeg_ms
    check (ffmpeg_ms is null or ffmpeg_ms >= 0),

  constraint chk_vision_usage_tokens
    check (
      (input_tokens is null or input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0)
      and (total_tokens is null or total_tokens >= 0)
    ),

  constraint chk_vision_usage_cost_usd
    check (cost_usd is null or cost_usd >= 0),

  -- ffmpeg_ms só deve existir quando ffmpeg_used = true.
  constraint chk_vision_usage_ffmpeg_consistency
    check (ffmpeg_used or ffmpeg_ms is null)
);

create index idx_vision_usage_events_created_at
  on public.vision_usage_events (created_at desc);

create index idx_vision_usage_events_source_created_at
  on public.vision_usage_events (source, created_at desc);

alter table public.vision_usage_events enable row level security;
-- RLS habilitada, ZERO policy criada de propósito (mesmo padrão de
-- qwen_health_state/015, bridge_operation_logs/018): anon/authenticated não
-- conseguem ler nem escrever aqui via REST direto, mesmo com a anon key
-- exposta no bundle do frontend. service_role ignora RLS por natureza
-- própria da role — só api/_visaoProduto.js (server-side, com
-- SUPABASE_SECRET_KEY) grava aqui, e api/system-tools.js?tool=vision-health
-- (server-side) lê.
revoke all on table public.vision_usage_events from public, anon, authenticated;
-- Camada extra além de RLS: mesmo que uma policy fosse adicionada por engano
-- no futuro, o REVOKE em nível de tabela ainda bloqueia anon/authenticated
-- antes de qualquer avaliação de RLS.
