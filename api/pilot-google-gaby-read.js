import { fetchBagyProductByLink } from './_bagySyncClient.js'

const PILOT = new Map([
  [7630238, 'https://www.primestoremen.com.br/amisa-real-madrid-home-adidas-2425'],
  [10586354, 'https://www.primestoremen.com.br/calca-jeans-armani-1'],
  [8641698, 'https://www.primestoremen.com.br/tenis-new-balance-1000-reflection-4'],
  [7618140, 'https://www.primestoremen.com.br/chinelo-slide-gucci-unissex'],
  [10251897, 'https://www.primestoremen.com.br/cueca-lupo-008'],
  [10547975, 'https://www.primestoremen.com.br/oculos-de-sol-balenciaga'],
  [7638364, 'https://www.primestoremen.com.br/bone-new-era-branco'],
  [7598984, 'https://www.primestoremen.com.br/fantasy-eau-de-parfum-100ml'],
])

function slim(p) {
  return {
    id: p?.id ?? null,
    name: p?.name ?? null,
    url: p?.url ?? null,
    active: p?.active ?? null,
    gender: p?.gender ?? null,
    age_group: p?.age_group ?? null,
    color: p?.color ?? null,
    colors: p?.colors ?? null,
    category: p?.category ?? null,
    category_default: p?.category_default ?? null,
    categories: p?.categories ?? null,
    brand: p?.brand ?? null,
    price: p?.price ?? null,
    payments: p?.payments ?? null,
    selling_out_of_stock: p?.selling_out_of_stock ?? null,
    attribute: p?.attribute ?? null,
    attribute_secondary: p?.attribute_secondary ?? null,
    variations: Array.isArray(p?.variations) ? p.variations.map(v => ({
      id: v?.id ?? null,
      price: v?.price ?? null,
      price_compare: v?.price_compare ?? null,
      balance: v?.balance ?? null,
      selling_out_of_stock: v?.selling_out_of_stock ?? null,
      color: v?.color ?? null,
      attribute: v?.attribute ?? null,
      attribute_secondary: v?.attribute_secondary ?? null,
      active: v?.active ?? null,
    })) : [],
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  const id = Number(req.query?.id)
  const link = PILOT.get(id)
  if (!link) return res.status(400).json({ error: 'id fora do piloto 4.5F' })
  const r = await fetchBagyProductByLink(link)
  if (!r.ok) return res.status(502).json({ ok:false, id, link, httpStatus:r.httpStatus, reason:r.reason })
  if (Number(r.product?.id) !== id) {
    return res.status(409).json({ ok:false, error:'ID divergente', expected:id, actual:r.product?.id, link })
  }
  return res.status(200).json({ ok:true, pilot:'4.5F-readonly', link, httpMs:r.httpMs, product:slim(r.product) })
}
