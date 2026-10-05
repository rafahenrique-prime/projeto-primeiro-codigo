-- 040_supplier_drive_scanner_scope_fix.sql
--
-- Supplier Drive Scanner V1 — isolamento por pasta.
--
-- Problema corrigido:
--   dois scopes do MESMO fornecedor + MESMA família (ex.: duas pastas MIA
--   para NIKE_DUNK) compartilhavam state/finalize por supplier+family.
--   Ao finalizar a segunda pasta, arquivos válidos da primeira podiam ser
--   marcados active=false.
--
-- Estratégia:
--   manter as RPCs V1 intactas e criar RPCs V2 aditivas que também recebem
--   p_drive_parent_id (folder id estável). O scanner passa a ler/finalizar
--   apenas o conteúdo daquele folder.
--
-- Segurança:
--   mesmo hash de token LAB existente, SECURITY DEFINER, nenhum grant direto
--   sobre supplier_shadow_products. Não altera GABY OFICIAL nem catálogo PRIME.

begin;

create or replace function public.lab_supplier_drive_state_v2(
  p_token text,
  p_supplier_key text,
  p_canonical_family text,
  p_drive_parent_id text
)
returns table (
  id uuid,
  drive_file_id text,
  content_hash text,
  active boolean,
  analysis_status text,
  visual_color text,
  vision_confidence numeric
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    s.id,
    s.drive_file_id,
    s.content_hash,
    s.active,
    s.analysis_status,
    s.visual_color,
    s.vision_confidence
  from public.supplier_shadow_products s
  where
    encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') =
      'bc459883461a5e73cd69087a379d2beed351d46c51de23a673719c5c021984bd'
    and s.supplier_key = p_supplier_key
    and s.canonical_family = p_canonical_family
    and s.drive_parent_id = p_drive_parent_id;
$$;

create or replace function public.lab_supplier_drive_finalize_v2(
  p_token text,
  p_supplier_key text,
  p_canonical_family text,
  p_drive_parent_id text,
  p_seen_file_ids text[],
  p_run_id text
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count integer := 0;
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     'bc459883461a5e73cd69087a379d2beed351d46c51de23a673719c5c021984bd'
  then
    return 0;
  end if;

  update public.supplier_shadow_products s
  set
    active = false,
    removed_at = now(),
    last_seen_run_id = p_run_id
  where
    s.supplier_key = p_supplier_key
    and s.canonical_family = p_canonical_family
    and s.drive_parent_id = p_drive_parent_id
    and s.active = true
    and not (s.drive_file_id = any(coalesce(p_seen_file_ids, array[]::text[])));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.lab_supplier_drive_state_v2(
  text, text, text, text
) from public;

revoke all on function public.lab_supplier_drive_finalize_v2(
  text, text, text, text, text[], text
) from public;

grant execute on function public.lab_supplier_drive_state_v2(
  text, text, text, text
) to anon, authenticated;

grant execute on function public.lab_supplier_drive_finalize_v2(
  text, text, text, text, text[], text
) to anon, authenticated;

commit;
