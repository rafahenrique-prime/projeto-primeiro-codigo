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

app.listen(port, '0.0.0.0', () => {
  console.log(`PRIME LAB API listening on port ${port}`)
})
