import systemToolsHandler from './system-tools.js'

function clean(value) {
  return String(value ?? '').trim()
}

export async function handleSupplierHarnessOcrProxy(
  req,
  res,
  {
    env = process.env,
    systemToolsFn = systemToolsHandler,
  } = {}
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const expectedSecret = clean(env.LAB_PRODUCT_UNIVERSE_API_SECRET)
  if (!expectedSecret) {
    return res.status(503).json({ error: 'LAB proxy não configurado' })
  }

  const receivedSecret = clean(req.headers?.['x-prime-lab-secret'])
  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'não autorizado' })
  }

  req.query = {
    ...(req.query || {}),
    tool: 'ocr-openrouter',
  }

  return systemToolsFn(req, res)
}

export default handleSupplierHarnessOcrProxy
