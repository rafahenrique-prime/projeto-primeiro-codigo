-- 022_bagy_sync_product_insert.sql
--
-- Auditoria Bagy V2 — Etapa B: estende bagy_sync_product_transaction (migration
-- 020) para também aceitar INSERT de produto novo (nunca visto em products),
-- na MESMA transação que grava as variações. Extensão ADITIVA da function
-- existente — não cria uma RPC irmã, pra não duplicar o loop de upsert de
-- variação + checagem de conflito de bagy_variation_id que a migration 020
-- já resolve.
--
-- Contrato novo:
-- - p_product_id = NULL           → branch de INSERT (este arquivo)
-- - p_product_id = uuid existente → branch de UPDATE, 100% IDÊNTICO ao
--   comportamento da migration 020 (nenhuma linha da lógica de UPDATE foi
--   alterada, só renomeada a variável local p_product_id → v_product_id
--   depois de confirmada a existência da linha).
--
-- INSERT exige em p_product_fields: bagy_product_id + nome (únicos campos
-- realmente obrigatórios — nome é NOT NULL sem default em products; todo o
-- resto tem default do próprio banco ou é nullable, confirmado via schema
-- real, não por amostragem de dados). status/source/codigo NUNCA são
-- enviados no payload de INSERT — o banco aplica 'active'/'bagy'/NULL
-- sozinho, exatamente como já configurado no schema.
--
-- Idempotência: antes do INSERT, confirma que bagy_product_id ainda não
-- existe em products (mesmo padrão de erro explícito já usado pra
-- bagy_variation_id duplicado) — mais a constraint UNIQUE de
-- products.bagy_product_id como rede de segurança do próprio banco.

BEGIN;

CREATE OR REPLACE FUNCTION public.bagy_sync_product_transaction(
  p_product_id uuid,
  p_product_fields jsonb,
  p_variations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allowed_keys text[] := ARRAY[
    'bagy_product_id', 'nome', 'link', 'categoria', 'categoria_breadcrumb',
    'bagy_category_id', 'preco', 'preco_pix', 'imagem', 'descricao', 'marca',
    'sell_without_stock', 'source'
  ];
  v_key text;
  v_variation jsonb;
  v_bagy_variation_id bigint;
  v_conflicting_product uuid;
  v_processed int := 0;
  v_product_id uuid;
  v_bagy_product_id bigint;
  v_existing_product uuid;
BEGIN
  IF p_product_fields IS NULL OR jsonb_typeof(p_product_fields) <> 'object' THEN
    RAISE EXCEPTION 'bagy_sync_product_transaction: p_product_fields precisa ser um objeto jsonb';
  END IF;

  IF p_variations IS NULL OR jsonb_typeof(p_variations) <> 'array' THEN
    RAISE EXCEPTION 'bagy_sync_product_transaction: p_variations precisa ser um array jsonb (pode ser vazio: [])';
  END IF;

  -- Nenhuma chave fora da lista aprovada — mesma proteção da migration 020,
  -- vale igual pros dois branches (INSERT e UPDATE).
  FOR v_key IN SELECT jsonb_object_keys(p_product_fields) LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: campo não permitido em products: %', v_key;
    END IF;
  END LOOP;

  IF p_product_id IS NULL THEN
    -- ================= BRANCH NOVO: INSERT de produto que ainda não existe =================
    v_bagy_product_id := (p_product_fields->>'bagy_product_id')::bigint;
    IF v_bagy_product_id IS NULL THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: INSERT de produto novo exige bagy_product_id em p_product_fields';
    END IF;

    IF NOT (p_product_fields ? 'nome') OR (p_product_fields->>'nome') IS NULL OR btrim(p_product_fields->>'nome') = '' THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: INSERT de produto novo exige nome em p_product_fields';
    END IF;

    -- Idempotência explícita — antes de inserir, confirma que este
    -- bagy_product_id ainda não existe (a constraint UNIQUE da coluna é a
    -- segunda camada, caso esta checagem seja contornada por alguma corrida).
    SELECT id INTO v_existing_product FROM public.products WHERE bagy_product_id = v_bagy_product_id;
    IF v_existing_product IS NOT NULL THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: bagy_product_id % já existe em products (id %) — use UPDATE (p_product_id não-nulo), não INSERT', v_bagy_product_id, v_existing_product;
    END IF;

    -- status/source/codigo NÃO aparecem aqui de propósito — ficam a cargo
    -- dos defaults do banco ('active'/'bagy') ou NULL (codigo, nullable).
    INSERT INTO public.products (
      bagy_product_id, nome, link, categoria, categoria_breadcrumb,
      bagy_category_id, preco, preco_pix, imagem, descricao, marca,
      sell_without_stock, synced_at
    ) VALUES (
      v_bagy_product_id,
      p_product_fields->>'nome',
      p_product_fields->>'link',
      p_product_fields->>'categoria',
      p_product_fields->>'categoria_breadcrumb',
      (p_product_fields->>'bagy_category_id')::bigint,
      p_product_fields->>'preco',
      (p_product_fields->>'preco_pix')::numeric,
      p_product_fields->>'imagem',
      p_product_fields->>'descricao',
      p_product_fields->>'marca',
      (p_product_fields->>'sell_without_stock')::boolean,
      now()
    )
    RETURNING id INTO v_product_id;
  ELSE
    -- ================= BRANCH ATUAL: UPDATE (migration 020, sem nenhuma mudança de comportamento) =================
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: product_id % não existe em products', p_product_id;
    END IF;
    v_product_id := p_product_id;

    UPDATE public.products SET
      bagy_product_id      = COALESCE((p_product_fields->>'bagy_product_id')::bigint, bagy_product_id),
      nome                 = COALESCE(p_product_fields->>'nome', nome),
      link                 = COALESCE(p_product_fields->>'link', link),
      categoria            = COALESCE(p_product_fields->>'categoria', categoria),
      categoria_breadcrumb = CASE WHEN p_product_fields ? 'categoria_breadcrumb' THEN p_product_fields->>'categoria_breadcrumb' ELSE categoria_breadcrumb END,
      bagy_category_id     = CASE WHEN p_product_fields ? 'bagy_category_id' THEN (p_product_fields->>'bagy_category_id')::bigint ELSE bagy_category_id END,
      preco                = COALESCE(p_product_fields->>'preco', preco),
      preco_pix            = CASE WHEN p_product_fields ? 'preco_pix' THEN (p_product_fields->>'preco_pix')::numeric ELSE preco_pix END,
      imagem               = COALESCE(p_product_fields->>'imagem', imagem),
      descricao            = COALESCE(p_product_fields->>'descricao', descricao),
      marca                = COALESCE(p_product_fields->>'marca', marca),
      sell_without_stock   = CASE WHEN p_product_fields ? 'sell_without_stock' THEN (p_product_fields->>'sell_without_stock')::boolean ELSE sell_without_stock END,
      source               = COALESCE(p_product_fields->>'source', source),
      synced_at            = now()
    WHERE id = p_product_id;
  END IF;

  -- Upsert de variações — loop IDÊNTICO ao da migration 020, agora usando
  -- v_product_id (recém-inserido ou o p_product_id recebido) em vez de só
  -- p_product_id. Mesma proteção contra bagy_variation_id de outro produto.
  FOR v_variation IN SELECT * FROM jsonb_array_elements(p_variations) LOOP
    v_bagy_variation_id := (v_variation->>'bagy_variation_id')::bigint;
    IF v_bagy_variation_id IS NULL THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: variação sem bagy_variation_id no payload';
    END IF;

    SELECT product_id INTO v_conflicting_product
    FROM public.product_variations
    WHERE bagy_variation_id = v_bagy_variation_id
      AND product_id <> v_product_id;

    IF v_conflicting_product IS NOT NULL THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: bagy_variation_id % já pertence ao produto % (diferente do produto % informado)',
        v_bagy_variation_id, v_conflicting_product, v_product_id;
    END IF;

    INSERT INTO public.product_variations (
      product_id, bagy_variation_id, attributes, preco, preco_compare,
      stock_quantity, sell_without_stock, imagem_principal, synced_at
    ) VALUES (
      v_product_id,
      v_bagy_variation_id,
      COALESCE(v_variation->'attributes', '{}'::jsonb),
      (v_variation->>'preco')::numeric,
      (v_variation->>'preco_compare')::numeric,
      (v_variation->>'stock_quantity')::integer,
      (v_variation->>'sell_without_stock')::boolean,
      v_variation->>'imagem_principal',
      now()
    )
    ON CONFLICT (bagy_variation_id) DO UPDATE SET
      attributes         = EXCLUDED.attributes,
      preco              = EXCLUDED.preco,
      preco_compare      = EXCLUDED.preco_compare,
      stock_quantity     = EXCLUDED.stock_quantity,
      sell_without_stock = EXCLUDED.sell_without_stock,
      imagem_principal   = EXCLUDED.imagem_principal,
      synced_at          = now();

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', v_product_id,
    'inserted', p_product_id IS NULL,
    'variations_processed', v_processed
  );
END;
$$;

-- Superfície mínima — sem mudança em relação à migration 020: só
-- service_role pode chamar esta function (mesma assinatura uuid/jsonb/jsonb,
-- então o GRANT/REVOKE existente já cobre a versão nova automaticamente,
-- mas reafirmado aqui por clareza).
REVOKE ALL ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.bagy_sync_product_transaction IS 'Único caminho de escrita transacional do sincronizador Bagy→Supabase. p_product_id=NULL insere produto novo (Etapa B); p_product_id existente faz UPDATE (comportamento original, migration 020). Chamada só via service_role (RPC). Sempre inclui upsert de product_variations na MESMA transação.';

COMMIT;
