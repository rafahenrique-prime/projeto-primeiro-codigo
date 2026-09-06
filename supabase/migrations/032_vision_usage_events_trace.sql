-- 032_vision_usage_events_trace.sql
--
-- Etapa 0B do Story Vision Trace — adiciona SOMENTE 2 colunas nullable pra
-- correlacionar um evento de vision_usage_events com a execução real do
-- webhook (correlation_id, gerado 1x por request em api/webhook.js) e com o
-- Story do Instagram que originou a chamada (story_id, já resolvido por
-- api/_storyContext.js e até agora descartado depois do primeiro uso).
--
-- Migration incremental sobre 030_vision_usage_events.sql/
-- 031_vision_usage_events_media_type_unknown.sql — NÃO recria a tabela já
-- aplicada em Production, NÃO toca em nenhuma coluna/constraint existente.
-- RLS (enabled, zero policy) e REVOKE de 030 permanecem intocados — colunas
-- novas herdam a mesma proteção da tabela.
--
-- Escopo estritamente mínimo (YAGNI, ajuste pós-revisão): só as 2 colunas.
-- Nenhum índice novo, nenhuma constraint nova — sem query comprovada que
-- justifique isso ainda; pode ser adicionado numa migration futura se/quando
-- houver necessidade real.
--
-- Continua vocabulário fechado / zero PII: correlation_id é gerado
-- localmente (crypto.randomUUID(), sem relação com dado de cliente) e
-- story_id é um identificador técnico do Story (não é chat_id, telefone,
-- nome nem conteúdo da conversa).
--
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations
-- automatizadas) — mesmo padrão de 030/031. NÃO aplicada nesta etapa (0B é
-- só implementação + teste local; aplicação em Production requer autorização
-- separada).

alter table public.vision_usage_events
  add column correlation_id uuid,
  add column story_id text;
