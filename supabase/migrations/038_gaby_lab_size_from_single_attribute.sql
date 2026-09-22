-- 038_gaby_lab_size_from_single_attribute.sql
-- LAB only: corrige a leitura de tamanho da view gaby_catalog_lab.
-- Regra:
--   1) se existir a chave estruturada "tamanho", usa esse valor;
--   2) se houver exatamente 1 atributo estruturado na variação, usa o único valor;
--   3) se houver mais de 1 atributo e nenhuma chave "tamanho", retorna NULL.
-- Nunca infere tamanho por título, slug ou descrição.

CREATE OR REPLACE VIEW public.gaby_catalog_lab AS
SELECT
  p.id,
  p.bagy_product_id,
  p.nome,
  p.link,
  p.categoria,
  p.gender,
  p.age_group,
  p.color AS product_color,
  p.google_product_category,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'offer_id', v.bagy_variation_id,
        'size',
          CASE
            WHEN (v.attributes::jsonb) ? 'tamanho'
              THEN v.attributes::jsonb ->> 'tamanho'
            WHEN jsonb_typeof(v.attributes::jsonb) = 'object'
             AND (SELECT count(*) FROM jsonb_object_keys(v.attributes::jsonb)) = 1
              THEN (SELECT value FROM jsonb_each_text(v.attributes::jsonb) LIMIT 1)
            ELSE NULL
          END,
        'color', COALESCE(v.color, p.color),
        'stock_real', v.stock_real,
        'active', v.active,
        'available_confirmed',
          (p.status = 'active' AND v.active IS TRUE AND v.stock_real > 0),
        'availability_state', CASE
          WHEN p.status <> 'active' OR v.active IS FALSE THEN 'INDISPONIVEL'
          WHEN v.active IS NULL OR v.stock_real IS NULL THEN 'A_CONFIRMAR'
          WHEN v.stock_real > 0 THEN 'DISPONIVEL'
          ELSE 'ESGOTADO'
        END
      ) ORDER BY v.bagy_variation_id
    ) FILTER (WHERE v.id IS NOT NULL),
    '[]'::jsonb
  ) AS variations
FROM public.products p
LEFT JOIN public.product_variations v ON v.product_id = p.id
GROUP BY p.id, p.bagy_product_id, p.nome, p.link, p.categoria,
         p.gender, p.age_group, p.color, p.google_product_category;

COMMENT ON VIEW public.gaby_catalog_lab IS
  'Somente LAB. size usa a chave tamanho quando existir; caso contrário usa o único atributo estruturado da variação. Mais de um atributo sem chave tamanho => NULL. available_confirmed=true exige produto ativo + variação active=true + stock_real>0. NULL nunca vira promessa.';

REVOKE ALL ON TABLE public.gaby_catalog_lab FROM PUBLIC;
REVOKE ALL ON TABLE public.gaby_catalog_lab FROM anon, authenticated;
GRANT SELECT ON TABLE public.gaby_catalog_lab TO service_role;
