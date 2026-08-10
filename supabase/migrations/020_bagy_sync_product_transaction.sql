-- 020_bagy_sync_product_transaction.sql
--
-- Function transacional (SECURITY DEFINER) para o sincronizador Bagy → Supabase.
-- Resolve o bug encontrado na primeira tentativa de escrita real: UPDATE em
-- products commitava sozinho mesmo quando o INSERT em product_variations
-- falhava depois (duas chamadas REST separadas, sem transação entre elas).
--
-- Esta function faz as duas coisas dentro de UMA transação real do Postgres:
-- se qualquer variação falhar (ex.: bagy_variation_id já pertence a outro
-- produto), a function inteira levanta exceção e o Postgres desfaz tudo,
-- incluindo o UPDATE de products que rodou antes no mesmo corpo da function.
--
-- Não faz INSERT de produto novo (fora de escopo desta etapa — só produtos
-- já existentes em products, localizados antes por link/bagy_product_id
-- pela camada de orquestração em api/_bagySyncService.js).
--
-- Segurança:
-- - SECURITY DEFINER com search_path fixo (public, pg_temp) — evita
--   sequestro de search_path por schema que o caller não deveria controlar.
-- - Nenhum SQL dinâmico — todo campo de products é referenciado por nome
--   fixo no corpo da function, nunca a partir de uma string vinda do caller.
--   O payload jsonb só pode conter chaves de uma lista fixa permitida;
--   qualquer chave fora dela aborta a transação.
-- - EXECUTE revogado de PUBLIC/anon/authenticated e concedido só a
--   service_role — é o único caminho privilegiado de escrita nesta tabela;
--   sem isso, SECURITY DEFINER + função aberta pra anon seria uma escalação
--   de privilégio (anon conseguiria escrever em product_variations através
--   da function, contornando o REVOKE que já existe na tabela).

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
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'bagy_sync_product_transaction: p_product_id é obrigatório';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'bagy_sync_product_transaction: product_id % não existe em products', p_product_id;
  END IF;

  IF p_product_fields IS NULL OR jsonb_typeof(p_product_fields) <> 'object' THEN
    RAISE EXCEPTION 'bagy_sync_product_transaction: p_product_fields precisa ser um objeto jsonb';
  END IF;

  IF p_variations IS NULL OR jsonb_typeof(p_variations) <> 'array' THEN
    RAISE EXCEPTION 'bagy_sync_product_transaction: p_variations precisa ser um array jsonb (pode ser vazio: [])';
  END IF;

  -- Nenhuma chave fora da lista aprovada — sem isso, um payload malicioso ou
  -- com bug poderia tentar escrever em qualquer coluna futura sem revisão.
  FOR v_key IN SELECT jsonb_object_keys(p_product_fields) LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: campo não permitido em products: %', v_key;
    END IF;
  END LOOP;

  -- UPDATE de products — nomes de coluna fixos no corpo da function (sem SQL
  -- dinâmico). Campos ausentes do payload mantêm o valor atual (COALESCE);
  -- campos que aceitam null de propósito (categoria_breadcrumb,
  -- bagy_category_id, preco_pix, sell_without_stock) usam checagem de
  -- presença da chave em vez de COALESCE, pra permitir gravar null quando
  -- for isso que o mapper decidiu.
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

  -- Upsert de variações, uma a uma, na MESMA transação. Antes de cada
  -- upsert, confirma que o bagy_variation_id não pertence a outro produto —
  -- se pertencer, aborta a transação inteira (não sobrescreve product_id
  -- silenciosamente; isso indicaria um bug no caller ou um dado inesperado
  -- da Bagy, e vira erro explícito em vez de dado errado gravado).
  FOR v_variation IN SELECT * FROM jsonb_array_elements(p_variations) LOOP
    v_bagy_variation_id := (v_variation->>'bagy_variation_id')::bigint;
    IF v_bagy_variation_id IS NULL THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: variação sem bagy_variation_id no payload';
    END IF;

    SELECT product_id INTO v_conflicting_product
    FROM public.product_variations
    WHERE bagy_variation_id = v_bagy_variation_id
      AND product_id <> p_product_id;

    IF v_conflicting_product IS NOT NULL THEN
      RAISE EXCEPTION 'bagy_sync_product_transaction: bagy_variation_id % já pertence ao produto % (diferente do produto % informado)',
        v_bagy_variation_id, v_conflicting_product, p_product_id;
    END IF;

    INSERT INTO public.product_variations (
      product_id, bagy_variation_id, attributes, preco, preco_compare,
      stock_quantity, sell_without_stock, imagem_principal, synced_at
    ) VALUES (
      p_product_id,
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

  RETURN jsonb_build_object('ok', true, 'product_id', p_product_id, 'variations_processed', v_processed);
END;
$$;

-- Superfície mínima: só service_role pode chamar esta function. Sem isso,
-- SECURITY DEFINER + EXECUTE aberto pra PUBLIC seria uma escalação de
-- privilégio (anon herdaria, através da function, a escrita em
-- product_variations que foi deliberadamente revogada da tabela).
REVOKE ALL ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.bagy_sync_product_transaction IS 'Único caminho de escrita transacional do sincronizador Bagy→Supabase. Chamada só via service_role (RPC). Atualiza products e faz upsert de product_variations numa única transação — qualquer erro desfaz tudo, incluindo o UPDATE de products.';

COMMIT;
