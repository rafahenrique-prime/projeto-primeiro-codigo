-- Fase 2A.1 — qwen_health_state + claim_qwen_health_check
-- Persistência do último resultado do health check do QwenCloud (Operations Center)
-- e trava atômica que garante, entre múltiplas instâncias serverless concorrentes da
-- Vercel, que só UMA chamada real ao QwenCloud aconteça por intervalo configurado.
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas).

-- 1. Tabela de estado (single-row) -----------------------------------------
-- CREATE TABLE estrito (sem IF NOT EXISTS) — se o objeto já existir, a migration
-- deve falhar e forçar investigação, não seguir em silêncio (mesmo padrão da 013).
-- Linha única (id fixo = 1) — não é histórico, é o "estado atual" do provider Qwen.
-- NUNCA armazena API key, prompt, resposta gerada, headers ou payload bruto do
-- provedor — só metadados operacionais (disponibilidade, modelo, latência, tokens,
-- código de erro genérico, timestamps).

create table public.qwen_health_state (
  id               int primary key default 1,
  provider         text not null default 'qwen',
  available        boolean,
  model            text,
  latency_ms       integer,
  input_tokens     integer,
  output_tokens    integer,
  total_tokens     integer,
  error_code       text,
  last_checked_at  timestamptz,
  next_allowed_at  timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint chk_qwen_health_single_row check (id = 1)
);

insert into public.qwen_health_state (id, provider, next_allowed_at)
values (1, 'qwen', now());

alter table public.qwen_health_state enable row level security;
-- RLS habilitada, ZERO policy criada de propósito (mesmo padrão da 013/profile_learning_audit):
-- anon/authenticated não conseguem ler nem escrever aqui via REST direto, mesmo com a
-- anon key exposta no bundle do frontend. service_role ignora RLS por natureza própria
-- da role — só api/qwen-health.js (server-side, com SUPABASE_SECRET_KEY) acessa esta tabela.


-- 2. Função transacional de reivindicação atômica --------------------------
-- CREATE FUNCTION estrito (não CREATE OR REPLACE) — primeira migration desta função;
-- qualquer mudança futura na lógica deve vir em uma NOVA migration.
--
-- Atomicidade: um único UPDATE ... WHERE next_allowed_at <= now() RETURNING * é
-- atômico por construção no Postgres (READ COMMITTED). Quando duas transações
-- concorrentes tentam este UPDATE na mesma linha (id=1), a segunda fica bloqueada
-- pelo lock de linha da primeira; assim que a primeira COMMITa (já com
-- next_allowed_at avançado), a segunda retoma e reavalia sua própria cláusula WHERE
-- contra a versão JÁ ATUALIZADA da linha — encontra next_allowed_at no futuro e
-- portanto NÃO casa, afetando zero linhas. Por isso nunca duas chamadas conseguem
-- "reivindicar" o mesmo intervalo ao mesmo tempo, mesmo sob concorrência real entre
-- múltiplas instâncias/regiões da Vercel. Não depende de advisory lock nem de
-- SERIALIZABLE — é o comportamento padrão de qualquer UPDATE de linha única no Postgres.
--
-- O intervalo mínimo (segundos) é passado como parâmetro pela aplicação (lida de
-- QWEN_HEALTH_MIN_INTERVAL_SECONDS, com fallback de 1800s no código) — a função não
-- fixa esse valor, só aplica o que recebe.

create function public.claim_qwen_health_check(
  p_min_interval_seconds integer
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean := false;
  v_row     public.qwen_health_state%rowtype;
begin
  if p_min_interval_seconds is null or p_min_interval_seconds <= 0 then
    p_min_interval_seconds := 1800;
  end if;

  update public.qwen_health_state
    set next_allowed_at = now() + make_interval(secs => p_min_interval_seconds)
    where id = 1
      and next_allowed_at <= now()
    returning * into v_row;

  if found then
    v_claimed := true;
  else
    select * into v_row from public.qwen_health_state where id = 1;
  end if;

  return jsonb_build_object(
    'claimed', v_claimed,
    'state', to_jsonb(v_row)
  );
exception when others then
  -- Só SQLSTATE vai pro log interno do Postgres — nunca SQLERRM (mesmo padrão da 013).
  raise warning 'claim_qwen_health_check falhou; sqlstate=%', sqlstate;
  return jsonb_build_object('claimed', false, 'state', null, 'error', 'internal_database_error');
end;
$$;


-- 3. Permissões -------------------------------------------------------------
-- Só service_role pode chamar esta função ou tocar na tabela. anon/authenticated/
-- public explicitamente sem acesso (mesmo padrão da 013).

revoke all on function public.claim_qwen_health_check(integer) from public, anon, authenticated;
grant execute on function public.claim_qwen_health_check(integer) to service_role;
