-- 023_bagy_sync_product_insert_source.sql
--
-- Microajuste da migration 022: o branch de INSERT de
-- bagy_sync_product_transaction não incluía a coluna `source` na lista de
-- colunas do INSERT — mesmo que o caller (syncNewProduct, api/_bagySyncService.js)
-- passasse `source` em p_product_fields (chave já permitida em
-- v_allowed_keys), ela era simplesmente ignorada e o produto nascia com o
-- DEFAULT global da coluna ('bagy'), diferente do valor que o fluxo de
-- UPDATE normal sempre grava ('bagy_sync') — gerando uma "alteração
-- necessária" fantasma no dry_run seguinte, só pra corrigir esse campo.
--
-- Esta migration só adiciona `source` na lista de colunas/valores do
-- branch de INSERT — nenhuma outra linha da function 020/022 muda. O
-- DEFAULT global da coluna `source` na tabela `products` NÃO é alterado
-- (continua 'bagy', usado por outros fluxos) — isso é só o valor que ESTE
-- INSERT específico passa a gravar explicitamente quando informado.

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

  FOR v_key IN SELECT jsonb_object_keys(p_product_fields) LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: campo não permitido em products: %', v_key;
    END IF;
  END LOOP;

  IF p_product_id IS NULL THEN
    v_bagy_product_id := (p_product_fields->>'bagy_product_id')::bigint;
    IF v_bagy_product_id IS NULL THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: INSERT de produto novo exige bagy_product_id em p_product_fields';
    END IF;

    IF NOT (p_product_fields ? 'nome') OR (p_product_fields->>'nome') IS NULL OR btrim(p_product_fields->>'nome') = '' THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: INSERT de produto novo exige nome em p_product_fields';
    END IF;

    SELECT id INTO v_existing_product FROM public.products WHERE bagy_product_id = v_bagy_product_id;
    IF v_existing_product IS NOT NULL THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: bagy_product_id % já existe em products (id %) — use UPDATE (p_product_id não-nulo), não INSERT', v_bagy_product_id, v_existing_product;
    END IF;

    -- ÚNICA MUDANÇA desta migration: `source` entra na lista de colunas,
    -- com COALESCE pro default global só se o caller não informar nada
    -- (mantém o comportamento anterior pra qualquer outro chamador futuro
    -- que não passe `source`).
    INSERT INTO public.products (
      bagy_product_id, nome, link, categoria, categoria_breadcrumb,
      bagy_category_id, preco, preco_pix, imagem, descricao, marca,
      sell_without_stock, source, synced_at
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
      COALESCE(p_product_fields->>'source', 'bagy'),
      now()
    )
    RETURNING id INTO v_product_id;
  ELSE
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

REVOKE ALL ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.bagy_sync_product_transaction IS 'Único caminho de escrita transacional do sincronizador Bagy→Supabase. p_product_id=NULL insere produto novo (Etapa B, migration 022+023); p_product_id existente faz UPDATE (comportamento original, migration 020). source é gravado explicitamente como bagy_sync no INSERT quando informado pelo caller (migration 023) — default global da coluna continua bagy para quem não informar. Chamada só via service_role (RPC). Sempre inclui upsert de product_variations na MESMA transação.';

COMMIT;
