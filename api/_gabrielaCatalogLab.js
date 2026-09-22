/** PREVIEW LAB: nunca importado pelo webhook/GABY OFICIAL. */
export async function fetchGabrielaCatalogLab({ supabaseConfig, fetchImpl = fetch }) {
  const select = 'id,bagy_product_id,nome,link,categoria,gender,age_group,' +
    'product_color,google_product_category,variations'
  const res = await fetchImpl(
    `${supabaseConfig.baseUrl}/rest/v1/gaby_catalog_lab?select=${select}`,
    { headers: supabaseConfig.headers }
  )
  if (!res.ok) return { ok: false, products: [], error_code: 'source_unavailable' }
  const products = await res.json()
  return { ok: Array.isArray(products), products: Array.isArray(products) ? products : [] }
}

const norm = (v) => typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null

export function answerVariantFact(product, { size, color, gender } = {}) {
  const wantedGender = norm(gender)
  const productGender = norm(product?.gender)
  if (wantedGender && !productGender) return { answer: null, reason: 'unknown_gender' }
  if (wantedGender && productGender !== wantedGender) return { answer: false, reason: 'gender_mismatch' }
  // Pergunta factual só de gênero independe de estoque/variações.
  if (wantedGender && !size && !color) return { answer: true, reason: 'confirmed_gender' }

  const variations = Array.isArray(product?.variations) ? product.variations : []
  const wantedColor = norm(color)
  const productColor = norm(product?.product_color)
  const effectiveColor = (v) => norm(v?.color) || productColor
  if (wantedColor) {
    const matchingColor = variations.filter((v) => effectiveColor(v) === wantedColor)
    const hasUnknownColor = variations.length === 0
      ? !productColor
      : variations.some((v) => effectiveColor(v) === null)
    if (matchingColor.length === 0 && hasUnknownColor) return { answer: null, reason: 'unknown_color' }
    if (matchingColor.length === 0) return { answer: false, reason: 'not_found' }
  }

  const colorCandidates = wantedColor
    ? variations.filter((v) => effectiveColor(v) === wantedColor)
    : variations
  const wantedSize = norm(size)
  if (wantedSize) {
    const matchingSize = colorCandidates.filter((v) => norm(v?.size) === wantedSize)
    const hasUnknownSize = colorCandidates.length === 0
      ? variations.length === 0
      : colorCandidates.some((v) => norm(v?.size) === null)
    if (matchingSize.length === 0 && hasUnknownSize) return { answer: null, reason: 'unknown_size' }
    if (matchingSize.length === 0) return { answer: false, reason: 'not_found' }
    if (matchingSize.some((v) => v.available_confirmed === true)) return { answer: true, reason: 'confirmed_variant' }
    return { answer: null, reason: 'variant_not_confirmed_available' }
  }

  if (colorCandidates.some((v) => v.available_confirmed === true)) {
    return { answer: true, reason: 'confirmed_variant' }
  }
  if (colorCandidates.length > 0) return { answer: null, reason: 'variant_not_confirmed_available' }
  return { answer: null, reason: 'insufficient_structured_data' }
}

// Feed de amostra: estoque desconhecido nunca vira out_of_stock.
export function buildGoogleFeedOffer(product, variation) {
  let availability_state
  let emit
  if (variation?.stock_real == null || variation?.active == null) {
    availability_state = 'A_CONFIRMAR'
    emit = false
  } else if (variation.active !== true) {
    availability_state = 'INDISPONIVEL'
    emit = false
  } else if (variation.stock_real > 0) {
    availability_state = 'in_stock'
    emit = true
  } else {
    availability_state = 'out_of_stock'
    emit = true
  }

  return {
    emit,
    availability_state,
    offer: emit ? {
      id: String(variation.offer_id),
      item_group_id: String(product.bagy_product_id),
      size: variation.size ?? null,
      color: variation.color ?? product.product_color ?? null,
      gender: product.gender ?? null,
      age_group: product.age_group ?? null,
      google_product_category: product.google_product_category ?? null,
      availability: availability_state,
    } : null,
  }
}
