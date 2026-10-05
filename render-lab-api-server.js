import express from 'express'
import productUniverseHandler from './api/gaby-lab-product-universe-v1.js'

const app = express()
const port = Number(process.env.PORT || 10000)

app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))

app.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    ok: true,
    service: 'ignite-prime-render-lab-api',
    mode: 'LAB_ONLY',
    product_universe_runtime_enabled:
      String(process.env.LAB_PRODUCT_UNIVERSE_RUNTIME_ENABLED || '')
        .trim()
        .toLowerCase() === 'true',
  })
})

app.post('/api/gaby-lab-product-universe-v1', async (req, res) => {
  return productUniverseHandler(req, res)
})

app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.status(404).json({ ok: false, error: 'NOT_FOUND' })
})

async function runBootSmoke() {
  const enabled =
    String(process.env.LAB_BOOT_SMOKE_TEST || '')
      .trim()
      .toLowerCase() === 'true'

  if (!enabled) return

  const secret = String(process.env.LAB_PRODUCT_UNIVERSE_API_SECRET || '').trim()
  if (!secret) {
    console.log(JSON.stringify({
      event: 'PRODUCT_UNIVERSE_BOOT_SMOKE',
      ok: false,
      error: 'LAB_API_SECRET_MISSING',
    }))
    return
  }

  const cases = [
    {
      name: 'AIR_FORCE_PRETO_42',
      body: {
        visual: {
          brand: 'Nike',
          model: 'Air Force 1',
          color: 'branco',
        },
        requested: {
          brand: 'Nike',
          model: 'Air Force 1',
          color: 'preto',
          size: '42',
        },
      },
    },
    {
      name: 'NB9060_PRETO_42',
      body: {
        requested: {
          brand: 'New Balance',
          model: '9060',
          color: 'preto',
          size: '42',
        },
      },
    },
  ]

  for (const testCase of cases) {
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/gaby-lab-product-universe-v1`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
            'x-prime-lab-secret': secret,
          },
          body: JSON.stringify(testCase.body),
        }
      )

      const payload = await res.json().catch(() => null)

      console.log(JSON.stringify({
        event: 'PRODUCT_UNIVERSE_BOOT_SMOKE',
        case: testCase.name,
        ok: res.ok && payload?.ok === true,
        http_status: res.status,
        canonical_family: payload?.decision?.canonical_family || null,
        action: payload?.decision?.commercial?.action || null,
        product_state: payload?.decision?.commercial?.product_state || null,
        supplier_count: payload?.decision?.coverage?.supplier_count ?? null,
        vivian_mode: payload?.source_status?.VIVIAN?.mode || null,
        vivian_candidates: payload?.source_status?.VIVIAN?.candidates ?? null,
        mia_mode: payload?.source_status?.MIA?.mode || null,
        mia_candidates: payload?.source_status?.MIA?.candidates ?? null,
        prime_ok: payload?.source_status?.PRIME?.ok ?? null,
        prime_candidates: payload?.source_status?.PRIME?.candidates ?? null,
        error: payload?.error || null,
      }))
    } catch (error) {
      console.log(JSON.stringify({
        event: 'PRODUCT_UNIVERSE_BOOT_SMOKE',
        case: testCase.name,
        ok: false,
        error: error?.message || 'SMOKE_EXCEPTION',
      }))
    }
  }
}

app.listen(port, '0.0.0.0', async () => {
  console.log(`PRIME LAB API listening on port ${port}`)
  await runBootSmoke()
})
