-- 039_supplier_catalog_cycle_schedule.sql
--
-- Daily LAB schedule for Supplier Catalog Cycle V1.
--
-- 07:00 UTC = 04:00 America/Sao_Paulo (Uberlândia/MG, UTC-3).
-- Secrets are read from Supabase Vault by NAME only.
-- No plaintext scheduler token is stored in Git.
--
-- Required Vault entries (created out-of-band before this migration):
--   prime_supplier_cycle_url
--   prime_supplier_cycle_token

begin;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'prime-supplier-catalog-cycle-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'prime-supplier-catalog-cycle-v1',
  '0 7 * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'prime_supplier_cycle_url'
        limit 1
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-prime-cycle-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'prime_supplier_cycle_token'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'confirm', 'SUPPLIER_CATALOG_CYCLE_LAB',
        'cycle_key',
          'supplier-cycle-v1:' ||
          to_char(
            timezone('America/Sao_Paulo', now()),
            'YYYY-MM-DD'
          ),
        'trigger', 'supabase_cron',
        'max_changes', 3
      ),
      timeout_milliseconds := 240000
    ) as request_id;
  $job$
);

commit;
