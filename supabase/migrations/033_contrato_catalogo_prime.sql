-- 033_contrato_catalogo_prime.sql
--
-- CONTRATO CATÁLOGO PRIME — Etapa 1 (LAB). Mudanças ADITIVAS, nada é
-- removido nem renomeado. Aplicar SOMENTE no projeto Supabase de LAB nesta
-- etapa — produção fica intacta (decisão de Rafael, Etapa 0/1).
--
-- BASE FUNCIONAL: a versão ATUAL de produção de
-- public.bagy_sync_product_transaction (identificada por Rafael em
-- 2026-09-21) já suporta os campos de preço tabela/parcelamento abaixo —
-- suporte esse que NÃO consta das migrations 020-023 do repositório (as
-- migrations 024-029, ausentes aqui, foram aplicadas direto em produção).
-- Esta migration parte da versão 023 do repositório ACRESCIDA desses
-- campos, de modo a não remover nenhuma capacidade que produção já tem:
--   preco_tabela numeric, parcelamento_padrao_vezes integer,
--   parcelamento_padrao_valor_parcela numeric, parcelamento_padrao_com_juros boolean,
--   parcelamento_max_vezes integer, parcelamento_valor_parcela numeric,
--   parcelamento_com_juros boolean
-- (tipos conferidos por leitura dos dados reais em produção, 2026-09-21).
-- A DECISÃO DE ORIGEM de preco_tabela/parcelamento NÃO muda nesta etapa:
-- nenhum writer do repositório passa a alimentar esses campos; aqui só se
-- preserva a capacidade existente da RPC (decisão de Rafael, 2026-09-21).
--
-- Mudanças do Contrato Catálogo PRIME (Etapa 1), somando-se à base acima:
-- 1) product_variations ganha:
--    - stock_real integer: estoque físico SEMPRE preservado (balance da
--      Bagy), independentemente de sell_without_stock. balance=9999 é
--      "sem controle" e vira NULL, nunca quantidade.
--    - active boolean: status do valor de atributo ligado à variação
--      (derivado do objeto Bagy). NULL = desconhecido — NUNCA tratado como
--      disponibilidade confirmada (Etapa 0 APROVADA).
-- 2) bagy_sync_exceptions aceita o novo tipo 'ausente_listagem' (caso de
--    REVISÃO — ausência da listagem NUNCA inativa automaticamente).
-- 3) bagy_sync_product_transaction aceita os novos campos:
--    - products: 'status' entra em v_allowed_keys ('active'/'inactive',
--      validado), com escrita controlada nos branches de INSERT e UPDATE;
--    - variations: 'stock_real' e 'active' entram no upsert, com semântica
--      de "chave ausente preserva o valor gravado" no ON CONFLICT (o
--      mapper novo sempre envia as duas chaves, inclusive com NULL — NULL
--      explícito é dado, chave ausente é "não mexe").
--
-- ROLLBACK desta migration (se necessário): NÃO basta voltar à migration
-- 023 — ela NÃO representa mais a versão atual de produção (não tem os
-- campos de preço tabela/parcelamento). O caminho seguro é: antes de
-- aplicar esta migration, capturar a definição vigente com
--   SELECT pg_get_functiondef('public.bagy_sync_product_transaction(uuid,jsonb,jsonb)'::regprocedure);
-- e, no rollback, recriar a função a partir dessa definição capturada
-- (a versão de produção = 023 + campos de preço/parcelamento, sem as
-- mudanças do Contrato). As colunas novas são aditivas e podem ser
-- derrubadas com ALTER TABLE ... DROP COLUMN sem afetar os dados antigos.

BEGIN;

-- (1) Colunas novas em product_variations ------------------------------------
ALTER TABLE public.product_variations
  ADD COLUMN IF NOT EXISTS stock_real integer;

ALTER TABLE public.product_variations
  ADD COLUMN IF NOT EXISTS active boolean;

COMMENT ON COLUMN public.product_variations.stock_real IS 'Estoque físico real (balance da Bagy) preservado sempre, independente de sell_without_stock. NULL = desconhecido/sem-controle (balance=9999), nunca "tem estoque".';
COMMENT ON COLUMN public.product_variations.active IS 'Status do valor de atributo da variação derivado da Bagy (variation.attribute.active ou join product.attribute.values[].active). NULL = desconhecido — nunca disponibilidade confirmada.';

-- (2) Novo tipo de exceção: ausente_listagem (revisão, nunca inativação) -----
ALTER TABLE public.bagy_sync_exceptions
  DROP CONSTRAINT IF EXISTS bagy_sync_exceptions_tipo_check;

ALTER TABLE public.bagy_sync_exceptions
  ADD CONSTRAINT bagy_sync_exceptions_tipo_check
  CHECK (tipo IN ('404', 'pagina_invalida', 'duplicate_conflict', 'ausente_listagem'));

-- (3) RPC transacional: base = versão atual de produção (023 + campos de
-- preço tabela/parcelamento já suportados em produção), acrescida SOMENTE
-- das mudanças do Contrato (status em products; stock_real/active em
-- product_variations) ---------------------------------------------------------
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
    'sell_without_stock', 'source',
    -- Campos já suportados pela versão ATUAL de produção (ausentes das
    -- migrations 020-023 do repo) — PRESERVADOS, não reintroduzidos:
    'preco_tabela',
    'parcelamento_padrao_vezes', 'parcelamento_padrao_valor_parcela', 'parcelamento_padrao_com_juros',
    'parcelamento_max_vezes', 'parcelamento_valor_parcela', 'parcelamento_com_juros',
    -- Contrato Catálogo PRIME (Etapa 1):
    'status'
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

  -- CONTRATO CATÁLOGO PRIME: status só aceita o vocabulário real da coluna.
  -- As transições são decididas no service (404 confirmado → 'inactive';
  -- 200 em produto inativo → 'active'); aqui é só a trava final.
  IF p_product_fields ? 'status'
     AND (p_product_fields->>'status') IS NOT NULL
     AND (p_product_fields->>'status') NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'bagy_sync_product_transaction: status inválido em p_product_fields: % (aceitos: active, inactive)', p_product_fields->>'status';
  END IF;

  IF p_product_id IS NULL THEN
    -- ================= BRANCH INSERT (migrations 022/023 + campos de produção + status) =================
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

    INSERT INTO public.products (
      bagy_product_id, nome, link, categoria, categoria_breadcrumb,
      bagy_category_id, preco, preco_pix, imagem, descricao, marca,
      sell_without_stock, source, status,
      preco_tabela,
      parcelamento_padrao_vezes, parcelamento_padrao_valor_parcela, parcelamento_padrao_com_juros,
      parcelamento_max_vezes, parcelamento_valor_parcela, parcelamento_com_juros,
      synced_at
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
      COALESCE(p_product_fields->>'status', 'active'),
      (p_product_fields->>'preco_tabela')::numeric,
      (p_product_fields->>'parcelamento_padrao_vezes')::integer,
      (p_product_fields->>'parcelamento_padrao_valor_parcela')::numeric,
      (p_product_fields->>'parcelamento_padrao_com_juros')::boolean,
      (p_product_fields->>'parcelamento_max_vezes')::integer,
      (p_product_fields->>'parcelamento_valor_parcela')::numeric,
      (p_product_fields->>'parcelamento_com_juros')::boolean,
      now()
    )
    RETURNING id INTO v_product_id;
  ELSE
    -- ================= BRANCH UPDATE (base de produção + status) =================
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
      -- Campos preservados da versão atual de produção: chave ausente
      -- preserva o valor gravado (nenhum writer atual os envia; a decisão
      -- de origem de preco_tabela/parcelamento não muda nesta etapa).
      preco_tabela         = CASE WHEN p_product_fields ? 'preco_tabela' THEN (p_product_fields->>'preco_tabela')::numeric ELSE preco_tabela END,
      parcelamento_padrao_vezes         = CASE WHEN p_product_fields ? 'parcelamento_padrao_vezes' THEN (p_product_fields->>'parcelamento_padrao_vezes')::integer ELSE parcelamento_padrao_vezes END,
      parcelamento_padrao_valor_parcela = CASE WHEN p_product_fields ? 'parcelamento_padrao_valor_parcela' THEN (p_product_fields->>'parcelamento_padrao_valor_parcela')::numeric ELSE parcelamento_padrao_valor_parcela END,
      parcelamento_padrao_com_juros     = CASE WHEN p_product_fields ? 'parcelamento_padrao_com_juros' THEN (p_product_fields->>'parcelamento_padrao_com_juros')::boolean ELSE parcelamento_padrao_com_juros END,
      parcelamento_max_vezes            = CASE WHEN p_product_fields ? 'parcelamento_max_vezes' THEN (p_product_fields->>'parcelamento_max_vezes')::integer ELSE parcelamento_max_vezes END,
      parcelamento_valor_parcela        = CASE WHEN p_product_fields ? 'parcelamento_valor_parcela' THEN (p_product_fields->>'parcelamento_valor_parcela')::numeric ELSE parcelamento_valor_parcela END,
      parcelamento_com_juros            = CASE WHEN p_product_fields ? 'parcelamento_com_juros' THEN (p_product_fields->>'parcelamento_com_juros')::boolean ELSE parcelamento_com_juros END,
      -- CONTRATO CATÁLOGO PRIME: status só muda quando a chave vem no
      -- payload (transição decidida pelo service) — ausente, preserva.
      status               = CASE WHEN p_product_fields ? 'status' THEN p_product_fields->>'status' ELSE status END,
      synced_at            = now()
    WHERE id = p_product_id;
  END IF;

  -- Upsert de variações — mesmo loop das migrations 020-023, agora com
  -- stock_real e active. Semântica de chave ausente no ON CONFLICT:
  -- preserva o valor já gravado (callers antigos não degradam o dado
  -- novo); chave presente com NULL grava NULL (NULL explícito é dado —
  -- ex.: estoque sem-controle ou active desconhecido).
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
      stock_quantity, stock_real, active, sell_without_stock, imagem_principal, synced_at
    ) VALUES (
      v_product_id,
      v_bagy_variation_id,
      COALESCE(v_variation->'attributes', '{}'::jsonb),
      (v_variation->>'preco')::numeric,
      (v_variation->>'preco_compare')::numeric,
      (v_variation->>'stock_quantity')::integer,
      (v_variation->>'stock_real')::integer,
      (v_variation->>'active')::boolean,
      (v_variation->>'sell_without_stock')::boolean,
      v_variation->>'imagem_principal',
      now()
    )
    ON CONFLICT (bagy_variation_id) DO UPDATE SET
      attributes         = EXCLUDED.attributes,
      preco              = EXCLUDED.preco,
      preco_compare      = EXCLUDED.preco_compare,
      stock_quantity     = EXCLUDED.stock_quantity,
      stock_real         = CASE WHEN v_variation ? 'stock_real' THEN (v_variation->>'stock_real')::integer ELSE product_variations.stock_real END,
      active             = CASE WHEN v_variation ? 'active' THEN (v_variation->>'active')::boolean ELSE product_variations.active END,
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

-- Superfície mínima — inalterada: só service_role executa.
REVOKE ALL ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bagy_sync_product_transaction(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.bagy_sync_product_transaction IS 'Único caminho de escrita transacional do sincronizador Bagy→Supabase. p_product_id=NULL insere produto novo; p_product_id existente faz UPDATE. Base funcional = versão ATUAL de produção (inclui preco_tabela e os 6 campos de parcelamento, suportados em produção mas ausentes das migrations 020-023 do repo). CONTRATO CATÁLOGO PRIME (migration 033): acrescenta status em products (active/inactive, escrita controlada) e stock_real/active em product_variations (chave ausente preserva o valor gravado). Chamada só via service_role (RPC).';

COMMIT;
