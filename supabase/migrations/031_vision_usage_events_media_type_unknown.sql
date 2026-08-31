-- 031_vision_usage_events_media_type_unknown.sql
--
-- Migration incremental sobre 030_vision_usage_events.sql — NÃO recria a
-- tabela já aplicada em Production. Só amplia o vocabulário fechado de
-- media_type para cobrir falhas de download que acontecem ANTES de sabermos
-- se a mídia era imagem ou vídeo (ex.: URL fora da allowlist de host, fetch
-- falhou, timeout, tamanho excedido antes do content-type ser lido).
--
-- Gap identificado na revisão do Passo 2 (Painel Visão IA): sem este valor,
-- essas falhas ficavam sem telemetria nenhuma — o painel não conseguiria
-- mostrar "falhas de download", que é um requisito explícito do objetivo.
--
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations
-- automatizadas) — aplicada em produção via MCP Supabase (apply_migration).

alter table public.vision_usage_events
  drop constraint chk_vision_usage_media_type;

alter table public.vision_usage_events
  add constraint chk_vision_usage_media_type
    check (media_type in ('image', 'video', 'unknown'));

-- RLS, zero policy, revoke e índices já aplicados na 030 permanecem
-- intocados — esta migration só altera uma CHECK constraint.
