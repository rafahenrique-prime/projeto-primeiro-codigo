-- 037_supplier_drive_scanner_run_order_fix.sql
--
-- Fixa a ordem do Drive Scanner V1:
-- o ledger precisa existir como running antes de produtos referenciá-lo
-- por last_seen_run_id (FK).

begin;

create or replace function public.lab_supplier_drive_log_run(
  p_token text,
  p_run_id text,
  p_supplier_key text,
  p_status text,
  p_scanned integer,
  p_new integer,
  p_changed integer,
  p_unchanged integer,
  p_deactivated integer,
  p_summary jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     'bc459883461a5e73cd69087a379d2beed351d46c51de23a673719c5c021984bd'
  then
    return false;
  end if;

  if p_status not in ('running', 'completed', 'partial', 'failed') then
    raise exception 'invalid run status';
  end if;

  insert into public.supplier_shadow_sync_runs (
    run_id,
    supplier_key,
    trigger,
    status,
    started_at,
    finished_at,
    scanned_files,
    new_files,
    changed_files,
    unchanged_files,
    deactivated_files,
    analyzed_files,
    review_files,
    error_files,
    summary
  ) values (
    p_run_id,
    p_supplier_key,
    'drive_scanner_v1',
    p_status,
    now(),
    case when p_status = 'running' then null else now() end,
    greatest(coalesce(p_scanned, 0), 0),
    greatest(coalesce(p_new, 0), 0),
    greatest(coalesce(p_changed, 0), 0),
    greatest(coalesce(p_unchanged, 0), 0),
    greatest(coalesce(p_deactivated, 0), 0),
    0,
    0,
    0,
    p_summary
  )
  on conflict (run_id) do update set
    status = excluded.status,
    finished_at = case
      when excluded.status = 'running' then public.supplier_shadow_sync_runs.finished_at
      else excluded.finished_at
    end,
    scanned_files = excluded.scanned_files,
    new_files = excluded.new_files,
    changed_files = excluded.changed_files,
    unchanged_files = excluded.unchanged_files,
    deactivated_files = excluded.deactivated_files,
    summary = excluded.summary;

  return true;
end;
$$;

revoke all on function public.lab_supplier_drive_log_run(
  text, text, text, text, integer, integer, integer, integer, integer, jsonb
) from public;

grant execute on function public.lab_supplier_drive_log_run(
  text, text, text, text, integer, integer, integer, integer, integer, jsonb
) to anon, authenticated;

commit;
