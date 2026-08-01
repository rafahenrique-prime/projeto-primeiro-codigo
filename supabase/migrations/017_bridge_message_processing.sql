-- Fase 2B.2 — dedupe persistente simplificado para a PRIME Bridge
-- (poc/zap-gptmaker-bridge/server.mjs), adequado à topologia atual: um
-- único processo Node, sem concorrência entre múltiplas instâncias. Toda
-- escrita/leitura de estado passa por uma única RPC (process_bridge_message)
-- — nunca INSERT/UPDATE cru espalhado pelo código da bridge — para que uma
-- eventual evolução futura (posse por tentativa via claim_token/lease, se a
-- bridge um dia rodar em múltiplas instâncias concorrentes) fique contida
-- nesta função e nesta tabela, sem mudar a forma como a bridge a chama.
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations
-- automatizadas).

-- 1. Tabela de processamento ------------------------------------------------
-- CREATE TABLE estrito (sem IF NOT EXISTS) — se o objeto já existir, a
-- migration deve falhar e forçar investigação, não seguir em silêncio (mesmo
-- padrão de 013/015).

create table public.bridge_message_processing (
  message_id             text primary key,
  status                 text not null default 'received',
  attempts               integer not null default 1,
  error_code             text,
  processing_started_at  timestamptz not null default now(),
  failed_at              timestamptz,
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint chk_bridge_message_status
    check (status in ('received', 'completed', 'failed'))
);
-- processing_started_at: quando a tentativa ATUAL começou (não é o primeiro
-- recebimento — created_at cobre isso). É o campo que a janela de "stale"
-- (60s, ver função abaixo) usa para decidir se uma linha 'received' é uma
-- tentativa legítima ainda em andamento ou uma tentativa abandonada por
-- crash do processo, reivindicável de novo.

alter table public.bridge_message_processing enable row level security;
-- RLS habilitada, ZERO policy criada de propósito (mesmo padrão de
-- qwen_health_state, 015, e profile_learning_audit, 013): anon/authenticated
-- não conseguem ler nem escrever aqui via REST direto, mesmo com a anon key
-- exposta no bundle do frontend. service_role ignora RLS por natureza
-- própria da role.
revoke all on table public.bridge_message_processing from public, anon, authenticated;
-- Camada extra além de RLS: mesmo que uma policy fosse adicionada por engano
-- no futuro, o REVOKE em nível de tabela ainda bloqueia anon/authenticated
-- antes de qualquer avaliação de RLS.


-- 2. Função transacional única -----------------------------------------------
-- CREATE FUNCTION estrito (não CREATE OR REPLACE) — primeira migration desta
-- função; qualquer mudança futura na lógica deve vir em uma NOVA migration,
-- usando CREATE OR REPLACE FUNCTION lá — nunca editando este arquivo depois
-- de aplicado.
--
-- p_action = 'check_or_start' | 'mark_completed' | 'mark_failed'
--
-- 'check_or_start' — decide atomicamente se esta chamada deve processar a
--   mensagem, ignorá-la, ou reabrir uma tentativa anterior:
--   • linha não existe → cria 'received', attempts=1 → 'process'
--   • linha 'completed' → 'duplicate_completed' (nunca reaberta)
--   • linha 'failed' → reabre para 'received' (attempts+1, limpa
--     failed_at/error_code/completed_at, processing_started_at=now())
--     → 'retry_failed' (retry imediato, sem esperar janela nenhuma)
--   • linha 'received' com processing_started_at DENTRO da janela de
--     STALE_SECONDS (60s) → 'already_processing' (tentativa em andamento,
--     legítima, não mexe em nada)
--   • linha 'received' com processing_started_at FORA da janela de
--     STALE_SECONDS → considera a tentativa anterior abandonada (processo
--     crashou antes de completar/falhar) → reabre (attempts+1,
--     processing_started_at=now()) → 'retry_stale' — garante que nenhuma
--     mensagem fica presa em 'received' para sempre após um crash.
-- 'mark_completed' — só 'received' → 'completed'; nunca toca 'failed' nem
--   'completed' (WHERE status='received' garante isso estruturalmente).
-- 'mark_failed' — só 'received' → 'failed'; nunca toca 'completed' (mesma
--   garantia estrutural via WHERE).
--
-- Concorrência dentro do mesmo processo: o INSERT ... ON CONFLICT DO NOTHING
-- garante que, para mensagem nova, só uma chamada concorrente vence (garantia
-- nativa do Postgres). Para linha já existente, o SELECT ... FOR UPDATE trava
-- a linha antes de decidir — mesmo padrão já usado em
-- apply_profile_size_learning (migration 013) — serializando chamadas
-- concorrentes para o MESMO message_id: a segunda só prossegue depois que a
-- primeira commitar, e nesse ponto já enxerga o estado atualizado
-- (processing_started_at recém-renovado), garantindo que a segunda
-- corretamente recebe 'already_processing' em vez de reabrir a mesma linha —
-- nunca duas chamadas simultâneas recebem autorização para processar.
create function public.process_bridge_message(
  p_action      text,
  p_message_id  text,
  p_error_code  text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.bridge_message_processing%rowtype;
  v_row_count integer;
  v_stale_seconds constant integer := 60;
begin
  if p_message_id is null or length(trim(p_message_id)) = 0 then
    return jsonb_build_object('result', 'error', 'reason', 'missing_message_id');
  end if;

  if p_action = 'check_or_start' then
    -- Caminho 1: mensagem nunca vista. INSERT atômico — se duas chamadas
    -- concorrentes tentarem ao mesmo tempo, só uma vence o ON CONFLICT; a
    -- garantia vem do próprio Postgres, não de lógica em código.
    insert into public.bridge_message_processing
      (message_id, status, attempts, processing_started_at, created_at, updated_at)
    values
      (p_message_id, 'received', 1, now(), now(), now())
    on conflict (message_id) do nothing
    returning * into v_row;

    if found then
      return jsonb_build_object('result', 'process');
    end if;

    -- Caminho 2: já existia. SELECT ... FOR UPDATE trava a linha antes de
    -- decidir — serializa chamadas concorrentes para o mesmo message_id.
    select * into v_row
      from public.bridge_message_processing
      where message_id = p_message_id
      for update;

    if v_row.status = 'completed' then
      return jsonb_build_object('result', 'duplicate_completed');
    end if;

    if v_row.status = 'failed' then
      update public.bridge_message_processing
        set status = 'received',
            attempts = attempts + 1,
            processing_started_at = now(),
            failed_at = null,
            error_code = null,
            completed_at = null,
            updated_at = now()
        where message_id = p_message_id;
      return jsonb_build_object('result', 'retry_failed');
    end if;

    -- v_row.status = 'received'
    if v_row.processing_started_at < now() - make_interval(secs => v_stale_seconds) then
      update public.bridge_message_processing
        set attempts = attempts + 1,
            processing_started_at = now(),
            updated_at = now()
        where message_id = p_message_id;
      return jsonb_build_object('result', 'retry_stale');
    end if;

    return jsonb_build_object('result', 'already_processing');

  elsif p_action = 'mark_completed' then
    update public.bridge_message_processing
      set status = 'completed', completed_at = now(), updated_at = now()
      where message_id = p_message_id and status = 'received';
    get diagnostics v_row_count = row_count;
    if v_row_count = 0 then
      return jsonb_build_object('result', 'not_found_or_invalid_state');
    end if;
    return jsonb_build_object('result', 'completed');

  elsif p_action = 'mark_failed' then
    update public.bridge_message_processing
      set status = 'failed', failed_at = now(), error_code = p_error_code, updated_at = now()
      where message_id = p_message_id and status = 'received';
    get diagnostics v_row_count = row_count;
    if v_row_count = 0 then
      return jsonb_build_object('result', 'not_found_or_invalid_state');
    end if;
    return jsonb_build_object('result', 'failed');

  else
    return jsonb_build_object('result', 'error', 'reason', 'invalid_action');
  end if;
exception when others then
  -- Só SQLSTATE vai pro log interno do Postgres — nunca SQLERRM (mesmo
  -- padrão de 013/015). JSON de retorno continua genérico, sem dado sensível.
  raise warning 'process_bridge_message falhou; sqlstate=%', sqlstate;
  return jsonb_build_object('result', 'error', 'reason', 'internal_database_error');
end;
$$;


-- 3. Permissões ---------------------------------------------------------------
-- Só service_role pode chamar esta função. anon/authenticated/public
-- explicitamente sem acesso (mesmo padrão de 013/015).

revoke all on function public.process_bridge_message(text, text, text) from public, anon, authenticated;
grant execute on function public.process_bridge_message(text, text, text) to service_role;
