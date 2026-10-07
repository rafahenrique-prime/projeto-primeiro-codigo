-- 043_supplier_drive_missing_fingerprint_guard.sql
--
-- Supplier Drive Scanner V1 — guard para fingerprint temporariamente ausente.
--
-- Problema:
--   quando uma linha READY possui content_hash, mas o Drive falha
--   temporariamente em fornecer fingerprint, p_content_hash chega NULL.
--   O upsert antigo comparava hash_existente <> NULL como mudança e
--   derrubava o item READY para pending sem evidência real de alteração.
--
-- Correcao:
--   somente considerar conteúdo alterado quando p_content_hash NÃO é NULL
--   e é diferente do hash persistido. Fingerprint ausente preserva o estado.
--
-- Seguranca:
--   preserva token LAB, supplier allowlist, reclassificação estreita de família
--   e o mesmo contrato da RPC. Não toca PRIME, main ou GABY OFICIAL.

begin;

create or replace function public.lab_supplier_drive_upsert(
  p_token text,
  p_supplier_key text,
  p_drive_file_id text,
  p_drive_parent_id text,
  p_drive_path text,
  p_drive_url text,
  p_file_name text,
  p_mime_type text,
  p_content_hash text,
  p_brand text,
  p_canonical_family text,
  p_detected_model text,
  p_category text,
  p_run_id text
)
returns table (
  id uuid,
  change_type text,
  analysis_status text,
  active boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing public.supplier_shadow_products%rowtype;
  v_id uuid;
  v_change text;
  v_status text;
begin
  if encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <>
     'bc459883461a5e73cd69087a379d2beed351d46c51de23a673719c5c021984bd'
  then
    return;
  end if;

  if p_supplier_key not in ('VIVIAN', 'MIA') then
    raise exception 'invalid supplier';
  end if;

  select *
  into v_existing
  from public.supplier_shadow_products s
  where s.supplier_key = p_supplier_key
    and s.drive_file_id = p_drive_file_id
  limit 1;

  if not found then
    insert into public.supplier_shadow_products (
      supplier_key,
      drive_file_id,
      drive_parent_id,
      drive_path,
      drive_url,
      file_name,
      mime_type,
      content_hash,
      brand,
      canonical_family,
      detected_model,
      category,
      search_text,
      vision_confidence,
      analysis_status,
      analysis_error_code,
      active,
      first_seen_at,
      last_seen_at,
      indexed_at,
      removed_at,
      last_seen_run_id,
      schema_version
    ) values (
      p_supplier_key,
      p_drive_file_id,
      p_drive_parent_id,
      p_drive_path,
      p_drive_url,
      coalesce(nullif(trim(p_file_name), ''), 'supplier-image'),
      p_mime_type,
      p_content_hash,
      nullif(trim(p_brand), ''),
      nullif(trim(p_canonical_family), ''),
      nullif(trim(p_detected_model), ''),
      nullif(trim(p_category), ''),
      lower(trim(concat_ws(
        ' ',
        p_brand,
        p_detected_model,
        p_canonical_family,
        p_category
      ))),
      null,
      'pending',
      null,
      true,
      now(),
      now(),
      null,
      null,
      p_run_id,
      1
    )
    returning supplier_shadow_products.id into v_id;

    v_change := 'new';
    v_status := 'pending';
  else
    if v_existing.content_hash is null
       and v_existing.analysis_status = 'ready'
       and v_existing.visual_color is not null
    then
      update public.supplier_shadow_products s
      set
        drive_parent_id = p_drive_parent_id,
        drive_path = p_drive_path,
        drive_url = p_drive_url,
        file_name = coalesce(nullif(trim(p_file_name), ''), s.file_name),
        mime_type = coalesce(nullif(trim(p_mime_type), ''), s.mime_type),
        content_hash = p_content_hash,
        brand = coalesce(nullif(trim(p_brand), ''), s.brand),
        canonical_family = coalesce(nullif(trim(p_canonical_family), ''), s.canonical_family),
        detected_model = coalesce(nullif(trim(p_detected_model), ''), s.detected_model),
        category = coalesce(nullif(trim(p_category), ''), s.category),
        active = true,
        last_seen_at = now(),
        removed_at = null,
        last_seen_run_id = p_run_id
      where s.id = v_existing.id;

      v_id := v_existing.id;
      v_change := 'baseline';
      v_status := v_existing.analysis_status;

    elsif v_existing.analysis_status = 'review'
       and v_existing.analysis_error_code = 'VISION_FAMILY_MISMATCH'
       and coalesce(v_existing.canonical_family, '') <>
           coalesce(nullif(trim(p_canonical_family), ''), '')
    then
      update public.supplier_shadow_products s
      set
        drive_parent_id = p_drive_parent_id,
        drive_path = p_drive_path,
        drive_url = p_drive_url,
        file_name = coalesce(nullif(trim(p_file_name), ''), s.file_name),
        mime_type = coalesce(nullif(trim(p_mime_type), ''), s.mime_type),
        content_hash = p_content_hash,
        brand = coalesce(nullif(trim(p_brand), ''), s.brand),
        canonical_family = nullif(trim(p_canonical_family), ''),
        detected_model = coalesce(nullif(trim(p_detected_model), ''), s.detected_model),
        category = coalesce(nullif(trim(p_category), ''), s.category),
        search_text = lower(trim(concat_ws(
          ' ',
          p_brand,
          p_detected_model,
          p_canonical_family,
          p_category
        ))),
        visual_color = null,
        vision_confidence = null,
        analysis_status = 'pending',
        analysis_error_code = null,
        active = true,
        last_seen_at = now(),
        indexed_at = null,
        removed_at = null,
        last_seen_run_id = p_run_id
      where s.id = v_existing.id;

      v_id := v_existing.id;
      v_change := 'changed';
      v_status := 'pending';

    elsif p_content_hash is not null
       and coalesce(v_existing.content_hash, '') <> p_content_hash
    then
      update public.supplier_shadow_products s
      set
        drive_parent_id = p_drive_parent_id,
        drive_path = p_drive_path,
        drive_url = p_drive_url,
        file_name = coalesce(nullif(trim(p_file_name), ''), s.file_name),
        mime_type = coalesce(nullif(trim(p_mime_type), ''), s.mime_type),
        content_hash = p_content_hash,
        brand = coalesce(nullif(trim(p_brand), ''), s.brand),
        canonical_family = coalesce(nullif(trim(p_canonical_family), ''), s.canonical_family),
        detected_model = coalesce(nullif(trim(p_detected_model), ''), s.detected_model),
        category = coalesce(nullif(trim(p_category), ''), s.category),
        visual_color = null,
        vision_confidence = null,
        analysis_status = 'pending',
        analysis_error_code = null,
        active = true,
        last_seen_at = now(),
        indexed_at = null,
        removed_at = null,
        last_seen_run_id = p_run_id
      where s.id = v_existing.id;

      v_id := v_existing.id;
      v_change := 'changed';
      v_status := 'pending';

    else
      update public.supplier_shadow_products s
      set
        active = true,
        last_seen_at = now(),
        removed_at = null,
        last_seen_run_id = p_run_id
      where s.id = v_existing.id;

      v_id := v_existing.id;
      v_change := case
        when v_existing.active = false then 'reactivated'
        else 'unchanged'
      end;
      v_status := v_existing.analysis_status;
    end if;
  end if;

  id := v_id;
  change_type := v_change;
  analysis_status := v_status;
  active := true;
  return next;
end;
$$;

revoke all on function public.lab_supplier_drive_upsert(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.lab_supplier_drive_upsert(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

commit;
