import express from 'express'
import productUniverseHandler from './api/gaby-lab-product-universe-v1.js'
import supplierVisionWorkerHandler from './api/supplier-vision-worker-v1.js'
import supplierDriveScannerHandler from './api/supplier-drive-scanner-v1.js'
import supplierCatalogCycleHandler from './api/supplier-catalog-cycle-v1.js'
import supplierHomologationHarnessHandler from './api/supplier-homologation-harness-v1.js'
import supplierHarnessOcrProxyHandler from './api/_supplierHarnessOcrProxyRoute.js'
import storyHandoffTraceProbeHandler from './api/story-handoff-trace-probe-v1.js'
import primeControlGptmakerLabHandler from './api/prime-control-gptmaker-lab-v1.js'
import primeControlStoryReplayHandler from './api/prime-control-story-lab-v14c.js'
import primeControlPositiveHandler from './api/prime-control-story-positive-lab-v14c.js'
import { PHOTO as primeControlPositivePhoto } from './api/prime-control-story-positive-lab-v14c.js'
import { runSupplierHomologationHarnessBoot } from './api/_supplierHomologationHarnessBoot.js'
import { runSupplierHomologationPromotionBoot } from './api/_supplierHomologationPromotionBoot.js'
import { runSupplierGateLedgerSmoke } from './api/_supplierGateLedger.js'

const app = express()
const port = Number(process.env.PORT || 10000)

app.disable('x-powered-by')

// A Vision envia a imagem como data URL/base64. O worker limita a imagem a 8 MB,
// então esta rota protegida precisa aceitar o overhead do base64 sem ampliar o
// limite dos demais endpoints do LAB.
app.post(
  '/api/supplier-harness-ocr-proxy',
  express.json({ limit: '12mb' }),
  async (req, res) => supplierHarnessOcrProxyHandler(req, res)
)

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
    supplier_homologation_harness_v1: true,
  })
})

app.post('/api/gaby-lab-product-universe-v1', async (req, res) => {
  return productUniverseHandler(req, res)
})

app.post('/api/supplier-vision-worker-v1', async (req, res) => {
  return supplierVisionWorkerHandler(req, res)
})

app.post('/api/supplier-drive-scanner-v1', async (req, res) => {
  return supplierDriveScannerHandler(req, res)
})

app.post('/api/supplier-catalog-cycle-v1', async (req, res) => {
  return supplierCatalogCycleHandler(req, res)
})

app.post('/api/supplier-homologation-harness-v1', async (req, res) => {
  return supplierHomologationHarnessHandler(req, res)
})

app.post('/api/story-handoff-trace-probe-v1', async (req, res) => {
  return storyHandoffTraceProbeHandler(req, res)
})

app.post('/api/prime-control-gptmaker-lab-v1', async (req, res) => {
  return primeControlGptmakerLabHandler(req, res)
})

app.post('/api/prime-control-story-lab-v14c', async (req, res) => {
  return primeControlStoryReplayHandler(req, res)
})

app.post('/api/prime-control-story-positive-lab-v14c', (req,res) => primeControlPositiveHandler(req,res))

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
    {
      name: 'MCQUEEN_PRETO_42',
      body: {
        requested: {
          brand: 'Alexander McQueen',
          model: 'McQueen',
          color: 'preto',
          size: '42',
        },
      },
    },
    {
      name: 'NB1000_PRETO_42',
      body: {
        requested: {
          brand: 'New Balance',
          model: 'NB1000',
          color: 'preto',
          size: '42',
        },
      },
    },
    {
      name: 'NB1000_CINZA_BEGE_42',
      body: {
        requested: {
          brand: 'New Balance',
          model: 'NB1000',
          color: 'cinza / bege',
          size: '42',
        },
      },
    },
    {
      name: 'NB2000_AZUL_42',
      body: {
        requested: {
          brand: 'New Balance',
          model: 'NB2000',
          color: 'azul',
          size: '42',
        },
      },
    },
    {
      name: 'NB530_BRANCO_42',
      body: {
        requested: {
          brand: 'New Balance',
          model: 'NB530',
          color: 'branco',
          size: '42',
        },
      },
    },
    {
      name: 'NB530_PRATA_42',
      body: {
        requested: {
          brand: 'New Balance',
          model: 'NB530',
          color: 'prata',
          size: '42',
        },
      },
    },
    {
      name: 'SAMBA_BRANCO_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Samba',
          color: 'branco',
          size: '42',
        },
      },
    },
    {
      name: 'SAMBA_BEGE_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Samba',
          color: 'bege',
          size: '42',
        },
      },
    },
    {
      name: 'ADI2000_BEGE_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Adi 2000',
          color: 'bege',
          size: '42',
        },
      },
    },
    {
      name: 'ADI2000_MARROM_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Adi 2000',
          color: 'marrom',
          size: '42',
        },
      },
    },
    {
      name: 'CAMPUS_MARROM_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Campus',
          color: 'marrom',
          size: '42',
        },
      },
    },
    {
      name: 'CAMPUS_BEGE_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Campus',
          color: 'bege',
          size: '42',
        },
      },
    },
    {
      name: 'MIZUNO14_BRANCO_ROSA_42',
      body: {
        requested: {
          brand: 'Mizuno',
          model: 'Mizuno Pro 14',
          color: 'branco / rosa',
          size: '42',
        },
      },
    },
    {
      name: 'MIZUNO14_PRETO_AZUL_42',
      body: {
        requested: {
          brand: 'Mizuno',
          model: 'Mizuno Pro 14',
          color: 'preto / azul',
          size: '42',
        },
      },
    },
    {
      name: 'DUNK_BRANCO_BEGE_AZUL_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Nike Dunk',
          color: 'branco / bege / azul',
          size: '42',
        },
      },
    },
    {
      name: 'DUNK_PRETO_BRANCO_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Nike Dunk Low',
          color: 'preto / branco',
          size: '42',
        },
      },
    },
    {
      name: 'DUNK_BRANCO_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'SB Dunk',
          color: 'branco',
          size: '42',
        },
      },
    },
    {
      name: 'COURT_VISION_BEGE_PRETO_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Court Vision',
          color: 'bege / preto',
          size: '42',
        },
      },
    },
    {
      name: 'COURT_VISION_BEGE_DOURADO_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Court Vision Low',
          color: 'bege / dourado',
          size: '42',
        },
      },
    },
    {
      name: 'BAILLELI_ROSA_BRANCO_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Bailleli',
          color: 'rosa / branco',
          size: '42',
        },
      },
    },
    {
      name: 'BAILLELI_VERDE_MENTA_BRANCO_ROSA_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Nike Bailleli',
          color: 'verde menta / branco / rosa',
          size: '42',
        },
      },
    },
    {
      name: 'ADIZERO_ROXO_LARANJA_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Adizero',
          color: 'roxo / laranja',
          size: '42',
        },
      },
    },
    {
      name: 'ADIZERO_BRANCO_PRATA_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Adizero',
          color: 'branco / prata',
          size: '42',
        },
      },
    },
    {
      name: 'ADIZERO_VERDE_LIMAO_VERMELHO_AZUL_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Adizero',
          color: 'verde limão / vermelho / azul',
          size: '42',
        },
      },
    },
    {
      name: 'ADIZERO_AMARELO_42',
      body: {
        requested: {
          brand: 'Adidas',
          model: 'Adizero',
          color: 'amarelo',
          size: '42',
        },
      },
    },
    {
      name: 'VOMERO_PRETO_BRANCO_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Nike Vomero',
          color: 'preto / branco',
          size: '42',
        },
      },
    },
    {
      name: 'VOMERO_ROSA_AMARELO_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Vomero Premium',
          color: 'rosa / amarelo',
          size: '42',
        },
      },
    },
    {
      name: 'VOMERO_MARROM_DOURADO_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Air Max Vomero',
          color: 'marrom / dourado',
          size: '42',
        },
      },
    },
    {
      name: 'AIR_JORDAN1_BRANCO_AZUL_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Nike Air Jordan 1',
          color: 'branco / azul marinho / cinza',
          size: '42',
        },
      },
    },
    {
      name: 'AIR_JORDAN4_BRANCO_42',
      body: {
        requested: {
          brand: 'Nike',
          model: 'Nike Air Jordan 4',
          color: 'branco',
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
        best_source: payload?.decision?.best_match?.source || null,
        best_color: payload?.decision?.best_match?.color || null,
        best_match_type: payload?.decision?.best_match?.match_type || null,
        supplier_count: payload?.decision?.coverage?.supplier_count ?? null,
        price_state: payload?.decision?.price?.state || null,
        price_amount: payload?.decision?.price?.amount ?? null,
        size_state: payload?.decision?.size?.state || null,
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

async function runSupplierVisionBootSmoke() {
  const enabled =
    String(process.env.SUPPLIER_VISION_BOOT_SMOKE || '')
      .trim()
      .toLowerCase() === 'true'

  if (!enabled) return

  const secret = String(process.env.LAB_PRODUCT_UNIVERSE_API_SECRET || '').trim()
  if (!secret) {
    console.log(JSON.stringify({
      event: 'SUPPLIER_VISION_BOOT_SMOKE',
      ok: false,
      error: 'LAB_API_SECRET_MISSING',
    }))
    return
  }

  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/supplier-vision-worker-v1`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
          'x-prime-lab-secret': secret,
        },
        body: JSON.stringify({
          limit: 1,
          dry_run: false,
          confirm: 'VISION_WRITE_LAB',
        }),
      }
    )

    const payload = await res.json().catch(() => null)
    const first = payload?.processed?.[0] || null

    console.log(JSON.stringify({
      event: 'SUPPLIER_VISION_BOOT_SMOKE',
      ok: res.ok && payload?.ok === true,
      http_status: res.status,
      queued: payload?.queued ?? null,
      supplier: first?.supplier || null,
      family: first?.family || null,
      color: first?.color || null,
      confidence: first?.confidence ?? null,
      status: first?.status || null,
      persisted: first?.persisted ?? null,
      image_type: first?.image?.content_type || null,
      image_bytes: first?.image?.bytes ?? null,
      total_tokens: first?.usage?.total_tokens ?? null,
      cost_usd: first?.usage?.cost_usd ?? null,
      error: first?.error_code || payload?.error_code || payload?.error || null,
    }))
  } catch (error) {
    console.log(JSON.stringify({
      event: 'SUPPLIER_VISION_BOOT_SMOKE',
      ok: false,
      error: error?.message || 'SMOKE_EXCEPTION',
    }))
  }
}

async function runSupplierDriveScannerBootSmoke() {
  const enabled =
    String(process.env.SUPPLIER_DRIVE_SCANNER_BOOT_SMOKE || '')
      .trim()
      .toLowerCase() === 'true'

  if (!enabled) return

  const secret = String(process.env.LAB_PRODUCT_UNIVERSE_API_SECRET || '').trim()
  if (!secret) {
    console.log(JSON.stringify({
      event: 'SUPPLIER_DRIVE_SCANNER_BOOT_SMOKE',
      ok: false,
      error: 'LAB_API_SECRET_MISSING',
    }))
    return
  }

  const writeMode =
    String(process.env.SUPPLIER_DRIVE_SCANNER_BOOT_WRITE || '')
      .trim()
      .toLowerCase() === 'true'

  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/supplier-drive-scanner-v1`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
          'x-prime-lab-secret': secret,
        },
        body: JSON.stringify({
          dry_run: !writeMode,
          confirm: writeMode ? 'DRIVE_SCAN_WRITE_LAB' : undefined,
          max_changes: 1,
          scope_keys: ['VIVIAN_AIR_FORCE_1'],
        }),
      }
    )

    const payload = await res.json().catch(() => null)
    const first = payload?.scopes?.[0] || null

    console.log(JSON.stringify({
      event: 'SUPPLIER_DRIVE_SCANNER_BOOT_SMOKE',
      ok: res.ok && payload?.ok === true,
      http_status: res.status,
      dry_run: payload?.dry_run ?? null,
      write_mode: writeMode,
      scope: first?.key || null,
      scanned: first?.scanned ?? null,
      new_count: first?.new_count ?? null,
      changed_count: first?.changed_count ?? null,
      baseline_count: first?.baseline_count ?? null,
      unchanged_count: first?.unchanged_count ?? null,
      selected_for_pending: first?.selected_for_pending ?? null,
      deferred_changes: first?.deferred_changes ?? null,
      deactivated: first?.deactivated ?? null,
      parse_complete: first?.parse_complete ?? null,
      error: first?.error_code || payload?.error_code || payload?.error || null,
    }))
  } catch (error) {
    console.log(JSON.stringify({
      event: 'SUPPLIER_DRIVE_SCANNER_BOOT_SMOKE',
      ok: false,
      error: error?.message || 'SMOKE_EXCEPTION',
    }))
  }
}

async function runSupplierCatalogCycleBootSmoke() {
  const enabled =
    String(process.env.SUPPLIER_CATALOG_CYCLE_BOOT_SMOKE || '')
      .trim()
      .toLowerCase() === 'true'

  if (!enabled) return

  const token = String(process.env.SUPPLIER_CATALOG_CYCLE_TOKEN || '').trim()
  if (!token) {
    console.log(JSON.stringify({
      event: 'SUPPLIER_CATALOG_CYCLE_BOOT_SMOKE',
      ok: false,
      error: 'SUPPLIER_CYCLE_TOKEN_MISSING',
    }))
    return
  }

  try {
    const cycleKey =
      'supplier-cycle-smoke:' +
      new Date().toISOString().replace(/[:.]/g, '-')

    const res = await fetch(
      `http://127.0.0.1:${port}/api/supplier-catalog-cycle-v1`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-prime-cycle-token': token,
        },
        body: JSON.stringify({
          confirm: 'SUPPLIER_CATALOG_CYCLE_LAB',
          cycle_key: cycleKey,
          trigger: 'boot_smoke',
          max_changes: 1,
        }),
      }
    )

    const payload = await res.json().catch(() => null)

    console.log(JSON.stringify({
      event: 'SUPPLIER_CATALOG_CYCLE_BOOT_SMOKE',
      ok: res.ok && payload?.ok === true,
      http_status: res.status,
      cycle_key: payload?.cycle_key || null,
      status: payload?.status || null,
      selected_for_pending:
        payload?.totals?.selected_for_pending ?? null,
      ready: payload?.totals?.ready ?? null,
      review: payload?.totals?.review ?? null,
      error_count: payload?.totals?.error ?? null,
      cost_usd: payload?.totals?.cost_usd ?? null,
      duplicate: payload?.duplicate ?? null,
      error: payload?.error_code || payload?.error || null,
    }))
  } catch (error) {
    console.log(JSON.stringify({
      event: 'SUPPLIER_CATALOG_CYCLE_BOOT_SMOKE',
      ok: false,
      error: error?.message || 'SMOKE_EXCEPTION',
    }))
  }
}


async function runPrimeControlGptmakerProofBootSmoke() {
  const enabled =
    String(process.env.PRIME_CONTROL_GPTMAKER_PROOF_BOOT_SMOKE || '')
      .trim()
      .toLowerCase() === 'true'

  if (!enabled) return

  const secret = String(process.env.PRIME_CONTROL_GPTMAKER_LAB_SECRET || '').trim()
  if (!secret) {
    console.log(JSON.stringify({
      event: 'PRIME_CONTROL_GPTMAKER_PROOF_BOOT_SMOKE',
      ok: false,
      error: 'PRIME_CONTROL_GPTMAKER_LAB_SECRET_MISSING',
    }))
    return
  }

  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/prime-control-gptmaker-lab-v1`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
          'x-prime-control-secret': secret,
        },
        body: JSON.stringify({
          lab_proof: 'HANDOFF_V14B',
          pergunta: 'teste controlado',
        }),
      }
    )

    const payload = await res.json().catch(() => null)

    console.log(JSON.stringify({
      event: 'PRIME_CONTROL_GPTMAKER_PROOF_BOOT_SMOKE',
      ok:
        res.ok &&
        payload?.sucesso === true &&
        payload?.contexto?.proof_code === 'PC14B-GPTMAKER-CONSUMED',
      http_status: res.status,
      proof_code: payload?.contexto?.proof_code || null,
      trace_id_present: Boolean(res.headers.get('x-prime-trace-id')),
      error: payload?.erro || payload?.error || null,
    }))
  } catch (error) {
    console.log(JSON.stringify({
      event: 'PRIME_CONTROL_GPTMAKER_PROOF_BOOT_SMOKE',
      ok: false,
      error: error?.message || 'PROOF_BOOT_SMOKE_EXCEPTION',
    }))
  }
}

async function runStoryHandoffTraceBootSmoke() {
  const enabled =
    String(process.env.STORY_HANDOFF_TRACE_BOOT_SMOKE || '')
      .trim()
      .toLowerCase() === 'true'

  if (!enabled) return

  const secret = String(process.env.LAB_PRODUCT_UNIVERSE_API_SECRET || '').trim()
  if (!secret) {
    console.log(JSON.stringify({
      event: 'STORY_HANDOFF_TRACE_BOOT_SMOKE',
      ok: false,
      error: 'LAB_API_SECRET_MISSING',
    }))
    return
  }

  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/story-handoff-trace-probe-v1`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
          'x-prime-lab-secret': secret,
        },
        body: JSON.stringify({
          confirm: 'STORY_HANDOFF_TRACE_PROBE_LAB',
        }),
      }
    )

    const payload = await res.json().catch(() => null)

    console.log(JSON.stringify({
      event: 'STORY_HANDOFF_TRACE_BOOT_SMOKE',
      ok: res.ok && payload?.ok === true && payload?.emitted === true,
      http_status: res.status,
      emitted: payload?.emitted ?? null,
      trace_event: payload?.trace?.event || null,
      trace_version: payload?.trace?.version || null,
      trace_stage: payload?.trace?.stage || null,
      error: payload?.error || null,
    }))
  } catch (error) {
    console.log(JSON.stringify({
      event: 'STORY_HANDOFF_TRACE_BOOT_SMOKE',
      ok: false,
      error: error?.message || 'TRACE_BOOT_SMOKE_EXCEPTION',
    }))
  }
}

async function runPrimeControlStoryV14CBootSmoke() {
  if (String(process.env.PRIME_CONTROL_STORY_LAB_BOOT_SMOKE || '').toLowerCase() !== 'true') return
  const secret = String(process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY || '').trim()
  if (!secret) {
    console.log(JSON.stringify({event:'PRIME_CONTROL_STORY_LAB_BOOT_SMOKE',ok:false,error:'KEY_MISSING'}))
    return
  }
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/prime-control-story-lab-v14c`,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-prime-lab':'GABY-LAB-COMERCIAL-V1',
        'x-prime-control-story-key':secret,
      },
      body:JSON.stringify({case:'PRIME_LOGO_NEGATIVE',confirm:'RUN_STORY_LAB_V14C'}),
      signal:AbortSignal.timeout(23000),
    })
    const b=await r.json().catch(()=>null)
    console.log(JSON.stringify({
      event:'PRIME_CONTROL_STORY_LAB_BOOT_SMOKE',
      ok:r.ok && b?.ok===true,
      http_status:r.status,
      stage:b?.stage??null,
      vision_status:b?.result?.vision?.status??null,
      catalog_source:b?.result?.catalog?.source??null,
      jev_executed:b?.result?.jev?.executed??null,
      story_real:b?.result?.actual_instagram_story??null,
      correlation_id_present:Boolean(b?.correlation_id),
      payload_sha256_present:Boolean(b?.trace_sha256),
      error:b?.error??null,
    }))
  } catch(error) {
    console.log(JSON.stringify({
      event:'PRIME_CONTROL_STORY_LAB_BOOT_SMOKE',
      ok:false,error:error?.name==='TimeoutError'?'TIMEOUT':'NETWORK_FAILURE',
    }))
  }
}

async function probePositiveLabPhotoOnce() {
  if(process.env.PRIME_CONTROL_POSITIVE_MEDIA_PROBE!=='true')return
  try{
    const res=await fetch(primeControlPositivePhoto,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000)})
    const type=String(res.headers.get('content-type')||'').split(';')[0]
    const length=Number(res.headers.get('content-length')||0)
    console.info('[PrimeControlPositiveMediaProbe]',JSON.stringify({
      event:'PRIME_CONTROL_POSITIVE_MEDIA_PROBE',ok:res.ok,
      http_status:res.status,type,size_bytes:length,
      jev_key_present:Boolean(process.env.OPENROUTER_API_KEY),
    }))
  }catch(e){
    console.info('[PrimeControlPositiveMediaProbe]',JSON.stringify({
      event:'PRIME_CONTROL_POSITIVE_MEDIA_PROBE',
      ok:false,error_class:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR',
      jev_key_present:Boolean(process.env.OPENROUTER_API_KEY),
    }))
  }
}

async function runPositiveV14CBootOnce() {
  if(process.env.PRIME_CONTROL_POSITIVE_BOOT_ONCE!=='true')return
  const secret=String(process.env.PRIME_CONTROL_STORY_LAB_SHARED_KEY||'')
  if(!secret)return console.info('[PrimeControlPositiveBoot]',JSON.stringify({ok:false,error:'SECRET_MISSING'}))
  try{
    const response=await fetch(`http://127.0.0.1:${port}/api/prime-control-story-positive-lab-v14c`,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-prime-lab':'GABY-LAB-COMERCIAL-V1',
        'x-prime-control-story-key':secret,
      },
      body:JSON.stringify({case:'NB9060_BRANCO_LAB',confirm:'RUN_POSITIVE_STORY_LAB_V14C'}),
      signal:AbortSignal.timeout(30000),
    })
    const body=await response.json().catch(()=>null)
    console.info('[PrimeControlPositiveBoot]',JSON.stringify({
      event:'PRIME_CONTROL_POSITIVE_BOOT',
      ok:body?.ok===true,http_status:response.status,
      run_id:body?.run_id||null,stage:body?.stage||null,status:body?.status||null,
      vision_status:body?.result?.vision?.status||null,
      vision_model:body?.result?.vision?.model||null,
      candidate_count:body?.result?.catalog?.candidates??null,
      jev_status:body?.result?.jev?.status||null,jev_action:body?.result?.jev?.action||null,
      jev_reason:body?.result?.jev?.reason||null,
      jev_cost_usd:body?.result?.jev?.cost_usd??null,
      error:body?.error||null,
    }))
  }catch(e){
    console.info('[PrimeControlPositiveBoot]',JSON.stringify({
      event:'PRIME_CONTROL_POSITIVE_BOOT',ok:false,
      error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR',
    }))
  }
}

app.listen(port, '0.0.0.0', async () => {
  console.log(`PRIME LAB API listening on port ${port}`)
  await runSupplierGateLedgerSmoke()
  await runSupplierHomologationHarnessBoot({
    baseUrl: `http://127.0.0.1:${port}`,
  })
  await runSupplierHomologationPromotionBoot({ baseUrl: `http://127.0.0.1:${port}` })
  await runBootSmoke()
  await runSupplierVisionBootSmoke()
  await runSupplierDriveScannerBootSmoke()
  await runSupplierCatalogCycleBootSmoke()
  await runStoryHandoffTraceBootSmoke()
  await runPrimeControlGptmakerProofBootSmoke()
  void runPrimeControlStoryV14CBootSmoke().catch(() => {})
  void probePositiveLabPhotoOnce().catch(() => {})
  void runPositiveV14CBootOnce().catch(() => {})
})
