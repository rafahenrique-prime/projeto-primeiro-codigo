-- Fase 2C — profile_learning_audit + apply_profile_size_learning
-- Cria a tabela de auditoria e a função transacional que registra e aplica,
-- de forma atômica, o aprendizado automático de customer_profiles.size a
-- partir de declarações explícitas do próprio cliente (api/_profileLearning.js,
-- chamado por api/onnewmessage.js). Só o campo size nesta primeira versão.
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas).

-- 1. Tabela de auditoria -------------------------------------------------
-- CREATE TABLE estrito (sem IF NOT EXISTS) — se o objeto já existir,
-- a migration deve falhar e forçar investigação, não seguir em silêncio.

create table public.profile_learning_audit (
  id            uuid primary key default gen_random_uuid(),
  conv_id       text not null,
  context_id    text,
  message_id    text not null,
  field         text not null,
  old_value     text,
  new_value     text not null,
  source_text   text,
  rule_matched  text not null,
  confidence    text not null default 'high',
  channel       text,
  applied       boolean not null default true,
  created_at    timestamptz not null default now(),
  reverted_at   timestamptz,

  constraint uq_profile_learning_event unique (message_id, field),

  -- Defesa em profundidade no schema, mas SÓ sobre o que a automação
  -- nova escreve (new_value, field, confidence, channel) — old_value é
  -- espelho fiel de customer_profiles.size, um campo genérico que pode
  -- conter qualquer valor legado ('M', 'G', 'GG', '40/41', 'Único',
  -- etc.), e por isso NÃO tem constraint de faixa.
  constraint chk_field_size_only
    check (field = 'size'),

  constraint chk_confidence_high_only
    check (confidence = 'high'),

  constraint chk_channel_valid
    check (channel is null or channel in ('WHATSAPP', 'INSTAGRAM')),

  constraint chk_rule_matched_not_blank
    check (length(trim(rule_matched)) > 0),

  constraint chk_source_text_length
    check (source_text is null or length(source_text) <= 200),

  -- CASE em vez de AND/OR encadeado — Postgres não garante ordem de
  -- avaliação de operandos em CHECK constraints, então nunca depender
  -- de curto-circuito para proteger um cast. O CASE só tenta o cast
  -- depois de confirmar o formato via regex no WHEN.
  constraint chk_new_value_range
    check (
      case
        when new_value ~ '^[0-9]{2}$'
          then new_value::integer between 33 and 46
        else false
      end
    ),

  constraint chk_applied_reverted_coherence
    check (
      (applied = true  and reverted_at is null)
      or
      (applied = false and reverted_at is not null)
    )
);

-- CREATE INDEX estrito (sem IF NOT EXISTS), mesmo motivo acima.
create index idx_profile_learning_audit_conv_id
  on public.profile_learning_audit (conv_id, created_at desc);

alter table public.profile_learning_audit enable row level security;
-- Nenhuma policy criada de propósito: RLS habilitada + zero policy =
-- anon/authenticated não conseguem ler/escrever aqui via REST direto.
-- service_role ignora RLS por natureza própria da role, então a função
-- continua funcionando normalmente quando chamada com a Secret key.


-- 2. Função transacional --------------------------------------------------
-- CREATE FUNCTION estrito (não CREATE OR REPLACE) — esta é a primeira
-- migration desta função; se ela já existir inesperadamente, a migration
-- deve falhar e revelar drift, não substituir em silêncio. Qualquer
-- mudança futura na lógica desta função deve vir em uma NOVA migration,
-- usando CREATE OR REPLACE FUNCTION lá — nunca editando este arquivo
-- depois de aplicado.

create function public.apply_profile_size_learning(
  p_conv_id       text,
  p_context_id    text,
  p_message_id    text,
  p_channel       text,
  p_new_size      text,
  p_source_text   text,
  p_rule_matched  text,
  p_confidence    text default 'high'
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old_value  text;
  v_audit_id   uuid;
  v_row_count  integer;
begin
  -- (1) Validação de entrada
  if p_conv_id is null or length(trim(p_conv_id)) = 0
     or p_message_id is null or length(trim(p_message_id)) = 0
     or p_new_size is null or length(trim(p_new_size)) = 0
     or p_rule_matched is null or length(trim(p_rule_matched)) = 0 then
    return jsonb_build_object('status', 'invalid_input', 'reason', 'campo_obrigatorio_ausente');
  end if;

  -- Formato primeiro, cast depois — nunca na mesma condição composta
  if p_new_size !~ '^[0-9]{2}$' then
    return jsonb_build_object('status', 'invalid_input', 'reason', 'size_formato_invalido');
  end if;

  if p_new_size::integer not between 33 and 46 then
    return jsonb_build_object('status', 'invalid_input', 'reason', 'size_fora_da_faixa');
  end if;

  if p_confidence is distinct from 'high' then
    return jsonb_build_object('status', 'invalid_input', 'reason', 'confidence_nao_suportada');
  end if;

  if p_channel is not null and p_channel not in ('WHATSAPP', 'INSTAGRAM') then
    return jsonb_build_object('status', 'invalid_input', 'reason', 'channel_invalido');
  end if;

  -- (2) Checagem rápida de duplicidade — atalho de performance, evita
  --     pagar o custo de um FOR UPDATE quando já dá pra saber sem lock
  if exists (
    select 1 from public.profile_learning_audit
    where message_id = p_message_id and field = 'size'
  ) then
    return jsonb_build_object('status', 'duplicate', 'message_id', p_message_id);
  end if;

  -- (3) Existência + lock numa única consulta — elimina a janela entre
  --     "checar se existe" e "travar a linha"
  select size into v_old_value
    from public.customer_profiles
    where conv_id = p_conv_id
    for update;

  if not found then
    return jsonb_build_object('status', 'profile_not_found');
  end if;

  -- (4) Segunda checagem de duplicidade — protegida pelo lock, cobre a
  --     corrida real: duas chamadas com o mesmo message_id passam pelo
  --     passo 2 antes de qualquer uma inserir; a primeira adquire o
  --     lock, aplica e commita; a segunda só prossegue depois disso e
  --     agora enxerga a auditoria da primeira, retornando duplicate em
  --     vez de reavaliar unchanged com base num estado que já mudou.
  if exists (
    select 1 from public.profile_learning_audit
    where message_id = p_message_id and field = 'size'
  ) then
    return jsonb_build_object('status', 'duplicate', 'message_id', p_message_id);
  end if;

  -- (5) Sem mudança real — não grava auditoria, não faz UPDATE
  if v_old_value is not distinct from p_new_size then
    return jsonb_build_object('status', 'unchanged', 'value', p_new_size);
  end if;

  -- (6) Registra o evento — ON CONFLICT DO NOTHING é a defesa FINAL,
  --     específica da constraint nomeada (não um catch-all de exceção
  --     que poderia capturar outra violação única por engano)
  insert into public.profile_learning_audit
    (conv_id, context_id, message_id, field, old_value, new_value,
     source_text, rule_matched, confidence, channel)
  values
    (p_conv_id, p_context_id, p_message_id, 'size', v_old_value, p_new_size,
     left(p_source_text, 200), p_rule_matched, p_confidence, p_channel)
  on conflict on constraint uq_profile_learning_event do nothing
  returning id into v_audit_id;

  if v_audit_id is null then
    return jsonb_build_object('status', 'duplicate', 'message_id', p_message_id);
  end if;

  -- (7) Aplica no perfil — só size
  update public.customer_profiles
    set size = p_new_size
    where conv_id = p_conv_id;

  get diagnostics v_row_count = row_count;

  -- (8) Confirmação de exatamente 1 linha afetada — mensagem sem
  --     nenhum dado do cliente (nem conv_id), só a contagem
  if v_row_count <> 1 then
    raise exception 'apply_profile_size_learning: linhas_afetadas=% esperado=1', v_row_count;
  end if;

  return jsonb_build_object(
    'status', 'applied',
    'conv_id', p_conv_id,
    'old_value', v_old_value,
    'new_value', p_new_size
  );

exception when others then
  -- Só SQLSTATE (código curto, ex.: '23505') vai pro log interno do
  -- Postgres — nunca SQLERRM (mensagem completa, que pode conter
  -- fragmentos de dado). JSON de retorno continua genérico.
  raise warning 'apply_profile_size_learning falhou; sqlstate=%', sqlstate;
  return jsonb_build_object('status', 'error', 'reason', 'internal_database_error');
end;
$$;


-- 3. Permissões -------------------------------------------------------------
-- Só a role autenticada pela Secret key (service_role) pode chamar esta
-- função. anon/authenticated/public explicitamente sem acesso.

revoke all on function public.apply_profile_size_learning(
  text, text, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.apply_profile_size_learning(
  text, text, text, text, text, text, text, text
) to service_role;
